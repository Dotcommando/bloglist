import path from 'node:path';

import { cloudflareSettings } from '../../src/infra/deployment/cloudflare.settings.js';

describe('one-time Cloudflare site configuration', () => {
  const local = {
    mongoUri: 'mongodb://localhost:27017',
    database: 'synthetic',
    operator: { operatorId: 'operator', platformAdministrator: true as const },
  };
  const config = {
    siteId: 'site-1', workerName: 'example-site', publicOrigin: 'https://example.test', backendOrigin: 'https://origin.test',
  };

  it('uses a stable output directory independent of publication identity', () => {
    expect(cloudflareSettings(config, local).outputRoot).toBe(path.resolve('deploy'));
  });

  it('rejects proxy loops, unknown fields, credentialed origins and overlapping storage', () => {
    expect(() => cloudflareSettings({ ...config, backendOrigin: config.publicOrigin }, local)).toThrow();
    expect(() => cloudflareSettings({ ...config, releaseId: 'manual' }, local)).toThrow();
    expect(() => cloudflareSettings({ ...config, backendOrigin: 'https://user:password@origin.test' }, local)).toThrow();
    expect(() => cloudflareSettings(config, {
      ...local,
      media: { root: path.resolve('deploy/media'), publicBaseUrl: '/assets' },
    })).toThrow();
  });
});
