import 'reflect-metadata';

import { Test } from '@nestjs/testing';

import { CmsApiService } from '../../src/app/services/cms/cms-api.service.js';
import { cmsApiProviders } from '../../src/infra/cms/cms.providers.js';
import { CMS_API, CMS_SNIPPET_API } from '../../src/infra/cms/cms.tokens.js';
import { PublicHttpModule } from '../../src/infra/public-http.module.js';

const settings = {
  mongoUri: 'mongodb://localhost:27017',
  database: 'zarya_unit',
  host: '127.0.0.1',
  port: 0,
  artifactsRoot: '.tmp/cms-test-artifacts',
};

describe('private CMS extension composition', () => {
  it('resolves the private API through a token without any controller or network adapter', async () => {
    const providers = cmsApiProviders(settings);

    expect(providers.every((provider) => typeof provider === 'object' && 'provide' in provider
      && ['symbol', 'string'].includes(typeof provider.provide))).toBe(true);
    const module = await Test.createTestingModule({ providers }).compile();

    try {
      expect(module.get(CMS_API)).toBeInstanceOf(CmsApiService);
      expect(module.get(CMS_SNIPPET_API)).toHaveProperty('forSnippet');
    } finally {
      await module.close();
    }
  });

  it('makes the bridge available internally in HTTP composition without exporting it or registering routes', () => {
    const module = PublicHttpModule.forHttp(settings);

    expect(module.controllers).toBeUndefined();
    expect(module.exports).toBeUndefined();
    expect(module.providers?.some((provider) => typeof provider === 'object' && 'provide' in provider
      && provider.provide === CMS_SNIPPET_API)).toBe(true);
  });
});
