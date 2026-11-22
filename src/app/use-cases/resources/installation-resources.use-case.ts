import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import type { IInstallationResourceView } from '../../../domain/resources/installation-resources.js';
import { DatabasePlacement, resolveDumpExecution, unallocatedCpu, validateResourceAllocation } from
  '../../../domain/resources/site-process-allocation.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IChangeInstallationResources, IGetInstallationResources } from
  '../../../ports/inbound/resources/installation-resources.port.js';
import type { IInstallationResourcesPort } from '../../../ports/outbound/resources/installation-resources.port.js';
import type { ISiteResourceCatalogPort } from '../../../ports/outbound/resources/site-resource-catalog.port.js';

export class GetInstallationResourcesUseCase implements IGetInstallationResources {
  constructor(protected readonly resources: IInstallationResourcesPort,
    protected readonly sites: ISiteResourceCatalogPort,
    protected readonly current: IGetCurrentAdminUser) {}

  async execute(input: Parameters<IGetInstallationResources['execute']>[0]): Promise<IInstallationResourceView> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const sites = await this.sites.list();
    const state = await this.resources.read(sites.map((site) => site.siteId));

    return {
      ...state,
      recommendation: Math.ceil(state.observedCmsCpu ?? state.cmsCpu),
      unallocated: unallocatedCpu(state),
      allocationEditable: state.capacity > 1 && !(state.databasePlacement === DatabasePlacement.ManagedLocal
        && sites.length === 1 && state.capacity <= 2),
      siteDetails: sites.map((site) => ({
        siteId: site.siteId,
        name: site.name,
        domain: site.primaryDomain,
        dumpMode: resolveDumpExecution(state, site.siteId),
        ...(site.addons ? { addons: site.addons } : {}),
      })),
    };
  }
}

export class ChangeInstallationResourcesUseCase implements IChangeInstallationResources {
  constructor(private readonly resources: IInstallationResourcesPort, private readonly sites: ISiteResourceCatalogPort,
    private readonly current: IGetCurrentAdminUser) {}

  async execute(input: Parameters<IChangeInstallationResources['execute']>[0]): Promise<IInstallationResourceView> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const sites = await this.sites.list();
    const state = await this.resources.read(sites.map((site) => site.siteId));

    if (state.version !== input.expectedVersion || state.activeDump) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Resource configuration changed or a dump is active');
    }

    const allocationChanged = input.databaseCpu !== state.databaseCpu
      || input.cmsCpu !== undefined && input.cmsCpu !== state.cmsCpu
      || input.sites.length !== state.sites.length
      || input.sites.some((entry) => !state.sites.some((saved) => saved.siteId === entry.siteId
        && saved.processes === entry.processes));

    if (
      allocationChanged
      && (state.capacity <= 1
      || (state.databasePlacement === DatabasePlacement.ManagedLocal
      && sites.length === 1
      && state.capacity <= 2))
      || input.sitePoolSize !== undefined
      && (!Number.isSafeInteger(input.sitePoolSize)
        || input.sitePoolSize < 1
      || !state.databasePools?.editable)
      || input.cmsCpu !== undefined
      && (!state.managed
      || !Number.isFinite(input.cmsCpu)
        || input.cmsCpu <= 0
      || input.cmsCpu > state.capacity
        || Math.abs(input.cmsCpu * 10 - Math.round(input.cmsCpu * 10)) > 1e-9
        || state.capacity > 1
      && input.cmsCpu + input.databaseCpu + state.infrastructureCpu > state.capacity + 1e-8)
      || !Number.isFinite(input.databaseCpu)
      || Math.abs(input.databaseCpu * 10 - Math.round(input.databaseCpu * 10)) > 1e-9
      || input.sites.length !== sites.length
      || input.sites.some((entry) => !sites.some((site) => site.siteId === entry.siteId))
      || (input.databaseCpu !== state.databaseCpu
      && !state.managed)
      || (state.capacity > 1
      && input.databaseCpu + state.infrastructureCpu >= state.capacity)
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid resource distribution');
    }
    validateResourceAllocation({ ...state, databaseCpu: input.databaseCpu, sites: input.sites });

    await this.resources.change({
      expectedVersion: input.expectedVersion,
      databaseCpu: input.databaseCpu,
      ...(input.sitePoolSize !== undefined ? { sitePoolSize: input.sitePoolSize } : {}),
      ...(input.cmsCpu !== undefined ? { cmsCpu: input.cmsCpu } : {}),
      sites: input.sites,
    });

    return new GetInstallationResourcesUseCase(this.resources, this.sites, this.current).execute(input);
  }
}
