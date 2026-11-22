import type { Mock } from 'vitest';

import {
  CloudflareDeliveryAdapter,
} from '../../src/adapters/outbound/deployment/cloudflare/cloudflare-delivery.adapter.js';
import { DeploymentOutcomeKind, type IDeploymentAttempt } from '../../src/domain/deployment/deployment.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

describe('Cloudflare durable delivery', () => {
  const target = { ...deploymentFixture().target, providerKey: 'cloudflare' };
  const attempt: IDeploymentAttempt = {
    attemptId: 'attempt-1',
    target,
    publication: { releaseId: 'release-1', generation: '1' },
    startedAt: new Date('2026-01-01Z'),
    ownershipUntil: new Date('2026-01-01T01:00Z'),
  };

  function setup(receipt = 'attempt-1:release-1', attached = true, probeStatus = 200): {
    adapter: CloudflareDeliveryAdapter;
    prepare: Mock<() => Promise<{ releaseId: string; directory: string }>>;
    upload: Mock<() => Promise<void>>;
    request: Mock<(url: string | URL | Request) => Promise<Response>>;
  } {
    const prepare = vi.fn(async () => ({ releaseId: 'release-1', directory: '/synthetic/deploy' }));
    const upload = vi.fn(async () => {});
    const request = vi.fn(async (url: string | URL | Request) => {
      const address = String(url);

      if (address.includes('/deployments')) {
        return Response.json({
          success: true,
          result: { deployments: [{ versions: [{ version_id: 'version-1', percentage: 100 }] }] },
        });
      }
      if (address.includes('/domains')) {
        return Response.json({
          success: true,
          result: attached ? [{
            hostname: 'www.example.test', service: target.destinationName, environment: 'production',
          }] : [],
        });
      }
      if (address.startsWith(target.publicOrigin)) {
        return new Response(null, { status: probeStatus, headers: { 'X-Zarya-Deployment': receipt } });
      }

      return Response.json({ success: true, result: [] });
    });
    const adapter = new CloudflareDeliveryAdapter({
      accountId: 'a'.repeat(32), apiToken: 'secret',
    }, prepare, upload, request);

    return { adapter, prepare, upload, request };
  }

  it('confirms only the exact exported publication with an active version and attached public domain', async () => {
    const { adapter, upload } = setup();

    await expect(adapter.deliver(attempt)).resolves.toEqual({
      kind: DeploymentOutcomeKind.Confirmed, releaseId: 'release-1', providerVersion: 'version-1',
    });
    expect(upload).toHaveBeenCalledWith('/synthetic/deploy', 'attempt-1:release-1', target);
  });

  it.each([
    ['old-attempt:release-1', true], ['attempt-1:release-1', false],
  ])('keeps partial or unverified uploads uncertain', async (receipt, attached) => {
    const { adapter } = setup(receipt, attached);

    await expect(adapter.deliver(attempt)).resolves.toMatchObject({ kind: DeploymentOutcomeKind.Unknown });
  });

  it.each([301, 308, 404])('confirms the Worker without requiring a root document: %s', async (status) => {
    const { adapter } = setup('attempt-1:release-1', true, status);

    await expect(adapter.reconcile(attempt)).resolves.toMatchObject({ kind: DeploymentOutcomeKind.Confirmed });
  });

  it('confirms a Request homepage that rejects undeclared query parameters', async () => {
    const { adapter, request } = setup();
    const original = request.getMockImplementation()!;

    request.mockImplementation(async (input) => new URL(String(input)).origin === target.publicOrigin
      && new URL(String(input)).search ? new Response(null, { status: 400 }) : original(input));
    await expect(adapter.deliver(attempt)).resolves.toMatchObject({ kind: DeploymentOutcomeKind.Confirmed });
  });

  it('explains a completed upload whose public verification receives HTTP 400', async () => {
    const { adapter, upload } = setup('attempt-1:release-1', true, 400);

    await expect(adapter.deliver(attempt)).resolves.toMatchObject({
      kind: DeploymentOutcomeKind.Unknown,
      diagnostic: {
        issue: 'Backend',
        retryable: false,
        stage: 'PublicVerification',
        reason: 'HttpStatus',
        httpStatus: 400,
        recovery: 'CheckBackendAndReconcile',
      },
    });
    expect(upload).toHaveBeenCalledOnce();
  });

  it('does not upload if preparation captured a different release', async () => {
    const { adapter, prepare, upload } = setup();

    prepare.mockResolvedValue({ releaseId: 'release-new', directory: '/synthetic/deploy' });
    await expect(adapter.deliver(attempt)).resolves.toMatchObject({
      kind: DeploymentOutcomeKind.Rejected, diagnostic: { issue: 'PublicationChanged' },
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('reconciles an interrupted upload without starting a second upload', async () => {
    const { adapter, prepare, upload } = setup();

    await expect(adapter.reconcile(attempt)).resolves.toMatchObject({ kind: DeploymentOutcomeKind.Confirmed });
    expect(prepare).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('checks backend health independently of the configurable administration route', async () => {
    const f = setup();
    const original = f.request.getMockImplementation()!;

    f.request.mockImplementation(async input => {
      const url = new URL(String(input));

      return url.origin === target.backendOrigin
        ? new Response(null, { status: url.pathname === '/api/health' ? 200 : 404 })
        : original(input);
    });
    await expect(f.adapter.check(target)).resolves.toEqual([]);
    expect(f.request).toHaveBeenCalledWith(new URL('/api/health', target.backendOrigin),
      expect.objectContaining({ method: 'HEAD', redirect: 'manual', cache: 'no-store' }));
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
  });

  it('requires backend HTTPS connectivity before upload and does not expose provider errors', async () => {
    const { adapter, request } = setup();

    request.mockRejectedValue(new Error('private-provider-token'));
    await expect(adapter.check(target)).resolves.toEqual([{ issue: 'ProviderUnavailable', retryable: true }]);
  });
});
