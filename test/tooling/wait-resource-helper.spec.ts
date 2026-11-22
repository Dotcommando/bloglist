import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

function socketPath(): string {
  return process.platform === 'win32' ? '\\\\.\\pipe\\zarya-ready-' + randomUUID()
    : path.join(os.tmpdir(), 'zarya-ready-' + randomUUID() + '.sock');
}

function run(socket: string, seconds: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/wait-resource-helper.mjs'], {
      env: { ...process.env, ZARYA_RESOURCE_SOCKET: socket, ZARYA_RESOURCE_WAIT_SECONDS: String(seconds) },
      stdio: 'ignore',
    });
    const deadline = setTimeout(() => child.kill(), 5000);

    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(deadline);
      resolve(code);
    });
  });
}

it('waits for the real helper socket rather than accepting an absent helper', async () => {
  const socket = socketPath();
  const server = createServer(connection => connection.end());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, resolve);
  });

  try {
    expect(await run(socket, 2)).toBe(0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it('fails startup within a bounded deadline if the helper is absent', async () => {
  expect(await run(socketPath(), 0.1)).toBe(1);
});
