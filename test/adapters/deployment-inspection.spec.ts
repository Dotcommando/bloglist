import { DeploymentInspectionAdapter } from '../../src/adapters/outbound/deployment/deployment-inspection.adapter.js';
import { DeploymentIssue } from '../../src/domain/deployment/deployment.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

describe('deployment inspection boundary', () => {
  const read = vi.fn();
  const request = vi.fn<typeof fetch>();
  const store = { read, stage: vi.fn() };
  const { target } = deploymentFixture();
  const requested = { releaseId: 'release-a', generation: 'generation-a' };
  const operation = (): DeploymentInspectionAdapter => new DeploymentInspectionAdapter(store, request);

  beforeEach(() => {
    vi.resetAllMocks();
    read.mockResolvedValue({ siteId: target.siteId, releaseId: requested!.releaseId });
    request.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it('verifies scoped publication storage and probes only the saved backend without redirects', async () => {
    await expect(operation().inspect(target, requested!)).resolves.toEqual([]);
    expect(read).toHaveBeenCalledWith(target.siteId, requested!.releaseId);
    expect(request).toHaveBeenCalledWith(new URL('/api/health', target.backendOrigin), expect.objectContaining({
      method: 'HEAD', redirect: 'manual', cache: 'no-store',
    }));
  });

  it.each([null, { siteId: 'foreign', releaseId: 'release-a' }])(
    'reports absent or foreign storage safely', async (release) => {
      read.mockResolvedValue(release);
      await expect(operation().inspect(target, requested!)).resolves.toEqual([{
        issue: DeploymentIssue.Storage,
        retryable: false,
      }]);
      expect(request).not.toHaveBeenCalled();
    });

  it('returns typed diagnostics for storage errors and backend redirects/errors', async () => {
    read.mockRejectedValueOnce(new Error('private storage detail'));
    await expect(operation().inspect(target, requested!)).resolves.toEqual([{
      issue: DeploymentIssue.Storage,
      retryable: false,
    }]);
    request.mockResolvedValueOnce(new Response(null, { status: 302 }));
    await expect(operation().inspect(target, requested!)).resolves.toEqual([{
      issue: DeploymentIssue.Backend,
      retryable: true,
    }]);
    request.mockRejectedValueOnce(new Error('private network detail'));
    await expect(operation().inspect(target, requested!)).resolves.toEqual([{
      issue: DeploymentIssue.Backend,
      retryable: true,
    }]);
  });
});
