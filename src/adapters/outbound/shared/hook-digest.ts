import { createHash } from 'node:crypto';

export function hookDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
