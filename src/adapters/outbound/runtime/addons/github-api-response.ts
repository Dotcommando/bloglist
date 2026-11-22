import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { packageObject } from './addon-package-manifest.js';

export const githubApiOrigin = 'https://api.github.com';

export async function readGitHubJson(body: ReadableStream<Uint8Array>): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Uint8Array[] = [];

  for await (const chunk of body) {
    size += chunk.byteLength;

    if (size > 1024 ** 2) {
      throw new BusinessError(BusinessErrorCode.Validation, 'GitHub metadata exceeds its limit');
    }
    chunks.push(chunk);
  }

  return packageObject(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
}
