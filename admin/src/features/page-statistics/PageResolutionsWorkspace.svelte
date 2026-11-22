<script lang="ts">
  import { parseDate } from '@internationalized/date';
  import { untrack } from 'svelte';

  import { adminLanguage, adminLocales, messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import {
    DeliveryFilter, type IResolutionStatistics, MethodFilter, OutcomeFilter, RepresentationFilter, ResolutionPeriod,
  } from './page-resolutions.types';
  import { getPageResolutions } from './page-resolutions-api';
  import ResolutionDateRange from './ResolutionDateRange.svelte';

  let { siteId, active, timeZone, onUnauthorized }: {
    siteId: string;
    active: boolean;
    timeZone: string;
    onUnauthorized: () => void;
  } = $props();
  let period = $state(ResolutionPeriod.Today);
  let cmsVersion = $state('');
  let delivery = $state(DeliveryFilter.All);
  let representation = $state(RepresentationFilter.All);
  let method = $state(MethodFilter.Get);
  let outcome = $state(OutcomeFilter.Success);
  let from = $state('');
  let to = $state('');
  let result = $state<IResolutionStatistics | null>(null);
  let loading = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let loadedKey = '';
  let generation = 0;
  const numberLocale = $derived(adminLocales[$adminLanguage].numberLocale);
  const number = $derived(new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }));
  const integer = $derived(new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }));
  const calls = $derived(result?.rows.reduce((count, row) => count + row.calls, 0) ?? 0);
  const outcomeLabels = $derived({
    all: $messages.pageResolutionsAllOutcomes,
    Success: $messages.pageResolutionsSuccess,
    Redirect: $messages.pageResolutionsRedirect,
    NotFound: $messages.pageResolutionsNotFound,
    Invalid: $messages.pageResolutionsInvalidRequest,
    Unavailable: $messages.pageResolutionsUnavailable,
    Failure: $messages.pageResolutionsFailure,
    Aborted: $messages.pageResolutionsDisconnected,
  });

  function latency(value: number): string {
    return value > 0 && value < 0.01 ? '<' + number.format(0.01) : number.format(value);
  }
  function date(value: string): string {
    return new Intl.DateTimeFormat(adminLocales[$adminLanguage].numberLocale, {
      timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
    }).format(parseDate(value).toDate('UTC'));
  }

  async function load(): Promise<void> {
    const current = ++generation;
    const identity = siteId;
    const today = result?.today;
    let dates: { from?: string; to?: string } = {};

    if (period === ResolutionPeriod.Custom) {
      if (!from || !to) {
        return;
      }
      dates = { from, to };
    } else if (period !== ResolutionPeriod.Today && today) {
      dates = {
        from: parseDate(today).subtract({ days: period === ResolutionPeriod.Week ? 6 : 29 }).toString(), to: today,
      };
    }
    loading = true;
    error = null;

    try {
      const next = await getPageResolutions(identity, {
        ...dates, ...(cmsVersion ? { cmsVersion } : {}), delivery, representation, method, outcome,
      });

      if (current !== generation || identity !== siteId) {
        return;
      }
      result = next;

      if (period !== ResolutionPeriod.Custom) {
        from = next.from;
        to = next.to;
      }
    } catch (value) {
      if (current !== generation) {
        return;
      }
      if (value instanceof ContentRequestError && value.status === 401) {
        onUnauthorized();
      } else {
        error = contentError(value);
      }
    } finally {
      if (current === generation) {
        loading = false;
      }
    }
  }

  $effect(() => {
    const key = siteId + ':' + timeZone;

    if (active) {
      untrack(() => {
        if (loadedKey !== key) {
          loadedKey = key;
          result = null;
          period = ResolutionPeriod.Today;
          cmsVersion = '';
          void load();
        }
      });
    }
  });
</script>

