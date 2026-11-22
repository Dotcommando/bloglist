import { readLocalSettings, validateLocalSettings } from '../../src/infra/local-application.settings.js';

describe('local application settings', () => {
  const environment = {
    ZARYA_MONGO_URI: 'mongodb://localhost:27039/?directConnection=true',
    ZARYA_MONGO_DATABASE: 'zarya_local',
    ZARYA_LOCAL_OPERATOR_ID: 'local',
    ZARYA_LOCAL_ADMINISTRATOR: 'true',
    ZARYA_MEDIA_ROOT: './data/media',
    ZARYA_MEDIA_PUBLIC_PATH: '/media',
  };

  it('reads explicit configuration and freezes a detached operator context', () => {
    const settings = readLocalSettings(environment);

    expect(settings.database).toBe('zarya_local');
    expect(Object.isFrozen(settings)).toBe(true);
    expect(Object.isFrozen(settings.operator)).toBe(true);
    const input = { ...settings, operator: { ...settings.operator } };
    const copied = validateLocalSettings(input);

    input.operator.platformAdministrator = false;
    expect(copied.operator.platformAdministrator).toBe(true);
  });

  it.each([
    'ZARYA_MONGO_URI', 'ZARYA_MONGO_DATABASE', 'ZARYA_LOCAL_OPERATOR_ID', 'ZARYA_LOCAL_ADMINISTRATOR',
  ])('fails for a missing %s instead of choosing an implicit database/operator', (name) => {
    expect(() => readLocalSettings({ ...environment, [name]: '' })).toThrow();
  });

  it('rejects unsupported schemes, unsafe database names and ambiguous authority values', () => {
    expect(() => readLocalSettings({ ...environment, ZARYA_MONGO_URI: 'https://localhost' })).toThrow();
    expect(() => readLocalSettings({ ...environment, ZARYA_MONGO_DATABASE: '../other' })).toThrow();
    expect(() => readLocalSettings({ ...environment, ZARYA_LOCAL_ADMINISTRATOR: 'yes' })).toThrow();
  });
  it('rejects overlapping rendering roots and invalid read deadlines', () => {
    const settings = readLocalSettings(environment);

    expect(() => validateLocalSettings({
      ...settings,
      rendering: {
        sourcesRoot: './sites', artifactsRoot: './sites/artifacts',
      },
    })).toThrow();
    expect(() => validateLocalSettings({
      ...settings,
      rendering: {
        sourcesRoot: './sites', artifactsRoot: './artifacts', loaderTimeoutMs: 0,
      },
    })).toThrow();
  });
  it('rejects media storage inside publication/source roots to keep originals private', () => {
    const settings = readLocalSettings(environment);

    expect(() => validateLocalSettings({ ...settings, media: { root: './artifacts/media', publicBaseUrl: '/media' } }))
      .toThrow();
    expect(() => validateLocalSettings({ ...settings, media: { root: './sites/media', publicBaseUrl: '/media' } }))
      .toThrow();
  });
});
