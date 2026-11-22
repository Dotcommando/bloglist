<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import type { IResourceSite } from '../resources/resources-api.js';
  import type { ICalibrationTarget } from './calibration.types.js';

  let { target = $bindable(), site }: { target: ICalibrationTarget;
    site: IResourceSite | undefined } = $props();
  const available = $derived(site?.addons?.flatMap(addon => addon.queries.map(query => ({
    addonKey: addon.addonKey, queryId: query.queryId,
  }))) ?? []);
</script>

<div class="_api-steps">
  {#each target.apiSteps ?? [] as step, index (index)}
    <div class="_api-step">
      <label>{$messages.calibrationApiStepsPublicGETAfterPage} {index + 1}
        <select value={`${step.addonKey}:${step.queryId}`} onchange={event => {
          const [addonKey, queryId] = event.currentTarget.value.split(':');

          if (addonKey && queryId && target.apiSteps) {
            target.apiSteps[index] = { addonKey, queryId };
          }
        }}>
          {#each site?.addons ?? [] as addon (addon.addonKey)}
            {#each addon.queries as query (query.queryId)}
              <option value={`${addon.addonKey}:${query.queryId}`}>
                {addon.addonKey} · {query.queryId} · {addon.implementationVersion}
              </option>
            {/each}
          {/each}
          {#if !site?.addons?.some(addon => addon.addonKey === step.addonKey
            && addon.queries.some(query => query.queryId === step.queryId))}
            <option value={`${step.addonKey}:${step.queryId}`}>
              {step.addonKey} · {step.queryId} ({$messages.calibrationApiStepsUnavailable})
            </option>
          {/if}
        </select>
      </label>
      <button type="button" class="cms-danger" onclick={() => {
        target.apiSteps = (target.apiSteps ?? []).filter((_, i) => i !== index);
      }}>{$messages.calibrationApiStepsRemoveStep}</button>
    </div>
  {/each}
  {#if available.length}
    <button type="button" class="cms-secondary" disabled={(target.apiSteps?.length ?? 0) >= 8} onclick={() => {
      const step = available[0];

      if (step) {
        target.apiSteps = [...target.apiSteps ?? [], { ...step }];
      }
    }}>{$messages.calibrationApiStepsPublicAPI}</button>
  {/if}
</div>

<style>
  ._api-steps { grid-column: 1 / -1; display: grid; gap: 12px; }
  ._api-step { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
  label { display: grid; gap: 6px; min-width: 0; flex: 1; }
  select { width: 100%; }
  button { justify-self: start; min-height: 44px; }
</style>
