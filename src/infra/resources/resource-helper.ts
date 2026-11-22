import { createHash, timingSafeEqual } from 'node:crypto';
import { chmod, chown, lstat, readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import os from 'node:os';

import { handleCalibrationLoad } from '../../adapters/inbound/rest/calibration/calibration-load-helper.js';
import { ProcessCalibrationLoad } from '../../adapters/outbound/runtime/calibration/calibration-load.adapter.js';
import { resourceRecord } from '../../adapters/outbound/runtime/docker/container-resource.protocol.js';
import {
  DockerEngineResourceBoundary,
} from '../../adapters/outbound/runtime/docker/docker-engine-resource.boundary.js';
import {
  DockerResourceControlAdapter,
} from '../../adapters/outbound/runtime/docker/docker-resource-control.adapter.js';

const socketPath = process.env.ZARYA_RESOURCE_SOCKET ?? '';

const secretPath = process.env.ZARYA_RESOURCE_SECRET_FILE ?? '';

const overridePath = process.env.ZARYA_RESOURCE_OVERRIDE_FILE ?? '';

const capacity = Number(process.env.ZARYA_INSTALLATION_CPU_BUDGET);

const infrastructureCpu = Number(process.env.ZARYA_INFRASTRUCTURE_CPU_RESERVE ?? '0');

if (
  !socketPath
  || !secretPath
  || !overridePath
  || !Number.isFinite(capacity)
  || capacity <= 0
  || capacity > os.availableParallelism()
  || !Number.isFinite(infrastructureCpu)
  || infrastructureCpu < 0
  || infrastructureCpu >= capacity
) {
  throw new Error('Explicit valid resource-helper settings are required');
}

const secret = (await readFile(secretPath, 'utf8')).trim();

if (!/^[a-f0-9]{64}$/.test(secret) || !(await lstat(secretPath)).isFile()) {
  throw new Error('Private resource-helper key required');
}

const controller = new DockerResourceControlAdapter({ capacity, infrastructureCpu },
  new DockerEngineResourceBoundary({
    dockerSocket: process.env.ZARYA_DOCKER_SOCKET ?? '/var/run/docker.sock',
    composeProject: process.env.ZARYA_RESOURCE_COMPOSE_PROJECT ?? '',
    overridePath,
  }));

const calibrationOrigin = process.env.ZARYA_CALIBRATION_TARGET_ORIGIN ?? 'http://127.0.0.1:3000';

const calibration = new ProcessCalibrationLoad(() => calibrationOrigin);

const server = createServer((request, response) => {
  const handle = async (): Promise<void> => {
    const supplied = request.headers.authorization ?? '';
    const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

    if (
      !timingSafeEqual(digest(supplied), digest('Bearer ' + secret))
      || !['/limits', '/calibration/load'].includes(request.url ?? '')
      || request.rawHeaders.filter((value, index) =>
        index % 2 === 0 && value.toLowerCase() === 'authorization').length !== 1
    ) {
      response.writeHead(403).end();

      return;
    }
    if (request.url === '/calibration/load') {
      await handleCalibrationLoad(request, response, calibration);

      return;
    }
    if (request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(await controller.observe()));

      return;
    }
    if (
      request.method !== 'PUT'
      || request.headers['content-encoding'] !== undefined
      || request.headers['content-type'] !== 'application/json'
    ) {
      response.writeHead(400).end();

      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
      if (!Buffer.isBuffer(chunk) || (size += chunk.length) > 8192) {
        response.writeHead(413).end();

        return;
      }
      chunks.push(chunk);
    }
    const body = resourceRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')));

    if (
      Object.keys(body).some((key) => !['databaseCpu', 'cmsCpu'].includes(key))
      || typeof body.databaseCpu !== 'number'
      || typeof body.cmsCpu !== 'number'
    ) {
      response.writeHead(400).end();

      return;
    }

    const result = await controller.apply({ databaseCpu: body.databaseCpu, cmsCpu: body.cmsCpu });

    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  };

  void handle().catch(() => {
    if (!response.headersSent) {
      response.writeHead(503);
    }
    response.end();
  });
});

try {
  const previous = await lstat(socketPath);

  if (!previous.isSocket() || previous.isSymbolicLink()) {
    throw new Error('Resource socket path is occupied');
  }

  const live = await new Promise<boolean>((resolve, reject) => {
    const probe = connect(socketPath);

    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') {
        resolve(false);
      } else {
        reject(error);
      }
    });
    probe.setTimeout(1000, () => probe.destroy(new Error('Resource socket probe timed out')));
  });

  if (live) {
    throw new Error('Another resource helper is running');
  }
  await unlink(socketPath);
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error;
  }
}

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(socketPath, () => {
    server.off('error', reject);
    resolve();
  });
});

try {
  await chmod(socketPath, 0o600);
  await chown(socketPath,
    Number(process.env.ZARYA_RESOURCE_UID ?? '1000'), Number(process.env.ZARYA_RESOURCE_GID ?? '1000'));
} catch (error) {
  server.close();
  throw error;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}
