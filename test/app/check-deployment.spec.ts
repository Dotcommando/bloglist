import { CheckDeploymentTargetUseCase } from '../../src/app/use-cases/deployment/check-deployment-target.use-case.js';
import { DeploymentIssue } from '../../src/domain/deployment/deployment.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';
import { FakeDeploymentStore } from '../helpers/fake-deployment-store.js';

describe('CheckDeploymentTarget', () => {
  const actor = { siteId: 'site-a', actorId: 'administrator' };
  const access = { requireAdministrator: vi.fn() };
  const publications = { current: vi.fn() };
  const inspection = { inspect: vi.fn() };
  const catalogue = { supports: vi.fn(), validate: vi.fn() };
  let store: FakeDeploymentStore;
  const operation = (): CheckDeploymentTargetUseCase => new CheckDeploymentTargetUseCase(store, access,
    publications, catalogue, inspection);

  beforeEach(() => {
    vi.resetAllMocks();
    store = new FakeDeploymentStore();
    store.records.set(actor.siteId, deploymentFixture());
    publications.current.mockResolvedValue({ releaseId: 'release-a', generation: 'generation-a' });
    catalogue.supports.mockReturnValue(true);
    inspection.inspect.mockResolvedValue([]);
  });

  it('checks the saved target and current publication without changing delivery state', async () => {
    const before = await store.get(actor.siteId);

    await expect(operation().execute(actor)).resolves.toEqual([]);
    expect(inspection.inspect).toHaveBeenCalledWith(before!.target, {
      releaseId: 'release-a', generation: 'generation-a',
    });
    expect(await store.get(actor.siteId)).toEqual(before);
  });

  it('authorizes before reading configuration or spending inspection resources', async () => {
    access.requireAdministrator.mockRejectedValue(new Error('Forbidden'));
    const get = vi.spyOn(store, 'get');

    await expect(operation().execute(actor)).rejects.toThrow('Forbidden');
    expect(get).not.toHaveBeenCalled();
    expect(inspection.inspect).not.toHaveBeenCalled();
  });

  it('rejects an absent target and diagnoses unpublished or invalid targets', async () => {
    await expect(operation().execute({ ...actor, siteId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    publications.current.mockResolvedValueOnce(null);
    await expect(operation().execute(actor)).resolves.toEqual([{
      issue: DeploymentIssue.NoPublication,
      retryable: false,
    }]);
    catalogue.validate.mockImplementationOnce(() => {
      throw new Error('private detail');
    });
    await expect(operation().execute(actor)).resolves.toEqual([{
      issue: DeploymentIssue.Configuration,
      retryable: false,
    }]);
    expect(inspection.inspect).not.toHaveBeenCalled();
  });
});
