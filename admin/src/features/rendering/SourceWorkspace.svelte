<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import {
    AdminRouteKind, AdminSection, type IAdminRoute, navigateAdmin, renderingUsagePath, sitePath,
  } from '../../app/admin-route';
  import { messages } from '../../i18n/i18n';
  import { type IAdminSite, WorkspacePanel } from '../../shared/api/content.types';
  import {
    contentError, type ContentErrorMessage, ContentRequestError, publishSite,
  } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import CreateButton from '../../shared/ui/CreateButton.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import ElementEditor from './ElementEditor.svelte';
  import {
    BackupState, elementFingerprint, ElementKind, ElementSaveFeedback, ElementSaveIntent,
    type IElementBuffer, type IRenderingElement, type ITemplateDiagnostic,
    ParameterKind, SourceFile, TemplateValidationIssue,
  } from './rendering.types';
  import { getElement, listElements, previewElement, saveElement } from './rendering-api';

  let { can, site, kind, route, active, desktop, onUnauthorized, onBusy, onDirtyChange }: {
    can: CanUseAction;
    site: IAdminSite;
    kind: ElementKind;
    route: IAdminRoute;
    active: boolean;
    desktop: boolean;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
  } = $props();
  const buffers = new SvelteMap<string, IElementBuffer>();
  let items = $state<IRenderingElement[]>([]);
  let loaded = $state(false);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let diagnostic = $state<ITemplateDiagnostic | null>(null);
  let conflicted = $state(false);
  let feedback = $state<ElementSaveFeedback | null>(null);
  let previewFailed = $state(false);
  let previewUrl = $state('');
  let sitePublished = $state(false);
  let selected = $state('');
  let query = $state('');
  let panel = $state(WorkspacePanel.Tree);
  let listToggle: HTMLButtonElement;
  let editorToggle: HTMLButtonElement;
  let generation = 0;
  const section = $derived(kind === ElementKind.Template ? AdminSection.Templates
    : kind === ElementKind.Chunk ? AdminSection.Chunks : AdminSection.Snippets);
  const namespace = $derived('cms.' + section + '.');
  const canList = $derived(can(namespace + 'list'));
  const canRead = $derived(can(namespace + 'read'));
  const canCreate = $derived(can(namespace + 'create'));
  const canEdit = $derived(can(namespace + (route.kind === AdminRouteKind.CreateElement ? 'create' : 'update')));
  const canApply = $derived(can('cms.publication.publish-site'));
  const canPreview = $derived(can(namespace + 'preview'));
  const canReadPreview = $derived(can('cms.rendering-previews.read'));
  const basePath = $derived(sitePath(site.siteId) + '/' + section);
  const buffer = $derived(buffers.get(selected));
  const previewPages = $derived(buffer?.element.usages
    .filter((usage) => usage.kind === 'Page' && usage.readable) ?? []);
  const creating = $derived(route.kind === AdminRouteKind.CreateElement);
  const editing = $derived(route.kind === AdminRouteKind.Element || route.kind === AdminRouteKind.CreateElement);
  const visible = $derived(items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())
    || item.id.toLowerCase().includes(query.toLowerCase())));

  function remember(item: IRenderingElement, key = item.id): IElementBuffer {
    const current = $state<IElementBuffer>({
      element: item,
      file: item.kind === ElementKind.Snippet ? SourceFile.Server : SourceFile.Html,
      dirty: false,
      savedContent: elementFingerprint(item),
      selection: {},
    });

    buffers.set(key, current);

    return current;
  }

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
      diagnostic = value instanceof ContentRequestError ? value.diagnostic : null;
      conflicted = value instanceof ContentRequestError && value.status === 409;
    }
  }

  function diagnosticMessage(value: ITemplateDiagnostic): string {
    const key = value.issue === TemplateValidationIssue.UnknownChunkParameter ? 'unknownChunkParameter'
      : value.issue === TemplateValidationIssue.MissingChunkParameter ? 'missingChunkParameter'
        : 'missingParameterSeparator';
    const label = (value.source?.kind === ElementKind.Chunk ? $messages.chunkDiagnosticSource
      : $messages.templateDiagnosticSource).replace('{key}', () => value.source?.key ?? '');

    return $messages[key].replace('{key}', () => value.source?.key ?? '')
      .replace('{parameter}', () => value.parameter ?? '').replace('{source}', () => label);
  }

  async function showPanel(next: WorkspacePanel): Promise<void> {
    panel = next;
    await tick();

    if (!desktop) {
      (next === WorkspacePanel.Tree ? listToggle : editorToggle)?.focus({ preventScroll: true });
    }
  }

  async function load(next: IAdminRoute, refresh = false): Promise<void> {
    const captured = ++generation;
    const nextId = next.kind === AdminRouteKind.CreateElement ? '#new' : next.elementId;

    loading = true;
    previewUrl = '';

    if (nextId !== selected || refresh) {
      error = null;
      diagnostic = null;
      conflicted = false;
      feedback = null;
      sitePublished = false;
    }
    if (nextId !== selected) {
      selected = '';
    }

    try {
      if (canList && (!loaded || refresh)) {
        const result = await listElements(site.siteId, kind);

        if (captured !== generation) {
          return;
        }
        items = result;
        loaded = true;
      }

      const id = nextId;

      if (!id || id === '#new' && !canCreate || id !== '#new' && !canRead) {
        selected = '';
        await showPanel(WorkspacePanel.Tree);

        return;
      }
      if (!buffers.has(id) || refresh) {
        const item = id === '#new' ? {
          siteId: site.siteId,
          id: '',
          name: '',
          kind,
          version: '',
          backupState: BackupState.Ready,
          html: kind === ElementKind.Template ? '<!doctype html>\n<html lang="[[*language]]">\n'
            + '<head><title>[[*title]]</title></head>\n<body>[[*contentMd:markdown]]</body>\n</html>'
            : kind === ElementKind.Snippet ? '' : '<section>\n</section>',
          css: '',
          browserTypeScript: null,
          parameters: [],
          usages: [],
          ...(kind === ElementKind.Snippet ? {
            snippet: {
              code: 'return "Hello from a snippet";',
              phases: ['Build', 'Request'],
              output: { name: 'result', kind: ParameterKind.String, required: true },
            },
          } : {}),
        } : await getElement(site.siteId, kind, id);

        if (captured !== generation) {
          return;
        }
        remember(item, id);
      }
      selected = id;

      if (next.sourceFile) {
        const current = buffers.get(id);

        if (current) {
          current.file = next.sourceFile;
        }
      }
      await showPanel(WorkspacePanel.Editor);
    } catch(value) {
      if (captured === generation) {
        failure(value);
      }
    } finally {
      if (captured === generation) {
        loading = false;
      }
    }
  }

  async function save(intent: ElementSaveIntent): Promise<void> {
    const current = buffer;

    if (!current || busy || !canEdit || intent === ElementSaveIntent.Apply && !canApply) {
      return;
    }
    busy = true;
    onBusy(true);
    error = null;
    diagnostic = null;
    feedback = null;
    sitePublished = false;
    previewUrl = '';
    conflicted = false;
    let destination: string | null = null;
    let sourceSaved = false;

    try {
      const result = await saveElement($state.snapshot(current.element), creating);

      current.element = { ...result, usages: current.element.usages };
      current.savedContent = elementFingerprint(result);
      current.dirty = false;
      buffers.set(result.id, current);
      items = items.some((item) => item.id === result.id)
        ? items.map((item) => item.id === result.id ? result : item) : [...items, result];
      sourceSaved = result.backupState === BackupState.Ready;

      if (creating) {
        buffers.delete('#new');
        selected = result.id;
        destination = canRead ? basePath + '/' + result.id : basePath;
      }
      onDirtyChange([...buffers.values()].some((item) => item.dirty));

      if (canRead) {
        void getElement(site.siteId, kind, result.id).then((fresh) => {
          if (current.element.version === fresh.version) {
            current.element.usages = fresh.usages;
          }
        }).catch((value: unknown) => {
          if (value instanceof ContentRequestError && value.status === 401) {
            onUnauthorized();
          }
        });
      }
      if (sourceSaved) {
        if (intent === ElementSaveIntent.Apply) {
          await publishSite(site.siteId);
          feedback = ElementSaveFeedback.Applied;
        } else {
          feedback = ElementSaveFeedback.Draft;
        }
      }
    } catch(value) {
      if (value instanceof ContentRequestError && value.status === 401) {
        destination = null;
      }
      if (sourceSaved && intent === ElementSaveIntent.Apply) {
        feedback = value instanceof ContentRequestError && value.status === 400
          ? ElementSaveFeedback.ApplyRejected : ElementSaveFeedback.ApplyFailed;
      }
      failure(value);
    } finally {
      busy = false;
      onBusy(false);

      if (destination) {
        navigateAdmin(destination, true);
      }
    }
  }

  async function preview(pageId: string): Promise<void> {
    if (!buffer || busy || !canPreview || !canReadPreview || !previewPages.some((page) => page.id === pageId)) {
      return;
    }
    busy = true;
    onBusy(true);
    previewFailed = false;
    previewUrl = '';
    error = null;
    diagnostic = null;
    feedback = null;

    try {
      previewUrl = await previewElement($state.snapshot(buffer.element), pageId);
    } catch(value) {
      failure(value);
      previewFailed = true;
    } finally {
      busy = false;
      onBusy(false);
    }
  }

  function openUsage(usageKind: string, id: string): void {
    if (busy) {
      return;
    }

    navigateAdmin(renderingUsagePath(site.siteId, usageKind, id));
  }

  $effect(() => {
    if (active) {
      const next = route;

      untrack(() => {
        if (!busy) {
          void load(next);
        }
      });
    }

    return () => {
      generation++;
    };
  });
