import type { ISiteFile } from '../files/files.types.js';
import { defaultImageOutput, imageOutputs } from '../files/image-outputs.js';

export function openGraphImageUrl(file: ISiteFile, publicOrigin: string | null, outputKey?: string): string {
  const output = outputKey === undefined ? defaultImageOutput(file.outputs)
    : imageOutputs(file.outputs).find((item) => item.key === outputKey);

  if (!file.mimeType.startsWith('image/') || !output || output.url.startsWith('//')) {
    throw new Error('A public image output is required');
  }

  const url = new URL(output.url, publicOrigin ?? undefined);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('A public HTTP image address is required');
  }

  return url.href;
}
