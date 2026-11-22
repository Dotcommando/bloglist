import { normalizeAdminEmail, validateAdminPassword } from '../../src/domain/admin-users/admin-user.policy.js';

describe('administrator input policy', () => {
  it('normalizes case and internationalized email domains', () => {
    expect(normalizeAdminEmail(' ADMIN@B\u00dcCHER.EXAMPLE ')).toBe('admin@xn--bcher-kva.example');
  });
  it.each(['not-email', 'two@@example.test', '<bad>@example.test', '.bad@example.test',
    'bad..name@example.test', 'bad@example.test/path', 'bad@example.test:80',
  ])('rejects malformed email %s', (value) => {
    expect(() => normalizeAdminEmail(value)).toThrow();
  });
  it('counts Unicode code points without trimming or truncating passwords', () => {
    expect(() => validateAdminPassword('\u{1f642}'.repeat(15))).not.toThrow();
    expect(() => validateAdminPassword('\u{1f642}'.repeat(14))).toThrow();
    expect(() => validateAdminPassword('synthetic password '.repeat(100))).toThrow();
    expect(() => validateAdminPassword('  long password  ')).not.toThrow();
  });
});
