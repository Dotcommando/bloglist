import { GetDeploymentStatusUseCase } from '../../src/app/use-cases/deployment/get-deployment-status.use-case.js';
import { DeploymentState, type IDeploymentRecord } from '../../src/domain/deployment/deployment.js';

describe('GetDeploymentStatus', () => {
  const actor = { siteId: 'site-a', actorId: 'admin-a' };
  const access = { requireAdministrator: vi.fn<() => Promise<void>>() };
  const store = {
    get: vi.fn<() => Promise<IDeploymentRecord | null>>(),
    list: vi.fn(),
    save: vi.fn(),
  };
  const publications = { current: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    access.requireAdministrator.mockResolvedValue();
    store.get.mockResolvedValue(null);
    publications.current.mockResolvedValue({ releaseId: 'release-a', generation: 'generation-a' });
  });

  it('returns an explicit unconfigured status without inventing a target or delivery', async () => {
    const status = await new GetDeploymentStatusUseCase(store, access, publications).execute(actor);

    expect(access.requireAdministrator).toHaveBeenCalledWith('site-a', 'admin-a');
    expect(store.get).toHaveBeenCalledWith('site-a');
    expect(status).toEqual({
      target: null,
      version: null,
      activeReleaseId: 'release-a',
      state: DeploymentState.Idle,
      attempts: 0,
      retryAt: null,
      diagnostic: null,
      delivered: null,
    });
  });

  it('authorizes before reading deployment or publication state', async () => {
    access.requireAdministrator.mockRejectedValue(new Error('Forbidden'));

    await expect(new GetDeploymentStatusUseCase(store, access, publications).execute(actor))
      .rejects.toThrow('Forbidden');
    expect(store.get).not.toHaveBeenCalled();
    expect(publications.current).not.toHaveBeenCalled();
  });
});
