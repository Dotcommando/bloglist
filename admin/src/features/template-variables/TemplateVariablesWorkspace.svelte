<script lang="ts">
  import { untrack } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import type { IAdminSite } from '../../shared/api/content.types';
  import { contentError, ContentRequestError } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import CreateButton from '../../shared/ui/CreateButton.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import { type ISiteFile, mergeFiles } from '../files/files.types';
  import { listFiles } from '../files/files-api';
  import { ElementKind, type IRenderingElement } from '../rendering/rendering.types';
  import { listElements } from '../rendering/rendering-api';
  import { type ITvCatalog, TvKind } from './template-variables.types';
  import { listTemplateVariables, saveTemplateVariables } from './template-variables-api';
  import TvValueEditor from './TvValueEditor.svelte';

  let { can, site, active, onUnauthorized, onBusy, onDirtyChange }: {
    can: CanUseAction;
    site: IAdminSite;
    active: boolean;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onDirtyChange: (value: boolean) => void;
  } = $props();
  let catalog = $state<ITvCatalog | null>(null);
  let templates = $state<IRenderingElement[]>([]);
  let files = $state<readonly ISiteFile[]>([]);
  let selected = $state<number | null>(null);
  let initial = $state('');
  let persistedNames = $state<(string | null)[]>([]);
  let loading = $state(false);
  let busy = $state(false);
  let saved = $state(false);
  let failed = $state<string | null>(null);
  const kindLabels = {
    [TvKind.Text]: 'tvText',
    [TvKind.Markdown]: 'tvMarkdown',
    [TvKind.Image]: 'tvImage',
    [TvKind.File]: 'tvFile',
  } as const;
  const canSave = $derived(can('cms.template-variables.save'));
  const field = $derived(selected === null ? null : catalog?.fields[selected] ?? null);

  $effect(() => {
    const dirty = catalog !== null && JSON.stringify(catalog.fields) !== initial;

    untrack(() => onDirtyChange(dirty));
  });
  $effect(() => {
    if (active && !catalog && !loading && !failed) {
      untrack(() => {
        void load();
      });
    }
  });

  async function load(): Promise<void> {
    loading = true;
    failed = null;

    try {
      const [definitions, elements] = await Promise.all([
        listTemplateVariables(site.siteId),
        can('cms.templates.list') ? listElements(site.siteId, ElementKind.Template) : Promise.resolve([]),
      ]);

      catalog = definitions;
      templates = elements;
      initial = JSON.stringify(definitions.fields);
      persistedNames = definitions.fields.map((field) => field.name);
      files = can('cms.files.list') ? (await listFiles(site.siteId).catch(() => null))?.files ?? [] : [];
    } catch (error) {
      failure(error);
    } finally {
      loading = false;
    }
  }
  function failure(error: unknown): void {
    if (error instanceof ContentRequestError && error.status === 401) {
      onUnauthorized();
    } else {
      failed = $messages[contentError(error)];
    }
  }
  function create(): void {
    if (!catalog) {
      return;
    }

    let ordinal = catalog.fields.length + 1;

    while (catalog.fields.some((field) => field.name === 'field' + ordinal)) {
      ordinal++;
    }
    catalog.fields.push({
      name: 'field' + ordinal,
      caption: $messages.tvNew,
      description: '',
      kind: TvKind.Text,
      required: false,
      sortOrder: ordinal * 100,
      templateIds: [],
    });
    persistedNames.push(null);
    selected = catalog.fields.length - 1;
    saved = false;
  }
  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!catalog || busy || !canSave) {
      return;
    }
    busy = true;
    onBusy(true);
    failed = null;
    saved = false;

    try {
      catalog = await saveTemplateVariables(catalog);
      initial = JSON.stringify(catalog.fields);
      persistedNames = catalog.fields.map((field) => field.name);
      saved = true;
    } catch (error) {
      failure(error);
    } finally {
      busy = false;
      onBusy(false);
    }
  }
</script>

