import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { handleCalibrationLoad } from '../../src/adapters/inbound/rest/calibration/calibration-load-helper.js';
import { ProcessCalibrationLoad } from '../../src/adapters/outbound/runtime/calibration/calibration-load.adapter.js';

/** Protocol double for Docker CPU control only; the generator and HTTP traffic remain real. */
export async function calibrationHelperFixture(): Promise<{
  resourceSocket: string;
  resourceSecret: string;
  observations: { databaseCpu: number; cmsCpu: number }[];
  target(value: string): void;
  close(): Promise<void>;
}> {
  const socket = process.platform === 'win32' ? '\\\\.\\pipe\\zarya-calibration-' + randomUUID()
    : path.join(os.tmpdir(), 'zarya-calibration-' + randomUUID() + '.sock');
  const secret = 'a'.repeat(64);
  let origin = '';
  let limits = { databaseCpu: 1, cmsCpu: 5 };
  const observations: typeof limits[] = [];
  const generator = new ProcessCalibrationLoad(() => origin);
  const server = createServer((request, response) => {
    const handle = async (): Promise<void> => {
      if (request.headers.authorization !== 'Bearer ' + secret) {
        response.writeHead(403).end();

        return;
      }
      if (request.url === '/calibration/load') {
        await handleCalibrationLoad(request, response, generator);

        return;
      }
      if (request.method === 'PUT') {
        const parts: Buffer[] = [];

        for await (const chunk of request) {
          parts.push(Buffer.from(chunk));
        }
        limits = JSON.parse(Buffer.concat(parts).toString());
        observations.push(limits);
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ...limits, databaseImage: 'synthetic-docker:0.14.0' }));
    };

    void handle().catch(() => response.writeHead(503).end());
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socket, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    resourceSocket: socket,
    resourceSecret: secret,
    observations,
    target(value: string): void {
      origin = value;
    },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
