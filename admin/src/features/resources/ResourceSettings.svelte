<script lang="ts">
  import { tick, untrack } from 'svelte';

  import { type AdminMessageKey, formatMessage, messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { CalibrationScope, type ICalibrationRecommendation } from '../calibration/calibration.types';
  import { calibrationRequest } from '../calibration/calibration-api';
  import { resourceAllocationPreview, ResourceDumpMode } from './resource-allocation-view';
  import ResourceProcesses from './ResourceProcesses.svelte';
  import { installationResources, type IResourceView, ResourceDatabasePlacement } from './resources-api';

  let { active, siteId, onUnauthorized, onDirtyChange, onBusy, recommendation = null, revision = 0 }: {
    active: boolean;
    recommendation?: ICalibrationRecommendation | null;
    revision?: number;
    siteId: string;
    onUnauthorized: () => void;
    onDirtyChange: (value: boolean) => void;
    onBusy: (value: boolean) => void;
  } = $props();
  let saved = $state<IResourceView | null>(null);
  let pendingRecommendation = $state<ICalibrationRecommendation | null>(null);
  let seenRecommendation: ICalibrationRecommendation | null = null;
  let editVersion = $state('');
  let databaseCpu = $state(1);
  let sitePoolSize = $state(5);
  let proposedCmsCpu = $state<number | null>(null);
  let counts = $state<Record<string, number>>({});
  const minimumApplyFeedbackMs = 400;
  let resourceForm: HTMLFormElement | undefined = $state();
  let overlayBounds: DOMRect | null = $state(null);
  let busy = $state(false);
  let refreshing = $state(false);
  let readSequence = 0;
  let inputRevision = 0;
  let loadError = $state<AdminMessageKey | ''>('');
  let saveError = $state<AdminMessageKey | ''>('');
  let success = $state<AdminMessageKey | ''>('');
  let feedback: HTMLDivElement | undefined = $state();
  const dirty = $derived(saved !== null && (pendingRecommendation !== null
    || proposedCmsCpu !== null && proposedCmsCpu !== saved.cmsCpu
    || databaseCpu !== saved.databaseCpu
    || saved.databasePools !== undefined && sitePoolSize !== saved.databasePools.sitePoolSize
    || saved.sites.some((site) => counts[site.siteId] !== site.processes)));
  const site = $derived(saved?.sites.find((entry) => entry.siteId === siteId));
  const preview = $derived(saved ? resourceAllocationPreview(
    proposedCmsCpu !== null
      ? {
        ...saved,
        cmsCpuBudget: proposedCmsCpu,
        cmsCpu: proposedCmsCpu,
      } : saved, databaseCpu, counts, siteId) : null);

  function accept(value: IResourceView, discard: boolean): void {
    saved = value;

    if (discard) {
      editVersion = value.version;
      pendingRecommendation = null;
      proposedCmsCpu = null;
      databaseCpu = value.databaseCpu;
      sitePoolSize = value.databasePools?.sitePoolSize ?? 5;
      counts = Object.fromEntries(value.sites.map((entry) => [entry.siteId, entry.processes]));
    }
  }

  async function load(discard = false): Promise<IResourceView | undefined> {
    if (busy || refreshing) {
      return;
    }

    const sequence = ++readSequence;
    const revision = inputRevision;

    refreshing = true;

    try {
      const value = await installationResources();

      if (sequence !== readSequence || busy) {
        return;
      }
      accept(value, !dirty || discard && revision === inputRevision);
      loadError = '';

      if (discard && revision === inputRevision) {
        saveError = '';
        success = '';
      }

      return value;
    } catch (failure) {
      if (sequence !== readSequence) {
        return;
      }
      if (failure instanceof ContentRequestError && failure.status === 401) {
        onUnauthorized();
      } else {
        loadError = 'resourceSettingsCouldNotRefreshTheActual';
      }
    } finally {
      if (sequence === readSequence) {
        refreshing = false;
      }
    }
  }

  async function showFeedback(): Promise<void> {
    await tick();

    if (active && feedback?.isConnected) {
      feedback.focus({ preventScroll: true });
      feedback.scrollIntoView({ block: 'nearest' });
    }
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!saved || !preview || busy) {
      return;
    }
    saveError = '';
    success = '';

    readSequence++;
    refreshing = false;
    busy = true;
    const applyingStarted = performance.now();

    onBusy(true);
    let reconcile = false;
    const requested = saved.sites.map((entry) => ({
      siteId: entry.siteId,
      processes: counts[entry.siteId] ?? 1,
    }));

    try {
      let value: IResourceView;

      if (pendingRecommendation) {
        await calibrationRequest('/runs/' + pendingRecommendation.runId + '/apply', 'POST',
          { expectedVersion: editVersion });
        value = await installationResources();
      } else {
        value = await installationResources({
          expectedVersion: !dirty && saved.applyError ? saved.version : editVersion,
          databaseCpu,
          sites: requested,
          ...(saved.databasePools?.editable ? { sitePoolSize } : {}),
          ...(proposedCmsCpu !== null ? { cmsCpu: proposedCmsCpu } : {}),
        });
      }
      accept(value, true);
      success = 'resourceSettingsAllocationSavedAssignedAndRunning';
    } catch (failure) {
      if (failure instanceof ContentRequestError && failure.status === 401) {
        onUnauthorized();
      } else {
        const status = failure instanceof ContentRequestError ? failure.status : 0;
        const timedOut = failure instanceof DOMException && failure.name === 'TimeoutError';

        reconcile = true;
        saveError = timedOut
          ? ('resourceSettingsSaveResponseTimedOutChanges')
          : status === 400
            ? ('resourceSettingsAllocationRejectedCheckCPUQuotas')
            : status === 409
              ? ('resourceSettingsSaveRejectedAllocationChangedOr')
              : ('resourceSettingsCouldNotFinishApplyingThe');

      }
    } finally {
      const remaining = minimumApplyFeedbackMs - (performance.now() - applyingStarted);

      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
      busy = false;
      onBusy(false);
    }
    await showFeedback();

    if (reconcile) {
      const actual = await load();

      if (
        actual
        && !actual.applyError
        && actual.databaseCpu === databaseCpu
        && (!actual.databasePools
        || actual.databasePools.appliedSitePoolSize === sitePoolSize)
        && requested.every((entry) => actual.sites.some((site) => site.siteId === entry.siteId
          && site.processes === entry.processes && site.running === entry.processes))
      ) {
        saveError = '';
        success = 'resourceSettingsSaveConfirmedAllAssignedProcesses';
      }
    }
  }

  $effect(() => {
    if (!busy || !active || !resourceForm) {
      overlayBounds = null;

      return;
    }

    const form = resourceForm;
    const update = (): void => {
      const box = form.getBoundingClientRect();
      const viewport = window.visualViewport;
      let left = Math.max(box.left, viewport?.offsetLeft ?? 0);
      let top = Math.max(box.top, viewport?.offsetTop ?? 0);
      let right = Math.min(box.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth));
      let bottom = Math.min(box.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight));

      for (let parent = form.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clip = parent.getBoundingClientRect();

        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      overlayBounds = right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null;
    };
    const observer = new ResizeObserver(update);

    observer.observe(form);

    for (let parent = form.parentElement; parent; parent = parent.parentElement) {
      observer.observe(parent);
    }
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  });

  $effect(() => {
    if (active && saved && recommendation && !busy && seenRecommendation !== recommendation) {
      const value = recommendation;

      untrack(() => {
        seenRecommendation = value;

        if (dirty) {
          saveError = 'resourceSettingsSaveOrDiscardYourCurrent';

          return;
        }
        if (value.scope === CalibrationScope.Site && !saved!.sites.some(site => site.siteId === value.siteId)) {
          return;
        }
        editVersion = saved!.version;

        if (value.scope === CalibrationScope.Installation) {
          databaseCpu = value.configuration.databaseCpu;
          sitePoolSize = value.configuration.sitePoolSize;
          proposedCmsCpu = value.configuration.cmsCpu;
        }
        counts = Object.fromEntries(saved!.sites.map(site => [site.siteId,
          value.scope === CalibrationScope.Installation || site.siteId === value.siteId
            ? value.configuration.sites.find(entry => entry.siteId === site.siteId)?.processes ?? site.processes
            : site.processes]));
        pendingRecommendation = value;
        success = 'resourceSettingsCalibrationResultFilledPressSave';
      });
    }
  });
  $effect(() => {
    if (active) {
      const observedRevision = revision;

      void observedRevision;
      untrack(() => {
        void load();
      });
    }
  });
  $effect(() => {
    onDirtyChange(dirty);
  });
  $effect(() => {
    if (active) {
      untrack(() => {
        void load();
      });
      const timer = setInterval(() => {
        void load();
      }, 5000);

      return () => clearInterval(timer);
    }
  });
