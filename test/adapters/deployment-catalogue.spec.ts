import {
  validateCloudflareTarget,
} from '../../src/adapters/outbound/deployment/cloudflare/cloudflare-target.validator.js';
import {
  DeploymentProviderCatalogueAdapter,
} from '../../src/adapters/outbound/deployment/deployment-provider-catalogue.adapter.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

describe('explicit deployment provider catalogue', () => {
  it('rejects unknown providers instead of silently selecting Cloudflare', () => {
    const catalogue = new DeploymentProviderCatalogueAdapter(new Map([['cloudflare', validateCloudflareTarget]]));

    expect(catalogue.supports('synthetic')).toBe(false);
    expect(() => catalogue.validate(deploymentFixture().target)).toThrow();
  });

  it('validates Cloudflare-specific destination names outside the application use case', () => {
    const catalogue = new DeploymentProviderCatalogueAdapter(new Map([['cloudflare', validateCloudflareTarget]]));
    const target = { ...deploymentFixture().target, providerKey: 'cloudflare', destinationName: 'example-site' };

    expect(catalogue.supports('cloudflare')).toBe(true);
    expect(() => catalogue.validate(target)).not.toThrow();
    expect(() => catalogue.validate({ ...target, destinationName: '../foreign' })).toThrow();
  });
});
