<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import type { ICalibrationMetrics } from './calibration.types.js';

  let { metrics, label, averages = false }: {
    metrics: ICalibrationMetrics;
    label: string;
    averages?: boolean;
  } = $props();
</script>

<table class="_calibration-metrics-table" aria-label={label}>
  <tbody>
    <tr>
      {#if averages}
        <td>{$messages.calibrationMetricsTableMean} {metrics.averageMs.toFixed(1)} ms</td>
        <td>{$messages.calibrationMetricsTableMedian} {metrics.medianMs.toFixed(1)} ms</td>
      {:else}
        <td>{$messages.calibrationMetricsTableRequests} {metrics.requests}</td>
        <td>{$messages.calibrationMetricsTableErrors} {metrics.errors}</td>
      {/if}
    </tr>
    <tr>
      <td>p95: {metrics.p95Ms.toFixed(1)} ms</td>
      <td>p99: {metrics.p99Ms.toFixed(1)} ms</td>
    </tr>
  </tbody>
</table>

<style>
  ._calibration-metrics-table { width: auto; margin-top: 4px; border-collapse: collapse; font: inherit; }
  ._calibration-metrics-table td {
    padding: 0 16px 0 0;
    border: 0;
    background: transparent;
    vertical-align: top;
    white-space: nowrap;
  }
  ._calibration-metrics-table td:last-child { padding-right: 0; }
</style>
