<script lang="ts">
  import { untrack } from 'svelte';

  import { adminLanguage, type AdminMessageKey, messages } from '../../i18n/i18n';
  import { ContentRequestError, object } from '../../shared/api/content-api';
  import CmsDialog from '../../shared/ui/CmsDialog.svelte';
  import { installationResources, type IResourceView } from '../resources/resources-api';
  import {
    CalibrationScope, type ICalibrationDetail, type ICalibrationDraft, type ICalibrationProfile,
    type ICalibrationRecommendation,
  } from './calibration.types';
  import {
    calibrationDetail, calibrationProfiles, calibrationRequest, latestCalibrations,
    saveCalibrationProfile, startCalibration,
  } from './calibration-api';
  import {
    calibrationAvailabilityReadError, calibrationBlockers, type ICalibrationCapabilities,
  } from './calibration-availability';
  import {
    calibrationDefault,
    calibrationPercentTotal,
    calibrationReference,
    calibrationShare,
  } from './calibration-profile';
import CalibrationApiSteps from './CalibrationApiSteps.svelte';
  import CalibrationHistory from './CalibrationHistory.svelte';
  import CalibrationOverlay from './CalibrationOverlay.svelte';
  import CalibrationShareInput from './CalibrationShareInput.svelte';

  let { siteId, active, timeZone, onUnauthorized, onBusy, onDirtyChange, onApplied, onRecommendation }: {
    siteId: string;
    active: boolean;
    timeZone: string;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onDirtyChange: (value: boolean) => void;
    onApplied: () => void;
    onRecommendation: (value: ICalibrationRecommendation) => void;
  } = $props();
  let profiles = $state<ICalibrationProfile[]>([]);
  let nextCursor = $state<string | null>(null);
  let previous = $state<ICalibrationProfile | null>(null);
  let draft = $state<ICalibrationDraft | null>(null);
  let shares = $state<string[]>([]);
  let savedText = $state('');
  let processValues = $state('');
  let poolValues = $state('');
  let loadValues = $state('');
  let resources = $state<IResourceView | null>(null);
  let capabilities = $state<ICalibrationCapabilities | null>(null);
  let availabilityFailure = $state<number | null>(null);
  const blockers = $derived(calibrationBlockers(resources, capabilities, $adminLanguage));
  let busy = $state(false);
  let loading = $state(false);
  const fullAvailable = $derived(!loading && availabilityFailure === null
    && resources !== null && capabilities !== null && blockers.length === 0);
  let error = $state<AdminMessageKey | ''>('');
  let feedback = $state<AdminMessageKey | ''>('');
  let deleting = $state(false);
  let region = $state<HTMLElement>();
  let currentRun = $state<ICalibrationDetail | null>(null);
  let historyRevision = $state(0);
  let sequence = 0;
  let announced = '';
  const traffic = $derived(calibrationPercentTotal(shares));
  const editorText = $derived(JSON.stringify({ draft, shares, processValues, poolValues, loadValues }));
  const dirty = $derived(draft !== null && editorText !== savedText);
  const running = $derived(currentRun?.run.status === 'Running');
  function integers(value: string): number[] {
    return value.split(/[\s,]+/).filter(Boolean).map(Number);
  }
  const latencyFields = $derived([
    { key: 'averageMs', label: $messages.calibrationHistoryMean },
    { key: 'medianMs', label: $messages.calibrationHistoryMedian },
    { key: 'p95Ms', label: 'p95' }, { key: 'p99Ms', label: 'p99' },
  ]);
  const valid = $derived(draft !== null && !!draft.name.trim() && traffic.valid
    && draft.targets.length > 0 && draft.targets.every(target => !!target.reference.trim()) && draft.distributedCpu > 0
    && [processValues, poolValues, loadValues].every(text => /^\d+(?:[\s,]+\d+)*$/.test(text.trim())
      && integers(text).every(value => Number.isSafeInteger(value) && value > 0))
    && Object.values(draft.criteria).every(value => value === null || Number.isFinite(value) && value > 0)
    && [draft.search.warmupSeconds, draft.search.probeSeconds,
      draft.search.confirmationSeconds, draft.search.maximumSeconds]
      .every(value => Number.isSafeInteger(value) && value > 0)
    && draft.distributedCpu >= 0.2 && draft.search.databaseCpuStep > 0
    && draft.search.maximumSeconds >= draft.search.warmupSeconds + draft.search.confirmationSeconds);

  function fill(profile: ICalibrationProfile | null): void {
    previous = profile;
    draft = profile ? structuredClone($state.snapshot(profile))
      : calibrationDefault(resources?.sites.map(site => site.siteId) ?? [siteId], resources?.capacity ?? 1);
    const legacy = draft.scope !== CalibrationScope.Installation;
    const missing = (resources?.sites ?? []).filter(site => !draft!.targets.some(row => row.siteId === site.siteId));

    draft.scope = CalibrationScope.Installation;
    draft.siteId = null;
    draft.targets.push(...missing.map(site => ({
      siteId: site.siteId, kind: calibrationReference('/'), reference: '/', share: 0,
    })));

    if (!profile) {
      draft.name = $messages.calibrationNewProfile;
    }
    shares = draft.targets.map(target => String(target.share / 100));
    processValues = draft.search.processCounts.join(', ');
    poolValues = draft.search.poolSizes.join(', ');
    loadValues = draft.search.concurrencyLevels.join(', ');
    savedText = profile && (legacy || missing.length) ? ''
      : JSON.stringify({ draft, shares, processValues, poolValues, loadValues });
    error = '';
    feedback = '';
  }
  function failed(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      const status = value instanceof ContentRequestError ? value.status : 0;

      error = status === 400
        ? ('calibrationParametersRejectedCheckTheProfile')
        : status === 409 ? ('calibrationStateChangedOrAnotherOperation')
          : ('calibrationRequestDidNotCompleteRefresh');
    }
  }
  async function load(more = false): Promise<void> {
    const id = ++sequence;

    loading = true;
    availabilityFailure = null;

    try {
      const page = await calibrationProfiles(siteId, more ? nextCursor : null);
      const [state, available, runs] = await Promise.all([installationResources(),
        calibrationRequest('/capabilities'), latestCalibrations(siteId)]);
      const live = runs.find(run => run.status === 'Running');
      const detail = live ? await calibrationDetail(live.runId) : null;

      if (id !== sequence) {
        return;
      }
      profiles = more ? [...profiles, ...page.items] : page.items;
      nextCursor = page.nextCursor;
      resources = state;
      capabilities = {
        processSupervisor: object(available).site === true,
        externalGenerator: object(available).installation === true,
      };

      if (detail) {
        currentRun = detail;
      }
    } catch (value) {
      if (id === sequence) {
        if (value instanceof ContentRequestError && value.status === 401) {
          onUnauthorized();
        } else {
          availabilityFailure = value instanceof ContentRequestError ? value.status : 0;
        }
      }
    } finally {
      if (id === sequence) {
        loading = false;
      }
    }
  }
  async function action(operation: () => Promise<void>): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    onBusy(true);
    error = '';
    feedback = '';

    try {
      await operation();
    } catch (value) {
      failed(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }
  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!draft || !valid) {
      return;
    }

    const value: ICalibrationDraft = {
      name: draft.name,
      scope: draft.scope,
      siteId: draft.scope === CalibrationScope.Site ? siteId : null,
      distributedCpu: draft.distributedCpu,
      targets: draft.targets.map((target, index) => ({
        ...target,
        reference: target.reference.trim(),
        kind: calibrationReference(target.reference),
        share: calibrationShare(shares[index] ?? '') ?? 0,
      })),
      criteria: { ...draft.criteria },
      search: {
        ...draft.search,
        processCounts: integers(processValues),
        poolSizes: integers(poolValues),
        concurrencyLevels: integers(loadValues),
      },
    };

    await action(async () => {
      const saved = await saveCalibrationProfile(value, previous);

      fill(saved);
      feedback = 'calibrationProfileSaved';
      await load();
    });
  }
  async function start(): Promise<void> {
    if (!previous || dirty || !valid) {
      return;
    }

    const profile = previous;

    await action(async () => {
      const run = await startCalibration(profile);

      currentRun = { run, measurements: [] };
      historyRevision++;
    });
  }
  async function poll(): Promise<void> {
    if (!currentRun || !running || busy) {
      return;
    }

    const id = currentRun.run.runId;

    try {
      const detail = await calibrationDetail(id);

      if (currentRun?.run.runId !== id) {
        return;
      }
      currentRun = detail;

      if (detail.run.status !== 'Running') {
        historyRevision++;
        const winner = detail.measurements.find(row => row.measurementId === detail.run.winnerId);

        if (
          winner
          && detail.run.profile.scope === CalibrationScope.Installation
          && detail.run.status === 'Completed'
          && detail.run.restored
          && announced !== id
        ) {
          announced = id;
          feedback = 'calibrationMeasurementsSavedAndOriginalSettings';
          onRecommendation({
            runId: id,
            scope: detail.run.profile.scope,
            siteId: detail.run.profile.siteId,
            configuration: winner.configuration,
          });
        }
      }
    } catch (value) {
      failed(value);
    }
  }
  $effect(() => {
    if (!active) {
      return;
    }

    const observedSite = siteId;

    void observedSite;
    untrack(() => {
      void load();
    });
    const timer = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      sequence++;
      clearInterval(timer);
    };
  });
  $effect(() => {
    const value = dirty;

    untrack(() => onDirtyChange(value));
  });
