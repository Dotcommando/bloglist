<script lang="ts">
  import { untrack } from 'svelte';

  import { adminLanguage, messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import type { DeploymentIssue } from './deployment-api';
import {
  checkDeployment,
  DeploymentState,
  getDeploymentStatus,
  type IDeploymentDiagnostic,
  type IDeploymentStatus,
  retryDeployment,
  saveDeployment,
} from './deployment-api';

  let { can, siteId, active, timeZone, onUnauthorized, onBusy, onDirtyChange }: {
    can: CanUseAction;
    siteId: string;
    active: boolean;
    timeZone: string;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onDirtyChange: (value: boolean) => void;
  } = $props();
  let status = $state<IDeploymentStatus | null>(null);
  let enabled = $state(false);
  let destinationName = $state('');
  let publicOrigin = $state('');
  let backendOrigin = $state('');
  let busy = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let diagnostics = $state<IDeploymentDiagnostic[] | null>(null);
  let saved = $state(false);
  const locked = $derived(status?.state === DeploymentState.Running
    || status?.state === DeploymentState.OutcomeUnknown);
  const dirty = $derived(status !== null && (enabled !== (status.target?.enabled ?? false)
    || destinationName !== (status.target?.destinationName ?? '')
    || publicOrigin !== (status.target?.publicOrigin ?? '')
    || backendOrigin !== (status.target?.backendOrigin ?? '')));
  const stateLabels = $derived({
    Idle: $messages.deploymentIdle,
    Queued: $messages.deploymentQueued,
    Running: $messages.calibrationHistoryRunning,
    Succeeded: $messages.deploymentDelivered,
    Failed: $messages.calibrationHistoryFailed,
    OutcomeUnknown: $messages.deploymentOutcomeUnknown,
  });

  const stageLabels = $derived({
    Upload: $messages.deploymentWorkerUpload,
    ProviderVerification: $messages.deploymentActiveWorkerVerification,
    DomainVerification: $messages.deploymentDomainAttachmentVerification,
    PublicVerification: $messages.deploymentPublicResponseVerification,
  });
  const reasonLabels = $derived({
    UnconfirmedOutcome: $messages.deploymentUploadOutcomeIsUnconfirmed,
    HttpStatus: $messages.deploymentHTTPResponse,
    ReceiptMismatch: $messages.deploymentTheResponseDoesNotIdentify,
    ActiveVersionMismatch: $messages.deploymentNoSingleFullyActiveVersion,
    DomainMismatch: $messages.deploymentDomainAttachmentIsUnconfirmed,
    Network: $messages.deploymentVerificationDidNotReceiveA,
    Authorization: $messages.deploymentProviderAuthorizationWasRejected,
  });
  const recoveryLabels = $derived({
    Reconcile: $messages.deploymentKeepTheExecutorRunningTo,
    CheckProviderAndReconcile: $messages.deploymentCheckWorkerStateTheExecutor,
    CheckDomainAndReconcile: $messages.deploymentCorrectDomainAttachmentTheExecutor,
    CheckBackendAndReconcile: $messages.deploymentCorrectTheBackendResponseThe,
    CheckCredentialsAndReconcile: $messages.deploymentCorrectTheExecutorCredentialsAnd,
  });

  function issueLabel(issue: DeploymentIssue): string {
    const labels: Record<DeploymentIssue, string> = {
      Configuration: $messages.deploymentCheckTargetSettings,
      NoPublication: $messages.deploymentPublishTheSiteFirst,
      Backend: $messages.deploymentBackendUnavailableCheckDNSAnd,
      Storage: $messages.deploymentCheckPublicationFilesAndStorage,
      Authorization: $messages.deploymentCheckTheExecutorSCloudflare,
      DomainConflict: $messages.deploymentDomainConflictCheckDNSAnd,
      ProviderUnavailable: $messages.deploymentProviderTemporarilyUnavailable,
      PublicationChanged: $messages.deploymentPublicationChangedDuringPreparation,
      Interrupted: $messages.deploymentReconcileTheInterruptedDeliveryOn,
    };

    return labels[issue];
  }

  function date(value: string): string {
    return new Intl.DateTimeFormat($adminLanguage, {
      dateStyle: 'medium', timeStyle: 'short', timeZone,
    }).format(new Date(value));
  }

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    onBusy(true);
    error = null;
    saved = false;

    try {
      await action();
    } catch (value) {
      if (value instanceof ContentRequestError && value.status === 401) {
        onUnauthorized();
      } else {
        error = contentError(value);
      }
    } finally {
      busy = false;
      onBusy(false);
    }
  }

  async function load(): Promise<void> {
    const value = await getDeploymentStatus(siteId);

    status = value;
    enabled = value.target?.enabled ?? false;
    destinationName = value.target?.destinationName ?? '';
    publicOrigin = value.target?.publicOrigin ?? '';
    backendOrigin = value.target?.backendOrigin ?? '';
    diagnostics = null;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      await saveDeployment(siteId, {
        expectedVersion: status?.target?.version ?? null,
        enabled,
        providerKey: 'cloudflare',
        destinationName,
        publicOrigin,
        backendOrigin,
      });
      await load();
      saved = true;
    });
  }

  $effect(() => {
    if (active) {
      untrack(() => {
        if (!status) {
          void run(load);
        }
      });
    }
  });
  $effect(() => {
    const value = dirty;

    untrack(() => onDirtyChange(value));
  });
</script>