</script>

<div class="site-viewport" hidden={!active}>
  <div class="site-panels" class:site-panels__editor={panel === WorkspacePanel.Editor}>
    <aside id={'source-list-' + kind} class="page-drawer" aria-label={$messages[section]}
      inert={!active || !desktop && panel !== WorkspacePanel.Tree}
      aria-hidden={!active || !desktop && panel !== WorkspacePanel.Tree}>
      <div class="_drawer-heading">
        <div class="_drawer-context"><span class="_setup-kicker">{site.primaryDomain}</span>
          <button class="cms-circle" aria-label={$messages.openWorkspace} disabled={busy}
            bind:this={listToggle} onclick={() => {
              void showPanel(WorkspacePanel.Editor);
            }}>›</button>
        </div>
        <div class="_drawer-title-row"><h2>{$messages[section]}</h2>
          {#if canCreate}<CreateButton label={$messages.createElement} disabled={busy || loading}
            onclick={() => {
              navigateAdmin(basePath + '/-/new');
            }} />{/if}</div>
        {#if canList}<label class="_language-label" for={'source-search-' + kind}>{$messages.searchElements}</label>
        <input id={'source-search-' + kind} class="source-search" type="search" bind:value={query}
          placeholder={$messages.searchElements} disabled={busy} />{/if}
      </div>
      {#if canList}<div use:scrollShadow class="_tree-scroll">
        {#if loading && !loaded}<p class="cms-loading" role="status">{$messages.loadingElements}</p>{/if}
        <ul class="source-list">
          {#each visible as item (item.id)}
            <li><button class="_source-item" aria-current={selected === item.id ? 'page' : undefined}
              disabled={busy || loading}
              onclick={() => {
                if (canRead) {
                  navigateAdmin(basePath + '/' + item.id);
                }
              }}>
              <svg class="_source-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {#if kind === ElementKind.Template}
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18M9 9v11" />
                {:else if kind === ElementKind.Snippet}
                  <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
                {:else}
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                {/if}
              </svg>
              <span class="_source-copy"><span class="cms-drawer-label" title={item.name}>{item.name}</span>
                {#if buffers.get(item.id)?.dirty}<small>{$messages.sourceUnsaved}</small>{/if}</span>
            </button></li>
          {/each}
        </ul>
        {#if !loading && !visible.length}<p class="cms-loading">{$messages.noElements}</p>{/if}
        {#if error && !desktop && panel === WorkspacePanel.Tree}<p class="cms-error" role="alert">{$messages[error]}</p>
          <RefreshButton disabled={busy} onclick={() => {
            void load(route, true);
          }} />{/if}
      </div>
      {/if}<div class="_drawer-footer">{site.name}</div>
    </aside>
    <main class="page-workspace" aria-label={$messages[section]} aria-busy={loading || busy}
      inert={!active || !desktop && panel !== WorkspacePanel.Editor}
      aria-hidden={!active || !desktop && panel !== WorkspacePanel.Editor}>
      <div class="_workspace-toolbar">
        <button class="cms-circle" aria-label={$messages.openElementList} disabled={busy} bind:this={editorToggle}
          onclick={() => {
            void showPanel(WorkspacePanel.Tree);
          }}>‹</button>
        <h1 class="_workspace-title" id={buffer ? 'element-' + buffer.element.kind + '-title' : undefined}>
          {creating && buffer ? buffer.element.kind === 'Template' ? $messages.newTemplate
            : buffer.element.kind === 'Snippet' ? $messages.newSnippet : $messages.newChunk
            : buffer?.element.name ?? $messages[section]}
        </h1>

      </div>
      <div use:scrollShadow class="_workspace-scroll">
        {#if error}<p class="cms-error" role="alert">
          {#if feedback === ElementSaveFeedback.ApplyRejected}{$messages.sourceApplyRejected}
            {diagnostic ? diagnosticMessage(diagnostic) : ''}
          {:else if feedback === ElementSaveFeedback.ApplyFailed}{$messages.sourceApplyFailed}
          {:else if diagnostic}{diagnosticMessage(diagnostic)}
          {:else}{conflicted ? $messages.sourceConflict : $messages[error]}{/if}</p>
          {#if diagnostic?.source}
            <button class="cms-secondary" disabled={busy} onclick={() => {
              if (diagnostic?.source) {
                openUsage(diagnostic.source.kind, diagnostic.source.key);
              }
            }}>{$messages.openDiagnosticSource}</button>
          {:else}
          <button class="cms-secondary" disabled={busy} onclick={() => {
            if (!buffer?.dirty || window.confirm($messages.sourceReloadConfirm)) {
              void load(route, true);
            }
          }}>{$messages.sourceReload}</button>{/if}{/if}
        {#if feedback === ElementSaveFeedback.Draft}
          <p class="cms-success" role="status">
            {canApply ? $messages.sourceSaved : $messages.sourceSavedNeedsPublisher}
          </p>{/if}
        {#if feedback === ElementSaveFeedback.Applied}
          <p class="cms-success" role="status">{$messages.sourceApplied}</p>{/if}
        {#if sitePublished}<p class="cms-success" role="status">{$messages.sitePublished}</p>{/if}
        {#if buffer?.element.backupState === BackupState.Pending}
          <p class="cms-error" role="alert">{$messages.backupPending}</p>
        {/if}
        {#if previewFailed}<p class="cms-error" role="alert">{$messages.previewFailed}</p>{/if}
        {#if editing && buffer}
          {#key selected}
            <ElementEditor {can} {buffer} elements={items} {creating} {busy} {canEdit} {canApply}
              {canPreview} {canReadPreview} {previewPages}
              onSave={(intent) => {
                void save(intent);
              }} onPreview={(id) => {
                void preview(id);
              }}
              onCancel={() => {
                buffers.delete(selected);
                onDirtyChange([...buffers.values()].some((item) => item.dirty));
                navigateAdmin(basePath);
              }}
              onDirty={(dirty) => {
                buffer.dirty = dirty;
                onDirtyChange([...buffers.values()].some((item) => item.dirty));
              }} />
          {/key}
        {:else if !loading}
          <div class="workspace-welcome"><p>{$messages.selectElement}</p><p>{$messages.selectElementHint}</p></div>
        {/if}
        {#if canPreview && canReadPreview && previewUrl}<section class="source-preview"><h2>{$messages.preview}</h2>
          <iframe src={previewUrl} title={$messages.preview} sandbox="allow-scripts"></iframe></section>{/if}
      </div>
    </main>
  </div>
</div>
