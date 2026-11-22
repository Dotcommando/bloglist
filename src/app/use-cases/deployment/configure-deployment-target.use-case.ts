import { DeploymentIssue, DeploymentState, type IDeploymentTarget } from '../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import { servingSiteOrigin } from '../../../domain/sites/site-addresses.js';
import type {
  IConfigureDeploymentInput, IConfigureDeploymentTarget,
} from '../../../ports/inbound/deployment/deployment.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type {
  IDeploymentAccessPort, IDeploymentValuesPort,
} from '../../../ports/outbound/deployment/deployment-access.port.js';
import type { IDeploymentProviderCataloguePort } from '../../../ports/outbound/deployment/deployment-provider.port.js';
import type { IDeploymentPublicationPort } from '../../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../../ports/outbound/deployment/deployment-store.port.js';

function origin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid deployment origin');
  }
  requireCondition(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
    && (url.protocol === 'https:' || url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'Invalid deployment origin');

  return url.origin;
}

export class ConfigureDeploymentTargetUseCase implements IConfigureDeploymentTarget {
  constructor(private readonly store: IDeploymentStorePort, private readonly access: IDeploymentAccessPort,
    private readonly publications: IDeploymentPublicationPort, private readonly sites: IGetSite,
    private readonly catalogue: IDeploymentProviderCataloguePort, private readonly values: IDeploymentValuesPort) {}

  async execute(input: IConfigureDeploymentInput): Promise<IDeploymentTarget> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const site = await this.sites.execute({ siteId: input.siteId });

    if (!site) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
    requireCondition(site.siteId === input.siteId, 'Foreign deployment site');
    requireCondition(this.catalogue.supports(input.providerKey), 'Unsupported deployment provider');
    requireCondition(input.destinationName.trim().length > 0 && input.destinationName.length <= 200
      && Array.from(input.destinationName).every((character) => character.charCodeAt(0) >= 32
        && character.charCodeAt(0) !== 127), 'Invalid destination name');
    const publicOrigin = origin(input.publicOrigin);
    const backendOrigin = origin(input.backendOrigin);
    const selected = servingSiteOrigin(site.toState().addresses) ?? 'https://' + site.primaryDomain;

    requireCondition(publicOrigin === selected && publicOrigin !== backendOrigin,
      'Deployment origins must match the selected site and avoid a proxy loop');
    const current = await this.store.get(input.siteId);

    if ((current?.target.version ?? null) !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Deployment configuration changed');
    }
    if (current?.state === DeploymentState.Running || current?.state === DeploymentState.OutcomeUnknown) {
      throw new BusinessError(BusinessErrorCode.Conflict,
        'Resolve the active delivery before changing its destination');
    }

    const now = this.values.now();
    const target: IDeploymentTarget = {
      targetId: current?.target.targetId ?? this.values.id(),
      siteId: input.siteId,
      version: this.values.id(),
      providerKey: input.providerKey,
      destinationName: input.destinationName.trim(),
      publicOrigin,
      backendOrigin,
      enabled: input.enabled,
      createdAt: current?.target.createdAt ?? now,
      updatedAt: now,
    };

    this.catalogue.validate(target);
    const publication = await this.publications.current(input.siteId);

    await this.store.save({
      siteId: input.siteId,
      version: this.values.id(),
      target,
      state: target.enabled && publication ? DeploymentState.Queued : DeploymentState.Idle,
      attempt: null,
      requested: publication,
      attempts: 0,
      retryAt: null,
      diagnostic: target.enabled && !publication ? { issue: DeploymentIssue.NoPublication, retryable: false } : null,
      delivered: current?.delivered ?? null,
    }, current?.version ?? null);

    return target;
  }
}
