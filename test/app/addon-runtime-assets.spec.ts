import { GetAddonRuntimeAssetUseCase } from '../../src/app/use-cases/addons/get-addon-runtime-asset.use-case.js';
import { GetAddonRuntimeViewUseCase } from '../../src/app/use-cases/addons/get-addon-runtime-view.use-case.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IAddonRuntimeAssets } from '../../src/ports/outbound/addons/addon-runtime-assets.port.js';

describe('authorized runtime views', () => {
  const scope = { siteId: 'target', actorId: 'operator', addonKey: 'synthetic' };

  it('checks site access before reading either metadata or asset content', async () => {
    const assets: IAddonRuntimeAssets = { view: vi.fn(() => null), read: vi.fn() };
    const access = {
      requireAdministrator: vi.fn(async () => {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Denied');
      }),
    };

    await expect(new GetAddonRuntimeViewUseCase(assets, access).execute(scope))
      .rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    await expect(new GetAddonRuntimeAssetUseCase(assets, access).execute({
      ...scope,
      digest: 'a'.repeat(64),
      asset: 'admin.js',
    })).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    expect(assets.view).not.toHaveBeenCalled();
    expect(assets.read).not.toHaveBeenCalled();
  });

  it('preserves a missing static view and validates the runtime identity before reading', async () => {
    const assets: IAddonRuntimeAssets = { view: vi.fn(() => null), read: vi.fn() };
    const access = { requireAdministrator: vi.fn(async () => {}) };

    await expect(new GetAddonRuntimeViewUseCase(assets, access).execute(scope)).resolves.toBeNull();
    expect(access.requireAdministrator).toHaveBeenCalledWith('target', 'operator');
    await expect(new GetAddonRuntimeAssetUseCase(assets, access).execute({
      ...scope,
      digest: 'invalid',
      asset: 'admin.js',
    })).rejects.toMatchObject({ code: BusinessErrorCode.Validation });
    expect(assets.read).not.toHaveBeenCalled();
  });
});
