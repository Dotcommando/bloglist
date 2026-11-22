<script lang="ts">
  import { adminLanguage, messages } from '../../i18n/i18n';
  import { cpuChartSegments } from './cpu-chart';
  import { cpuCharts } from './cpu-telemetry';

  let { active, timeZone }: { active: boolean; timeZone: string } = $props();
  const latestTime = $derived($cpuCharts.points.at(-1)?.timestamp);

  function time(instant: number): string {
    return new Intl.DateTimeFormat($adminLanguage, { timeZone, timeStyle: 'medium' }).format(instant);
  }
</script>

<section class="cpu-usage" hidden={!active} aria-label={$messages.cpuUsageLogicalCPUUsage}>
  <p>{$messages.cpuUsageLogicalCPUs} {$cpuCharts.logicalCpuCount} · {$cpuCharts.source}</p>
  <p>{$messages.cpuUsageOneSecondSamplesWholeHost}</p>
  {#if !$cpuCharts.live}<p role="status">{$messages.cpuUsageMeasurementsAreUnavailableOrWaiting}</p>{/if}
  {#if latestTime}
    <p class="_cpu-time-range"><span>{time(Date.parse(latestTime) - 299000)}</span>
      <span>{time(Date.parse(latestTime))} ({timeZone})</span></p>
  {/if}
  <div class="_cpu-charts">
    {#each Array.from({ length: $cpuCharts.logicalCpuCount }, (_, index) => index) as index (index)}
      {@const latest = $cpuCharts.live ? $cpuCharts.points.at(-1)?.usage[index] : null}
      <figure class="_cpu-chart">
        <figcaption><span>CPU {index}</span><span>{latest == null ? '—' : `${latest}%`}</span></figcaption>
        <div class="_cpu-plot">
          <div class="_cpu-scale" aria-hidden="true">
            {#each [100, 75, 50, 25, 0] as value (value)}
              <span style:top={`${100 - value}%`}>{value}%</span>
            {/each}
          </div>
          <svg viewBox="0 0 299 100" preserveAspectRatio="none" role="img" aria-label={`CPU ${index}: 0–100%`}>
            <path d="M0 0H299M0 25H299M0 50H299M0 75H299M0 100H299" class="_cpu-grid" />
            {#each cpuChartSegments($cpuCharts.points, index) as points (points)}
              <polyline {points} class="_cpu-line" />
            {/each}
          </svg>
        </div>
      </figure>
    {/each}
  </div>
</section>

<style>
  .cpu-usage { width: 100%; }
  ._cpu-time-range { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  ._cpu-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 20px; }
  ._cpu-chart { margin: 0; min-width: 0; padding: 18px 16px; border-radius: 12px;
    background: var(--cms-section-surface); }
  figcaption { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; margin-bottom: 22px; }
  ._cpu-plot { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: 10px; margin-bottom: 8px; }
  ._cpu-scale { position: relative; height: 144px; font-size: 12px; color: var(--cms-muted); }
  ._cpu-scale span { position: absolute; right: 0; transform: translateY(-50%); }
  svg { width: 100%; height: 144px; display: block; overflow: hidden; }
  ._cpu-grid { stroke: var(--cms-muted); opacity: 0.3; fill: none; stroke-width: 1; vector-effect: non-scaling-stroke; }
  ._cpu-line { stroke: var(--cms-accent); fill: none; stroke-width: 1.7; vector-effect: non-scaling-stroke; }
</style>
