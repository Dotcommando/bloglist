import { scrypt } from 'node:crypto';

import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';

describe('administrator password hashing', () => {
  it('verifies exact passwords and fails closed for unknown, corrupt and unsupported digests', async () => {
    const adapter = new ScryptAdminPasswordAdapter();
    const digest = await adapter.hash(' synthetic password ');

    expect(await adapter.verify(' synthetic password ', digest)).toBe(true);
    expect(await adapter.verify('synthetic password', digest)).toBe(false);
    expect(await adapter.verify('wrong', null)).toBe(false);
    expect(await adapter.verify('wrong', 'scrypt$v1$999999999$8$3$bad$bad')).toBe(false);
    expect(await adapter.verify('wrong', digest + '$extra')).toBe(false);
  });
  it('stores salted digests that can be verified without retaining plaintext', async () => {
    const adapter = new ScryptAdminPasswordAdapter();
    const password = '  synthetic test password  ';
    const first = await adapter.hash(password);
    const second = await adapter.hash(password);

    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    const [algorithm, version, n, r, p, salt, key] = first.split('$');

    expect([algorithm, version, n, r, p]).toEqual(['scrypt', 'v1', '32768', '8', '3']);

    if (!salt || !key) {
      throw new Error('Missing digest components');
    }

    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, Buffer.from(salt, 'base64url'), 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, value) => {
          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        });
    });

    expect(actual.equals(Buffer.from(key, 'base64url'))).toBe(true);
  });
});
