<script lang="ts">
  import { Popover } from 'bits-ui';
  import { tick } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import { type IUrlSuggestion, UrlSearchPurpose } from './urls.types';
  import { searchUrls } from './urls-api';

  let { siteId, currentUrlId, purpose, label, value = $bindable(''), selectedPath = '', disabled = false,
    onUnauthorized }: {
    siteId: string;
    currentUrlId: string;
    purpose: UrlSearchPurpose;
    label: string;
    value?: string;
    selectedPath?: string;
    disabled?: boolean;
    onUnauthorized: () => void;
  } = $props();
  const id = $props.id();
  let open = $state(false);
  let query = $state('');
  let offset = $state(0);
  let items = $state<IUrlSuggestion[]>([]);
  let loading = $state(false);
  let failed = $state(false);
  let highlighted = $state(-1);
  let chosen = $state<IUrlSuggestion | null>(null);
  let searchInput: HTMLInputElement | undefined;
  let retry = $state(0);
  const choices = $derived(purpose === UrlSearchPurpose.Parent
    ? [{ urlId: '', path: $messages.urlNoParent }, ...items] : items);
  const display = $derived(value ? selectedPath || (chosen?.urlId === value ? chosen.path : '') || value
    : purpose === UrlSearchPurpose.Parent ? $messages.urlNoParent : $messages.urlChooseTarget);

  $effect(() => {
    if (!open || disabled) {
      return;
    }

    const currentSite = siteId;
    const currentUrl = currentUrlId;
    const currentPurpose = purpose;
    const currentQuery = query;
    const currentOffset = offset;

    void retry;
    let cancelled = false;

    loading = true;
    failed = false;
    highlighted = -1;
    const timer = setTimeout(() => {
      void searchUrls(currentSite, currentUrl, currentPurpose, currentQuery, currentOffset).then((result) => {
        if (!cancelled) {
          items = result;
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          if (error instanceof ContentRequestError && error.status === 401) {
            onUnauthorized();
          } else {
            failed = true;
          }
        }
      }).finally(() => {
        if (!cancelled) {
          loading = false;
        }
      });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  function choose(choice: { urlId: string; path: string }): void {
    if (loading || failed || disabled) {
      return;
    }
    value = choice.urlId;
    chosen = items.find((item) => item.urlId === choice.urlId) ?? null;
    open = false;
  }

  function keydown(event: KeyboardEvent): void {
    if (loading || failed) {
      if (event.key === 'Enter') {
        event.preventDefault();
      }

      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlighted = event.key === 'ArrowDown' ? Math.min(highlighted + 1, choices.length - 1)
        : Math.max(highlighted - 1, 0);
      void tick().then(() => document.getElementById(id + '-option-' + highlighted)
        ?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choice = choices[highlighted];

      if (choice) {
        choose(choice);
      }
    }
  }
</script>

<div class="_form-field">
  <label for={id + '-trigger'}>{label}</label>
  <Popover.Root bind:open onOpenChange={(next) => {
    if (next) {
      query = '';
      offset = 0;
    }
  }}>
    <Popover.Trigger id={id + '-trigger'} class="_url-picker-trigger" {disabled} aria-label={label}>
      <span class="_url-picker-value">{display}</span><span aria-hidden="true">⌄</span>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="_url-picker-popup" side="bottom" align="start" sideOffset={6} collisionPadding={12}
        aria-label={label} onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput?.focus();
        }}>
        <input bind:this={searchInput} role="combobox" aria-expanded="true" aria-autocomplete="list"
          aria-controls={id + '-list'}
          aria-activedescendant={highlighted < 0 ? undefined : id + '-option-' + highlighted}
          aria-label={$messages.urlSuggestionSearch} placeholder={$messages.urlSuggestionSearch} maxlength="2048"
          value={query} oninput={(event) => {
            query = event.currentTarget.value;
            offset = 0;
          }}
          onkeydown={keydown} autocapitalize="none" autocomplete="off" spellcheck="false" />
        <div class="_url-picker-results">
          <div id={id + '-list'} role="listbox" aria-label={label} aria-busy={loading} class="_url-picker-options">
            {#if !failed}
              {#each choices as choice, index (choice.urlId)}
                <button type="button" role="option" id={id + '-option-' + index} aria-selected={choice.urlId === value}
                  disabled={loading} class="_url-picker-option"
                  class:_url-picker-option__highlighted={highlighted === index}
                  onclick={() => choose(choice)}>{choice.path}</button>
              {/each}
            {/if}
          </div>
          {#if loading}
            <div class="_url-picker-overlay" role="status" aria-label={$messages.urlLoading}>
              <span class="_saving-spinner" aria-hidden="true"></span>
            </div>
          {/if}
        </div>
        <div role="status" class="_url-picker-status">
          {#if failed}{$messages.urlSuggestionFailed}
          {:else if !loading && items.length === 0}{$messages.urlSuggestionEmpty}{/if}
        </div>
        {#if failed}
          <button type="button" onclick={() => {
            retry += 1;
          }}>{$messages.retry}</button>
        {:else}
          <div class="_url-picker-pagination">
            <button type="button" disabled={loading || offset === 0} onclick={() => {
              offset -= 10;
            }}>
              {$messages.urlSuggestionPrevious}</button>
            <button type="button" disabled={loading || items.length < 10} onclick={() => {
              offset += 10;
            }}>
              {$messages.urlSuggestionNext}</button>
          </div>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {#if purpose === UrlSearchPurpose.Parent}<small>{$messages.urlRoutingParentHint}</small>{/if}
</div>

<style>
  ._url-picker-value { min-width: 0; overflow-wrap: anywhere; }
  :global(._url-picker-popup) {
    z-index: 50;
    width: var(--bits-popover-anchor-width);
    max-width: calc(100vw - 24px);
    max-height: min(600px, var(--bits-popover-content-available-height));
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid #ced3cc;
    border-radius: 7px;
    background: #fff;
    box-shadow: 0 8px 24px #252d2720;
  }
  ._url-picker-results { position: relative; display: flex; flex-direction: column; min-height: 80px; }
  ._url-picker-options { min-height: 0; overflow-y: auto; }
  ._url-picker-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #ffffffa6;
    cursor: wait;
  }
  :global(._url-picker-popup input) { min-height: 44px; flex-shrink: 0; }
  ._url-picker-option {
    display: block;
    width: 100%;
    min-height: 40px;
    padding: 10px;
    border: 0;
    border-radius: 4px;
    text-align: left;
    overflow-wrap: anywhere;
    background: #fff;
    color: #252d27;
  }
  ._url-picker-option:hover, ._url-picker-option__highlighted { background: #e9eee2; }
  ._url-picker-option[aria-selected="true"] { font-weight: 600; color: #244d37; }
  ._url-picker-status { font-size: 13px; color: #69736c; }
  ._url-picker-status:empty { display: none; }
  ._url-picker-pagination { display: flex; flex-shrink: 0; justify-content: space-between; gap: 8px; }
  ._url-picker-pagination button {
    min-height: 40px;
    padding: 8px;
    border: 1px solid #ced3cc;
    border-radius: 4px;
    background: #fff;
    color: #252d27;
  }
</style>
