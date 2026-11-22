import { createHmac } from 'node:crypto';

export function adminAddressProof(key: string, host: string, nonce: string): string {
  return createHmac('sha256', key).update(host + '\n' + nonce).digest('hex');
}
