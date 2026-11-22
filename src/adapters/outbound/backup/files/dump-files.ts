import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function child(root: string, relative: string): string {
  if (
    !relative
    || relative.includes('\\')
    || relative.includes(':')
    || relative.includes('\0')
    || relative.split('/').some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
  ) {
    throw new Error('Invalid dump path');
  }

  const target = path.resolve(root, relative);

  if (!target.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('Dump path escapes root');
  }

  return target;
}

export async function checked(root: string, relative: string): Promise<string> {
  const target = child(root, relative);
  let current = path.resolve(root);

  for (const part of ['', ...path.relative(current, target).split(path.sep)]) {
    current = path.join(current, part);
    const info = await lstat(current).catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return null;
    });

    if (info?.isSymbolicLink()) {
      throw new Error('Symbolic links are forbidden in dumps');
    }
  }

  return target;
}

export async function* treeRecords(root: string, area: string,
  relative = ''): AsyncGenerator<Record<string, unknown>> {
  const directory = relative ? await checked(root, relative) : root;
  const info = await lstat(directory).catch((error: unknown) => {
    if (!missing(error)) {
      throw error;
    }

    return null;
  });

  if (!info) {
    return;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Expected an owned directory');
  }

  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? relative + '/' + entry.name : entry.name;

    if (entry.isDirectory()) {
      yield { kind: 'directory', area, path: name };
      yield* treeRecords(root, area, name);
    } else {
      if (!entry.isFile()) {
        throw new Error('Only regular files can be dumped');
      }

      const filename = await checked(root, name);
      const before = await lstat(filename);
      const hash = createHash('sha256');

      yield { kind: 'file', area, path: name, size: before.size };

      for await (const chunk of createReadStream(filename, { highWaterMark: 65536 })) {
        if (!Buffer.isBuffer(chunk)) {
          throw new Error('Invalid file bytes');
        }

        const bytes = chunk;

        hash.update(bytes);
        yield { kind: 'chunk', data: bytes.toString('base64') };
      }
      const after = await lstat(filename);

      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) {
        throw new Error('Site files changed during snapshot');
      }
      yield { kind: 'fileEnd', checksum: hash.digest('hex') };
    }
  }
}

export interface IDirectorySwap {
  readonly root: string;
  readonly target: string;
  readonly staged: string;
  readonly previous: string;
  readonly hadOriginal: boolean;
}

export async function rollbackSwaps(swaps: readonly IDirectorySwap[]): Promise<void> {
  for (const swap of [...swaps].reverse()) {
    const target = await checked(swap.root, swap.target);
    const previous = await checked(swap.root, swap.previous);
    const staged = await checked(swap.root, swap.staged);
    const backupExists = await lstat(previous).then(() => true).catch((e: unknown) => {
      if (!missing(e)) {
        throw e;
      }

      return false;
    });
    const stageExists = await lstat(staged).then(() => true).catch((e: unknown) => {
      if (!missing(e)) {
        throw e;
      }

      return false;
    });

    if (backupExists || !stageExists && !swap.hadOriginal) {
      await rm(target, { recursive: true, force: true });
    }
    if (backupExists) {
      await rename(previous, target);
    }
    await rm(staged, { recursive: true, force: true });
  }
}

export async function applySwaps(swaps: readonly IDirectorySwap[]): Promise<void> {
  for (const swap of swaps) {
    const target = await checked(swap.root, swap.target);
    const staged = await checked(swap.root, swap.staged);
    const previous = await checked(swap.root, swap.previous);

    await mkdir(path.dirname(target), { recursive: true });

    try {
      await rename(target, previous);
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
    }
    await rename(staged, target);
  }
}

export async function fileHash(filename: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}
