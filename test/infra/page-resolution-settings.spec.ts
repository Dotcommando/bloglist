import { readPublicHttpSettings } from '../../src/infra/public-http.settings.js';

describe('page diagnostic startup settings', () => {
  const environment = {
    ZARYA_MONGO_URI: 'mongodb://localhost:27017',
    ZARYA_MONGO_DATABASE: 'unit_diagnostics',
    ZARYA_HTTP_PORT: '0',
  };

  it('enables recording by default and accepts explicit disabling', () => {
    expect(readPublicHttpSettings(environment).pageDiagnostics).toBe(true);
    expect(readPublicHttpSettings({ ...environment, ZARYA_PAGE_DIAGNOSTICS: 'false' }).pageDiagnostics).toBe(false);
  });

  it('rejects unsupported values at startup', () => {
    expect(() => readPublicHttpSettings({ ...environment, ZARYA_PAGE_DIAGNOSTICS: 'invalid' })).toThrow();
  });
});
