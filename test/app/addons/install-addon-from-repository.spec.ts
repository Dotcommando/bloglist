import { InstallAddonFromRepositoryUseCase }
  from '../../../src/app/use-cases/addons/install-addon-from-repository.use-case.js';
import { AddonInstallationStatus, type IAddonInstallation } from '../../../src/domain/addons/addon-installation.js';
import type { IAddonInstallationStore }
  from '../../../src/ports/outbound/addons/addon-installation-store.port.js';
import type { IAddonPackageDelivery }
  from '../../../src/ports/outbound/addons/addon-package-delivery.port.js';

const identity = {
  repositoryUrl: 'https://github.com/example/events',
  releaseTag: 'v1.0.0',
  sourceCommit: 'a'.repeat(40),
  artifactChecksum: 'b'.repeat(64),
  runtimeDigest: 'c'.repeat(64),
  addonKey: 'events',
  implementationVersion: '1.0.0',
  cmsVersion: '0.8.0',
};

const input = { siteId: 'site', actorId: 'admin', repositoryUrl: 'https://github.com/Example/Events.git/' };

const now = new Date('2026-11-01T12:00:00Z');

function fixture(): {
  operation: InstallAddonFromRepositoryUseCase;
  store: IAddonInstallationStore;
  delivery: IAddonPackageDelivery;
  access: { requireAdministrator: ReturnType<typeof vi.fn<() => Promise<void>>> };
} {
  let saved: IAddonInstallation | null = null;
  const access = { requireAdministrator: vi.fn(async () => {}) };
  const store: IAddonInstallationStore = {
    findByRepository: vi.fn(async () => saved),
    list: async () => saved ? [saved] : [],
    reserve: vi.fn(async (next: IAddonInstallation) => {
      saved ??= next;

      return saved;
    }),
    complete: vi.fn(async () => {
      saved = { ...saved!, status: AddonInstallationStatus.Installed, installedAt: now };

      return saved;
    }),
  };
  const delivery: IAddonPackageDelivery = {
    prepare: vi.fn(async () => ({ ...identity, contentId: 'staged' })),
    installed: vi.fn(() => false),
    install: vi.fn(async () => {}),
    discard: vi.fn(async () => {}),
  };
  const operation = new InstallAddonFromRepositoryUseCase(store, delivery, access, {
    nextId: () => 'installation', nextVersion: () => 'unused', now: () => now,
  });

  return { operation, store, delivery, access };
}

