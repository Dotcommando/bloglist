import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

export function fileMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export async function assertNoLinks(target: string): Promise<void> {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;

  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);

    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error('Deployment paths cannot contain symbolic links');
      }
    } catch (error) {
      if (!fileMissing(error)) {
        throw error;
      }
    }
  }
}

export async function readDeploymentOwner(
  root: string, siteId: string,
): Promise<{ releaseId: string; exportId: string }> {
  await assertNoLinks(root);
  await assertNoLinks(path.join(root, '.zarya-deployment.json'));
  const data: unknown = JSON.parse(await readFile(path.join(root, '.zarya-deployment.json'), 'utf8'));

  if (
    !data
    || typeof data !== 'object'
    || !('format' in data)
    || data.format !== 'zarya-site-deployment'
    || !('version' in data)
    || data.version !== 1
    || !('siteId' in data)
    || data.siteId !== siteId
    || !('releaseId' in data)
    || typeof data.releaseId !== 'string'
    || !('exportId' in data)
    || typeof data.exportId !== 'string'
  ) {
    throw new Error('Output directory does not belong to this site deployment');
  }

  return { releaseId: data.releaseId, exportId: data.exportId };
}

/** Shared by preparation and upload so Wrangler never reads a changing output tree. */
export async function withDeploymentLock<T>(root: string, action: () => Promise<T>): Promise<T> {
  await assertNoLinks(root);
  await mkdir(path.dirname(root), { recursive: true });
  const filename = path.join(path.dirname(root), '.' + path.basename(root) + '.lock');
  let lock;

  try {
    lock = await open(filename, 'wx');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error('Deployment is busy; after a crash, remove its stale lock only when no deployment is running');
    }
    throw error;
  }

  try {
    await lock.writeFile(String(process.pid));

    return await action();
  } finally {
    await lock.close();
    await unlink(filename);
  }
}
