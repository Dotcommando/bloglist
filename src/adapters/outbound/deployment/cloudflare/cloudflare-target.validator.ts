import type { IDeploymentTarget } from '../../../../domain/deployment/deployment.js';
import { requireCondition } from '../../../../domain/shared/validation.js';

export function validateCloudflareTarget(target: IDeploymentTarget): void {
  requireCondition(target.providerKey === 'cloudflare'
    && /^[a-z0-9][a-z0-9-]{0,62}$/.test(target.destinationName), 'Invalid Cloudflare Worker name');
}
