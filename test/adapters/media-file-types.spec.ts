import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { AssetInspectionAdapter } from '../../src/adapters/outbound/media/sharp/asset-inspection.adapter.js';
import type { IInspectedAsset } from '../../src/ports/outbound/media/asset-inspection.port.js';
import { zipFixture } from '../support/office-documents.js';

describe('accepted media file formats', () => {
  const adapter = new AssetInspectionAdapter();
  const resources: IInspectedAsset[] = [];
  const inspection = {
    inspect: async (...args: Parameters<AssetInspectionAdapter['inspect']>): Promise<IInspectedAsset> => {
      const result = await adapter.inspect(...args);

      resources.push(result);

      return result;
    },
  };

  afterEach(async () => {
    await Promise.all(resources.splice(0).map((result) => result.dispose?.()));
  });

  it('reports distinct size, format, content and CSV encoding failures', async () => {
    for (const [filename, bytes, issue] of [
      ['empty.csv', Buffer.alloc(0), 'FileEmpty'],
      ['wrong.exe', Buffer.from('not accepted'), 'FileUnsupportedFormat'],
      ['fake.xlsx', Buffer.from('not a workbook'), 'FileContentMismatch'],
      ['fake.png', Buffer.from('not an image'), 'FileContentMismatch'],
      ['encoding.csv', Buffer.from([0xff, 0xfe, 0x41, 0x00]), 'FileCsvEncoding'],
      ['binary.csv', Buffer.from('a,\0b'), 'FileCsvContent'],
      ['large.csv', Buffer.alloc(64 * 1024 * 1024 + 1), 'FileDocumentTooLarge'],
      ['large.png', Buffer.alloc(20 * 1024 * 1024 + 1), 'FileImageTooLarge'],
    ] as const) {
      await expect(inspection.inspect(filename, assetBinary(bytes, 'wrong/type'))).rejects.toMatchObject({ issue });
    }
  });

  it('accepts detected WOFF2 without image geometry and rejects disguised content', async () => {
    const bytes = Buffer.alloc(48);

    bytes.write('wOF2');
    bytes.writeUInt32BE(0x00010000, 4);
    bytes.writeUInt32BE(bytes.length, 8);
    const font = await inspection.inspect('regular.woff2', assetBinary(bytes, 'application/octet-stream'));

    expect(font.content).toMatchObject({ mimeType: 'font/woff2', byteSize: bytes.length });
    expect(font.dimensions).toBeUndefined();
    await expect(inspection.inspect('fake.woff2', assetBinary(Buffer.from('<script>bad</script>'), 'font/woff2')))
      .rejects.toMatchObject({ issue: 'FileContentMismatch' });
  });

  it('accepts UTF-8 JSON and rejects malformed JSON', async () => {
    expect((await inspection.inspect('data.json', assetBinary(Buffer.from('{"ok":true}'), 'wrong/type')))
      .content.mimeType).toBe('application/json');
    await expect(inspection.inspect('broken.json', assetBinary(Buffer.from('{bad}'), 'application/json')))
      .rejects.toThrow();
  });

  it.each(['jpeg', 'png', 'webp', 'avif'])('inspects actual %s raster data', async (format) => {
    const source = sharp({ create: { width: 16, height: 12, channels: 3, background: '#f00' } });
    const bytes = format === 'jpeg' ? await source.jpeg().toBuffer()
      : format === 'png' ? await source.png().toBuffer()
        : format === 'webp' ? await source.webp().toBuffer() : await source.avif().toBuffer();

    expect((await inspection.inspect('image.' + format, assetBinary(bytes, 'wrong/type'))).content.mimeType)
      .toBe('image/' + format);
  });
  it('accepts ICO containing real icon pixels', async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#f005' } }).png().toBuffer();
    const icon = Buffer.alloc(22);

    icon.writeUInt16LE(1, 2);
    icon.writeUInt16LE(1, 4);
    icon[6] = 16;
    icon[7] = 16;
    icon.writeUInt16LE(1, 10);
    icon.writeUInt16LE(32, 12);
    icon.writeUInt32LE(png.length, 14);
    icon.writeUInt32LE(22, 18);
    expect((await inspection.inspect('favicon.ico', assetBinary(Buffer.concat([icon, png]), 'wrong/type')))
      .content.mimeType).toBe('image/x-icon');
  });
  it.each([['doc', 'WordDocument', 'application/msword'], ['xls', 'Workbook', 'application/vnd.ms-excel']])(
    'recognizes legacy %s compound-file content', async (extension, streamName, mime) => {
      const source = Buffer.alloc(1024);

      Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(source);
      Buffer.from(streamName, 'utf16le').copy(source, 512);
      expect((await inspection.inspect('attachment.' + extension, assetBinary(source, 'wrong/type'))).content.mimeType)
        .toBe(mime);
    });
  it.each([['docx', 'word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']])(
    'recognizes %s packages', async (extension, filename, mime) => {
      const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Override PartName="/' + filename + '" ContentType="' + mime + '.main+xml"/></Types>';
      const source = zipFixture([{ name: '[Content_Types].xml', value: contentTypes },
        { name: filename, value: '<document/>' }]);

      expect((await inspection.inspect('attachment.' + extension, assetBinary(source, 'wrong/type'))).content.mimeType)
        .toBe(mime);
    });
  it('uses the document byte limit rather than the smaller image limit', async () => {
    const text = Buffer.alloc(21 * 1024 * 1024, 65);

    expect((await inspection.inspect('large.csv', assetBinary(text, 'text/csv'))).content.byteSize).toBe(text.length);
    await expect(inspection.inspect('too-large.csv', assetBinary(new Uint8Array(64 * 1024 * 1024 + 1), 'text/csv')))
      .rejects.toThrow('byte limit');
  });
});
