import {
  AddonInstallationStatus, addonRepositoryUrl, type IAddonInstallation,
} from '../../../domain/addons/addon-installation.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IInstallAddonFromRepository, IInstallAddonFromRepositoryInput,
} from '../../../ports/inbound/addons/install-addon-from-repository.port.js';
import type { IAddonInstallationStore } from '../../../ports/outbound/addons/addon-installation-store.port.js';
import type { IAddonPackageDelivery } from '../../../ports/outbound/addons/addon-package-delivery.port.js';
import type {
  ISiteAddonAccessPort, ISiteAddonValuesPort,
} from '../../../ports/outbound/addons/site-addon-access.port.js';

export class InstallAddonFromRepositoryUseCase implements IInstallAddonFromRepository {
  constructor(private readonly store: IAddonInstallationStore, private readonly delivery: IAddonPackageDelivery,
    private readonly access: ISiteAddonAccessPort, private readonly values: ISiteAddonValuesPort) {}

  async execute(input: IInstallAddonFromRepositoryInput): Promise<IAddonInstallation> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const repositoryUrl = addonRepositoryUrl(input.repositoryUrl);
    const existing = await this.store.findByRepository(repositoryUrl);
    const { installedAddonKey } = input;

    if (existing && installedAddonKey && existing.addonKey !== installedAddonKey) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'The repository belongs to another add-on');
    }
    if (existing && this.delivery.installed(existing.addonKey, existing.runtimeDigest)) {
      return existing.status === AddonInstallationStatus.Installed ? existing
        : this.store.complete(existing.installationId, existing.runtimeDigest, this.values.now());
    }

    const prepared = await this.delivery.prepare(repositoryUrl, existing?.releaseTag ?? null);
    const failures: unknown[] = [];
    let result: IAddonInstallation | undefined;

    try {
      if (prepared.repositoryUrl !== repositoryUrl) {
        throw new BusinessError(BusinessErrorCode.Scope, 'Package source does not match the requested repository');
      }
      if (
        installedAddonKey
        && (prepared.addonKey !== installedAddonKey
          || !this.delivery.installed(installedAddonKey, prepared.runtimeDigest))
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'The release must match the active add-on package');
      }

      const { contentId, ...identity } = prepared;
      const reserved = await this.store.reserve({
        ...identity,
        installationId: this.values.nextId(),
        status: AddonInstallationStatus.Pending,
        createdAt: this.values.now(),
        installedAt: null,
        installedBy: input.actorId,
      });

      if (!installedAddonKey) {
        await this.delivery.install(contentId);
      }

      result = await this.store.complete(reserved.installationId, reserved.runtimeDigest, this.values.now());
    } catch (error) {
      failures.push(error);
    }

    try {
      await this.delivery.discard(prepared.contentId);
    } catch (error) {
      failures.push(error);
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length) {
      throw new AggregateError(failures, 'Add-on installation and staging cleanup failed');
    }
    if (!result) {
      throw new Error('Add-on installation has no result');
    }

    return result;
  }
}
