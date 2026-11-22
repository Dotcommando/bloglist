import { request } from 'node:http';

import type { IContainerResourceObservation } from '../../../../ports/outbound/resources/container-resources.port.js';

export function resourceRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid resource-control metadata');
  }

  return Object.fromEntries(Object.entries(value));
}

export function resourceObservation(value: unknown): IContainerResourceObservation {
  const data = resourceRecord(value);

  if (
    !(data.databaseCpu === null || typeof data.databaseCpu === 'number' && Number.isFinite(data.databaseCpu))
    || !(data.cmsCpu === null || typeof data.cmsCpu === 'number' && Number.isFinite(data.cmsCpu))
    || !(data.databaseImage === null || typeof data.databaseImage === 'string')
  ) {
    throw new Error('Invalid resource observation');
  }

  return { databaseCpu: data.databaseCpu, cmsCpu: data.cmsCpu, databaseImage: data.databaseImage };
}

export function localResourceExchange(socketPath: string, target: string, method: string,
  body?: unknown, secret?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = request({
      socketPath,
      path: target,
      method,
      headers: {
        ...(secret ? { Authorization: 'Bearer ' + secret } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    },
    (incoming) => {
      const chunks: Buffer[] = [];
      let size = 0;

      incoming.on('data', (chunk: Buffer) => {
        size += chunk.length;

        if (size > 1024 * 1024) {
          incoming.destroy(new Error('Resource-control metadata exceeds its limit'));
        } else {
          chunks.push(chunk);
        }
      });
      incoming.once('error', reject);
      incoming.once('aborted', () => reject(new Error('Resource-control response was interrupted')));
      incoming.once('end', () => {
        if (!incoming.statusCode || incoming.statusCode < 200 || incoming.statusCode >= 300) {
          reject(new Error('Resource-control operation failed'));

          return;
        }

        try {
          resolve(size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null);
        } catch (error) {
          reject(error);
        }
      });
    });

    outgoing.once('error', reject);
    outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Resource-control deadline exceeded')));
    outgoing.end(payload);
  });
}
