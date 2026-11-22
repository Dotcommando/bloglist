import {
  ProcessDeploymentTargetsUseCase,
} from '../../src/app/use-cases/deployment/process-deployment-targets.use-case.js';
import {
  DeploymentIssue, type DeploymentOutcome, DeploymentOutcomeKind, DeploymentReason, DeploymentRecovery,
  DeploymentStage, DeploymentState, type IDeploymentAttempt,
} from '../../src/domain/deployment/deployment.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';
import { FakeDeploymentStore } from '../helpers/fake-deployment-store.js';

describe('ProcessDeploymentTargets', () => {
  let store: FakeDeploymentStore;
  let at: Date;
  let sequence: number;
  const publication = { current: vi.fn() };
  const provider = {
    key: 'synthetic',
    check: vi.fn(),
    deliver: vi.fn<(attempt: IDeploymentAttempt) => Promise<DeploymentOutcome>>(),
    reconcile: vi.fn(),
  };
  const resolver = { resolve: vi.fn() };
  const releasePermit = vi.fn<(_: boolean) => Promise<void>>();
  const guard = { acquire: vi.fn() };
  const operation = (): ProcessDeploymentTargetsUseCase => new ProcessDeploymentTargetsUseCase(
    store, publication, resolver, {
      id: () => 'id-' + ++sequence,
      now: () => new Date(at),
    }, guard);
  const confirmed = (releaseId = 'release-a'): DeploymentOutcome => ({
    kind: DeploymentOutcomeKind.Confirmed,
    releaseId,
    providerVersion: 'provider-' + releaseId,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    guard.acquire.mockResolvedValue({ release: releasePermit });
    releasePermit.mockResolvedValue(undefined);
    store = new FakeDeploymentStore();
    store.records.set('site-a', deploymentFixture());
    at = new Date('2026-01-01T00:00:00Z');
    sequence = 0;
    publication.current.mockResolvedValue({ releaseId: 'release-a', generation: 'generation-a' });
    resolver.resolve.mockReturnValue(provider);
    provider.check.mockResolvedValue([]);
    provider.deliver.mockImplementation(async (attempt) => confirmed(attempt.publication.releaseId));
    provider.reconcile.mockResolvedValue({ kind: DeploymentOutcomeKind.Unknown });
  });

  it('delivers once and records the exact prepared publication', async () => {
    await expect(operation().execute()).resolves.toEqual({ processed: 1 });
    expect((await store.get('site-a'))).toMatchObject({
      state: DeploymentState.Succeeded,
      delivered: { releaseId: 'release-a', generation: 'generation-a', providerVersion: 'provider-release-a' },
    });
    await operation().execute();
    expect(provider.deliver).toHaveBeenCalledTimes(1);
  });

  it('releases the restoration lock conservatively when reading the final delivery state fails', async () => {
    vi.spyOn(store, 'get').mockRejectedValue(new Error('Storage unavailable'));

    await expect(operation().execute()).rejects.toThrow('Storage unavailable');
    expect(releasePermit).toHaveBeenCalledExactlyOnceWith(false);
    expect(provider.deliver).not.toHaveBeenCalled();
  });

  it('skips delivery while restoration owns the shared lock', async () => {
    guard.acquire.mockResolvedValue(null);

    await expect(operation().execute()).resolves.toEqual({ processed: 0 });
    expect(provider.deliver).not.toHaveBeenCalled();
    expect(releasePermit).not.toHaveBeenCalled();
  });

  it('never deploys an unpublished or disabled target', async () => {
    publication.current.mockResolvedValueOnce(null);
    await operation().execute();
    const record = deploymentFixture();

    store.records.set('site-a', { ...record, target: { ...record.target, enabled: false } });
    await operation().execute();
    expect(provider.deliver).not.toHaveBeenCalled();
  });

  it('retains a newer activation while an older delivery is running and never uploads both concurrently', async () => {
    let finish: (result: DeploymentOutcome) => void = () => {
      throw new Error('Delivery not started');
    };
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });

    provider.deliver.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
      started();
    }));
    const first = operation().execute();

    await ready;
    publication.current.mockResolvedValue({ releaseId: 'release-b', generation: 'generation-a' });
    await operation().execute();
    expect(provider.deliver).toHaveBeenCalledTimes(1);
    finish(confirmed());
    await first;
    expect((await store.get('site-a'))?.delivered?.releaseId).toBe('release-a');
    await operation().execute();
    expect((await store.get('site-a'))?.delivered?.releaseId).toBe('release-b');
  });

  it('uses bounded backoff for a known temporary failure and preserves the previous confirmed delivery', async () => {
    await operation().execute();
    publication.current.mockResolvedValue({ releaseId: 'release-b', generation: 'generation-a' });
    provider.deliver.mockResolvedValue({
      kind: DeploymentOutcomeKind.Rejected,
      diagnostic: { issue: DeploymentIssue.ProviderUnavailable, retryable: true },
    });
    await operation().execute();
    const failed = await store.get('site-a');

    expect(failed?.state).toBe(DeploymentState.Failed);
    expect(failed?.delivered?.releaseId).toBe('release-a');
    expect(failed?.retryAt?.getTime()).toBe(at.getTime() + 10000);
    await operation().execute();
    expect(provider.deliver).toHaveBeenCalledTimes(2);

    for (let index = 1; index < 5; index++) {
      at = (await store.get('site-a'))!.retryAt!;
      await operation().execute();
    }
    expect((await store.get('site-a'))?.attempts).toBe(5);
    expect((await store.get('site-a'))?.retryAt).toBeNull();
    await operation().execute();
    expect(provider.deliver).toHaveBeenCalledTimes(6);
  });

  it('does not turn an exception or expired ownership into permission to start another upload', async () => {
    provider.deliver.mockRejectedValue(new Error('private provider response'));
    await operation().execute();
    expect((await store.get('site-a'))?.state).toBe(DeploymentState.OutcomeUnknown);
    await operation().execute();
    expect(provider.deliver).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await store.get('site-a'))).not.toContain('private provider response');
    const record = (await store.get('site-a'))!;

    store.records.set('site-a', { ...record, state: DeploymentState.Running });
    at = new Date(at.getTime() + 31 * 60 * 1000);
    await operation().execute();
    expect((await store.get('site-a'))?.state).toBe(DeploymentState.OutcomeUnknown);
    expect(provider.deliver).toHaveBeenCalledTimes(1);
  });

  it('preserves and refreshes uncertain-delivery diagnostics without another upload', async () => {
    const diagnostic = {
      issue: DeploymentIssue.Backend,
      retryable: false,
      stage: DeploymentStage.PublicVerification,
      reason: DeploymentReason.HttpStatus,
      httpStatus: 400,
      recovery: DeploymentRecovery.CheckBackendAndReconcile,
    };

    provider.deliver.mockResolvedValueOnce({ kind: DeploymentOutcomeKind.Unknown, diagnostic });
    await operation().execute();
    expect((await store.get('site-a'))?.diagnostic).toEqual(diagnostic);
    const refreshed = { ...diagnostic, httpStatus: 503 };

    provider.reconcile.mockResolvedValue({ kind: DeploymentOutcomeKind.Unknown, diagnostic: refreshed });
    await operation().execute();
    expect((await store.get('site-a'))?.diagnostic).toEqual(refreshed);
    expect(provider.deliver).toHaveBeenCalledOnce();
    expect((await store.get('site-a'))?.state).toBe(DeploymentState.OutcomeUnknown);
    expect(releasePermit.mock.calls).toEqual([[false], [false]]);
  });

  it('reconciles confirmed external completion after restart before allowing the newer publication', async () => {
    provider.deliver.mockResolvedValueOnce({ kind: DeploymentOutcomeKind.Unknown });
    await operation().execute();
    publication.current.mockResolvedValue({ releaseId: 'release-b', generation: 'generation-a' });
    provider.reconcile.mockResolvedValue(confirmed());
    await operation().execute();
    expect((await store.get('site-a'))?.delivered?.releaseId).toBe('release-a');
    await operation().execute();
    expect((await store.get('site-a'))?.delivered?.releaseId).toBe('release-b');
  });

  it('fails preflight without attempting an upload and keeps provider diagnostics typed', async () => {
    provider.check.mockResolvedValue([{ issue: DeploymentIssue.DomainConflict, retryable: false }]);
    await operation().execute();
    expect(provider.deliver).not.toHaveBeenCalled();
    expect((await store.get('site-a'))).toMatchObject({
      state: DeploymentState.Failed,
      retryAt: null,
      diagnostic: { issue: DeploymentIssue.DomainConflict, retryable: false },
    });
  });

  it('keeps two site targets isolated even when publication identities coincide', async () => {
    store.records.set('site-b', deploymentFixture('site-b'));
    await operation().execute();
    expect(provider.deliver.mock.calls.map(([attempt]) => attempt.target.siteId)).toEqual(['site-a', 'site-b']);
    expect((await store.get('site-b'))?.target.siteId).toBe('site-b');
    expect((await store.get('site-a'))?.target.siteId).toBe('site-a');
  });
});
