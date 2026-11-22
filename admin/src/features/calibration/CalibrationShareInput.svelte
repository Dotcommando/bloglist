<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import { calibrationShare, calibrationShareStep } from './calibration-profile';

  let { value = $bindable(''), label }: { value?: string | undefined; label: string } = $props();
</script>

<div class="_share-input">
  <button type="button" class="cms-secondary cms-action-square"
    aria-label={$messages.calibrationShareInputDecreaseShareBy}
    onclick={() => {
      value = calibrationShareStep(value, -1);
    }}>−</button>
  <input type="text" inputmode="decimal" role="spinbutton" aria-label={label} aria-valuemin="0" aria-valuemax="100"
    aria-valuenow={(calibrationShare(value) ?? 0) / 100} bind:value onkeydown={event => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        value = calibrationShareStep(value, event.key === 'ArrowUp' ? 1 : -1);
      }
    }} />
  <button type="button" class="cms-secondary cms-action-square"
    aria-label={$messages.calibrationShareInputIncreaseShareBy}
    onclick={() => {
      value = calibrationShareStep(value, 1);
    }}>+</button>
</div>

<style>
  ._share-input { display: flex; align-items: center; gap: .25rem; }
  ._share-input input { width: 6rem; text-align: center; }
  ._share-input button { min-width: 44px; min-height: 44px; }
</style>
