<script lang="ts">
  import { untrack } from 'svelte';

  import { adminLanguage, type AdminMessageKey, messages } from '../../i18n/i18n';
  import { contentError, ContentRequestError } from '../../shared/api/content-api';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { getTransliteration, type ITransliterationTable, saveTransliteration } from './transliteration-api';

  let { siteId, active, editable, onUnauthorized, onBusy, onDirtyChange }: {
    siteId: string;
    active: boolean;
    editable: boolean;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onDirtyChange: (value: boolean) => void;
  } = $props();
  const id = $props.id();
  const replacementPattern = '[a-zA-Z0-9\\-]{0,16}';
  let tables = $state.raw<ITransliterationTable[]>([]);
  let draft = $state<ITransliterationTable | null>(null);
  let savedCollapseHyphens = $state(true);
  let collapseHyphens = $state(true);
  const saved = $derived(tables.find((table) => table.language === draft?.language));
  const dirty = $derived(collapseHyphens !== savedCollapseHyphens || Boolean(draft?.rules.some((rule, index) =>
    rule.replacement !== saved?.rules[index]?.replacement)));
  const languageNames = $derived(new Intl.DisplayNames([$adminLanguage], { type: 'language' }));
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<AdminMessageKey | null>(null);
  let success = $state(false);

  function select(language: string): void {
    const table = tables.find((item) => item.language === language);

    draft = table ? structuredClone(table) : null;
    collapseHyphens = savedCollapseHyphens;
    success = false;
    error = null;
  }

  function failed(failure: unknown): void {
    if (failure instanceof ContentRequestError && failure.status === 401) {
      onUnauthorized();
    } else {
      error = failure instanceof ContentRequestError && failure.status === 400
        ? 'transliterationInvalid' : contentError(failure);
    }
  }

  async function load(): Promise<void> {
    loading = true;
    error = null;

    try {
      const language = draft?.language;
      const edits = new Map(draft?.rules.filter((rule, index) => rule.replacement !== saved?.rules[index]?.replacement)
        .map(({ symbol, replacement }) => [symbol, replacement]));
      const editedCollapse = collapseHyphens !== savedCollapseHyphens ? collapseHyphens : undefined;
      const settings = await getTransliteration(siteId);

      tables = settings.tables;
      savedCollapseHyphens = settings.collapseHyphens;
      select(language ?? tables[0]?.language ?? '');
      collapseHyphens = editedCollapse ?? savedCollapseHyphens;

      for (const rule of draft?.rules ?? []) {
        const replacement = edits.get(rule.symbol);

        if (replacement !== undefined) {
          rule.replacement = replacement;
        }
      }
    } catch (failure) {
      failed(failure);
    } finally {
      loading = false;
    }
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!editable || !draft || !saved || !dirty || busy) {
      return;
    }
    busy = true;
    onBusy(true);
    error = null;

    try {
      const table = $state.snapshot(draft);
      const settings = await saveTransliteration(siteId, table, saved.rules, collapseHyphens, savedCollapseHyphens);

      tables = settings.tables;
      savedCollapseHyphens = settings.collapseHyphens;
      select(table.language);
      success = true;
    } catch (failure) {
      failed(failure);
    } finally {
      busy = false;
      onBusy(false);
    }
  }

  $effect(() => {
    if (active) {
      untrack(() => {
        if (!tables.length && !loading) {
          void load();
        }
      });
    }
  });
  $effect(() => {
    const value = dirty;

    untrack(() => onDirtyChange(value));
  });
</script>

