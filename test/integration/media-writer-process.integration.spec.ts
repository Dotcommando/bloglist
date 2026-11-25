import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

it('reclaims a writer interrupted before publishing its ticket and serializes other processes', async () => {
  const root = await mkdtemp(path.resolve('.tmp/media-writers-'));
  const queue = path.join(root, '.storage-index/site-1.json.writers');
  const entry = 'dist/adapters/outbound/storage/files/media/site-asset-directory.adapter.js';
  const module = pathToFileURL(path.resolve(entry));
  const run = promisify(execFile);
  const program = `
import { appendFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { SiteAssetDirectoryAdapter } from ${JSON.stringify(module.href)};
const adapter = new SiteAssetDirectoryAdapter(process.argv[1], { primaryDomain: async () => 'writers.test' });
await adapter.withWrite('site-1', async (directory) => {
  const sentinel = path.join(directory, 'active');
  await writeFile(sentinel, '', { flag: 'wx' });
  try {
    await setTimeout(60);
    await appendFile(path.join(directory, 'results'), process.pid + '\\n');
  } finally {
    await unlink(sentinel);
  }
});
`;

  try {
    await mkdir(queue, { recursive: true });
    const crash = spawn(process.execPath, ['--input-type=module', '-e', `
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
await writeFile(path.join(process.argv[1], process.pid + '-00000000-0000-0000-0000-000000000000.lock'), '');
process.exit(17);
`, queue], { windowsHide: true });
    const [status] = await once(crash, 'exit');

    expect(status).toBe(17);
    expect(await readdir(queue)).toHaveLength(1);
    await Promise.all([1, 2, 3, 4].map(() =>
      run(process.execPath, ['--input-type=module', '-e', program, root], { windowsHide: true })));
    expect(await readdir(queue)).toEqual([]);
    const results = (await readFile(path.join(root, 'writers.test/results'), 'utf8')).trim().split('\n');

    expect(results).toHaveLength(4);
    expect(new Set(results).size).toBe(4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