</script>

<section hidden={!active} class="_calibration-workspace" bind:this={region} aria-busy={busy}>
  <p>{$messages.calibrationCalibrationTemporarilyChangesResourcesAnd}</p>
  {#if loading}<p role="status">{$messages.calibrationCheckingCalibrationAvailability}</p>
  {:else if availabilityFailure !== null}
    <p class="cms-warning" data-calibration-unavailable role="status">
      {calibrationAvailabilityReadError(availabilityFailure, $adminLanguage)}</p>
  {:else if blockers.length}
    <div class="cms-warning" data-calibration-unavailable role="status">
      <strong>{$messages.calibrationCalibrationUnavailable}</strong>
      {#each blockers as blocker (blocker.code)}
        <p data-calibration-blocker={blocker.code}><strong>{blocker.reason}</strong><br />{blocker.action}</p>
      {/each}
    </div>
  {/if}
  <div class="_calibration-controls">
    <button type="button" class="cms-primary" disabled={busy || loading || !resources}
      onclick={() => fill(null)}>{$messages.calibrationCreateProfile}</button>
    <button type="button" class="cms-secondary" disabled={busy || loading} onclick={() => void load()}>
      {$messages.refresh}</button>
  </div>
  {#if profiles.length}<div class="_calibration-profiles" aria-label={$messages.calibrationProfiles}>
    {#each profiles as profile (profile.profileId)}<button type="button" class="cms-secondary" disabled={busy}
      aria-pressed={previous?.profileId === profile.profileId} onclick={() => fill(profile)}>
      {profile.name}</button>{/each}
    {#if nextCursor}<button type="button" class="cms-secondary" disabled={loading} onclick={() => void load(true)}>
      {$messages.moreActions}</button>{/if}
  </div>{/if}
  {#if draft}<form onsubmit={save} aria-busy={busy}>
    <fieldset disabled={busy}>
      <h2>{previous ? $messages.calibrationEditProfile : $messages.calibrationNewProfile}</h2>
      <div class="_calibration-fields _profile-fields">
        <label class="_form-field">{$messages.calibrationProfileName}
          <input bind:value={draft.name} maxlength="128" required />
        </label>
        <label class="_form-field">{$messages.calibrationTotalDatabaseAndCMSCPU}
          <input class="_compact" type="number" min="0.2" step="0.1" bind:value={draft.distributedCpu} required />
        </label>
      </div>
      <p>{$messages.calibrationSearchesDatabaseAndCMSCPU}</p>
      {#if previous?.scope === CalibrationScope.Site}<p class="cms-warning">
        {$messages.calibrationThisLegacyProfileMeasuredProcesses}
      </p>{/if}
      <h3>{$messages.calibrationPagesAndTrafficShares}</h3>
      <p>{$messages.calibrationEnterAURLRelativePath}</p>
      {#each resources?.sites ?? [] as site (site.siteId)}
        <section class="_calibration-site" aria-label={site.name} data-calibration-site={site.siteId}>
          <header class="_calibration-site-heading">
            <div><h4>{site.name}</h4><small>{site.domain}</small></div>
            <button type="button" class="cms-secondary cms-action-square"
              title={$messages.calibrationAddPage} aria-label={$messages.calibrationAddPage}
              onclick={() => {
                if (draft) {
                  draft.targets.push({
                    siteId: site.siteId, kind: calibrationReference('/'), reference: '/', share: 0,
                  });
                  shares.push('');
                }
              }}>+</button>
          </header>
          {#each draft.targets.map((target, index) => ({ target, index }))
            .filter(row => row.target.siteId === site.siteId) as { target, index } (index)}
            <div class="_calibration-target">
              <label class="_form-field _target-reference">
                <span>{$messages.urlPage} {index + 1}</span>
                <input bind:value={target.reference} placeholder="/" required />
              </label>
              <div class="_form-field _target-share"><span>{$messages.calibrationShare}</span>
                <CalibrationShareInput bind:value={shares[index]}
                  label={$messages.calibrationPageShare + (index + 1)} />
              </div>
              <button type="button" class="cms-danger cms-action-square"
                disabled={draft.targets.filter(row => row.siteId === site.siteId).length === 1}
                title={$messages.calibrationRemovePageFromProfile}
                aria-label={$messages.calibrationRemovePageRow + (index + 1)} onclick={() => {
                  if (draft) {
                    draft.targets = draft.targets.filter((_, i) => i !== index);
                    shares = shares.filter((_, i) => i !== index);
                  }
                }}>
                <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                </svg>
              </button>
              <CalibrationApiSteps bind:target={() => target, value => {
                if (draft) {
                  draft.targets[index] = value;
                }
              }}
                site={resources?.sites.find(row => row.siteId === target.siteId)} />
            </div>
          {/each}
          {#if !draft.targets.some((row, index) => row.siteId === site.siteId
            && (calibrationShare(shares[index] ?? '') ?? 0) > 0)}
            <p class="cms-warning">{$messages.calibrationAssignPositiveTrafficToThis}</p>
          {/if}
        </section>
      {/each}
      <p class:cms-error={!traffic.valid} role={!traffic.valid ? 'alert' : undefined} data-calibration-total>
        {$messages.calibrationTotalShare} {(traffic.total / 100).toFixed(2)}%
        {#if !traffic.valid} —
          {$messages.calibrationMaximumWithPrecision}{/if}</p>
      <h3>{$messages.calibrationLatencyLimitsMs}</h3>
      <p>{$messages.calibrationABlankFieldDisablesThat}</p>
      <div class="_calibration-fields">
        {#each latencyFields as criterion (criterion.key)}
          <label class="_form-field">{criterion.label}
            <input class="_compact" type="number" min="0.1" step="any"
            value={Reflect.get(draft.criteria, criterion.key) ?? ''} oninput={event => {
              if (draft) {
                Reflect.set(draft.criteria, criterion.key, event.currentTarget.value === ''
                  ? null : event.currentTarget.valueAsNumber);
                draft.criteria = { ...draft.criteria };
              }
            }} />
          </label>
        {/each}
      </div>
      <details><summary>{$messages.calibrationSearchRangesAndExperimentTiming}</summary>
        <p>{$messages.calibrationTheseAreSearchParametersNot}</p>
        <div class="_calibration-fields">
          <label class="_form-field">{$messages.calibrationProcessCountCandidatesCommaSeparated}
            <input bind:value={processValues} />
          </label>
          <label class="_form-field">{$messages.calibrationGeneratorConcurrencyLevels}
            <input bind:value={loadValues} />
          </label>
          <label class="_form-field">{$messages.calibrationPoolSizeCandidatesCommaSeparated}
            <input bind:value={poolValues} />
          </label>
          <label class="_form-field">{$messages.calibrationDatabaseCPUStep}
            <input class="_compact" type="number" min="0.1"
            step="0.1" bind:value={draft.search.databaseCpuStep} />
          </label>
          <label class="_form-field">{$messages.calibrationWarmupSeconds}
            <input class="_compact" type="number" min="1" step="1"
              bind:value={draft.search.warmupSeconds} />
          </label>
          <label class="_form-field">{$messages.calibrationProbeSeconds}
            <input class="_compact" type="number" min="1" step="1" bind:value={draft.search.probeSeconds} />
          </label>
          <label class="_form-field">{$messages.calibrationConfirmationSeconds}
            <input class="_compact" type="number" min="1" step="1" bind:value={draft.search.confirmationSeconds} />
          </label>
          <label class="_form-field">{$messages.calibrationTotalRunBudgetSeconds}
            <input class="_compact" type="number" min="1" step="1" bind:value={draft.search.maximumSeconds} />
          </label>
        </div>
      </details>
      <div class="_calibration-controls">
        <button type="submit" class="cms-primary" disabled={!valid}>{$messages.calibrationSaveProfile}</button>
        <button type="button" class="cms-secondary"
          disabled={!previous || dirty || !valid || running || !fullAvailable || traffic.total === 0
          || !resources?.sites.every(site => draft?.targets.some((row, index) => row.siteId === site.siteId
            && (calibrationShare(shares[index] ?? '') ?? 0) > 0))}
          onclick={() => void start()}>
          {$messages.calibrationStartCalibration}</button>
        {#if previous}<button type="button" class="cms-danger" onclick={() => {
          deleting = true;
        }}>
          {$messages.calibrationDeleteProfile}</button>{/if}
      </div>
    </fieldset>
  </form>{/if}
  {#if currentRun}<section class="_calibration-progress" aria-live="polite">
    <h2>{$messages.calibrationCurrentRun}</h2>
    <p>{currentRun.run.profile.name} · {currentRun.run.status} · {currentRun.run.phase}</p>
    <p>{$messages.calibrationRetainedMeasurements} {currentRun.measurements.length}</p>
    {#if currentRun.run.error}<p class="cms-error">{currentRun.run.error}</p>{/if}
    {#if running}<button type="button" class="cms-secondary" disabled={busy}
      onclick={() => void action(async () => {
        await calibrationRequest('/runs/' + currentRun!.run.runId + '/cancel', 'POST', {});
        currentRun = await calibrationDetail(currentRun!.run.runId);
        historyRevision++;
      })}>{$messages.calibrationStopAndRestoreSettings}</button>{/if}
  </section>{/if}
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if feedback}<p class="cms-success" role="status">{$messages[feedback]}</p>{/if}
  <CalibrationHistory {siteId} {active} {timeZone} revision={historyRevision} {onUnauthorized} {onBusy} {onApplied}
    {onRecommendation} />
  <CalibrationOverlay {busy} target={region} label={$messages.calibrationApplyingChanges} />
</section>
<CmsDialog open={deleting} title={$messages.calibrationDeleteProfile2} {busy} onClose={() => {
  deleting = false;
}}>
  <p>{previous?.name}</p>
  <p>{$messages.calibrationMeasurementHistoryWillBeRetained}</p>
  <div class="_dialog-actions"><button type="button" class="cms-secondary" disabled={busy}
      onclick={() => {
        deleting = false;
      }}>
    {$messages.cancel}</button><button type="button" class="cms-danger" disabled={busy}
      onclick={() => void action(async () => {
        if (!previous) {
          return;
        }
        await calibrationRequest('/profiles/' + previous.profileId, 'DELETE', { expectedVersion: previous.version });
        deleting = false;
        draft = null;
        previous = null;
        await load();
      })}>{$messages.accessSettingsDelete}</button></div>
</CmsDialog>

<style>
  ._calibration-workspace { min-width: 0; max-width: 100%; }
  ._calibration-workspace .cms-action-square { min-width: 44px; min-height: 44px; }
  ._calibration-controls, ._calibration-profiles { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
  fieldset { border: 0; padding: 0; min-width: 0; }
  ._calibration-fields { display: flex; gap: 1rem 2rem; flex-wrap: wrap; }
  ._calibration-fields > label { min-width: 9rem; }
  ._compact { width: 8rem; }
  ._profile-fields > label:first-child { flex: 1; }
  ._calibration-site { padding: 1rem; margin: .75rem 0; border-radius: 12px;
    background: var(--cms-section-surface); }
  ._calibration-site-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  ._calibration-site-heading h4 { margin: 0; }
  ._calibration-site-heading small { overflow-wrap: anywhere; }
  ._calibration-target { display: grid; grid-template-columns: minmax(0, 1fr) auto 44px;
    align-items: center; gap: .75rem; margin: .5rem 0; }
  ._calibration-target ._form-field { margin-bottom: 0; flex-direction: row; align-items: center; }
  ._target-reference span { flex-shrink: 0; white-space: nowrap; }
  ._target-reference input { min-width: 0; }
  ._target-share > span { max-width: 8rem; }
  ._calibration-target > button { width: 44px; min-height: 44px; }
  @media (max-width: 767px) {
    ._calibration-target { grid-template-columns: minmax(0, 1fr) 44px; }
    ._target-reference { grid-column: 1 / -1; }
    ._calibration-target ._target-share { flex-direction: column; align-items: start; }
    ._calibration-target > button { align-self: end; }
  }
  ._calibration-progress { margin-top: 2rem; }
  summary { cursor: pointer; padding: .75rem 0; }
</style>
