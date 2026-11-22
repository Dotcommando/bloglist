import { expect, it, vi } from 'vitest';

import { CheckAddonRepositoryUpdateUseCase }
  from '../../../src/app/use-cases/addons/check-addon-repository-update.use-case.js';
import { AddonInstallationStatus, type IAddonInstallation } from '../../../src/domain/addons/addon-installation.js';
import { AddonUpdateMode } from '../../../src/domain/addons/addon-update.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';

const input = { actorId: 'admin', addonKey: 'test-addon' };

const repositoryUrl = 'https://github.com/zarya/test-addon';

it('does not read the installation catalog or contact GitHub without global authority', async () => {
  const requireAdministrator = vi.fn().mockRejectedValue(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
  const list = vi.fn();
  const prepareLatest = vi.fn();
  const check = new CheckAddonRepositoryUpdateUseCase({ requireAdministrator }, { list }, { prepareLatest });

  await expect(check.execute(input)).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
  expect(list).not.toHaveBeenCalled();
  expect(prepareLatest).not.toHaveBeenCalled();
});

it('checks only the completed claim for the selected card, and returns the prepared update', async () => {
  const installed: IAddonInstallation = {
    installationId: 'installation',
    addonKey: input.addonKey,
    status: AddonInstallationStatus.Installed,
    repositoryUrl,
    releaseTag: 'v1.0.0',
    sourceCommit: 'a'.repeat(40),
    artifactChecksum: 'b'.repeat(64),
    runtimeDigest: 'c'.repeat(64),
    implementationVersion: '1.0.0',
    cmsVersion: '0.16.0',
    createdAt: new Date(0),
    installedAt: new Date(0),
    installedBy: 'admin',
  };
  const proposal = {
    addonKey: input.addonKey,
    updateId: 'update',
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    fromDigest: 'old',
    toDigest: 'new',
    mode: AddonUpdateMode.Compatible,
  };
  const list = vi.fn().mockResolvedValue([
    { ...installed, addonKey: 'other' }, { ...installed, status: AddonInstallationStatus.Pending },
  ]);
  const prepareLatest = vi.fn().mockResolvedValueOnce(proposal).mockResolvedValueOnce(null);
  const check = new CheckAddonRepositoryUpdateUseCase({ requireAdministrator: vi.fn() }, { list }, { prepareLatest });

  await expect(check.execute(input)).resolves.toEqual({ status: 'NoRepository' });
  expect(prepareLatest).not.toHaveBeenCalled();

  list.mockResolvedValue([installed]);
  await expect(check.execute(input)).resolves.toEqual({ status: 'Available', update: proposal });
  expect(prepareLatest).toHaveBeenCalledWith(repositoryUrl, input.addonKey);
  await expect(check.execute(input)).resolves.toEqual({ status: 'Current' });
});
