import {
  DeploymentIssue,
  type DeploymentOutcome,
  DeploymentOutcomeKind,
  DeploymentState,
  type IDeploymentAttempt,
  type IDeploymentPublication,
  type IDeploymentRecord,
} from '../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IProcessDeploymentTargets } from '../../../ports/inbound/deployment/deployment.port.js';
import type { IDeliveryRestoreGuardPort } from '../../../ports/outbound/deployment/delivery-restore-guard.port.js';
import type { IDeploymentValuesPort } from '../../../ports/outbound/deployment/deployment-access.port.js';
import type {
  IDeploymentProviderPort, IDeploymentProviderResolverPort,
} from '../../../ports/outbound/deployment/deployment-provider.port.js';
import type { IDeploymentPublicationPort } from '../../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../../ports/outbound/deployment/deployment-store.port.js';

const retryDelays = [10000, 60000, 300000, 1800000] as const;

const ownershipMilliseconds = 30 * 60 * 1000;

function samePublication(left: IDeploymentPublication | null, right: IDeploymentPublication): boolean {
  return left?.releaseId === right.releaseId && left.generation === right.generation;
}

export class ProcessDeploymentTargetsUseCase implements IProcessDeploymentTargets {
  constructor(private readonly store: IDeploymentStorePort, private readonly publications: IDeploymentPublicationPort,
    private readonly providers: IDeploymentProviderResolverPort, private readonly values: IDeploymentValuesPort,
    private readonly guard: IDeliveryRestoreGuardPort) {}

  async execute(): Promise<{ readonly processed: number }> {
    let processed = 0;

    for (const target of await this.store.list()) {
      try {
        const permit = await this.guard.acquire(target.siteId);

        if (!permit) {
          continue;
        }

        try {
          if (await this.process(target.siteId)) {
            processed++;
          }
        } finally {
          let resolved = false;

          try {
            const current = await this.store.get(target.siteId);

            resolved = current !== null && current.state !== DeploymentState.Running
              && current.state !== DeploymentState.OutcomeUnknown;
          } finally {
            await permit.release(resolved);
          }
        }
      } catch (error) {
        if (
          !(error instanceof BusinessError)
          || ![BusinessErrorCode.StaleWrite, BusinessErrorCode.HookUnavailable].includes(error.code)
        ) {
          throw error;
        }
      }
    }

    return { processed };
  }

