import { RetryDeploymentUseCase } from '../../src/app/use-cases/deployment/retry-deployment.use-case.js';
import { DeploymentState } from '../../src/domain/deployment/deployment.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

describe('RetryDeployment', () => {
  const store = { get: vi.fn(), list: vi.fn(), save: vi.fn() };
  const access = { requireAdministrator: vi.fn() };
  const publications = { current: vi.fn() };
  const status = { execute: vi.fn() };
  const values = { id: () => 'next-version', now: () => new Date(0) };
  const input = { siteId: 'site-a', actorId: 'admin-a', expectedVersion: 'record-1' };
  const operation = (): RetryDeploymentUseCase => new RetryDeploymentUseCase(
    store, access, publications, values, status);

  beforeEach(() => {
    vi.resetAllMocks();
    access.requireAdministrator.mockResolvedValue(undefined);
    store.get.mockResolvedValue({ ...deploymentFixture(), state: DeploymentState.Failed });
    publications.current.mockResolvedValue({ releaseId: 'new-release', generation: 'generation-a' });
    status.execute.mockResolvedValue({ state: DeploymentState.Queued });
  });

  it('queues the current committed publication after a known failure using the captured version', async () => {
    await expect(operation().execute(input)).resolves.toMatchObject({ state: DeploymentState.Queued });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      version: 'next-version',
      state: DeploymentState.Queued,
      requested: { releaseId: 'new-release', generation: 'generation-a' },
      attempts: 0,
      retryAt: null,
    }), 'record-1');
  });

  it.each([DeploymentState.Running, DeploymentState.OutcomeUnknown, DeploymentState.Succeeded])(
    'does not create an overlapping or unreconciled attempt from %s', async (state) => {
      store.get.mockResolvedValue({ ...deploymentFixture(), state });

      await expect(operation().execute(input)).rejects.toMatchObject({ code: 'Conflict' });
      expect(store.save).not.toHaveBeenCalled();
    },
  );

  it('rejects stale retries and authenticates before reading state', async () => {
    await expect(operation().execute({ ...input, expectedVersion: 'stale' }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    vi.clearAllMocks();
    access.requireAdministrator.mockRejectedValue(new Error('Forbidden'));

    await expect(operation().execute(input)).rejects.toThrow('Forbidden');
    expect(store.get).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
});
