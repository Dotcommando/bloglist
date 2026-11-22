import {
  DeploymentIssue, type DeploymentOutcome, DeploymentOutcomeKind, DeploymentReason, DeploymentRecovery, DeploymentStage,
  type IDeploymentAttempt,
  type IDeploymentDiagnostic, type IDeploymentTarget,
} from '../../../../domain/deployment/deployment.js';
import type { IDeploymentProviderPort } from '../../../../ports/outbound/deployment/deployment-provider.port.js';
import { validateCloudflareTarget } from './cloudflare-target.validator.js';

export interface ICloudflareDeliverySettings {
  readonly accountId: string;
  readonly apiToken: string;
}

interface ICloudflareDomain {
  readonly hostname: string;
  readonly service: string;
  readonly environment: string;
}

class CloudflareAuthorizationError extends Error {}

export class CloudflareDeliveryAdapter implements IDeploymentProviderPort {
  readonly key = 'cloudflare';

  constructor(private readonly settings: ICloudflareDeliverySettings,
    private readonly prepare: (target: IDeploymentTarget) => Promise<{
      readonly releaseId: string; readonly directory: string;
    }>,
    private readonly upload: (directory: string, receipt: string, target: IDeploymentTarget) => Promise<void>,
    private readonly request: typeof fetch = fetch) {}

  private async api<T>(route: string): Promise<T> {
    const response = await this.request('https://api.cloudflare.com/client/v4/accounts/'
      + this.settings.accountId + '/workers/' + route, {
      headers: { Authorization: 'Bearer ' + this.settings.apiToken },
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 401 || response.status === 403) {
      throw new CloudflareAuthorizationError();
    }

    const result: { success?: boolean; result: T } = await response.json();

    if (!response.ok || result.success !== true) {
      throw new Error('Cloudflare request failed');
    }

    return result.result;
  }

  async check(target: IDeploymentTarget): Promise<readonly IDeploymentDiagnostic[]> {
    try {
      validateCloudflareTarget(target);
    } catch {
      return [{ issue: DeploymentIssue.Configuration, retryable: false }];
    }

    try {
      const domains = await this.api<readonly ICloudflareDomain[]>('domains');
      const hostname = new URL(target.publicOrigin).hostname;

      if (
        domains.some((domain) => domain.hostname === hostname
        && (domain.service !== target.destinationName || domain.environment !== 'production'))
      ) {
        return [{ issue: DeploymentIssue.DomainConflict, retryable: false }];
      }
    } catch (error) {
      return [{
        issue: error instanceof CloudflareAuthorizationError
          ? DeploymentIssue.Authorization : DeploymentIssue.ProviderUnavailable,
        retryable: !(error instanceof CloudflareAuthorizationError),
      }];
    }

    try {
      const response = await this.request(new URL('/api/health', target.backendOrigin), {
        method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
      });

      await response.body?.cancel();

      if (response.status !== 200) {
        return [{ issue: DeploymentIssue.Backend, retryable: true }];
      }
    } catch {
      return [{ issue: DeploymentIssue.Backend, retryable: true }];
    }

    return [];
  }

  async deliver(attempt: IDeploymentAttempt): Promise<DeploymentOutcome> {
    let prepared: { readonly releaseId: string; readonly directory: string };

    try {
      prepared = await this.prepare(attempt.target);
    } catch {
      return { kind: DeploymentOutcomeKind.Rejected, diagnostic: { issue: DeploymentIssue.Storage, retryable: false } };
    }

    if (prepared.releaseId !== attempt.publication.releaseId) {
      return {
        kind: DeploymentOutcomeKind.Rejected,
        diagnostic: { issue: DeploymentIssue.PublicationChanged, retryable: true },
      };
    }

    try {
      await this.upload(prepared.directory, attempt.attemptId + ':' + prepared.releaseId, attempt.target);
    } catch {
      // An unsuccessful CLI exit can still have activated code or attached a domain.
      return {
        kind: DeploymentOutcomeKind.Unknown,
        diagnostic: {
          issue: DeploymentIssue.Interrupted,
          retryable: false,
          stage: DeploymentStage.Upload,
          reason: DeploymentReason.UnconfirmedOutcome,
          recovery: DeploymentRecovery.Reconcile,
        },
      };
    }

    return this.reconcile(attempt);
  }

  async reconcile(attempt: IDeploymentAttempt): Promise<DeploymentOutcome> {
    let stage = DeploymentStage.ProviderVerification;
    const unknown = (issue: DeploymentIssue, reason: DeploymentReason,
      recovery: DeploymentRecovery, httpStatus?: number): DeploymentOutcome => ({
      kind: DeploymentOutcomeKind.Unknown,
      diagnostic: { issue, retryable: false, stage, reason, recovery, ...(httpStatus ? { httpStatus } : {}) },
    });

    try {
      const script = encodeURIComponent(attempt.target.destinationName);
      const result = await this.api<{
        deployments: readonly { versions: readonly { version_id: string; percentage: number }[] }[];
      }>('scripts/' + script + '/deployments');
      const versions = result.deployments[0]?.versions;

      if (versions?.length !== 1 || versions[0]?.percentage !== 100 || !versions[0].version_id) {
        return unknown(DeploymentIssue.Interrupted, DeploymentReason.ActiveVersionMismatch,
          DeploymentRecovery.CheckProviderAndReconcile);
      }

      stage = DeploymentStage.DomainVerification;
      const domains = await this.api<readonly ICloudflareDomain[]>('domains');

      if (
        !domains.some((domain) => domain.hostname === new URL(attempt.target.publicOrigin).hostname
        && domain.service === attempt.target.destinationName && domain.environment === 'production')
      ) {
        return unknown(DeploymentIssue.DomainConflict, DeploymentReason.DomainMismatch,
          DeploymentRecovery.CheckDomainAndReconcile);
      }

      stage = DeploymentStage.PublicVerification;
      // Request documents reject undeclared query parameters; the receipt identifies the attempt.
      const response = await this.request(new URL('/', attempt.target.publicOrigin), {
        method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
      });

      await response.body?.cancel();

      if (response.status < 200 || response.status >= 400 && response.status !== 404) {
        return unknown(DeploymentIssue.Backend, DeploymentReason.HttpStatus,
          DeploymentRecovery.CheckBackendAndReconcile, response.status);
      }
      if (response.headers.get('X-Zarya-Deployment') !== attempt.attemptId + ':' + attempt.publication.releaseId) {
        return unknown(DeploymentIssue.Interrupted, DeploymentReason.ReceiptMismatch,
          DeploymentRecovery.Reconcile);
      }

      return {
        kind: DeploymentOutcomeKind.Confirmed,
        releaseId: attempt.publication.releaseId,
        providerVersion: versions[0].version_id,
      };
    } catch (error) {
      if (error instanceof CloudflareAuthorizationError) {
        return unknown(DeploymentIssue.Authorization, DeploymentReason.Authorization,
          DeploymentRecovery.CheckCredentialsAndReconcile);
      }

      return unknown(stage === DeploymentStage.PublicVerification ? DeploymentIssue.Backend
        : DeploymentIssue.ProviderUnavailable, DeploymentReason.Network,
      stage === DeploymentStage.PublicVerification ? DeploymentRecovery.CheckBackendAndReconcile
        : DeploymentRecovery.CheckProviderAndReconcile);
    }
  }
}
