import { expect, it, vi } from 'vitest';

import { GetAddonUpdateUseCase } from '../../src/app/use-cases/addons/get-addon-update.use-case.js';
import { PrepareAddonUpdateUseCase } from '../../src/app/use-cases/addons/prepare-addon-update.use-case.js';
import type { IAddonUpdatePackagesPort } from '../../src/ports/outbound/addons/addon-update-packages.port.js';

it('authorizes preparation and status before accessing package storage or consuming input', async () => {
  const access = { requireAdministrator: vi.fn().mockRejectedValue(new Error('denied')) };
  const packages: IAddonUpdatePackagesPort = { prepareContent: vi.fn(), status: vi.fn() };
  const content = {
    byteSize: 0,
    mimeType: 'application/gzip',
    bytes: (async function* () {
      yield new Uint8Array();
    })(),
  };

  await expect(new PrepareAddonUpdateUseCase(access, packages).execute({ actorId: 'admin', content }))
    .rejects.toThrow('denied');
  await expect(new GetAddonUpdateUseCase(access, packages).execute({ actorId: 'admin', updateId: 'update' }))
    .rejects.toThrow('denied');
  expect(packages.prepareContent).not.toHaveBeenCalled();
  expect(packages.status).not.toHaveBeenCalled();
});