<section class="settings-form" hidden={!active} aria-busy={busy} aria-label={$messages.deploymentSiteDeployment}>
  <p>{$messages.deploymentTheExecutorDeliversTheActive}</p>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if saved}<p class="cms-success" role="status">{$messages.deploymentSettingsSaved}</p>{/if}
  {#if status}
    <dl class="_deployment-status" aria-live="polite">
      <dt>{$messages.addonUpdatesPanelStatus}</dt><dd>{stateLabels[status.state]}</dd>
      <dt>{$messages.deploymentActiveCMSPublication}</dt><dd>{status.activeReleaseId ?? '—'}</dd>
      <dt>{$messages.deploymentLastConfirmedDelivery}</dt>
      <dd>{status.delivered ? status.delivered.releaseId + ' · ' + date(status.delivered.completedAt) : '—'}</dd>
      <dt>{$messages.deploymentAttempts}</dt><dd>{status.attempts}</dd>
      {#if status.retryAt}<dt>{$messages.deploymentNextAttempt}</dt><dd>{date(status.retryAt)}</dd>{/if}
    </dl>
    {#if status.diagnostic}
      {#if status.diagnostic.stage}
        <dl class="_deployment-status">
          <dt>{$messages.deploymentStage}</dt><dd>{stageLabels[status.diagnostic.stage]}</dd>
          {#if status.diagnostic.reason}
            <dt>{$messages.deploymentReason}</dt>
            <dd>{status.diagnostic.httpStatus ? 'HTTP ' + status.diagnostic.httpStatus
              : reasonLabels[status.diagnostic.reason]}</dd>
          {/if}
          {#if status.diagnostic.recovery}
            <dt>{$messages.deploymentRecovery}</dt><dd>{recoveryLabels[status.diagnostic.recovery]}</dd>
          {/if}
        </dl>
        {#if status.diagnostic.stage === 'PublicVerification'}
          <p>{$messages.deploymentTheActiveWorkerVersionAnd}</p>
        {/if}
      {:else}<p role="status">{issueLabel(status.diagnostic.issue)}</p>{/if}
    {/if}
    {#if status.state === DeploymentState.OutcomeUnknown}
      <p role="status">{$messages.deploymentFurtherDeliveryIsBlockedUntil}</p>
    {/if}
    <form onsubmit={submit}>
      <fieldset class="_url-fieldset" disabled={busy || locked || !can('cms.deployment.configure')}>
        <label class="_form-field">{$messages.deploymentProvider}
          <select><option>Cloudflare</option></select>
        </label>
        <label class="_form-field">{$messages.deploymentWorkerName}
          <input bind:value={destinationName} required maxlength="200" autocomplete="off" />
        </label>
        <label class="_form-field">{$messages.deploymentPublicOrigin}
          <input type="url" bind:value={publicOrigin} required placeholder="https://www.example.com" />
        </label>
        <label class="_form-field">{$messages.deploymentBackendOrigin}
          <input type="url" bind:value={backendOrigin} required placeholder="https://api.example.com" />
        </label>
        <Checkbox bind:checked={enabled} disabled={busy || locked}>
          {$messages.deploymentAutomaticDelivery}
        </Checkbox>
        <p>{$messages.deploymentUseTheSelectedSiteOrigin}</p>
      </fieldset>
    <div class="_url-actions _deployment-actions">
      <RefreshButton disabled={busy || dirty} onclick={() => {
        void run(load);
      }} />
      {#if can('cms.deployment.check')}<button type="button" class="cms-secondary"
        disabled={busy || dirty || !status.target} onclick={() => {
          void run(async () => {
            diagnostics = await checkDeployment(siteId);
          });
        }}>{$messages.deploymentCheck}</button>{/if}
      {#if can('cms.deployment.configure')}
        <button class="cms-primary" disabled={!dirty || busy || locked}>{$messages.accessSettingsSave}</button>
      {/if}
    </div>
    </form>
    {#if can('cms.deployment.retry') && status.state === DeploymentState.Failed && status.target?.enabled}
      <div class="_url-actions">
        <button type="button" class="cms-secondary" disabled={busy || dirty} onclick={() => {
          void run(async () => {
            status = await retryDeployment(siteId, status!.version!);
          });
        }}>{$messages.deploymentRetryDelivery}</button>
      </div>
    {/if}
    {#if diagnostics}
      <div role="status">
        {#if diagnostics.length === 0}
          <p>{$messages.deploymentPublicationAndBackendAreAvailable}</p>
        {/if}
        {#each diagnostics as item (item.issue)}<p>{issueLabel(item.issue)}</p>{/each}
      </div>
    {/if}
  {:else if busy}<p role="status">{$messages.urlLoading}</p>
  {:else}<RefreshButton onclick={() => {
    void run(load);
  }} />{/if}
</section>

<style>
  ._deployment-status { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 12px 24px; margin: 24px 0; }
  ._deployment-status dt { color: var(--cms-muted); }
  ._deployment-status dd { margin: 0; overflow-wrap: anywhere; }
  ._deployment-actions { flex-wrap: nowrap; gap: 6px; margin-top: 24px; }
  ._deployment-actions :global(button) { padding-left: 6px; padding-right: 6px; }
  @media (min-width: 576px) {
    ._deployment-actions { gap: 10px; }
    ._deployment-actions :global(button) { padding-left: 18px; padding-right: 18px; }
  }
  @media (max-width: 575px) {
    ._deployment-status { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    ._deployment-status dd { margin-bottom: 12px; }
  }
</style>
