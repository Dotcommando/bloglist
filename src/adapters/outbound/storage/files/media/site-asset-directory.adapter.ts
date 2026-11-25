import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { normalizeSiteHostname } from '../../../../../domain/sites/site-hostname.policy.js';
import type { ISiteAssetDirectory, ISiteStorageScope } from '../../../../../ports/outbound/sites/site-storage.port.js';

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function recordedDomain(value: string): string {
  const domain: unknown = JSON.parse(value);

  if (typeof domain !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(domain) || domain.includes('..')) {
    throw new RangeError('Invalid recorded site domain');
  }

  return domain;
}

async function removeParticipant(file: string): Promise<void> {
  for (const target of [file, file + '.ready', file + '.ticket']) {
    await unlink(target).catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }
    });
  }
}

async function activeParticipants(directory: string, owner: string):
Promise<readonly { name: string; ticket: number }[]> {
  const active: { name: string; ticket: number }[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const pid = Number(/^([1-9]\d*)-[0-9a-f-]{36}\.lock$/.exec(entry.name)?.[1]);

    if (!entry.isFile() || !Number.isSafeInteger(pid) || entry.name === owner) {
      continue;
    }

    const file = path.join(directory, entry.name);

    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
        await removeParticipant(file);
        continue;
      }
      if (!(error instanceof Error && 'code' in error && error.code === 'EPERM')) {
        throw error;
      }
    }

    try {
      const published = await readFile(file + '.ready', 'utf8').catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return '0';
      });
      const ticket = Number(published);

      if (!Number.isSafeInteger(ticket) || ticket < 0) {
        throw new Error('Invalid site storage writer ticket');
      }
      active.push({ name: entry.name, ticket });
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
    }
  }

  return active;
}

async function acquireLock(directory: string): Promise<() => Promise<void>> {
  const owner = process.pid + '-' + randomUUID() + '.lock';
  const file = path.join(directory, owner);
  const release = (): Promise<void> => removeParticipant(file);

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(file, '', { flag: 'wx' });
    // An empty marker is the choosing phase. Its PID is durable in the name.
    // Only the unique marker of a dead process is reclaimed, so reapers cannot remove a successor.
    const ticket = (await activeParticipants(directory, owner)).reduce((max, row) => Math.max(max, row.ticket), 0) + 1;

    await writeFile(file + '.ticket', String(ticket), { flag: 'wx' });
    await rename(file + '.ticket', file + '.ready');

    for (let attempt = 0; attempt < 200; attempt++) {
      const active = await activeParticipants(directory, owner);

      if (!active.some((row) => row.ticket === 0 || row.ticket < ticket || row.ticket === ticket && row.name < owner)) {
        return release;
      }
      await setTimeout(25);
    }
    throw new Error('Site storage writer is active');
  } catch (error) {
    await release();
    throw error;
  }
}

export async function checkedStoragePath(root: string, relative: string): Promise<string> {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);

  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new RangeError('Storage path escapes its root');
  }

  let current = base;

  for (const part of ['', ...path.relative(base, target).split(path.sep)]) {
    current = path.join(current, part);

    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new RangeError('Symbolic links are forbidden in site storage');
      }
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
    }
  }

  return target;
}

/** Physical locations are derived from registered domains; immutable object identities retain siteId. */
export class SiteAssetDirectoryAdapter implements ISiteAssetDirectory {
  constructor(private readonly root: string, private readonly sites: ISiteStorageScope,
    private readonly children: readonly string[] = ['images', 'files', '.private']) {}

  async synchronize(siteId: string): Promise<void> {
    await this.resolve(siteId);
  }

  async withWrite<T>(siteId: string, action: (directory: string) => Promise<T>): Promise<T> {
    const directory = await this.resolve(siteId);
    const lockPath = await checkedStoragePath(this.root, '.storage-index/' + siteId + '.json.writers');
    const release = await acquireLock(lockPath);

    try {
      if (path.basename(directory) !== normalizeSiteHostname(await this.sites.primaryDomain(siteId))) {
        throw new Error('Site domain changed; retry the storage operation');
      }

      return await action(directory);
    } finally {
      await release();
    }
  }

  async resolve(siteId: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) {
      throw new RangeError('Invalid site storage identity');
    }

    const domain = normalizeSiteHostname(await this.sites.primaryDomain(siteId));

    if (!/^[a-z0-9][a-z0-9.-]*$/.test(domain) || domain.includes('..')) {
      throw new RangeError('Domain cannot name a portable directory');
    }

    const target = await checkedStoragePath(this.root, domain);
    const index = await checkedStoragePath(this.root, '.storage-index/' + siteId + '.json');
    let previous: string | null = null;

    try {
      previous = recordedDomain(await readFile(index, 'utf8'));

      if (previous === domain && await this.owned(target, siteId)) {
        return target;
      }
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
    }
    await mkdir(path.dirname(index), { recursive: true });
    const lockPath = await checkedStoragePath(this.root, '.storage-index/' + siteId + '.json.writers');
    const release = await acquireLock(lockPath);

    try {
      // Reload after acquiring the writer lock; another process may have completed a relocation.
      try {
        previous = recordedDomain(await readFile(index, 'utf8'));
      } catch (error) {
        if (!missing(error)) {
          throw error;
        }
      }
      const targetOwned = await this.owned(target, siteId);

      if (!targetOwned && previous !== null && previous !== domain) {
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(previous) || previous.includes('..')) {
          throw new RangeError('Invalid recorded site domain');
        }

        const from = await checkedStoragePath(this.root, previous);

        if (!await this.owned(from, siteId)) {
          throw new Error('Previous site directory is unavailable');
        }
        await rename(from, target);
      } else if (!targetOwned) {
        await mkdir(target);
        await writeFile(path.join(target, '.site.json'), JSON.stringify({ siteId }), { flag: 'wx' });
      }

      for (const directory of this.children) {
        const child = await checkedStoragePath(target, directory);

        await mkdir(child, { recursive: true });
      }
      const temporary = index + '.' + randomUUID();

      await writeFile(temporary, JSON.stringify(domain), { flag: 'wx' });
      await rename(temporary, index);

      return target;
    } finally {
      await release();
    }
  }

  private async owned(directory: string, siteId: string): Promise<boolean> {
    const marker = await checkedStoragePath(directory, '.site.json');

    try {
      const owner: unknown = JSON.parse(await readFile(marker, 'utf8'));

      if (!owner || typeof owner !== 'object' || !('siteId' in owner) || owner.siteId !== siteId) {
        throw new Error('Asset directory belongs to another site');
      }

      return true;
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }

      try {
        await lstat(directory);
        throw new Error('Asset directory belongs to another site or has no ownership marker');
      } catch (probe) {
        if (!missing(probe)) {
          throw probe;
        }
      }

      return false;
    }
  }
}
