import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createConnection } from 'mongoose';

import { FileSiteDumpStore } from '../../src/adapters/outbound/backup/files/site-dump-store.adapter.js';
import { DumpDatabase } from '../../src/adapters/outbound/backup/mongoose/dump-database.adapter.js';

it('excludes restoration across processes until delivery has been reconciled', async () => {
  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/delivery-restore-'));
  const connection = createConnection();
  const filename = '2026-10-29T12-00-00-000Z_11111111-1111-4111-8111-111111111111.jsonl.gz';
  const store = new FileSiteDumpStore({
    root, sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts'),
  }, new DumpDatabase(connection));
  const module = pathToFileURL(path.resolve(
    'dist/adapters/outbound/deployment/files/delivery-restore-guard.adapter.js',
  )).href;
  const script = `
    import { FileDeliveryRestoreGuard } from ${JSON.stringify(module)};
    const guard = new FileDeliveryRestoreGuard(${JSON.stringify(root)});
    const permit = await guard.acquire('site-1');
    if (!permit) throw new Error('Missing permit');
    process.send('acquired');
    await new Promise(resolve => process.once('message', resolve));
    await permit.release(false);
    process.send('unknown');
    await new Promise(resolve => process.once('message', resolve));
    const recovery = await guard.acquire('site-1');
    await recovery.release(true);
    process.disconnect();
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });

  try {
    await once(child, 'message');
    await mkdir(path.join(root, 'site-1'));
    await writeFile(path.join(root, 'site-1', filename), 'synthetic archive');
    await expect(store.delete('site-1', filename)).rejects.toMatchObject({ code: 'Conflict' });
    const unknown = once(child, 'message');

    child.send('interrupt');
    await unknown;
    await expect(store.recover()).rejects.toMatchObject({ code: 'Conflict' });
    await expect(store.delete('site-1', filename)).rejects.toMatchObject({ code: 'Conflict' });
    const exit = once(child, 'exit');

    child.send('reconcile');
    expect((await exit)[0]).toBe(0);
    await store.recover();
    await store.delete('site-1', filename);
    expect(await store.list('site-1')).toEqual([]);
  } finally {
    child.kill();
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
});
