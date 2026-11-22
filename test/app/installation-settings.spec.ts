import {
  ChangeAdminAddressUseCase,
} from '../../src/app/use-cases/installation/change-admin-address.use-case.js';
import {
  GetInstallationSettingsUseCase,
} from '../../src/app/use-cases/installation/get-installation-settings.use-case.js';
import type {
  IInstallationSettings,
} from '../../src/domain/installation/installation-settings.js';
import {
  BusinessError, BusinessErrorCode,
} from '../../src/domain/shared/business-error.js';
import type {
  IGetCurrentAdminUser,
} from '../../src/ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IInstallationSettingsStore,
} from '../../src/ports/outbound/installation/installation-settings-store.port.js';

function fixture(): {
  current: { execute: ReturnType<typeof vi.fn<IGetCurrentAdminUser['execute']>> };
  store: IInstallationSettingsStore;
  reachability: { verify: ReturnType<typeof vi.fn<(origin: string) => Promise<void>>> };
  change: ChangeAdminAddressUseCase;
} {
  let settings: IInstallationSettings = {
    adminOrigin: 'https://backend.example.com', version: 'v1', previousOrigin: null,
  };
  const current = {
    execute: vi.fn<IGetCurrentAdminUser['execute']>().mockResolvedValue({
      user: {
        adminUserId: 'admin',
        email: 'admin@example.test',
        allowedSiteIds: [],
        authorization: { systemAdmin: true, siteIds: [], siteAdminSiteIds: [] },
        blocked: false,
        version: 'v1',
        createdAt: new Date('2026-11-04T00:00:00Z'),
        updatedAt: new Date('2026-11-04T00:00:00Z'),
      },
      session: {
        sessionId: 'session',
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(),
        clientAddress: null,
        userAgent: null,
        current: true,
      },
    }),
  };
  const store: IInstallationSettingsStore = {
    read: vi.fn(async () => settings),
    changeAdminOrigin: vi.fn(async (origin, version) => {
      if (version !== settings.version) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Settings changed');
      }
      settings = { adminOrigin: origin, version: 'v2', previousOrigin: settings.adminOrigin };

      return settings;
    }),
  };
  const reachability = { verify: vi.fn<(origin: string) => Promise<void>>().mockResolvedValue(undefined) };

  return { current, store, reachability, change: new ChangeAdminAddressUseCase(store, current, reachability) };
}

describe('installation administrator address', () => {
  it('reads installation-wide settings only after authentication', async () => {
    const f = fixture();

    expect(await new GetInstallationSettingsUseCase(f.store, f.current).execute({ token: 'session' }))
      .toMatchObject({ adminOrigin: 'https://backend.example.com', version: 'v1' });
    f.current.execute.mockRejectedValue(new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Login'));
    vi.mocked(f.store.read).mockClear();
    await expect(new GetInstallationSettingsUseCase(f.store, f.current).execute({ token: null }))
      .rejects.toMatchObject({ code: BusinessErrorCode.AuthenticationRequired });
    expect(f.store.read).not.toHaveBeenCalled();
  });
  it('verifies the new address before committing and preserves the old address for navigation', async () => {
    const f = fixture();
    const result = await f.change.execute({
      token: 'session',
      adminAddress: 'https://public.example.com/admin',
      expectedVersion: 'v1',
    });

    expect(f.reachability.verify).toHaveBeenCalledWith('https://public.example.com');
    expect(result).toEqual({
      adminOrigin: 'https://public.example.com',
      version: 'v2',
      previousOrigin: 'https://backend.example.com',
    });
  });
  it.each(['http://public.example.com/admin', 'https://127.0.0.1/admin', 'https://localhost/admin',
    'https://name:password@public.example.com/admin', 'https://public.example.com/other',
    'https://public.example.com/admin?x=1', 'https://public.example.com/admin#x',
    'https://public.example.com:444/admin', 'https://internal/admin'])('rejects invalid address %s before probing', async (adminAddress) => {
    const f = fixture();

    await expect(f.change.execute({ token: 'session', adminAddress, expectedVersion: 'v1' }))
      .rejects.toMatchObject({ code: BusinessErrorCode.Validation });
    expect(f.reachability.verify).not.toHaveBeenCalled();
    expect(f.store.changeAdminOrigin).not.toHaveBeenCalled();
  });
  it('retains the settings version for an authenticated unchanged address without probing', async () => {
    const f = fixture();

    expect(await f.change.execute({
      token: 'session', adminAddress: 'https://backend.example.com/admin/', expectedVersion: 'v1',
    })).toEqual(await f.store.read());
    expect(f.current.execute).toHaveBeenCalledOnce();
    expect(f.reachability.verify).not.toHaveBeenCalled();
    expect(f.store.changeAdminOrigin).not.toHaveBeenCalled();
  });
  it('rechecks authority after probing and never writes after revocation', async () => {
    const f = fixture();
    const failure = new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Session revoked');

    f.reachability.verify.mockImplementationOnce(async () => {
      f.current.execute.mockRejectedValueOnce(failure);
    });
    await expect(f.change.execute({
      token: 'session', adminAddress: 'https://public.example.com/admin', expectedVersion: 'v1',
    })).rejects.toBe(failure);
    expect(f.reachability.verify).toHaveBeenCalledOnce();
    expect(f.current.execute).toHaveBeenCalledTimes(2);
    expect(f.store.changeAdminOrigin).not.toHaveBeenCalled();
    expect((await f.store.read()).version).toBe('v1');
  });
  it('leaves settings unchanged when reachability fails, authorization fails or an edit is stale', async () => {
    const f = fixture();
    const input = { token: 'session', adminAddress: 'https://public.example.com/admin/', expectedVersion: 'v1' };

    f.reachability.verify.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Validation, 'Unavailable'));
    await expect(f.change.execute(input)).rejects.toMatchObject({ code: BusinessErrorCode.Validation });
    expect(f.store.changeAdminOrigin).not.toHaveBeenCalled();
    await expect(f.change.execute({ ...input, expectedVersion: 'stale' }))
      .rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
    f.current.execute.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Login'));
    await expect(f.change.execute(input)).rejects.toMatchObject({ code: BusinessErrorCode.AuthenticationRequired });
    expect(f.store.changeAdminOrigin).not.toHaveBeenCalled();
  });
});
