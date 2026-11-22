import {
  ConfigureDeploymentTargetUseCase,
} from '../../src/app/use-cases/deployment/configure-deployment-target.use-case.js';
import { DeploymentState } from '../../src/domain/deployment/deployment.js';
import type { IConfigureDeploymentInput } from '../../src/ports/inbound/deployment/deployment.port.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';
import { siteFixture } from '../support/sites.js';

describe('ConfigureDeploymentTarget', () => {
  const input: IConfigureDeploymentInput = {
    siteId: 'site-a',
    actorId: 'admin-a',
    expectedVersion: null,
    enabled: true,
    providerKey: 'synthetic',
    destinationName: 'site-output',
    publicOrigin: 'https://www.example.test',
    backendOrigin: 'https://api.example.test',
  };
  const store = { get: vi.fn(), list: vi.fn(), save: vi.fn() };
  const access = { requireAdministrator: vi.fn() };
  const publications = { current: vi.fn() };
  const sites = { execute: vi.fn() };
  const catalogue = { supports: vi.fn(), validate: vi.fn() };
  let sequence = 0;
  const values = { id: () => 'new-' + ++sequence, now: () => new Date('2026-01-01T00:00:00Z') };
  const operation = (): ConfigureDeploymentTargetUseCase => new ConfigureDeploymentTargetUseCase(
    store, access, publications, sites, catalogue, values);

  beforeEach(() => {
    vi.resetAllMocks();
    sequence = 0;
    store.get.mockResolvedValue(null);
    store.save.mockResolvedValue(undefined);
    access.requireAdministrator.mockResolvedValue(undefined);
    publications.current.mockResolvedValue({ releaseId: 'release-a', generation: 'generation-a' });
    sites.execute.mockResolvedValue(siteFixture('site-a', 'Example', 'www.example.test'));
    catalogue.supports.mockReturnValue(true);
  });

  it('queues the already published site on first configuration without publishing drafts', async () => {
    const target = await operation().execute(input);

    expect(target.siteId).toBe(input.siteId);
    expect(catalogue.validate).toHaveBeenCalledWith(target);
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      siteId: input.siteId,
      state: DeploymentState.Queued,
      requested: { releaseId: 'release-a', generation: 'generation-a' },
      target,
    }), null);
  });

  it('does not read configuration or site state before authorization', async () => {
    access.requireAdministrator.mockRejectedValue(new Error('Forbidden'));

    await expect(operation().execute(input)).rejects.toThrow('Forbidden');
    expect(store.get).not.toHaveBeenCalled();
    expect(sites.execute).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects unsupported providers, mismatched public origins and proxy loops before saving', async () => {
    catalogue.supports.mockReturnValueOnce(false);

    await expect(operation().execute(input)).rejects.toMatchObject({ code: 'Validation' });
    await expect(operation().execute({ ...input, publicOrigin: 'https://foreign.test' }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(operation().execute({ ...input, backendOrigin: input.publicOrigin }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('guards configuration version and refuses to replace an executing or unresolved destination', async () => {
    const fixture = deploymentFixture();

    store.get.mockResolvedValue(fixture);
    await expect(operation().execute(input)).rejects.toMatchObject({ code: 'StaleWrite' });

    for (const state of [DeploymentState.Running, DeploymentState.OutcomeUnknown]) {
      store.get.mockResolvedValue({ ...fixture, state });
      await expect(operation().execute({ ...input, expectedVersion: fixture.target.version }))
        .rejects.toMatchObject({ code: 'Conflict' });
    }
    expect(store.save).not.toHaveBeenCalled();
  });
});