</script>

<section class="resource-settings" hidden={!active}
  aria-label={$messages.resourceSettingsInstallationResources}>
  <div class="_resource-heading"><h2>{$messages.accessSettingsResources}</h2>
    <RefreshButton disabled={busy || refreshing} onclick={() => {
      void load(true);
    }} /></div>
  {#if saved && preview}
    <form bind:this={resourceForm} onsubmit={save} aria-busy={busy} oninput={() => {
      inputRevision++;
      pendingRecommendation = null;
      saveError = '';
      success = '';
    }}>
      {#if proposedCmsCpu !== null}
        <p>{$messages.resourceSettingsSharedCMSCPUQuotaAfter}
          <strong>{proposedCmsCpu} CPU</strong></p>
      {/if}
      <div class="_docker-frame">
        <h3>{saved.databasePlacement === ResourceDatabasePlacement.ManagedLocal
          ? 'Docker' : $messages.resourceSettingsInstallation} · {saved.capacity} CPU</h3>
        <p>{$messages.resourceSettingsInfrastructureReserve} {saved.infrastructureCpu} CPU</p>
        {#if saved.databasePlacement === ResourceDatabasePlacement.ManagedLocal}
        <div class="_resource-row">
          <label class="_resource-control">MongoDB {saved.databaseVersion ?? '—'} · CPU
            <input type="number" min="0.1" max={saved.capacity} step="0.1" bind:value={databaseCpu}
              disabled={busy || !saved.managed || !saved.allocationEditable || saved.activeDump} required /></label>
          <p>{$messages.resourceSettingsActualDatabaseCPUQuota}
            <strong>{saved.observedDatabaseCpu ?? '—'} CPU</strong></p>
        </div>
        {#if !saved.managed}<p>{$messages.resourceSettingsDockerControlIsUnavailableThe}</p>{/if}
        {:else}
          <h3>MongoDB {saved.databaseVersion ?? '—'}</h3>
          <p>{saved.databasePlacement === ResourceDatabasePlacement.Remote
            ? $messages.resourceSettingsTheDatabaseIsRemoteIts
            : $messages.resourceSettingsTheLocalDatabaseIsManaged}</p>
        {/if}
        {#if saved.databasePools}
          <section class="_database-pools">
            <h3>{$messages.resourceSettingsMongoDBConnections}</h3>
            <label class="_resource-control">{$messages.resourceSettingsMaximumConnectionsPerSiteProcess}
              <input data-site-pool-size type="number" min="1" step="1" bind:value={sitePoolSize}
                disabled={busy || saved.activeDump || !saved.databasePools.editable} required /></label>
            <p>{$messages.resourceSettingsSaved} <strong>{saved.databasePools.sitePoolSize}</strong>
              · {$messages.resourceSettingsAppliedToAllSiteProcesses}
              <strong>{saved.databasePools.appliedSitePoolSize ?? '—'}</strong></p>
            <p>{$messages.resourceSettingsServicePoolPerProcessCoordinator}
              <strong>{saved.databasePools.coordinatorPoolSize}</strong>
              {$messages.resourceSettingsConfiguredAtStartup}</p>
            <p>{$messages.resourceSettingsPoolsOpenConnectionsOnDemand}</p>
          </section>
        {/if}
        <div class="_cluster-frame">
          <h3>{$messages.resourceSettingsAllCMSProcesses}</h3>
          <p>{$messages.resourceSettingsSharedCPUQuotaForAll}
            <strong>{saved.observedCmsCpu ?? saved.cmsCpu} CPU</strong></p>
          <p>{$messages.resourceSettingsOSProcessesNotCPUCores}</p>
          <ResourceProcesses value={saved} />
          {#each saved.sites as entry (entry.siteId)}
            <div class="_resource-site" class:_resource-site__framed={saved.sites.length > 1}>
              <div><strong>{entry.name}</strong><p>{entry.domain}</p>
                {#if entry.addons?.length}<p>{$messages.resourceSettingsAddOns}
                  {entry.addons.map(addon => `${addon.addonKey} ${addon.implementationVersion}`).join(', ')}
                </p>{/if}
              </div>
              <label class="_resource-control">{$messages.resourceSettingsProcessesForThisSite}
                <input type="number" min="1" step="1" bind:value={counts[entry.siteId]} required
                  disabled={busy || !saved.allocationEditable || saved.activeDump} /></label>
              <p class="_resource-actual">{$messages.resourceSettingsSiteAssigned}
                <strong>{entry.processes}</strong>
                · {$messages.resourceSettingsRunningNow} <strong>{entry.running}</strong></p>
              {#if saved.activeDump && saved.dumpSiteId === entry.siteId}
                <p role="status" class="_resource-actual">{entry.processes >= 2
                  ? $messages.resourceSettingsOneProcessIsTemporarilyLent
                  : $messages.resourceSettingsThisSiteIsCreatingA}</p>
              {/if}
              {#if entry.error}
                <p class="cms-error _resource-actual" role="status">
                  {$messages.resourceSettingsSomeAssignedProcessesCouldNot}</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
      <div class="_resource-summary">
        <div><h3>{$messages.resourceSettingsSiteProcessesOnly}</h3>
          <p>{$messages.resourceSettingsAssignedToSites} <strong>{preview.savedTotal}</strong></p>
          <p>{$messages.resourceSettingsRunningForSites} <strong>{preview.runningTotal}</strong></p>
        </div>
        <div><h3>{dirty ? $messages.resourceSettingsEnteredValuesNotAppliedYet
          : $messages.resourceSettingsCPURecommendation}</h3>
          <p>{$messages.resourceSettingsSiteProcessesInTheForm} <strong>{preview.total}</strong></p>
          <p>{$messages.resourceSettingsCPUGuidelineForSiteProcesses}
            <strong>{preview.recommendation}</strong></p>
          <p>{$messages.resourceSettingsUnallocatedCPUBudget}
            <strong>{preview.unallocated} CPU</strong></p>
        </div>
      </div>
      {#if saved.capacity <= 1 && saved.databasePlacement === ResourceDatabasePlacement.ManagedLocal}
        <p>{$messages.resourceSettingsTheDatabaseAndSitesShare}</p>{/if}
      {#if site}
        <div class="_dump-explanation">
          <p>{$messages.resourceSettingsWhenYouCreateASite}</p>
          {#if dirty}<p><strong>{$messages.resourceSettingsAfterApplyingTheEnteredValues}</strong></p>{/if}
          <p>{site.name}: {preview.dumpMode === ResourceDumpMode.BorrowedProcess
            ? $messages.resourceSettingsOneSiteProcessWillStop
            : $messages.resourceSettingsSingleProcessCapture}
          </p>
        </div>
      {/if}
      {#if preview.aboveRecommendation}
        <p class="_resource-warning" role="status">
          {formatMessage($messages.resourceSettingsRequestedProcessesTotalRecommendedBy, {
            total: preview.total,
            recommendation: preview.recommendation,
          })}</p>
      {/if}
      <div class="_resource-actions">
        <button class="cms-primary"
          title={!busy && !dirty ? $messages.resourceSettingsNoUnsavedChanges : undefined}
          disabled={busy || !dirty && !saved.applyError || saved.activeDump
            || !pendingRecommendation && !saved.allocationEditable && !saved.databasePools?.editable}>
          {!busy && !dirty && success && !saved.applyError
            ? $messages.resourceSettingsAllocationSaved
            : $messages.resourceSettingsSaveAllocation}</button>
        <RefreshButton disabled={busy || refreshing} onclick={() => {
          void load(true);
        }} />
      </div>
      <div class="_resource-feedback" bind:this={feedback} tabindex="-1">
        {#if saveError}<p class="cms-error" role="alert">{$messages[saveError]}</p>{/if}
        {#if success}<p role="status">{$messages[success]}</p>{/if}
        {#if saved.applyError}
          <p class="cms-error" role="alert">{$messages.resourceSettingsTheSavedAllocationIsNot}</p>
        {/if}
        {#if loadError}<p class="cms-error" role="alert">{$messages[loadError]}</p>{/if}
      </div>
      {#if busy && overlayBounds}
        <div class="_resource-saving-overlay" role="status" aria-live="polite"
          style:left={overlayBounds.left + 'px'} style:top={overlayBounds.top + 'px'}
          style:width={overlayBounds.width + 'px'} style:height={overlayBounds.height + 'px'}>
          <div class="_resource-saving-message">
            <span class="_saving-spinner" aria-hidden="true"></span>
            <span>{$messages.resourceSettingsApplyingAllocation}</span>
          </div>
        </div>
      {/if}
    </form>
  {:else if loadError}
    <p class="cms-error" role="alert">{$messages[loadError]}</p>
  {/if}
</section>

<style>
  .resource-settings { margin-top: 32px; width: 100%; max-width: none; min-width: 0; overflow-wrap: anywhere; }
  .resource-settings form { position: relative; }
  ._resource-saving-overlay { position: fixed; z-index: 2; display: grid; place-items: center;
    background: color-mix(in srgb, var(--cms-section-surface) 92%, transparent); cursor: wait; }
  ._resource-saving-message { margin: 0;
    width: max-content; max-width: 100%; display: flex; flex-direction: column; align-items: center;
    gap: 16px; padding: 16px; color: var(--cms-ink); text-align: center; }
  ._resource-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  ._docker-frame { border: 1px solid var(--cms-border); border-radius: 12px; padding: 20px; }
  ._database-pools { margin-top: 24px; }
  ._cluster-frame { margin-top: 24px; }
  ._resource-row { display: flex; align-items: end; flex-wrap: wrap; gap: 16px 32px; }
  ._resource-control { display: flex; flex-direction: column; align-items: start; gap: 8px; font-size: 14px; }
  ._resource-control input { width: 8rem; max-width: 100%; }
  ._resource-site { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 24px; margin-top: 24px; }
  ._resource-site__framed { border: 1px solid var(--cms-border); border-radius: 8px; padding: 20px; }
  ._resource-site p { margin: 8px 0 0; }
  ._resource-actual { grid-column: 1 / -1; }
  ._resource-summary { display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 24px; }
  ._dump-explanation { padding: 16px 20px; background: var(--cms-section-surface); border-radius: 8px; }
  ._dump-explanation p { margin: 0; }
  ._dump-explanation p + p { margin-top: 10px; }
  ._resource-warning { padding: 16px 20px; border-radius: 8px; color: var(--cms-warning);
    background: var(--cms-warning-surface); }
  ._resource-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
  ._resource-feedback { scroll-margin: 16px; }
  ._resource-feedback:empty { display: none; }
  @media (max-width: 575px) {
    ._docker-frame, ._resource-site__framed { padding: 14px; }
    ._resource-site { grid-template-columns: minmax(0, 1fr); }
  }
</style>
