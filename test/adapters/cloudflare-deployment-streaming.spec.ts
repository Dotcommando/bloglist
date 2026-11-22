import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  CloudflareDeploymentAdapter,
} from '../../src/adapters/outbound/deployment/cloudflare/cloudflare-deployment.adapter.js';

it('streams public deployment payloads without collecting binary files into Buffer arrays', async () => {
  const root = await mkdtemp(path.resolve('.tmp/deployment-stream-'));

  if (!root.startsWith(path.resolve('.tmp') + path.sep)) {
    throw new Error('Unexpected deployment test root');
  }

  const chunk = new Uint8Array(64 * 1024).fill(65);
  const byteSize = chunk.length * 32;
  const expected = createHash('sha256');

  for (let index = 0; index < 32; index++) {
    expected.update(chunk);
  }
  const checksum = expected.digest('hex');
  const writer = new CloudflareDeploymentAdapter({
    outputRoot: path.join(root, 'output'),
    siteId: 'site',
    workerName: 'synthetic',
    publicOrigin: 'https://example.test',
    backendOrigin: 'http://127.0.0.1:3000',
    mediaPath: '/assets',
  }, 'export function createCloudflareWorker() {}');
  const concatenate = vi.spyOn(Buffer, 'concat');

  try {
    const result = await writer.write({
      siteId: 'site',
      releaseId: 'release',
      primaryDomain: 'example.test',
      publicOrigin: 'https://example.test',
      routes: [],
      files: [{
        path: 'assets/files/payload.pdf',
        checksum,
        content: {
          mimeType: 'application/pdf',
          byteSize,
          bytes: {
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
              for (let index = 0; index < 32; index++) {
                yield chunk;
              }
            },
          },
        },
      }],
    });

    expect(concatenate.mock.calls.filter(([chunks]) =>
      chunks.reduce((size, part) => size + part.byteLength, 0) > 64 * 1024).length).toBe(0);
    const filename = path.join(result.directory, 'assets/files/payload.pdf');

    expect((await stat(filename)).size).toBe(byteSize);
    const actual = createHash('sha256');

    for await (const part of createReadStream(filename)) {
      actual.update(part);
    }
    expect(actual.digest('hex')).toBe(checksum);
  } finally {
    concatenate.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
