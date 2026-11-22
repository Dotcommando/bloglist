<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import type { ICalibrationMetrics } from './calibration.types.js';
  import CalibrationMetricsTable from './CalibrationMetricsTable.svelte';

  let { metrics, names }: { metrics: Record<string, ICalibrationMetrics> | undefined;
    names: Record<string, string> } = $props();
  function label(key: string): string {
    const value: unknown = JSON.parse(key);

    return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string'
      ? `${names[value[0]] ?? value[0]} · GET ${value[1]}` : key;
  }
</script>

{#if metrics}
  <details>
    <summary>{$messages.calibrationStepMetricsScenarioRequests}</summary>
    {#each Object.entries(metrics) as [key, value] (key)}
      <div class="_step-metrics">
        <strong>{label(key)}</strong>
        <CalibrationMetricsTable metrics={value} label={label(key)} />
      </div>
    {/each}
  </details>
{/if}

<style>
  ._step-metrics { margin: 12px 0; overflow-wrap: anywhere; }
</style>
