import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export enum AddonInstallationStatus { Pending = 'Pending', Installed = 'Installed' }

export interface IAddonPackageIdentity {
  readonly repositoryUrl: string;
  readonly releaseTag: string;
  readonly sourceCommit: string;
  readonly artifactChecksum: string;
  readonly runtimeDigest: string;
  readonly addonKey: string;
  readonly implementationVersion: string;
  readonly cmsVersion: string;
}

export interface IAddonInstallation extends IAddonPackageIdentity {
  readonly installationId: string;
  readonly status: AddonInstallationStatus;
  readonly createdAt: Date;
  readonly installedAt: Date | null;
  readonly installedBy: string;
}

export function sameAddonPackage(left: IAddonPackageIdentity, right: IAddonPackageIdentity): boolean {
  return left.repositoryUrl === right.repositoryUrl && left.releaseTag === right.releaseTag
    && left.sourceCommit === right.sourceCommit && left.artifactChecksum === right.artifactChecksum
    && left.runtimeDigest === right.runtimeDigest && left.addonKey === right.addonKey
    && left.implementationVersion === right.implementationVersion && left.cmsVersion === right.cmsVersion;
}

export function requireAddonInstallation(value: IAddonInstallation): void {
  if (
    addonRepositoryUrl(value.repositoryUrl) !== value.repositoryUrl
    || !value.installationId
    || !value.installedBy
    || !value.releaseTag
    || value.releaseTag.length > 256
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.sourceCommit)
    || !/^[a-f0-9]{64}$/.test(value.artifactChecksum)
    || !/^[a-f0-9]{64}$/.test(value.runtimeDigest)
    || !/^[a-z][a-z0-9-]{0,63}$/.test(value.addonKey)
    || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(value.implementationVersion)
    || !/^\d+\.\d+\.\d+$/.test(value.cmsVersion)
    || !Number.isFinite(value.createdAt.getTime())
    || !Object.values(AddonInstallationStatus).includes(value.status)
    || (value.status === AddonInstallationStatus.Pending ? value.installedAt !== null
      : !value.installedAt || !Number.isFinite(value.installedAt.getTime()) || value.installedAt < value.createdAt)
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on installation');
  }
}

export function addonRepositoryUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid repository URL');
  }

  if (
    value.length > 2048
    || url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || !/^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'A public GitHub repository URL is required');
  }

  const parts = url.pathname.replace(/\/$/, '').replace(/\.git$/i, '').split('/');
  const owner = parts[1]!;
  const repository = parts[2]!;

  if (!repository || repository === '.' || repository === '..') {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid repository name');
  }

  return 'https://github.com/' + owner.toLowerCase() + '/' + repository.toLowerCase();
}
