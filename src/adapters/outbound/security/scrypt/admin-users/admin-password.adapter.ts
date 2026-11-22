import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { validateAdminPassword } from '../../../../../domain/admin-users/admin-user.policy.js';
import type { IAdminPasswordPort } from '../../../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

const COST = 32768;

const BLOCK_SIZE = 8;

const PARALLELISM = 3;

const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY_BYTES },
      (error, derived) => {
        if (error) {
          reject(error);
        } else {
          resolve(derived);
        }
      });
  });
}

export class ScryptAdminPasswordAdapter implements IAdminPasswordPort {
  async hash(password: string): Promise<string> {
    validateAdminPassword(password);
    const salt = randomBytes(16);
    const key = await derive(password, salt);

    return ['scrypt', 'v1', COST, BLOCK_SIZE, PARALLELISM,
      salt.toString('base64url'), key.toString('base64url')].join('$');
  }

  async verify(password: string, digest: string | null): Promise<boolean> {
    const parts = digest?.split('$');
    const saltText = parts?.[5] ?? '';
    const keyText = parts?.[6] ?? '';
    const salt = Buffer.from(saltText, 'base64url');
    const key = Buffer.from(keyText, 'base64url');
    const valid = parts?.length === 7 && parts.slice(0, 5).join('$') === 'scrypt$v1$32768$8$3'
      && salt.length === 16 && key.length === 64 && salt.toString('base64url') === saltText
      && key.toString('base64url') === keyText;
    // Unknown accounts and corrupt digests perform the same bounded expensive derivation.
    const actual = await derive(password, valid ? salt : Buffer.alloc(16));
    const equal = timingSafeEqual(actual, valid ? key : Buffer.alloc(64));

    return Boolean(valid && equal);
  }
}