describe('install an add-on from a repository', () => {
  it('freezes identity before activation and acknowledges installed code without enabling a site', async () => {
    const f = fixture();
    const result = await f.operation.execute(input);

    expect(f.access.requireAdministrator).toHaveBeenCalledWith('site', 'admin');
    expect(f.delivery.prepare).toHaveBeenCalledWith(identity.repositoryUrl, null);
    expect(f.store.reserve).toHaveBeenCalledWith(expect.objectContaining({
      ...identity, status: AddonInstallationStatus.Pending, installedAt: null, installedBy: 'admin',
    }));
    expect(vi.mocked(f.store.reserve).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(f.delivery.install).mock.invocationCallOrder[0]!);
    expect(result).toMatchObject({ ...identity, status: 'Installed', installedAt: now });
    expect(f.delivery.discard).toHaveBeenCalledWith('staged');
  });

  it('links only the named active package without invoking activation', async () => {
    const f = fixture();

    vi.mocked(f.delivery.installed).mockReturnValue(true);
    const result = await f.operation.execute({ ...input, installedAddonKey: 'events' });

    expect(result).toMatchObject({ addonKey: 'events', status: 'Installed' });
    expect(f.delivery.installed).toHaveBeenCalledWith('events', identity.runtimeDigest);
    expect(f.delivery.install).not.toHaveBeenCalled();
    expect(f.delivery.discard).toHaveBeenCalledOnce();
  });

  it.each(['events', 'inbox'])('rejects a nonmatching source for %s before reserving it', async (installedAddonKey) => {
    const f = fixture();

    vi.mocked(f.delivery.installed).mockReturnValue(installedAddonKey === 'inbox');
    await expect(f.operation.execute({ ...input, installedAddonKey })).rejects.toThrow();
    expect(f.store.reserve).not.toHaveBeenCalled();
    expect(f.delivery.install).not.toHaveBeenCalled();
    expect(f.delivery.discard).toHaveBeenCalledOnce();
  });

  it('rejects unauthorized and unknown sites before resolving or downloading a package', async () => {
    const f = fixture();

    f.access.requireAdministrator.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(f.operation.execute(input)).rejects.toThrow('Forbidden');
    expect(f.delivery.prepare).not.toHaveBeenCalled();
    expect(f.store.reserve).not.toHaveBeenCalled();
  });

  it.each(['http://github.com/a/b', 'https://github.com/a/b?token=x', 'https://user:secret@github.com/a/b',
    'https://localhost/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/..'])(
    'rejects invalid repository %s before network access', async (repositoryUrl) => {
      const f = fixture();

      await expect(f.operation.execute({ ...input, repositoryUrl })).rejects.toMatchObject({ code: 'Validation' });
      expect(f.delivery.prepare).not.toHaveBeenCalled();
    },
  );

  it('returns an identical active installation without network access', async () => {
    const f = fixture();

    await f.operation.execute(input);
    vi.mocked(f.delivery.prepare).mockClear();
    vi.mocked(f.delivery.installed).mockReturnValue(true);
    expect(await f.operation.execute(input)).toMatchObject({ status: 'Installed' });
    expect(f.delivery.prepare).not.toHaveBeenCalled();
  });

  it('retains the prepared release after activation failure and retries that release', async () => {
    const f = fixture();

    vi.mocked(f.delivery.install).mockRejectedValueOnce(new Error('Activation failed'));
    await expect(f.operation.execute(input)).rejects.toThrow('Activation failed');
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(f.delivery.discard).toHaveBeenCalledOnce();
    await f.operation.execute(input);
    expect(f.delivery.prepare).toHaveBeenLastCalledWith(identity.repositoryUrl, 'v1.0.0');
  });

  it('reconciles a lost acknowledgement from verified active code without another download', async () => {
    const f = fixture();

    vi.mocked(f.store.complete).mockRejectedValueOnce(new Error('Unknown acknowledgement'));
    await expect(f.operation.execute(input)).rejects.toThrow('Unknown acknowledgement');
    vi.mocked(f.delivery.prepare).mockClear();
    vi.mocked(f.delivery.installed).mockReturnValue(true);
    expect(await f.operation.execute(input)).toMatchObject({ status: 'Installed' });
    expect(f.delivery.prepare).not.toHaveBeenCalled();
  });

  it('preserves activation and staging-disposal failures together without acknowledging installation', async () => {
    const f = fixture();
    const activation = new Error('Synthetic activation failure');
    const cleanup = new Error('Synthetic private staging failure');

    vi.mocked(f.delivery.install).mockRejectedValueOnce(activation);
    vi.mocked(f.delivery.discard).mockRejectedValueOnce(cleanup);
    await expect(f.operation.execute(input)).rejects.toMatchObject({ errors: [activation, cleanup] });
    expect(f.store.complete).not.toHaveBeenCalled();
    expect(await f.store.list()).toEqual([expect.objectContaining({ status: AddonInstallationStatus.Pending })]);
  });

  it('disposes staging when reserving the package identity fails', async () => {
    const f = fixture();

    vi.mocked(f.store.reserve).mockRejectedValueOnce(new Error('Conflict'));
    await expect(f.operation.execute(input)).rejects.toThrow('Conflict');
    expect(f.delivery.install).not.toHaveBeenCalled();
    expect(f.delivery.discard).toHaveBeenCalledOnce();
  });
});