<section class="page-resolutions" hidden={!active} aria-label={$messages.accessSettingsPageStatistics}>
  <p class="resolution-description">{$messages.pageResolutionsServerResponsePreparationTimeExcluding}</p>
  <form class="resolution-filters" onsubmit={(event) => {
    event.preventDefault();
    void load();
  }}>
    <label class="_form-field">{$messages.pageResolutionsPeriod}
      <select bind:value={period} disabled={loading} aria-label={$messages.pageResolutionsPeriod}>
        <option value={ResolutionPeriod.Today}>{$messages.pageResolutionsToday}</option>
        <option value={ResolutionPeriod.Week}>{$messages.pageResolutionsLastDays}</option>
        <option value={ResolutionPeriod.Month}>{$messages.pageResolutionsLastDays2}</option>
        <option value={ResolutionPeriod.Custom}>{$messages.pageResolutionsDateRange}</option>
      </select>
    </label>
    <label class="_form-field">{$messages.pageResolutionsCMSVersion}
      <select bind:value={cmsVersion} disabled={loading} aria-label={$messages.pageResolutionsCMSVersion}>
        <option value="">{$messages.pageResolutionsAllVersions}</option>
        {#each result?.versions ?? [] as version (version)}<option value={version}>{version}</option>{/each}
      </select>
    </label>
    {#if period === ResolutionPeriod.Custom && from && to}
      <div class="resolution-custom-dates">
        <ResolutionDateRange {from} {to} locale={$adminLanguage} disabled={loading} onchange={(start, end) => {
          from = start;
          to = end;
        }} />
      </div>
    {/if}
    <details class="resolution-extra-filters">
      <summary>{$messages.pageResolutionsMoreFilters}</summary>
      <div class="resolution-filter-grid">
        <label class="_form-field">{$messages.pageResolutionsDelivery}
          <select bind:value={delivery} disabled={loading} aria-label={$messages.pageResolutionsDelivery}>
            <option value={DeliveryFilter.All}>{$messages.pageResolutionsAllTypes}</option>
            <option value={DeliveryFilter.Static}>{$messages.pageResolutionsStatic}</option>
            <option value={DeliveryFilter.Dynamic}>{$messages.pageResolutionsDynamic}</option>
            <option value={DeliveryFilter.Redirect}>{$messages.pageResolutionsRedirect}</option>
            <option value={DeliveryFilter.Unresolved}>{$messages.pageResolutionsUnresolved}</option>
          </select>
        </label>
        <label class="_form-field">{$messages.pageResolutionsFormat}
          <select bind:value={representation} disabled={loading} aria-label={$messages.pageResolutionsFormat}>
            <option value={RepresentationFilter.All}>{$messages.pageResolutionsAllFormats}</option>
            <option value={RepresentationFilter.Html}>HTML</option>
            <option value={RepresentationFilter.Markdown}>Markdown</option>
          </select>
        </label>
        <label class="_form-field">{$messages.pageResolutionsMethod}
          <select bind:value={method} disabled={loading} aria-label={$messages.pageResolutionsMethod}>
            <option value={MethodFilter.All}>{$messages.pageResolutionsAllMethods}</option>
            <option value={MethodFilter.Get}>GET</option><option value={MethodFilter.Head}>HEAD</option>
          </select>
        </label>
        <label class="_form-field">{$messages.pageResolutionsOutcome}
          <select bind:value={outcome} disabled={loading} aria-label={$messages.pageResolutionsOutcome}>
            {#each Object.values(OutcomeFilter) as value (value)}
              <option {value}>{outcomeLabels[value]}</option>
            {/each}
          </select>
        </label>
      </div>
    </details>
    <div class="resolution-filter-actions">
      <button class="cms-primary" disabled={loading}>{$messages.pageResolutionsShowResults}</button>
      <RefreshButton disabled={loading} onclick={() => {
        void load();
      }} />
    </div>
  </form>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if loading}<p role="status">{$messages.pageResolutionsLoadingStatistics}</p>{/if}
  {#if result}
    <p class="resolution-summary" role="status">
      {date(result.from)} — {date(result.to)} · {result.timeZone} ·
      {integer.format(calls)} {$messages.pageResolutionsCalls} ·
      {integer.format(result.rows.length)} URL
    </p>
    {#if result.diagnostics.dropped || result.diagnostics.failed}
      <p class="cms-error" role="status">{$messages.pageResolutionsTheSampleMayBeIncomplete}
        {$messages.pageResolutionsDropped} {integer.format(result.diagnostics.dropped)},
        {$messages.pageResolutionsFailedWrites} {integer.format(result.diagnostics.failed)}.</p>
    {/if}
    <div class="cms-table-wrap" aria-busy={loading}>
      <!-- svelte-ignore a11y_no_redundant_roles (Mobile grid display needs explicit table semantics.) -->
      <table class="cms-table cms-table__responsive" role="table">
        <caption class="resolution-caption">{$messages.pageResolutionsMostRequestedPathsAppearFirst}</caption>
        <thead role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">URL</th>
          <th scope="col" role="columnheader">{$messages.pageResolutionsCalls2}</th>
          <th scope="col" role="columnheader">{$messages.pageResolutionsAverageMs}</th>
          <th scope="col" role="columnheader">{$messages.pageResolutionsMedianMs}</th>
          <th scope="col" role="columnheader">p95 ({$messages.pageResolutionsMs})</th>
          <th scope="col" role="columnheader">p99 ({$messages.pageResolutionsMs})</th>
        </tr></thead>
        <tbody role="rowgroup">
          {#each result.rows as row (row.path)}
            <tr role="row">
              <td role="cell" data-label="URL" class="cms-table-primary resolution-path">{row.path}</td>
              <td role="cell" data-label={$messages.pageResolutionsCalls2} class="cms-table-meta">
                {integer.format(row.calls)}</td>
              <td role="cell" data-label={$messages.pageResolutionsAverageMs} class="cms-table-meta">
                {latency(row.averageMs)}</td>
              <td role="cell" data-label={$messages.pageResolutionsMedianMs} class="cms-table-meta">
                {latency(row.medianMs)}</td>
              <td role="cell" data-label="p95" class="cms-table-meta">{latency(row.p95Ms)}</td>
              <td role="cell" data-label="p99" class="cms-table-meta">{latency(row.p99Ms)}</td>
            </tr>
          {:else}<tr role="row"><td role="cell" colspan="6" class="cms-table-empty">
            {$messages.pageResolutionsNoRequestsForThisPeriod}
          </td></tr>{/each}
        </tbody>
      </table>
    </div>
    <p class="resolution-description">{$messages.pageResolutionsMedianHalfOfRequestsAre}</p>
  {/if}
</section>

<style>
  .page-resolutions { width: 100%; min-width: 0; }
  .resolution-description, .resolution-summary { color: #69736c; font-size: 13px; line-height: 1.7; }
  .resolution-filters, .resolution-filter-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .resolution-filters { margin: 24px 0; }
  .resolution-filters :global(._form-field) { margin: 0; }
  .resolution-extra-filters, .resolution-custom-dates, .resolution-filter-actions { grid-column: 1 / -1; }
  .resolution-extra-filters summary { min-height: 44px; padding: 12px 0; cursor: pointer; font-size: 13px; }
  .resolution-filter-actions { display: flex; gap: 12px; align-items: center; }
  .resolution-caption { display: none; text-align: start; padding: 16px; font-size: 12px; color: #69736c; }
  .resolution-path { overflow-wrap: anywhere; }
  @media (min-width: 576px) {
    .resolution-filters, .resolution-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 768px) {
    .resolution-caption { display: table-caption; }
  }
</style>
