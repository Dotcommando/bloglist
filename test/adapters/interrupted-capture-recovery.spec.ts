import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { recoverCaptureOperation } from '../../src/adapters/outbound/backup/files/dump-capture-lease.js';

it('removes only the dead capture requester lock and refuses uncertain restore state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-interrupted-capture-'));
  const lock = path.join(root, '.coordination/.operation.lock');
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  });

  try {
    await mkdir(path.dirname(lock));
    await writeFile(lock, '123');
    await recoverCaptureOperation(root, 123);
    await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(lock, '456');
    await expect(recoverCaptureOperation(root, 123)).rejects.toThrow('ownership');
    expect(await readFile(lock, 'utf8')).toBe('456');
    await writeFile(lock, '123');
    await writeFile(path.join(root, '.restore-journal.json'), '{}');
    await expect(recoverCaptureOperation(root, 123)).rejects.toThrow('restore');
    expect(await readFile(lock, 'utf8')).toBe('123');
  } finally {
    kill.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