<div class="tv-workspace" hidden={!active}>
  <aside class="page-drawer tv-drawer" aria-label={$messages.templateVariables}>
    <div class="_drawer-heading">
      <div class="_drawer-context"><span class="_setup-kicker">{site.primaryDomain}</span></div>
      <div class="_drawer-title-row"><h2>{$messages.templateVariables}</h2>
        {#if canSave}<CreateButton label={$messages.tvCreate} disabled={busy || !catalog} onclick={create} />{/if}</div>
    </div>
    <div class="tv-list _tree-scroll" use:scrollShadow>
      {#each catalog?.fields ?? [] as item, index (index)}
        <button class="tv-row _source-item"
          aria-current={selected === index ? 'page' : undefined}
          disabled={busy} onclick={() => {
            selected = index;
            saved = false;
          }}><span class="_source-copy"><span class="cms-drawer-label" title={item.caption}>{item.caption}</span>
            <small class="cms-drawer-label" title={item.name}>{item.name}</small></span></button>
      {/each}
      {#if !catalog?.fields.length}<p>{$messages.tvEmpty}</p>{/if}
    </div>
  </aside>
  <main class="tv-editor" aria-label={$messages.tvEditor}>
    <div class="_workspace-toolbar"><h1 class="_workspace-title">{field?.caption ?? $messages.tvEditor}</h1>
      {#if canSave}<button class="cms-primary" type="submit" form="tv-definitions"
        disabled={busy || !catalog}>{$messages.tvSave}</button>{/if}</div>
    <div class="_workspace-scroll" use:scrollShadow>
      {#if loading}<p role="status">{$messages.loadingElements}</p>{/if}
      {#if failed}<p class="cms-error" role="alert">{failed}</p><RefreshButton onclick={() => {
        void load();
      }} />{/if}
      {#if saved}<p class="cms-success" role="status">{$messages.tvSaved}</p>{/if}
      <form id="tv-definitions" class="cms-form" onsubmit={save}>
        {#if field}
          <fieldset disabled={busy || !canSave} class="tv-fields">
            <div class="_definition-grid">
              <div class="_definition-field">
                <label for="tv-name">{$messages.tvTechnicalName}</label>
                <input id="tv-name" bind:value={field.name} required pattern={'[A-Za-z][A-Za-z0-9_]{0,127}'}
                  readonly={selected !== null && persistedNames[selected] !== null} />
              </div>
              <div class="_definition-field">
                <label for="tv-caption">{$messages.tvCaption}</label>
                <input id="tv-caption" bind:value={field.caption} required maxlength="200" />
              </div>
              <div class="_definition-field">
                <label for="tv-kind">{$messages.tvType}</label>
                <select id="tv-kind" value={field.kind} onchange={(event) => {
                  if (field) {
                    const next = Object.values(TvKind).find((kind) => kind === event.currentTarget.value);

                    if (next) {
                      field.kind = next;
                      delete field.defaultValue;
                    }
                  }
                }}>
                  {#each Object.values(TvKind) as kind (kind)}
                    <option value={kind}>{$messages[kindLabels[kind]]}</option>
                  {/each}
                </select>
              </div>
              <div class="_definition-field">
                <label for="tv-order">{$messages.sortOrder}</label>
                <input id="tv-order" type="number" step="1" bind:value={field.sortOrder} required />
              </div>
              <div class="_definition-field _definition-field__wide">
                <label for="tv-description">{$messages.tvDescription}</label>
                <textarea id="tv-description" bind:value={field.description} maxlength="2000" rows="2"></textarea>
              </div>
            </div>
            <Checkbox bind:checked={field.required}>{$messages.tvRequired}</Checkbox>
            <div class="_definition-groups">
              <section class="_definition-group" aria-labelledby="tv-templates-label">
                <h3 id="tv-templates-label">{$messages.templates}</h3>
                <div class="_template-options">
                  {#each templates as template (template.id)}
                    <Checkbox checked={field.templateIds.includes(template.id)} onCheckedChange={(checked) => {
                      if (field) {
                        field.templateIds = checked ? [...field.templateIds, template.id]
                          : field.templateIds.filter((id) => id !== template.id);
                      }
                    }}>{template.name}</Checkbox>
                  {/each}
                </div>
              </section>
              <section class="_definition-group" aria-labelledby="tv-default-heading">
                <h3 id="tv-default-heading">{$messages.tvDefault}</h3>
                <TvValueEditor {field} value={field.defaultValue} {files} siteId={site.siteId} id="tv-default"
                  allowDefault={false} {onUnauthorized}
                  onLibraryChange={(library) => files = mergeFiles(files, library.files)}
                  onChange={(value) => {
                    if (field) {
                      if (value === undefined) {
                        delete field.defaultValue;
                      } else {
                        field.defaultValue = value;
                      }
                    }
                  }} />
              </section>
            </div>
            <div class="_definition-actions">
              <button class="cms-secondary" type="button" onclick={() => {
                if (catalog && selected !== null) {
                  catalog.fields.splice(selected, 1);
                  persistedNames.splice(selected, 1);
                  selected = null;
                }
              }}>{$messages.tvRemove}</button>
            </div>
          </fieldset>
        {:else}<p>{$messages.tvChoose}</p>{/if}
      </form>
    </div>
  </main>
</div>

<style>
  .tv-workspace { display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; min-height: 0;
    grid-template-rows: minmax(120px, 25vh) minmax(0, 1fr); overflow: hidden; }
  .tv-workspace[hidden] { display: none; }
  .tv-editor { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .tv-list { display: flex; flex-direction: column; gap: 4px; }
  .tv-row { flex-shrink: 0; }
  .tv-fields { display: grid; gap: 24px; min-width: 0; margin: 0; padding: 0; border: 0; }
  .tv-fields input, .tv-fields textarea, .tv-fields select { max-width: 100%; min-width: 0; }
  ._definition-grid, ._definition-groups { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; }
  ._definition-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  ._definition-field label { font-size: 13px; font-weight: 600; }
  ._definition-field textarea { width: 100%; min-height: 96px; padding: 12px 14px;
    border: 1px solid #ced3cc; border-radius: 7px; font: inherit; font-size: 16px;
    line-height: 1.5; background: var(--cms-surface); color: var(--cms-ink); resize: vertical; }
  ._definition-field input[readonly] { background: var(--cms-row); color: var(--cms-muted); }
  ._definition-field__wide { grid-column: 1 / -1; }
  ._definition-groups { align-items: start; }
  ._definition-group { min-width: 0; padding: 20px; border-radius: 10px; background: var(--cms-row); }
  ._definition-group h3 { margin: 0 0 16px; font-size: 14px; font-weight: 600; color: var(--cms-ink); }
  ._template-options { display: grid; gap: 2px; }
  ._definition-actions { display: flex; justify-content: flex-start; padding-top: 8px; }
  @media (min-width: 992px) {
    .tv-workspace { grid-template-columns: var(--cms-drawer-width) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  }
  @media (min-width: 992px) {
    ._definition-grid, ._definition-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
