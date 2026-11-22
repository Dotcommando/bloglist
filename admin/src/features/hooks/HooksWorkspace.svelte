<script lang="ts">
  import { HookKind } from '@zarya/addon-contracts/hooks';
  import { tick, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';

  import { type IAdminRoute, navigateAdmin, sitePath } from '../../app/admin-route';
  import { adminLanguage, type AdminMessageKey, messages } from '../../i18n/i18n';
  import { type IAdminSite, WorkspacePanel } from '../../shared/api/content.types';
  import { ContentRequestError, object, request, string } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import SourceCode from '../../shared/ui/SourceCode.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import { getSiteTimeZone } from '../urls/urls-api';
  import {
    getHookHandler, type IHookBinding, type IHookHandlerView, type IHookView, loadHooks,
    readHandler, reorderHookBindings, saveHookBinding,
  } from './hooks-api';

  interface IBuffer {
    handler: IHookHandlerView;
    title: string;
    source: string;
    capabilities: string;
    saved: string;
    position: { start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number } | undefined;
  }
  let { can, site, route, active, desktop, timeZoneRevision, onUnauthorized, onBusy, onDirtyChange }: {
    can: CanUseAction;
    site: IAdminSite;
    route: IAdminRoute;
    active: boolean;
    desktop: boolean;
    timeZoneRevision: number;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
  } = $props();
  const expanded = new SvelteSet<string>();
  const buffers = new SvelteMap<string, IBuffer>();
  let hooks = $state<IHookView[]>([]);
  let handlers = $state<IHookHandlerView[]>([]);
  let loaded = $state(false);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<AdminMessageKey | ''>('');
  let notice = $state<AdminMessageKey | ''>('');
  let query = $state('');
  let timeZone = $state('UTC');
  let panel = $state(WorkspacePanel.Tree);
  let selectionGeneration = 0;
  let selectedHandler = $state('');
  let history = $state<Record<string, unknown>[] | null>(null);
  let newTitle = $state('');
  let newKind = $state<HookKind>(HookKind.Event);
  let existingHandler = $state('');
  const canList = $derived(can('cms.hooks.list'));
  const canCreate = $derived(can('cms.hooks.create-handler'));
  const canAttach = $derived(can('cms.hooks.save-subscription'));
  const base = $derived(sitePath(site.siteId) + '/hooks');
  const selectedHook = $derived(hooks.find((hook) => hook.hookKey === route.hookKey));
  const selectedBinding = $derived(selectedHook?.subscriptions.find((item) => item.subscriptionId
    === route.hookBindingId));
  const buffer = $derived(buffers.get(selectedHandler));
  const visible = $derived(hooks.filter((hook) => (hook.hookKey + ' ' + hook.title + ' '
    + hook.provider).toLowerCase().includes(query.toLowerCase())));
  const fingerprint = (buffer: IBuffer): string => JSON.stringify([buffer.title, buffer.source, buffer.capabilities]);

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = 'hooksOperationFailedRefreshTheData';
    }
  }

  async function refresh(): Promise<void> {
    if (loading) {
      return;
    }
    loading = true;

    try {
      const result = await loadHooks(site.siteId);

      hooks = result.hooks;
      handlers = result.handlers;
      loaded = true;
    } catch (value) {
      failure(value);
    } finally {
      loading = false;
    }
  }

  function remember(handler: IHookHandlerView): void {
    const value = $state<IBuffer>({
      handler,
      title: handler.title,
      source: handler.draft.source,
      capabilities: handler.draft.capabilities.join('\n'),
      saved: '',
      position: undefined,
    });

    value.saved = fingerprint(value);
    buffers.set(handler.handlerId, value);
  }

  async function select(binding: IHookBinding | undefined): Promise<void> {
    const generation = ++selectionGeneration;

    selectedHandler = binding?.ownerKind === 'User' ? binding.handlerId : '';

    if (!can('cms.hooks.read-handler') || binding?.ownerKind !== 'User' || buffers.has(binding.handlerId)) {
      return;
    }

    try {
      const handler = await getHookHandler(site.siteId, binding.handlerId);

      if (generation === selectionGeneration && !buffers.has(handler.handlerId)) {
        remember(handler);
      }
    } catch (value) {
      failure(value);
    }
  }

  async function operation(action: () => Promise<void | (() => void)>): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    error = '';
    notice = '';
    onBusy(true);

    let afterOperation: void | (() => void) = undefined;

    try {
      afterOperation = await action();
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }

    afterOperation?.();
  }

  function open(hookKey: string, bindingId?: string): void {
    notice = '';
    history = null;
    navigateAdmin(base + '/' + hookKey + (bindingId ? '/handlers/' + bindingId : ''));
    panel = WorkspacePanel.Editor;
  }

  async function attach(handler: IHookHandlerView): Promise<void | (() => void)> {
    if (!canAttach || !selectedHook?.available || selectedHook.kind !== handler.kind) {
      return;
    }

    const result = object(await saveHookBinding(site.siteId, {
      subscriptionId: '',
      hookKey: selectedHook.hookKey,
      schemaVersion: 1,
      kind: selectedHook.kind,
      title: handler.title,
      handlerId: handler.handlerId,
      addonKey: null,
      handlerKey: null,
      ownerKind: 'User',
      configuration: {},
      filters: {},
      enabled: false,
      priority: selectedHook.subscriptions.length,
      retrySafe: false,
      deliveryMode: 'Event',
      manifestKey: null,
    }, null));
    const key = selectedHook.hookKey;

    await refresh();
    expanded.add(key);

    const subscriptionId = string(result.subscriptionId);

    return () => open(key, subscriptionId);
  }

  async function create(kind: HookKind, assign: boolean): Promise<void | (() => void)> {
    if (!canCreate || assign && (!canAttach || !selectedHook?.available || selectedHook.kind !== kind)) {
      return;
    }

    const handler = readHandler(await request('/' + site.siteId + '/hooks/handlers/create', {
      title: newTitle,
      kind,
      draft: {
        source: kind === HookKind.Check
          ? 'return { allow: true };' : 'return { commands: [] };',
        capabilities: [],
      },
    }));

    remember(handler);
    newTitle = '';
    notice = 'hooksHandlerCreatedUnassigned';

    if (assign) {
      try {
        return await attach(handler);
      } catch (value) {
        await refresh();
        throw value;
      }
    }
    if (canList) {
      await refresh();
    }
  }

  async function save(): Promise<void> {
    if (!buffer) {
      return;
    }

    const current = buffer;
    const handler = readHandler(await request('/' + site.siteId + '/hooks/handlers/'
      + current.handler.handlerId + '/draft', {
      title: current.title,
      expectedVersion: current.handler.version,
      draft: { source: current.source, capabilities: current.capabilities.split(/\s+/).filter(Boolean) },
    }));

    current.handler = handler;
    current.saved = fingerprint(current);
    await refresh();
    notice = 'hooksDraftSavedActiveCodeIs';
  }

  async function apply(): Promise<void> {
    if (!buffer) {
      return;
    }

    const current = buffer;

    if (fingerprint(current) !== current.saved) {
      await save();
    }
    await request('/' + site.siteId + '/hooks/handlers/' + current.handler.handlerId + '/apply',
      { expectedVersion: current.handler.version });
    current.handler = await getHookHandler(site.siteId, current.handler.handlerId);
    await refresh();
    notice = 'hooksVersionApplied';
  }

  async function toggle(): Promise<void> {
    if (!buffer || !selectedBinding) {
      return;
    }

    const current = buffer;
    const enabled = !(current.handler.enabled && selectedBinding.enabled);

    current.handler = readHandler(await request('/' + site.siteId + '/hooks/handlers/'
      + current.handler.handlerId + '/enabled', {
      expectedVersion: current.handler.version, enabled,
    }));
    const { version, ...binding } = selectedBinding;

    await saveHookBinding(site.siteId, { ...binding, enabled }, version);
    await refresh();
    notice = enabled ? ('hooksEnabledSuspendedWorkWillResume')
      : ('hooksDisabledNewReactionsWillNot');
  }

  async function move(binding: IHookBinding, direction: number): Promise<void> {
    if (!selectedHook) {
      return;
    }

    const ordered = [...selectedHook.subscriptions];
    const index = ordered.findIndex((item) => item.subscriptionId === binding.subscriptionId);
    const target = index + direction;

    if (target < 0 || target >= ordered.length) {
      return;
    }
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    await reorderHookBindings(site.siteId, selectedHook.hookKey, ordered);
    await refresh();
  }

  $effect(() => {
    onDirtyChange([...buffers.values()].some((value) => fingerprint(value) !== value.saved));
  });
  $effect(() => {
    if (active && canList && !loaded && !loading) {
      untrack(() => {
        void refresh();
      });
    }
  });
  $effect(() => {
    const binding = selectedBinding;

    untrack(() => {
      void select(binding);
    });
  });
  $effect(() => {
    const revision = timeZoneRevision;

    if (active) {
      untrack(() => {
        void revision;

        if (!can('cms.site-settings.read')) {
          return;
        }
        void getSiteTimeZone(site.siteId).then((zone) => {
          timeZone = zone;
        }).catch(failure);
      });
    }
  });
  $effect(() => {
    if (active && route.hookKey) {
      untrack(() => {
        panel = WorkspacePanel.Editor;
      });
    }
  });

  async function showTree(): Promise<void> {
    panel = WorkspacePanel.Tree;
    await tick();
    document.getElementById('hooks-tree-toggle')?.focus();
  }
