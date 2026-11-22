<script lang="ts">
  import { Popover } from 'bits-ui';
  import { tick } from 'svelte';

  import { messages } from '../../i18n/i18n';

  let { label, items, value = $bindable(''), disabled = false, onchange }: {
    label: string;
    items: readonly { value: string; label: string }[];
    value?: string | undefined;
    disabled?: boolean;
    onchange?: (value: string) => void;
  } = $props();
  const id = $props.id();
  let open = $state(false);
  let query = $state('');
  let offset = $state(0);
  let highlighted = $state(-1);
  let input: HTMLInputElement | undefined;
  const matches = $derived(items.filter((item) => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const visible = $derived(matches.slice(offset, offset + 10));

  function choose(selected: string): void {
    value = selected;
    onchange?.(selected);
    open = false;
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlighted = event.key === 'ArrowDown' ? Math.min(highlighted + 1, visible.length - 1)
        : Math.max(highlighted - 1, 0);
      void tick().then(() => document.getElementById(id + '-' + highlighted)?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = visible[highlighted];

      if (item) {
        choose(item.value);
      }
    }
  }
</script>

<div class="_form-field">
  <label for={id + '-trigger'}>{label}</label>
  <Popover.Root bind:open onOpenChange={() => {
    query = '';
    offset = 0;
    highlighted = -1;
  }}>
    <Popover.Trigger id={id + '-trigger'} class="_url-picker-trigger" {disabled}>
      <span class="_reference-label">{items.find((item) => item.value === value)?.label
        ?? (value ? value : $messages.urlChooseTarget)}</span>
      <svg class="_reference-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="reference-popup" side="bottom" align="start" sideOffset={6} collisionPadding={12}
        aria-label={label} onOpenAutoFocus={(event) => {
          event.preventDefault();
          input?.focus();
        }}>
        <input bind:this={input} role="combobox" aria-expanded="true" aria-autocomplete="list"
          aria-controls={id + '-list'} aria-activedescendant={highlighted < 0 ? undefined : id + '-' + highlighted}
          aria-label={$messages.urlSuggestionSearch} value={query} onkeydown={keydown} oninput={(event) => {
            query = event.currentTarget.value;
            offset = 0;
            highlighted = -1;
          }} />
        <div role="listbox" id={id + '-list'} aria-label={label}>
          {#each visible as item, index (item.value)}
            <button type="button" role="option" id={id + '-' + index} aria-selected={value === item.value}
              class:highlighted={highlighted === index} onclick={() => choose(item.value)}>{item.label}</button>
          {/each}
        </div>
        {#if !visible.length}<p role="status">{$messages.urlSuggestionEmpty}</p>{/if}
        <div class="reference-pages">
          <button type="button" disabled={offset === 0} onclick={() => {
            offset -= 10;
            highlighted = -1;
          }}>
            {$messages.urlSuggestionPrevious}</button>
          <button type="button" disabled={offset + 10 >= matches.length}
            onclick={() => {
              offset += 10;
              highlighted = -1;
            }}>{$messages.urlSuggestionNext}</button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>

<style>
  ._reference-label { min-width: 0; overflow-wrap: anywhere; }
  ._reference-chevron { flex: 0 0 16px; width: 16px; height: 16px; stroke: #536357; stroke-width: 1.5;
    stroke-linecap: round; stroke-linejoin: round; }
  :global(.reference-popup) { z-index: 60; width: min(480px, calc(100vw - 24px)); max-height: 65vh;
    overflow: auto; padding: 12px; background: var(--cms-surface, white); border: 1px solid #ced3cc;
    border-radius: 7px; box-shadow: 0 8px 24px #252d2720; }
  :global(.reference-popup input) { width: 100%; min-height: 44px; }
  [role="option"] { display: block; width: 100%; padding: 12px; text-align: left;
    background: #f1f4ee; border: 1px solid transparent; margin-block: 4px; border-radius: 4px; }
  [role="option"]:hover, .highlighted { background: #e3eadc; }
  [aria-selected="true"] { border-color: #47694c; }
  .reference-pages { display: flex; justify-content: space-between; gap: 12px; }
</style>