  private async process(siteId: string): Promise<boolean> {
    let record = await this.store.get(siteId);

    if (!record?.target.enabled) {
      return false;
    }

    const provider = this.providers.resolve(record.target.providerKey);

    if (record.state === DeploymentState.Running) {
      if (record.attempt && record.attempt.ownershipUntil.getTime() > this.values.now().getTime()) {
        return false;
      }

      const interrupted: IDeploymentRecord = {
        ...record,
        version: this.values.id(),
        state: DeploymentState.OutcomeUnknown,
        diagnostic: { issue: DeploymentIssue.Interrupted, retryable: false },
        retryAt: null,
      };

      await this.store.save(interrupted, record.version);
      record = interrupted;
    }
    if (record.state === DeploymentState.OutcomeUnknown) {
      if (!record.attempt || !provider) {
        return false;
      }

      let outcome: DeploymentOutcome;

      try {
        outcome = await provider.reconcile(record.attempt);
      } catch {
        return false;
      }

      if (outcome.kind === DeploymentOutcomeKind.Unknown) {
        if (outcome.diagnostic && JSON.stringify(outcome.diagnostic) !== JSON.stringify(record.diagnostic)) {
          await this.store.save({
            ...record,
            version: this.values.id(),
            diagnostic: outcome.diagnostic,
          }, record.version);
        }

        return false;
      }
      await this.complete(record, record.attempt, outcome);

      return true;
    }

    const publication = await this.publications.current(siteId);

    if (!publication) {
      if (record.diagnostic?.issue !== DeploymentIssue.NoPublication) {
        await this.store.save({
          ...record,
          version: this.values.id(),
          state: DeploymentState.Idle,
          diagnostic: { issue: DeploymentIssue.NoPublication, retryable: false },
          retryAt: null,
        }, record.version);
      }

      return false;
    }
    if (!samePublication(record.requested, publication)) {
      const queued: IDeploymentRecord = {
        ...record,
        version: this.values.id(),
        state: DeploymentState.Queued,
        requested: publication,
        attempts: 0,
        attempt: null,
        retryAt: null,
        diagnostic: null,
      };

      await this.store.save(queued, record.version);
      record = queued;
    }
    if (
      record.state === DeploymentState.Succeeded
      && record.delivered?.releaseId === publication.releaseId
      && record.delivered.generation === publication.generation
      && record.delivered.targetVersion === record.target.version
    ) {
      return false;
    }
    if (
      record.state === DeploymentState.Failed
      && (!record.retryAt
      || record.retryAt.getTime() > this.values.now().getTime())
    ) {
      return false;
    }

    const startedAt = this.values.now();
    const attempt: IDeploymentAttempt = {
      attemptId: this.values.id(),
      target: record.target,
      publication,
      startedAt,
      ownershipUntil: new Date(startedAt.getTime() + ownershipMilliseconds),
    };
    const running: IDeploymentRecord = {
      ...record,
      version: this.values.id(),
      state: DeploymentState.Running,
      attempt,
      attempts: record.attempts + 1,
      retryAt: null,
      diagnostic: null,
    };

    await this.store.save(running, record.version);
    const outcome = provider ? await this.deliver(provider, attempt) : {
      kind: DeploymentOutcomeKind.Rejected as const,
      diagnostic: { issue: DeploymentIssue.Configuration, retryable: false },
    };
    const current = await this.store.get(siteId);

    if (current?.state !== DeploymentState.Running || current.attempt?.attemptId !== attempt.attemptId) {
      return true;
    }
    await this.complete(current, attempt, this.values.now().getTime() >= attempt.ownershipUntil.getTime()
      ? { kind: DeploymentOutcomeKind.Unknown } : outcome);

    return true;
  }

  private async deliver(provider: IDeploymentProviderPort, attempt: IDeploymentAttempt): Promise<DeploymentOutcome> {
    try {
      const diagnostics = await provider.check(attempt.target);

      if (diagnostics[0]) {
        return { kind: DeploymentOutcomeKind.Rejected, diagnostic: diagnostics[0] };
      }
    } catch {
      return {
        kind: DeploymentOutcomeKind.Rejected,
        diagnostic: { issue: DeploymentIssue.ProviderUnavailable, retryable: true },
      };
    }

    try {
      return await provider.deliver(attempt);
    } catch {
      return { kind: DeploymentOutcomeKind.Unknown };
    }
  }

  private async complete(record: IDeploymentRecord, attempt: IDeploymentAttempt,
    outcome: DeploymentOutcome): Promise<void> {
    let updated: IDeploymentRecord = {
      ...record,
      version: this.values.id(),
      state: DeploymentState.OutcomeUnknown,
      retryAt: null,
      diagnostic: outcome.kind === DeploymentOutcomeKind.Unknown && outcome.diagnostic
        ? outcome.diagnostic : { issue: DeploymentIssue.Interrupted, retryable: false },
    };

    if (
      outcome.kind === DeploymentOutcomeKind.Confirmed
      && outcome.releaseId === attempt.publication.releaseId
      && outcome.providerVersion.length > 0
      && outcome.providerVersion.length <= 200
    ) {
      updated = {
        ...updated,
        state: DeploymentState.Succeeded,
        diagnostic: null,
        delivered: {
          releaseId: outcome.releaseId,
          generation: attempt.publication.generation,
          targetVersion: attempt.target.version,
          providerVersion: outcome.providerVersion,
          completedAt: this.values.now(),
        },
      };
    } else if (outcome.kind === DeploymentOutcomeKind.Rejected) {
      const delay = retryDelays[record.attempts - 1];

      updated = {
        ...updated,
        state: DeploymentState.Failed,
        diagnostic: outcome.diagnostic,
        retryAt: outcome.diagnostic.retryable && delay !== undefined
          ? new Date(this.values.now().getTime() + delay) : null,
      };
    }
    await this.store.save(updated, record.version);
  }
}