</script>

{#snippet createHandlerForm(hook: IHookView | undefined)}
  {@const assign = Boolean(hook?.available && canAttach)}
  <form class="_handler-create" onsubmit={(event) => {
    event.preventDefault();
    void operation(() => create(hook?.kind ?? newKind, assign));
  }}>
    <h2>{$messages.hooksCreateHandler}</h2>
    {#if !hook}
      <label for="new-hook-kind">{$messages.hooksKind}</label>
      <select id="new-hook-kind" bind:value={newKind} disabled={busy}>
        <option value={HookKind.Event}>{$messages.hooksHandlerKindEvent}</option>
        <option value={HookKind.Check}>{$messages.hooksHandlerKindCheck}</option>
      </select>
    {/if}
    <label for="new-hook-title">{$messages.pageTitle}</label>
    <input id="new-hook-title" bind:value={newTitle} required maxlength="200" disabled={busy} />
    {#if !canAttach}<p>{$messages.hooksCreateNeedsSubscription}</p>{/if}
    <button class="cms-primary" disabled={busy}>
      {assign ? $messages.hooksCreateAndAttach : $messages.hooksCreateHandler}
    </button>
  </form>
{/snippet}

<div class="site-viewport" hidden={!active}>
  <div class="site-panels" class:site-panels__editor={panel === WorkspacePanel.Editor}
    class:_hooks-without-tree={!canList}>
    {#if canList}<aside class="page-drawer" aria-label="Hooks"
      inert={!active || !desktop && panel !== WorkspacePanel.Tree}
      aria-hidden={!active || !desktop && panel !== WorkspacePanel.Tree}>
      <div class="_drawer-heading">
        <div class="_drawer-context"><span class="_setup-kicker">{site.primaryDomain}</span>
          <button id="hooks-tree-toggle" class="cms-circle" aria-label={$messages.openWorkspace}
            onclick={() => {
              panel = WorkspacePanel.Editor;
            }}>›</button></div>
        <div class="_drawer-title-row"><h2>Hooks</h2><RefreshButton disabled={busy || loading}
          onclick={() => {
            void refresh();
          }} /></div>
        <label for="hook-search">{$messages.hooksSearchHooks}</label>
        <input id="hook-search" type="search" bind:value={query} />
      </div>
      <div use:scrollShadow class="_tree-scroll">
        {#if !loaded && loading}<p role="status">{$messages.loadingElements}</p>{/if}
        <ul class="hooks-tree">
          {#each visible as hook (hook.hookKey)}
            <li>
              <div class="_hook-row" class:_hook-row__selected={route.hookKey === hook.hookKey && !route.hookBindingId}>
                <button class="_hook-disclosure" aria-expanded={expanded.has(hook.hookKey)}
                  aria-label={(expanded.has(hook.hookKey) ? $messages.hooksCollapse : $messages.hooksExpand)
                    + hook.hookKey}
                  onclick={() => {
                    if (expanded.has(hook.hookKey)) {
                      expanded.delete(hook.hookKey);
                    } else {
                      expanded.add(hook.hookKey);
                    }
                  }}>
                  {expanded.has(hook.hookKey) ? '⌄' : '›'}</button>
                <button class="_hook-select" aria-current={route.hookKey === hook.hookKey
                  && !route.hookBindingId ? 'page' : undefined}
                  onclick={() => {
                    open(hook.hookKey);
                  }}><span class="cms-drawer-label" title={hook.hookKey}>{hook.hookKey}</span>
                  <small>{hook.subscriptions.length}</small></button>
              </div>
              {#if expanded.has(hook.hookKey)}
                <ul class="_hook-children">
                  {#each hook.subscriptions as binding, index (binding.subscriptionId)}
                    <li><button class="_handler-row" class:_handler-row__selected={route.hookBindingId
                      === binding.subscriptionId}
                      aria-current={route.hookBindingId === binding.subscriptionId ? 'page' : undefined}
                      onclick={() => {
                        open(hook.hookKey, binding.subscriptionId);
                      }}>
                      <small>{index + 1}.</small><span class="cms-drawer-label">{handlers.find((item) => item.handlerId
                        === binding.handlerId)?.title ?? binding.title}</span><small>{binding.enabled
                          ? '●' : '○'}</small>
                    </button></li>
                  {/each}
                  {#if !hook.subscriptions.length}<li class="_hook-empty">{$messages.hooksNoHandlers}</li>{/if}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
        {#if loaded && !visible.length}<p>{$messages.hooksNoMatchingHooks}</p>{/if}
      </div>
      <div class="_drawer-footer">{site.name}</div>
    </aside>{/if}
    <main class="page-workspace" aria-label={$messages.hooksWorkspace}
      inert={!active || canList && !desktop && panel !== WorkspacePanel.Editor}
      aria-hidden={!active || canList && !desktop && panel !== WorkspacePanel.Editor}>
      <div class="_workspace-toolbar">
        {#if canList}<button class="cms-circle" aria-label={$messages.hooksOpenHooksTree} onclick={() => {
          void showTree();
        }}>‹</button>{/if}
        <h1 class="_workspace-title">{history !== null ? $messages.hooksLatestDeliveries
          : selectedBinding ? buffer?.handler.title ?? selectedBinding.title : selectedHook?.hookKey ?? 'Hooks'}</h1>
        {#if can('cms.hooks.history')}<button class="cms-secondary" disabled={busy} onclick={() => {
          if (history !== null) {
            history = null;

            return;
          }
          void operation(async () => {
            const result = object(await request('/' + site.siteId + '/hooks/history'));

            if (!Array.isArray(result.items)) {
              throw new Error('Invalid history');
            }
            history = result.items.map(object);
          });
        }}>{history !== null ? $messages.hooksBackToHook : $messages.hooksHistory}</button>{/if}
      </div>
      <div use:scrollShadow class="_workspace-scroll">
        {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
        {#if notice}<p class="cms-success" role="status">{$messages[notice]}</p>{/if}
        {#if history}
          {#if !history.length}<p>{$messages.hooksNoDeliveriesYet}</p>{/if}
          {#each history as row (String(row.deliveryId))}
            <article class="cms-card"><strong>{String(row.hookKey)}</strong><p>{String(row.state)} ·
              {String(row.attempts)}</p>
              {#if row.error}<p>{String(row.error)}</p>{/if}
              {#if can('cms.hooks.retry-delivery') && (row.state === 'Failed' || row.state === 'OutcomeUnknown')}
              <button class="cms-secondary"
                disabled={busy} onclick={() => {
                  void operation(async () => {
                    await request('/' + site.siteId + '/hooks/history/' + row.deliveryId + '/retry', {
                      version:
                    row.version,
                    });
                    history = null;
                  });
                }}>{row.state === 'OutcomeUnknown' ? $messages.hooksReconcileAndRetry
                  : $messages.hooksRetry}</button>{/if}
              {#if can('cms.hooks.skip-delivery') && row.state === 'Failed'}
              <button class="cms-secondary" disabled={busy} onclick={() => {
                void operation(async () => {
                  await request('/' + site.siteId + '/hooks/history/' + row.deliveryId + '/skip', {
                    version: row.version, reason: 'Skipped by administrator',
                  });
                  history = null;
                });
              }}>{$messages.hooksSkip}</button>{/if}
            </article>
          {/each}
        {:else if selectedHook && selectedBinding}
          <p>{$messages.hooksAttachedHook}: <strong>{selectedHook.hookKey}</strong></p>
          <p>{selectedHook.kind} · {selectedBinding.addonKey ?? 'CMS user handler'} · {selectedBinding.enabled
            ? $messages.addonsEnabled : $messages.addonsDisabled}</p>
          {#if buffer}
            <div class="_handler-actions">
              {#if can('cms.hooks.save-draft')}
              <button class="cms-primary" disabled={busy} onclick={() => {
                void operation(save);
              }}>{$messages.saveDraft}</button>
              {/if}
              {#if can('cms.hooks.apply-handler')}
              <button class="cms-secondary" disabled={busy} onclick={() => {
                void operation(apply);
              }}>{$messages.calibrationHistoryApply}</button>
              {/if}
              {#if can('cms.hooks.set-enabled')}
              <button class="cms-secondary" disabled={busy || !buffer.handler.activeVersionId} onclick={() => {
                void operation(toggle);
              }}>
                {buffer.handler.enabled && selectedBinding.enabled ? $messages.addonsDisable
                  : $messages.addonsEnable}</button>
              {/if}
            </div>
            <label for="hook-handler-title">{$messages.pageTitle}</label><input id="hook-handler-title"
              bind:value={buffer.title} disabled={busy || !can('cms.hooks.save-draft')} />
            <p>{$messages.hooksActiveVersion}: {buffer.handler.activeVersionId ?? '—'}</p>
            <label for="hook-capabilities">{$messages.hooksPermittedCommandsAndQueriesOne}</label>
            <textarea id="hook-capabilities" rows="3" bind:value={buffer.capabilities}
              disabled={busy || !can('cms.hooks.save-draft')}></textarea>
            <SourceCode id="hook-handler-source" bind:value={buffer.source} label={$messages.hookServerTypeScript}
              disabled={busy || !can('cms.hooks.save-draft')}
              position={buffer.position} onPosition={(position) => {
                buffer.position = position;
              }} onSave={() => {
                void operation(save);
              }} />
          {:else if selectedBinding.ownerKind === 'Addon'}<p>{$messages.hooksThisHandlerIsImplementedBy}</p>
          {:else if can('cms.hooks.read-handler')}<p role="status">{$messages.loadingElements}</p>{/if}
        {:else if selectedHook}
          <p>{selectedHook.description}</p>
          <dl class="_hook-information">
            <dt>{$messages.hooksEmittedBy}</dt>
            <dd>{selectedHook.provider === 'cms' ? 'CMS Zarya' : selectedHook.provider}</dd>
            <dt>{$messages.hooksRegistered}</dt><dd>{new Intl.DateTimeFormat($adminLanguage,
              { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new
            Date(selectedHook.registeredAt))} ({timeZone})</dd>
            <dt>{$messages.hooksKind}</dt><dd>{selectedHook.kind}</dd>
            <dt>{$messages.hooksAssignedHandlers}</dt><dd>{selectedHook.subscriptions.length}</dd></dl>
          <h2>{$messages.hooksHandlerOrder}</h2>
          {#each selectedHook.subscriptions as binding, index (binding.subscriptionId)}
            <div class="_handler-order"><button class="cms-secondary" onclick={() => {
              open(selectedHook!.hookKey, binding.subscriptionId);
            }}>{index + 1}. {binding.title}</button>
              {#if can('cms.hooks.reorder-subscriptions')}
              <button class="cms-secondary" aria-label={$messages.hooksMoveUp + binding.title}
                disabled={busy || index === 0 || selectedHook.scopeKind !== 'Site'}
                onclick={() => {
                  void operation(() => move(binding, -1));
                }}>↑</button>
              <button class="cms-secondary" aria-label={$messages.hooksMoveDown + binding.title}
                disabled={busy || index === selectedHook.subscriptions.length - 1 || selectedHook.scopeKind !== 'Site'}
                onclick={() => {
                  void operation(() => move(binding, 1));
                }}>↓</button>{/if}</div>
          {/each}
          {#if !selectedHook.subscriptions.length}<p>{$messages.hooksNoHandlersAssigned}</p>{/if}
          {#if selectedHook.scopeKind === 'Site'}
          {#if canCreate}{@render createHandlerForm(selectedHook)}{/if}
          {#if canAttach && selectedHook.available && handlers.some((handler) => handler.kind === selectedHook.kind)}
            <form class="_handler-create" onsubmit={(event) => {
              event.preventDefault();
              const handler = handlers.find((item) => item.handlerId === existingHandler);

              if (handler) {
                void operation(() => attach(handler));
              }
            }}>
              <label for="existing-hook-handler">{$messages.hooksAttachExistingHandler}</label>
              <select id="existing-hook-handler" bind:value={existingHandler}><option value="">—</option>
                {#each handlers.filter((handler) => handler.kind === selectedHook!.kind) as handler
                  (handler.handlerId)}<option value={handler.handlerId}>{handler.title}</option>{/each}</select>
              <button class="cms-secondary" disabled={busy || !existingHandler}>{$messages.hooksAttach}</button>
            </form>
          {/if}
          {:else}<p>{$messages.hooksInstallationHooksAreAvailableTo}</p>{/if}
        {:else}
          {#if canList}
            <p>{$messages.hooksSelectAHookInThe}</p><p>{hooks.length} {$messages.hooksRegisteredHooks}</p>
          {/if}
          {#if canCreate}{@render createHandlerForm(undefined)}{/if}
        {/if}
      </div>
    </main>
  </div>
</div>

<style>
  .site-panels._hooks-without-tree {
    grid-template-columns: minmax(0, 1fr);
    transform: none;
  }

  .hooks-tree, ._hook-children { list-style: none;
  margin: 0;
  padding: 0;
  }
  ._hook-row, ._handler-row { display: flex;
  width: 100%;
  align-items: stretch;
  margin: 6px 0;
  border: 1px
    solid transparent;
    border-radius: 8px;
    background: var(--cms-row);
    }
  ._hook-row:hover, ._handler-row:hover { background: var(--cms-row-hover);
  }
  ._hook-row__selected, ._handler-row__selected { border-color: var(--cms-accent);
  }
  ._hook-disclosure { flex: 0 0 36px;
  min-height: 44px;
  border: 0;
  border-right: 1px solid var(--cms-border);
    border-radius: 7px 0 0 7px;
    background: #e5eadd;
    color: var(--cms-ink);
    cursor: pointer;
    }
  ._hook-select { display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
    min-width: 0;
    padding: 10px 8px;
    border: 0;
    background: transparent;
    text-align: left;
    color:
    var(--cms-ink);
    cursor: pointer;
    }
  ._hook-select span { overflow-wrap: anywhere;
  font-size: 13px;
  }
  ._hook-children { padding-left: 20px;
  }
  ._handler-row { align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px;
  color: var(--cms-ink);
    text-align: left;
    cursor: pointer;
    }
  ._handler-row span { flex: 1;
  overflow-wrap: anywhere;
  }
  ._hook-empty { padding: 8px;
  color: var(--cms-muted);
  font-size: 13px;
  }
  ._hook-information { display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  overflow-wrap: anywhere;
  }
  ._hook-information dt { color: var(--cms-muted);
  }
  ._hook-information dd { margin: 0 0 12px;
  }
  ._handler-actions, ._handler-order { display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
  }
  ._handler-create { display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin: 24px 0;
  }
  ._workspace-scroll input, ._workspace-scroll textarea, ._workspace-scroll select { width: 100%;
  margin: 8px 0;
  }
  @media (min-width: 576px) { ._hook-information { grid-template-columns: 180px minmax(0, 1fr);
  } }
</style>
