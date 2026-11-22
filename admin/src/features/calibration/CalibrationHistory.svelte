<script lang="ts">
  import { untrack } from 'svelte';

  import { adminLanguage, type AdminMessageKey, messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import { installationResources } from '../resources/resources-api';
  import type { ICalibrationDetail, ICalibrationMeasurement, ICalibrationRecommendation } from './calibration.types';
import type { ICalibrationAddonSnapshot } from './calibration-addon.types.js';
import { calibrationCompositionMatches } from './calibration-addon-composition.js';
  import { calibrationDetail, calibrationRequest, latestCalibrations } from './calibration-api';
import CalibrationAddons from './CalibrationAddons.svelte';
import CalibrationMetricsTable from './CalibrationMetricsTable.svelte';
  import CalibrationOverlay from './CalibrationOverlay.svelte';
import CalibrationStepMetrics from './CalibrationStepMetrics.svelte';

  let { siteId, active, timeZone, revision = 0, onUnauthorized, onBusy, onApplied,
    onRecommendation = (): void => {} }: {
    siteId: string;
    active: boolean;
    timeZone: string;
    revision?: number;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onApplied: () => void;
    onRecommendation?: (value: ICalibrationRecommendation) => void;
  } = $props();
  let rows = $state<ICalibrationDetail[]>([]);
  let error = $state<AdminMessageKey | ''>('');
  let feedback = $state<AdminMessageKey | ''>('');
  let busy = $state(false);
  let region = $state<HTMLElement>();
  let names = $state<Record<string, string>>({});
  let composition = $state<ICalibrationAddonSnapshot[]>([]);
  const compositionChanged = (detail: ICalibrationDetail): boolean => !calibrationCompositionMatches(
    detail.run.addonSnapshots, detail.run.profile.scope === 'Installation' ? composition
      : composition.filter(site => site.siteId === detail.run.profile.siteId));
  let selected = $state<ICalibrationDetail | null>(null);
  let sequence = 0;

  function failed(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = 'calibrationHistoryRequestFailedRefreshTheState';
    }
  }
  async function load(): Promise<void> {
    const current = ++sequence;

    try {
      const [runs, resources] = await Promise.all([latestCalibrations(siteId), installationResources()]);
      const details = await Promise.all(runs.map(run => {
        const existing = rows.find(row => row.run.runId === run.runId && row.run.status === run.status
          && row.run.winnerId === run.winnerId && run.status !== 'Running');

        return existing ? { ...existing, run } : calibrationDetail(run.runId);
      }));

      if (current === sequence) {
        rows = details;
        names = Object.fromEntries(resources.sites.map(site => [site.siteId, `${site.name} (${site.domain})`]));
        composition = resources.sites.map(site => ({ siteId: site.siteId, addons: [...site.addons ?? []] }));

        if (selected) {
          selected = details.find(row => row.run.runId === selected?.run.runId) ?? selected;
        }
        error = '';
      }
    } catch (value) {
      if (current === sequence) {
        failed(value);
      }
    }
  }
  function date(value: string): string {
    return new Intl.DateTimeFormat($adminLanguage, { dateStyle: 'short', timeStyle: 'medium', timeZone })
      .format(new Date(value));
  }
  function processCount(value: number): string {
    const forms: Record<string, string> = {
      one: $messages.calibrationHistoryProcess,
      other: $messages.calibrationHistoryProcesses,
      few: $messages.calibrationHistoryProcesses,
      many: $messages.calibrationHistoryProcesses2,
    };

    return value + ' ' + forms[new Intl.PluralRules($adminLanguage).select(value)];
  }
  function status(value: string): string {
    const text: Record<string, string> = {
      Running: $messages.calibrationHistoryRunning,
      Completed: $messages.calibrationHistoryCompleted,
      Cancelled: $messages.calibrationHistoryCancelled,
      Failed: $messages.calibrationHistoryFailed,
      Interrupted: $messages.calibrationHistoryInterruptedByRestart,
      RestorationRequired: $messages.calibrationHistoryRestorationRequired,
    };

    return text[value] ?? value;
  }
  async function apply(detail: ICalibrationDetail): Promise<void> {
    busy = true;
    onBusy(true);
    error = '';
    feedback = '';

    try {
      const state = await installationResources();

      await calibrationRequest('/runs/' + detail.run.runId + '/apply', 'POST', { expectedVersion: state.version });
      feedback = 'calibrationHistoryCalibrationResultApplied';
      onApplied();
      await load();
    } catch (value) {
      failed(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }
  function recommend(detail: ICalibrationDetail): void {
    const winner = detail.measurements.find(row => row.measurementId === detail.run.winnerId);

    if (winner) {
      onRecommendation({
        runId: detail.run.runId,
        scope: detail.run.profile.scope,
        siteId: detail.run.profile.siteId,
        configuration: winner.configuration,
      });
    }
  }
  $effect(() => {
    if (!active) {
      return;
    }

    const observedSite = siteId;
    const observedRevision = revision;

    void observedSite;
    void observedRevision;
    untrack(() => {
      void load();
    });
    const timer = setInterval(() => {
      if (!busy && rows.some(detail => detail.run.status === 'Running')) {
        void load();
      }
    }, 5000);

    return () => {
      sequence++;
      clearInterval(timer);
    };
  });
</script>

{#snippet configuration(measurement: ICalibrationMeasurement)}
  {@const value = measurement.configuration}
  <div class="_calibration-configuration">
    <div>{$messages.calibrationHistoryApplication}
      {processCount(value.sites.reduce((total, site) => total + site.processes, 0))} ·
      {value.cmsCpu.toFixed(1)} CPU</div>
    {#if value.sites.length > 1}
      {#each value.sites as site (site.siteId)}
        <div class="_calibration-site-processes">{names[site.siteId] ?? site.siteId}:
          {processCount(site.processes)}</div>
      {/each}
    {/if}
    <div>{$messages.calibrationHistoryDatabase} {value.databaseCpu.toFixed(1)} CPU</div>
    <div>{$messages.calibrationHistoryDatabasePoolPerProcess} {value.sitePoolSize}</div>
    <div>{$messages.calibrationHistoryGeneratorConnections} {measurement.concurrency}</div>
  </div>
{/snippet}

<section class="_calibration-history" hidden={!active} bind:this={region} aria-busy={busy}>
  <h2>{$messages.calibrationHistoryLastCalibrations}</h2>
  <p>{$messages.calibrationHistoryCompletingARunLeavesPersistent}</p>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if feedback}<p class="cms-success" role="status">{$messages[feedback]}</p>{/if}
  {#if !rows.length}<p>{$messages.calibrationHistoryNoRetainedRunsYet}</p>{:else}
    <div class="_calibration-table-scroll">
      <table class="cms-table">
        <thead><tr><th>{$messages.calibrationHistoryMeasured}</th><th>{$messages.calibrationHistoryProfileStatus}</th>
          <th>{$messages.calibrationHistoryReference}</th><th>{$messages.calibrationHistoryResult}</th>
          <th></th></tr></thead>
        <tbody>{#each rows as detail (detail.run.runId)}
          {@const winner = detail.measurements.find(row => row.measurementId === detail.run.winnerId)}
          {@const reference = detail.measurements.find(row => row.measurementId === detail.run.referenceId)}
          <tr><td>{date(detail.run.startedAt)}</td>
            <td><strong>{detail.run.profile.name}</strong><br />
              <span class="cms-status"
                class:cms-status__warning={detail.run.status === 'Running'}
                class:cms-status__success={detail.run.status === 'Completed'}
                class:cms-status__danger={['Cancelled', 'Failed', 'Interrupted', 'RestorationRequired']
                  .includes(detail.run.status)}>{status(detail.run.status)}</span>
              {#if detail.run.profile.scope === 'Site'}<br />
                <small>{$messages.calibrationHistoryLegacyFixedResourcesCPUBudget}</small>
              {:else}<br /><small>{detail.run.profile.distributedCpu} CPU ·
                  {$messages.calibrationHistoryTotalBudget}</small>{/if}
              {#if detail.run.status === 'Running'}<br />{detail.run.phase}{/if}
              {#if detail.run.status === 'Completed' && compositionChanged(detail)}<p class="cms-warning">
                {$messages.calibrationHistoryAddOnCompositionChangedOr}
              </p>{/if}</td>
            <td>{reference ? reference.metrics.successfulRps.toFixed(1) + ' visits/s' : '—'}</td>
            <td>{#if winner}<strong>{winner.metrics.successfulRps.toFixed(1)} visits/s</strong><br />
              {@render configuration(winner)}
              {:else}—{/if}</td>
            <td><div class="_calibration-actions">
              <button type="button" class="cms-secondary" disabled={busy} onclick={() => {
                selected = detail;
              }}>
                {$messages.calibrationHistoryDetails}</button>
              {#if winner && detail.run.restored && detail.run.status === 'Completed'
                && detail.run.profile.scope === 'Installation'}
                <button type="button" class="cms-primary" disabled={busy || compositionChanged(detail)}
                  onclick={() => void apply(detail)}>
                  {$messages.calibrationHistoryApply}</button>
                <button type="button" class="cms-secondary" disabled={busy || compositionChanged(detail)}
                  onclick={() => recommend(detail)}>
                  {$messages.calibrationHistoryFillResourceForm}</button>
              {/if}
            </div></td></tr>
        {/each}</tbody>
      </table>
    </div>
  {/if}
  {#if selected}
    <div class="_calibration-detail">
      <h3>{selected.run.profile.name} · {status(selected.run.status)}</h3>
      <p>{selected.run.generatorPlacement}</p>
      <CalibrationAddons snapshots={selected.run.addonSnapshots}
        sites={Object.entries(names).map(([siteId, name]) => ({ siteId, name }))} />
      {#if selected.run.error}<p class="cms-error">{selected.run.error}</p>{/if}
      <p>{$messages.calibrationHistoryOriginalSettingsRestored}
        {selected.run.restored ? '✓' : '—'}</p>
      <div class="_calibration-table-scroll"><table class="cms-table"><thead><tr>
        <th>{$messages.calibrationHistoryTypeDate}</th><th>{$messages.calibrationHistoryConfiguration}</th>
        <th>visits/s</th><th>{$messages.calibrationHistoryMean}</th><th>{$messages.calibrationHistoryMedian}</th>
        <th>p95</th><th>p99</th>
        <th>{$messages.calibrationHistoryErrorsPass}</th></tr></thead><tbody>
        {#each selected.measurements as row (row.measurementId)}
          <tr><td>{row.kind}<br />{date(row.finishedAt)}</td><td>
            {@render configuration(row)}</td>
            <td>{row.metrics.successfulRps.toFixed(1)}</td><td>{row.metrics.averageMs.toFixed(1)} ms</td>
            <td>{row.metrics.medianMs.toFixed(1)} ms</td><td>{row.metrics.p95Ms.toFixed(1)} ms</td>
            <td>{row.metrics.p99Ms.toFixed(1)} ms</td><td>{row.metrics.errors} / {row.passed ? '✓' : '—'}
              <CalibrationStepMetrics metrics={row.stepMetrics} {names} />
              <details><summary>{$messages.calibrationHistoryBySite}</summary>
                {#each Object.entries(row.siteMetrics) as [id, metrics] (id)}
                  <div class="_site-metrics">
                    <strong>{names[id] ?? id}</strong>
                    <div>{metrics.successfulRps.toFixed(1)} visits/s</div>
                    <CalibrationMetricsTable {metrics} label={names[id] ?? id} averages />
                  </div>
                {/each}
              </details>
            </td></tr>
        {/each}
      </tbody></table></div>
      <button type="button" class="cms-secondary" onclick={() => {
        selected = null;
      }}>{$messages.calibrationHistoryHide}</button>
    </div>
  {/if}
  <CalibrationOverlay {busy} target={region} label={$messages.calibrationHistoryApplyingSettings} />
</section>

<style>
  ._site-metrics { margin: 12px 0; overflow-wrap: anywhere; }
  ._calibration-history { margin-top: 2rem; min-width: 0; }
  ._calibration-table-scroll { max-width: 100%; overflow-x: auto; }
  ._calibration-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
  ._calibration-detail { margin-top: 1.5rem; }
  ._calibration-configuration { display: grid; gap: .125rem; font-size: 14px; line-height: 1.5; }
  ._calibration-site-processes { padding-inline-start: .75rem; }
  th, td { text-align: start; vertical-align: top; padding: .75rem; }
</style>
