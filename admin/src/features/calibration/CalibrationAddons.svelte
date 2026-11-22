<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import type { ICalibrationAddonSnapshot } from './calibration-addon.types.js';

  let { snapshots, sites }: { snapshots: readonly ICalibrationAddonSnapshot[] | undefined;
    sites: readonly { siteId: string; name: string }[] } = $props();
</script>

<p><strong>{$messages.calibrationAddonsAddOnsDuringMeasurement}</strong></p>
{#if snapshots}
  {#each snapshots as snapshot (snapshot.siteId)}
    <p>{sites.find(site => site.siteId === snapshot.siteId)?.name ?? snapshot.siteId}:
      {#each snapshot.addons as addon (addon.addonKey)}
        <span title={`${addon.runtimeDigest} · ${addon.configurationHash}`}>
          {addon.addonKey} {addon.implementationVersion}
        </span>
      {:else}{$messages.calibrationAddonsNoEnabledAddOns}{/each}
    </p>
  {/each}
{:else}
  <p>{$messages.calibrationAddonsThisHistoricalRunHasNo}</p>
{/if}