<div class="_transliteration" hidden={!active} aria-busy={loading || busy}>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if success}<p class="cms-success" role="status">{$messages.transliterationSaved}</p>{/if}
  {#if loading}<p role="status">{$messages.urlLoading}</p>{/if}
  {#if draft}
    <form onsubmit={save}>
      <div class="_transliteration-actions">
        <label class="_form-field">{$messages.transliterationLanguage}
          <select value={draft.language} disabled={busy || loading || dirty}
            onchange={(event) => select(event.currentTarget.value)}>
            {#each tables as table (table.language)}
              <option value={table.language}>{languageNames.of(table.language)}</option>
            {/each}
          </select>
        </label>
        <div class="_transliteration-buttons">
          {#if editable}
            <button class="cms-primary" disabled={busy || loading || !dirty}>
              {busy ? $messages.saving : $messages.settingsSave}
            </button>
            {#if dirty}
              <button type="button" class="cms-secondary" disabled={busy}
                onclick={() => select(draft?.language ?? '')}>{$messages.cancel}</button>
            {/if}
          {/if}
          <RefreshButton disabled={busy || loading} onclick={() => void load()} />
        </div>
      </div>
      <Checkbox bind:checked={collapseHyphens} disabled={!editable || busy || loading}>
        {$messages.transliterationCollapseHyphens}
      </Checkbox>
      <!-- svelte-ignore a11y_no_redundant_roles (Preserve table semantics with display:block.) -->
      <table class="cms-table _transliteration-table" role="table">
        <thead class="_visually-hidden">
          <tr>
            <th scope="col" role="columnheader">{$messages.transliterationSymbol}</th>
            <th scope="col" role="columnheader">{$messages.transliterationReplacement}</th>
          </tr>
        </thead>
        <!-- svelte-ignore a11y_no_redundant_roles (Preserve table semantics with display:block.) -->
        <tbody role="rowgroup">
          {#each draft.rules as rule, index (rule.symbol)}
            {@const symbol = rule.symbol.replaceAll(' ', '␠')}
            {@const hint = rule.replacement === '' ? $messages.transliterationEmpty : ''}
            {@const fieldId = id + '-' + index}
            <!-- svelte-ignore a11y_no_redundant_roles (Preserve row semantics with display:grid.) -->
            <tr role="row">
              <th scope="row" role="rowheader"><label for={fieldId}>{symbol}</label></th>
              <td role="cell">
                <input id={fieldId} type="text" maxlength="16" pattern={replacementPattern}
                  aria-label={$messages.transliterationReplacement + ' ' + symbol}
                  aria-describedby={hint ? fieldId + '-hint' : undefined}
                  readonly={!editable} disabled={busy || loading}
                  autocapitalize="none" spellcheck="false" value={rule.replacement} oninput={(event) => {
                    const input = event.currentTarget;

                    input.value = input.value.replace(/\s/g, '');
                    rule.replacement = input.value;
                  }} />
                {#if hint}<small id={fieldId + '-hint'}>{hint}</small>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </form>
  {:else if !loading}
    <RefreshButton onclick={() => void load()} />
  {/if}
</div>

<style>
  ._transliteration { container: transliteration / inline-size; padding: 16px 0; }
  ._transliteration-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-bottom: 16px; }
  ._transliteration-actions > label { margin-bottom: 0; }
  ._transliteration-buttons {
    display: flex; align-items: center; justify-content: end; flex-wrap: wrap;
    gap: 8px; min-height: 48px; margin-inline-start: auto;
  }
  ._transliteration-table { display: block; max-width: 264px; border: 0; }
  ._transliteration-table tbody { display: block; column-gap: 12px; }
  ._transliteration-table tbody tr {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center; break-inside: avoid; border-radius: 8px; margin: 0 0 4px; padding: 13px 10px;
    background: var(--cms-row);
  }
  ._transliteration-table tbody tr:focus-within { background: var(--cms-row-hover); }
  ._transliteration-table tbody th, ._transliteration-table td { border: 0; background: none; padding: 0; }
  ._transliteration-table tbody th {
    font-family: inherit; font-size: 16px; text-align: right; white-space: nowrap; padding-right: 8px;
  }
  ._transliteration-table td { position: relative; text-align: left; }
  ._transliteration-table input {
    display: block; width: 96px; max-width: 100%; min-width: 0; height: 44px; padding-inline: 10px;
  }
  ._transliteration-table input:focus-visible { outline-offset: -2px; }
  ._transliteration-table small {
    position: absolute; inset-block-start: calc(100% + 2px); inset-inline-start: 0;
    color: var(--cms-muted); font-size: 11px; line-height: 11px;
  }
  @media (pointer: fine) { ._transliteration-table input { height: 36px; font-size: 14px; } }
  @container transliteration (min-width: 576px) {
    ._transliteration-table { max-width: 540px; }
    ._transliteration-table tbody { columns: 2; }
  }
  @container transliteration (min-width: 880px) {
    ._transliteration-table { max-width: 816px; }
    ._transliteration-table tbody { columns: 3; }
  }
  @container transliteration (min-width: 1080px) {
    ._transliteration-table { max-width: 1092px; }
    ._transliteration-table tbody { columns: 4; }
  }
</style>
