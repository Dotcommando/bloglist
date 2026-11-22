import {
  AdminAuthSecretsAdapter, AdminAuthValuesAdapter,
} from '../../src/adapters/outbound/security/admin-auth/admin-auth-values.adapter.js';

describe('administrator authentication values', () => {
  it('uses random opaque tokens, stores only hashes and rejects malformed tokens', () => {
    const adapter = new AdminAuthSecretsAdapter();
    const first = adapter.issue();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(adapter.digest(first.token)).toBe(first.tokenDigest);
    expect(adapter.issue().token).not.toBe(first.token);
    expect(adapter.digest('malformed')).toBeNull();
    expect(adapter.loginKey('normalized@example.test')).toMatch(/^[a-f0-9]{64}$/);
    expect(adapter.sourceKey('127.0.0.1')).toMatch(/^[a-f0-9]{64}$/);
    expect(adapter.sourceKey('127.0.0.1')).not.toBe(adapter.loginKey('127.0.0.1'));
    expect(adapter.sourceKey(null)).not.toBe(adapter.sourceKey('127.0.0.1'));
  });
  it('adds exactly two calendar months in UTC with constrained month ends', () => {
    const adapter = new AdminAuthValuesAdapter();

    expect(adapter.sessionExpiresAt(new Date('2026-12-31T23:14:15.123Z')))
      .toEqual(new Date('2027-02-28T23:14:15.123Z'));
    expect(adapter.sessionExpiresAt(new Date('2027-12-31T23:14:15.123Z')))
      .toEqual(new Date('2028-02-29T23:14:15.123Z'));
  });
});
