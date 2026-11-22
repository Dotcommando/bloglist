import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

it.skipIf(process.platform === 'win32')('authorizes the helper before reading bodies or accessing Docker', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-helper-security-'));
  const socketPath = path.join(root, 'helper.sock');
  const dockerSocket = path.join(root, 'docker.sock');
  const secretPath = path.join(root, 'key');
  const overridePath = path.join(root, 'limits.json');
  const secret = randomBytes(32).toString('hex');
  const counts = { reads: 0, updates: 0 };
  const limits: Record<string, number> = { app: 1, mongo: 1 };
  const ids: Record<string, string> = { app: 'a'.repeat(64), mongo: 'b'.repeat(64) };
  const engine = createServer((req, res) => {
    const handle = async (): Promise<void> => {
      counts.reads++;
      let value: unknown;

      if (req.url!.startsWith('/containers/json?')) {
        const filters = new URL(req.url!, 'http://localhost').searchParams.get('filters')!;
        const service = filters.includes('service=mongo') ? 'mongo' : 'app';

        value = [{ Id: ids[service] }];
      } else {
        const service = req.url!.includes(ids.mongo!) ? 'mongo' : 'app';

        if (req.url!.endsWith('/update')) {
          const chunks: Buffer[] = [];

          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const parsed: { NanoCpus: number } = JSON.parse(Buffer.concat(chunks).toString());

          limits[service] = parsed.NanoCpus / 1e9;
          counts.updates++;
          value = {};
        } else {
          value = {
            Config: {
              Image: 'synthetic:0.14.0',
              Labels: {
                'com.docker.compose.project': 'synthetic', 'com.docker.compose.service': service,
              },
            },
            HostConfig: { NanoCpus: limits[service]! * 1e9 },
          };
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
    };

    void handle().catch(() => res.destroy());
  });

  await writeFile(secretPath, secret, { mode: 0o600 });
  await new Promise<void>((resolve) => engine.listen(dockerSocket, resolve));
  const child = spawn(process.execPath, [path.resolve('dist/resource-helper.js')], {
    env: {
      ...process.env,
      ZARYA_RESOURCE_SOCKET: socketPath,
      ZARYA_RESOURCE_SECRET_FILE: secretPath,
      ZARYA_RESOURCE_OVERRIDE_FILE: overridePath,
      ZARYA_DOCKER_SOCKET: dockerSocket,
      ZARYA_RESOURCE_COMPOSE_PROJECT: 'synthetic',
      ZARYA_RESOURCE_UID: String(process.getuid!()),
      ZARYA_RESOURCE_GID: String(process.getgid!()),
      ZARYA_INSTALLATION_CPU_BUDGET: '2',
      ZARYA_INFRASTRUCTURE_CPU_RESERVE: '0',
    },
    stdio: 'ignore',
  });
  const exited = once(child, 'exit').then(
    (value) => ({ value, error: null }),
    (error: Error) => ({ value: null, error }),
  );
  const send = (authorization?: string | string[], body?: string, unfinished = false,
    target = '/limits', method = 'PUT'): Promise<number> => new Promise((resolve, reject) => {
    const req = request({
      socketPath,
      path: target,
      method,
      agent: false,
      headers: [
        'Host', 'localhost', 'Content-Type', 'application/json',
        ...(authorization === undefined ? [] : (Array.isArray(authorization) ? authorization : [authorization])
          .flatMap((value) => ['Authorization', value])),
        ...(unfinished ? ['Content-Length', '1073741824'] : []),
        'Cookie', 'zarya_admin_session=ordinary-admin-token',
      ],
    }, (res) => {
      res.resume();
      res.once('error', reject);
      res.once('end', () => {
        resolve(res.statusCode!);
        req.destroy();
      });
    });

    req.once('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Helper consumed an unauthorized upload')));

    if (unfinished) {
      req.flushHeaders();
    } else {
      req.end(body);
    }
  });

  try {
    const deadline = Date.now() + 5000;
    let ready = false;

    while (!ready && Date.now() < deadline && child.exitCode === null) {
      ready = await lstat(socketPath).then((value) => value.isSocket(), () => false);

      if (!ready) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    expect(ready).toBe(true);
    expect((await lstat(socketPath)).mode & 0o777).toBe(0o600);

    for (const authorization of [undefined, 'Bearer ordinary-admin-token', 'Bearer ' + 'f'.repeat(64),
      ['Bearer ' + secret, 'Bearer ' + secret]]) {
      expect(await send(authorization, undefined, true)).toBe(403);
      expect(await send(authorization, undefined, true, '/calibration/load', 'POST')).toBe(403);
    }
    expect(await send('Bearer ' + secret, undefined, true, '/%6cimits')).toBe(403);
    expect(counts).toEqual({ reads: 0, updates: 0 });
    expect(await send('Bearer ' + secret, undefined, false, '/limits', 'GET')).toBe(200);

    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
      expect(await send('Bearer ' + secret, '{"databaseCpu":1,"cmsCpu":1,"' + key + '":{}}')).toBe(400);
    }
    expect(counts.updates).toBe(0);
    expect(await send('Bearer ' + secret, '{"databaseCpu":1,"cmsCpu":1}')).toBe(200);
    expect(counts.updates).toBe(2);
    expect(JSON.parse(await readFile(overridePath, 'utf8'))).toEqual({
      services: { app: { cpus: 1 }, mongo: { cpus: 1 } },
    });
  } finally {
    child.kill('SIGTERM');
    const result = await exited;

    engine.closeAllConnections();
    await new Promise<void>((resolve) => engine.close(() => resolve()));
    await rm(root, { recursive: true, force: true });

    expect(result.error).toBeNull();
  }
}, 15000);
