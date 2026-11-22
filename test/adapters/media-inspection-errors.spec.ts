import { stat } from 'node:fs/promises';
import path from 'node:path';

import type * as FileType from 'file-type';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';

import { AssetInspectionAdapter } from '../../src/adapters/outbound/media/sharp/asset-inspection.adapter.js';

vi.mock('file-type', async (original) => {
  const module = await original<typeof FileType>();

  return { ...module, fileTypeFromFile: vi.fn(module.fileTypeFromFile) };
});

it('propagates staged-file system errors and releases temporary content', async () => {
  const bytes = await sharp({
    create: {
      width: 2, height: 2, channels: 4, background: '#336699',
    },
  }).png().toBuffer();
  const failure = Object.assign(new Error('Staged file read failed'), {
    code: 'EIO', syscall: 'open', errno: -4070,
  });

  vi.mocked(fileTypeFromFile).mockRejectedValueOnce(failure);
  await expect(new AssetInspectionAdapter().inspect('photo.png', {
    mimeType: 'image/png',
    byteSize: bytes.length,
    bytes: {
      async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
        yield bytes;
      },
    },
  })).rejects.toBe(failure);
  const filename = vi.mocked(fileTypeFromFile).mock.calls[0]?.[0];

  if (!filename) {
    throw new Error('Inspection did not reach the staged file');
  }
  await expect(stat(path.dirname(filename))).rejects.toMatchObject({ code: 'ENOENT' });
});
