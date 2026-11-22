import sharp from 'sharp';

export async function icoFixture(width = 32): Promise<Buffer> {
  const png = await sharp({ create: { width, height: width, channels: 4, background: '#4488ff' } }).png().toBuffer();
  const header = Buffer.alloc(22);

  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = width === 256 ? 0 : width;
  header[7] = width === 256 ? 0 : width;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);

  return Buffer.concat([header, png]);
}
