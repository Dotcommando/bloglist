<script lang="ts">
  import type { Snippet } from 'svelte';

  let { checked = $bindable(false), disabled = false, id, name, value, children, onCheckedChange }: {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    name?: string;
    value?: string;
    children: Snippet;
    onCheckedChange?: (checked: boolean, input: HTMLInputElement) => void;
  } = $props();
  const generatedId = $props.id();
</script>

<label class="cms-checkbox" for={id ?? generatedId}>
  <span class="_checkbox-control">
    <input class="_checkbox-input" type="checkbox" id={id ?? generatedId} {name} {value} {disabled}
      bind:checked onchange={(event) => onCheckedChange?.(event.currentTarget.checked, event.currentTarget)} />
    <svg class="_checkbox-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m4 10 4 4 8-8" />
    </svg>
  </span>
  <span class="_checkbox-caption">{@render children()}</span>
</label>

<style>
  .cms-checkbox { display: flex; align-items: flex-start; gap: 10px; width: fit-content;
    max-width: 100%; min-height: 44px; margin: 0; padding: 10px 0; cursor: pointer;
    color: var(--cms-ink); font-size: 14px; line-height: 24px; }
  ._checkbox-control { position: relative; flex: 0 0 20px; width: 20px; height: 20px; margin-top: 2px; }
  ._checkbox-input { appearance: none; display: block; width: 20px; height: 20px; min-height: 0;
    margin: 0; padding: 0; border: 1.5px solid var(--cms-muted); border-radius: 5px;
    background: var(--cms-surface); cursor: inherit; }
  ._checkbox-input:checked { border-color: var(--cms-accent); background: var(--cms-accent); }
  ._checkbox-mark { position: absolute; inset: 0; width: 20px; height: 20px; opacity: 0;
    pointer-events: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  ._checkbox-input:checked + ._checkbox-mark { opacity: 1; }
  ._checkbox-caption { min-width: 0; overflow-wrap: anywhere; }
  .cms-checkbox:hover ._checkbox-input:not(:disabled) { border-color: var(--cms-accent); }
  .cms-checkbox:has(input:disabled) { cursor: not-allowed; opacity: 0.6; }
  @media (forced-colors: active) {
    ._checkbox-input { appearance: auto; }
    ._checkbox-mark { display: none; }
  }
</style>
