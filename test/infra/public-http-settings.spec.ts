import { readPublicHttpSettings, validatePublicHttpSettings } from '../../src/infra/public-http.settings.js';

describe('public HTTP settings', () => {
  it('resolves the optional admin build root without enabling authentication implicitly', () => {
    const env = { ZARYA_MONGO_URI: 'mongodb://localhost:27017', ZARYA_MONGO_DATABASE: 'test' };
    const settings = readPublicHttpSettings({ ...env, ZARYA_ADMIN_ROOT: './admin/dist' });

    expect(settings.adminRoot).toMatch(/admin[/\\]dist$/);
    expect(settings.adminAuth).toBeUndefined();
    expect(readPublicHttpSettings(env).adminRoot).toBeUndefined();
    expect(() => readPublicHttpSettings({ ...env, ZARYA_ADMIN_ROOT: '' })).toThrow();
  });
  it('enables admin authentication only with an explicit HTTPS origin or local HTTP origin', () => {
    const env = { ZARYA_MONGO_URI: 'mongodb://localhost:27017', ZARYA_MONGO_DATABASE: 'test' };

    expect(readPublicHttpSettings(env).adminAuth).toBeUndefined();
    expect(readPublicHttpSettings({ ...env, ZARYA_ADMIN_AUTH_ORIGIN: 'http://localhost:3000' }).adminAuth)
      .toEqual({ origin: 'http://localhost:3000' });

    for (const origin of ['http://example.test', 'https://example.test/path', 'https://user:password@example.test',
      'https://example.test/?query=yes', 'https://example.test/#fragment']) {
      expect(() => readPublicHttpSettings({ ...env, ZARYA_ADMIN_AUTH_ORIGIN: origin })).toThrow();
    }
  });
  it('requires database settings but never a local operator and validates before listening', () => {
    const settings = readPublicHttpSettings({ ZARYA_MONGO_URI: 'mongodb://localhost:27017', ZARYA_MONGO_DATABASE: 'test' });

    expect(settings.host).toBe('127.0.0.1');
    expect(settings.port).toBe(3000);
    expect(settings).not.toHaveProperty('operator');
    expect(Object.isFrozen(settings)).toBe(true);
    expect(() => readPublicHttpSettings({})).toThrow();
    expect(() => validatePublicHttpSettings({ ...settings, port: -1 })).toThrow();
    expect(() => validatePublicHttpSettings({ ...settings, host: '' })).toThrow();
    expect(() => readPublicHttpSettings({
      ZARYA_MONGO_URI: settings.mongoUri,
      ZARYA_MONGO_DATABASE: settings.database,
      ZARYA_HTTP_PORT: '',
    })).toThrow();
  });
});
