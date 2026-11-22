<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { type IAdminRoute, navigateAdmin, sitePath } from '../../app/admin-route';
  import { type AdminMessageKey, messages } from '../../i18n/i18n';
  import { type IAdminSite, WorkspacePanel } from '../../shared/api/content.types';
  import { contentError, ContentErrorMessage, ContentRequestError, getPage } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import FolderContents from '../../shared/ui/FolderContents.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import { siteLink, urlTree } from './url-tree';
  import UrlPicker from './UrlPicker.svelte';
  import {
    ChildrenUrlAction, IncomingRedirectAction,
    type ISiteAddresses, type IUrlCatalog, type IUrlHistory, type IUrlNode, OldUrlAction, PublishedUrlKind, UrlKind,
    UrlSearchPurpose,
  } from './urls.types';
  import { servingSiteOrigin } from './urls.types';
  import { getSiteAddresses, getUrlCatalog, getUrlHistory, moveUrl, publishRouting, redirectUrl } from './urls-api';
  import { materializeVirtualUrl } from './urls-api';
  import UrlTree from './UrlTree.svelte';

  let { can, site, route, active, desktop, onUnauthorized, onBusy, onDirtyChange, onChanged }: {
    can: CanUseAction;
    site: IAdminSite;
    route: IAdminRoute;
    active: boolean;
    desktop: boolean;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
    onChanged: () => void;
  } = $props();
  let catalog = $state<IUrlCatalog | null>(null);
  let addresses = $state<ISiteAddresses>({ publicOrigin: null, localOrigin: null });
  let selectedPath = $state('/');
  let query = $state('');
  let sitemapOnly = $state(false);
  let loading = $state(false);
  let busy = $state(false);
  let publishing = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let historyError = $state(false);
  let historyLoading = $state(false);
  let history = $state<IUrlHistory[]>([]);
  let notice = $state<AdminMessageKey | ''>('');
  let path = $state('');
  let parentUrlId = $state('');
  let childrenAction = $state(ChildrenUrlAction.Keep);
  let incomingRedirectAction = $state(IncomingRedirectAction.Retarget);
  let publicationPending = $state(false);
  let oldUrlAction = $state(OldUrlAction.Redirect);
  let redirectStatus = $state(301);
  let targetUrlId = $state('');
  let panel = $state(WorkspacePanel.Tree);
  let treeToggle = $state<HTMLButtonElement>();
  let editorToggle = $state<HTMLButtonElement>();
  let detailScroll = $state<HTMLDivElement>();
  let generation = 0;
  let historyGeneration = 0;
  let selectedId = '';
  let wasActive = false;
  const canList = $derived(can('cms.urls.list'));
  const canSuggest = $derived(can('cms.urls.suggest'));
  const canPublish = $derived(can('cms.urls.publish'));
  const canReadSettings = $derived(can('cms.site-settings.read'));
  const canReadDraft = $derived(can('cms.pages.read'));
  const canCreatePageAtFolder = $derived(canList && can('cms.pages.create') && can('cms.urls.materialize'));
  const basePath = $derived(sitePath(site.siteId) + '/urls');
  const nodes = $derived(catalog ? urlTree(catalog) : []);
  const selected = $derived(nodes.find((node) => node.path === selectedPath));
  const row = $derived(selected?.row ?? null);
  const parentPath = $derived(catalog?.urls.find((item) => item.url.urlId === parentUrlId)?.url.path ?? '');
  const targetPath = $derived(catalog?.urls.find((item) => item.url.urlId === targetUrlId)?.url.path ?? '');
  const savedTarget = $derived(row?.url.redirectTargetUrlId ?? '');
  const canSetRedirect = $derived(row ? can('cms.urls.set-redirect') : !selected?.live && can('cms.urls.materialize'));
  const page = $derived(catalog?.pages.find((page) => page.pageId === row?.url.pageId));
  const livePage = $derived(catalog?.pages.find((page) => page.pageId === selected?.live?.pageId));
  const linkedPageId = $derived(page?.pageId ?? livePage?.pageId);
  let checkedDraft = $state<{ siteId: string; pageId: string; readable: boolean } | null>(null);
  const linkedDraftReadable = $derived(canReadDraft
    && checkedDraft?.siteId === site.siteId && checkedDraft.pageId === linkedPageId ? checkedDraft.readable : null);
  const children = $derived(nodes.filter((node) => node.parent === selectedPath));
  const childRedirects = $derived(children.filter((node) => node.row
    ? node.row.url.kind === UrlKind.Redirect : node.live?.kind === PublishedUrlKind.Redirect));
  const childPages = $derived(children.filter((node) => node.row
    ? node.row.url.kind === UrlKind.Page : node.live && node.live.kind !== PublishedUrlKind.Redirect));
  const childItems = $derived(children.map((node) => {
    const redirect = node.row?.url.kind === UrlKind.Redirect;
    const page = catalog?.pages.find((item) => item.pageId === (node.row?.url.pageId ?? node.live?.pageId));

    return {
      id: node.path,
      label: node.path,
      ...(node.row ? { href: basePath + '/' + node.row.url.urlId } : {}),
      detail: redirect ? `${node.row!.url.redirectStatus} → ${destination(node.row!.url.redirectTargetUrlId)}`
        : !node.row && node.live?.kind === PublishedUrlKind.Redirect
          ? `${node.live.status} → ${node.live.targetPath}`
          : page ? page.title + ' · ' + (node.live && node.live.kind !== PublishedUrlKind.Redirect
            ? $messages.pagePublic : $messages.pageNotPublic) : $messages.urlVirtualFolder,
    };
  }));
  const incoming = $derived(catalog?.urls.filter((item) => item.url.redirectTargetUrlId === row?.url.urlId) ?? []);
  const target = $derived(nodes.find((node) => node.row?.url.urlId === row?.url.redirectTargetUrlId));
  const publicHref = $derived(siteLink(servingSiteOrigin(addresses), selectedPath));
  const localHref = $derived(addresses.originMode === undefined ? siteLink(addresses.localOrigin, selectedPath) : null);
  const hasPage = $derived(Boolean(page || livePage));
  const pending = $derived(Boolean(row && (!selected?.live
    || (row.url.kind === UrlKind.Page ? selected.live.kind === PublishedUrlKind.Redirect
      || selected.live.pageId !== row.url.pageId : selected.live.kind !== PublishedUrlKind.Redirect
      || selected.live.status !== row.url.redirectStatus
      || selected.live.targetUrlId !== row.url.redirectTargetUrlId))));
  const dirty = $derived(Boolean(row && (path !== row.url.path || parentUrlId !== (row.url.parentUrlId ?? '')
    || childrenAction !== ChildrenUrlAction.Keep || incomingRedirectAction !== IncomingRedirectAction.Retarget
    || oldUrlAction !== OldUrlAction.Redirect || redirectStatus !== (row.url.redirectStatus ?? 301)
    || targetUrlId !== (row.url.redirectTargetUrlId ?? ''))));
  const subtree = $derived.by(() => {
    if (!row || !catalog) {
      return [];
    }

    const prefix = row.url.path.endsWith('/') ? row.url.path : row.url.path + '/';

    return catalog.urls.filter((item) => item.url.urlId !== row.url.urlId && item.url.path.startsWith(prefix));
  });
  const visibleNodes = $derived.by(() => {
    if (!query.trim() && !sitemapOnly) {
      return nodes;
    }

    const matched = nodes.filter((node) => (!sitemapOnly || node.inSitemap)
      && (node.path.toLowerCase().includes(query.toLowerCase())
        || catalog?.pages.find((page) => page.pageId
          === node.row?.url.pageId)?.title.toLowerCase().includes(query.toLowerCase())));
    const visible = new SvelteSet(matched.map((node) => node.path));

    for (const node of matched) {
      let parent = node.parent;

      while (parent !== null) {
        visible.add(parent);
        parent = nodes.find((item) => item.path === parent)?.parent ?? null;
      }
    }

    return nodes.filter((node) => visible.has(node.path));
  });
  const childPageCount = $derived(subtree.filter((item) => item.url.kind === UrlKind.Page).length);
  const affectedRedirects = $derived.by(() => {
    if (!row || !catalog) {
      return [];
    }

    const removed = new SvelteSet<string>();

    if (oldUrlAction === OldUrlAction.Delete) {
      removed.add(row.url.urlId);
    }
    if (childrenAction === ChildrenUrlAction.PromoteWithoutRedirect) {
      for (const item of subtree) {
        removed.add(item.url.urlId);
      }
    }

    return catalog.urls.filter((item) => {
      if (
        item.url.kind !== UrlKind.Redirect
        || removed.has(item.url.urlId)
        || childrenAction !== ChildrenUrlAction.Keep
        && subtree.some((child) => child.url.urlId === item.url.urlId)
      ) {
        return false;
      }

      let target = item.url.redirectTargetUrlId;
      const visited = new SvelteSet<string>();

      while (target !== null) {
        if (removed.has(target)) {
          return true;
        }
        if (visited.has(target)) {
          return false;
        }
        visited.add(target);
        target = catalog!.urls.find((candidate) => candidate.url.urlId === target)?.url.redirectTargetUrlId ?? null;
      }

      return false;
    });
  });

  function promotedPath(value: string): string {
    if (!row) {
      return value;
    }

    const old = row.url.path.replace(/\/$/, '');
    const prefix = old + '/';

    return value.startsWith(prefix) ? old.slice(0, old.lastIndexOf('/') + 1) + value.slice(prefix.length)
      : $messages.urlSubtreeInvalid;
  }

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
    }
  }
  async function showPanel(next: WorkspacePanel): Promise<void> {
    panel = next;
    await tick();

    if (!desktop) {
      (next === WorkspacePanel.Tree ? treeToggle : editorToggle)?.focus({ preventScroll: true });
    }
  }
  async function loadHistory(urlId: string): Promise<void> {
    const captured = ++historyGeneration;

    history = [];
    historyError = false;
    historyLoading = true;

    try {
      const result = await getUrlHistory(site.siteId, urlId);

      if (captured === historyGeneration) {
        history = result;
      }
    } catch (value) {
      if (captured === historyGeneration) {
        if (value instanceof ContentRequestError && value.status === 401) {
          onUnauthorized();
        } else {
          historyError = true;
        }
      }
    } finally {
      if (captured === historyGeneration) {
        historyLoading = false;
      }
    }
  }
  function select(node: IUrlNode): void {
    detailScroll?.scrollTo({ top: 0 });
    selectedPath = node.path;
    selectedId = node.row?.url.urlId ?? '';
    path = node.path;
    parentUrlId = node.row?.url.parentUrlId ?? '';
    childrenAction = ChildrenUrlAction.Keep;
    incomingRedirectAction = IncomingRedirectAction.Retarget;
    oldUrlAction = OldUrlAction.Redirect;
    redirectStatus = node.row?.url.redirectStatus ?? 301;
    targetUrlId = node.row?.url.redirectTargetUrlId ?? '';
    history = [];
    historyGeneration++;
    historyLoading = false;
    historyError = false;

    if (node.row && can('cms.urls.history')) {
      void loadHistory(node.row.url.urlId);
    }
  }
  function openNode(node: IUrlNode): void {
    if (busy || dirty && !window.confirm($messages.leaveUnsaved)) {
      return;
    }
    notice = '';
    select(node);

    if (node.row) {
      navigateAdmin(basePath + '/' + node.row.url.urlId);
    } else {
      navigateAdmin(basePath);
    }
    void showPanel(WorkspacePanel.Editor);
  }
  async function load(next: IAdminRoute): Promise<void> {
    if (!canList) {
      return;
    }

    const captured = ++generation;

    loading = true;
    error = null;

    try {
      const [result, settings] = await Promise.all([
        getUrlCatalog(site.siteId),
        canReadSettings ? getSiteAddresses(site.siteId)
          : Promise.resolve({ publicOrigin: null, localOrigin: null }),
      ]);

      if (captured !== generation) {
        return;
      }
      catalog = result;
      addresses = settings;
      const tree = urlTree(result);
      const requested = next.urlId ? tree.find((node) => node.row?.url.urlId === next.urlId)
        : next.urlPageId ? tree.find((node) => node.row?.url.pageId === next.urlPageId) : tree.find((node) =>
          node.path === selectedPath) ?? tree[0];

      if (!requested) {
        select(tree.find((node) => node.path === '/')!);
        error = ContentErrorMessage.Missing;
        await showPanel(WorkspacePanel.Editor);
      } else {
        select(requested);

        if (next.urlId || next.urlPageId) {
          await showPanel(WorkspacePanel.Editor);
        }
      }
    } catch (value) {
      if (captured === generation) {
        failure(value);
      }
    } finally {
      if (captured === generation) {
        loading = false;
      }
    }
  }
  async function perform(operation: () => Promise<void>): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    onBusy(true);
    error = null;
    notice = '';

    try {
      await operation();
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
      publishing = false;
    }
  }
  async function move(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const current = row;

    if (!canList || !can('cms.urls.move') || current?.url.kind !== UrlKind.Page) {
      return;
    }

    const action = oldUrlAction;
    const parentOnly = path === current.url.path;
    const parent = canSuggest ? parentUrlId || null : current.url.parentUrlId;

    if (parentOnly && parent === current.url.parentUrlId) {
      return;
    }

    let savedId = '';

    await perform(async () => {
      const result = await moveUrl(site.siteId, current.url, path, parent,
        redirectStatus, parentOnly ? OldUrlAction.Redirect : action,
        parentOnly ? ChildrenUrlAction.Keep : childrenAction,
        parentOnly ? IncomingRedirectAction.Retarget : incomingRedirectAction);
      const saved = result.url;

      savedId = saved.urlId;

      onChanged();
      await load({ ...route, urlId: saved.urlId, urlPageId: null });
      publicationPending = result.publicationFailed;

      if (!publicationPending) {
        notice = parentOnly ? 'urlParentSaved'
          : !result.activated ? 'urlMoveSavedUnpublished'
            : action === OldUrlAction.Delete ? 'urlMovedDeleted' : 'urlMoved';
      }
    });

    if (savedId) {
      navigateAdmin(basePath + '/' + savedId);
    }
  }
  async function redirect(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const current = row;
    const target = canSuggest ? targetUrlId : savedTarget;

    if (
      !selected
      || !canList
      || !canSetRedirect
      || !target
      || !canSuggest
      && redirectStatus === current?.url.redirectStatus
    ) {
      return;
    }
    await perform(async () => {
      const result = current
        ? await redirectUrl(site.siteId, current.url.urlId, current.version, target, redirectStatus)
        : await materializeVirtualUrl(site.siteId, {
          kind: UrlKind.Redirect, path: selectedPath, targetUrlId: target, redirectStatus,
        });

      onChanged();
      await load({ ...route, urlId: result.url.urlId, urlPageId: null });
      publicationPending = result.publicationFailed;
      notice = result.publicationFailed ? '' : result.activated ? 'urlSaved' : 'urlSavedUnpublished';
    });

    if (!error) {
      navigateAdmin(basePath + '/' + selectedId);
    }
  }
  async function publish(): Promise<void> {
    if (!canPublish || dirty) {
      return;
    }

    await perform(async () => {
      publishing = true;
      const activated = await publishRouting(site.siteId);

      await load(route);
      publicationPending = false;
      notice = activated ? 'urlRoutingApplied' : 'urlRoutingNoRelease';
      onChanged();
    });
  }
  function destination(urlId: string | null): string {
    return catalog?.urls.find((item) => item.url.urlId === urlId)?.url.path ?? urlId ?? '—';
  }
  $effect(() => {
    const next = route;
    const entering = active && !wasActive;

    wasActive = active;

    if (active) {
      untrack(() => {
        const requestedId = next.urlId;

        if (!entering && catalog && (requestedId ?? '') === selectedId) {
          return;
        }
        if (dirty && requestedId && requestedId !== selectedId) {
          if (!window.confirm($messages.leaveUnsaved)) {
            navigateAdmin(basePath + '/' + selectedId, true);

            return;
          }
          void load(next);

          return;
        }
        if (!dirty) {
          void load(next);
        }
      });
    }
  });
  $effect(() => {
    const pageId = linkedPageId;
    const siteId = site.siteId;

    void catalog;
    checkedDraft = null;

    if (!active || !pageId || !canReadDraft) {
      return;
    }

    let current = true;

    void getPage(siteId, pageId).then((draft) => {
      if (current && draft.siteId === siteId && draft.pageId === pageId) {
        checkedDraft = { siteId, pageId, readable: true };
      }
    }).catch((failure: unknown) => {
      if (current && failure instanceof ContentRequestError) {
        if (failure.status === 401) {
          onUnauthorized();
        } else if (failure.status === 403 || failure.status === 404) {
          checkedDraft = { siteId, pageId, readable: false };
        }
      }
    });

    return () => {
      current = false;
    };
  });
  $effect(() => {
    const value = dirty;

    untrack(() => onDirtyChange(value));
  });

</script>

{#snippet routingApply(disabled: boolean)}
  {#if canPublish}
    <button class="cms-secondary" {disabled} onclick={() => {
      void publish();
    }}>{publishing ? $messages.publishing : $messages.urlApplyRouting}</button>
  {/if}
{/snippet}

{#snippet routingFeedback()}
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if notice}<p class="cms-success" role="status">{$messages[notice]}</p>{/if}
  {#if publicationPending}
    <p class="cms-error" role="alert">
      {canPublish ? $messages.urlPublicationPending : $messages.urlPublicationNeedsPublisher}
    </p>
  {/if}
{/snippet}

<div class="site-viewport" hidden={!active}>
  {#if !canList}
    <main class="page-workspace" aria-label={$messages.urls}>
      <div class="_workspace-toolbar">
        <h1 class="_workspace-title">{$messages.urls}</h1>
        {@render routingApply(busy)}
      </div>
      <div class="_workspace-scroll urls-workspace">
        {@render routingFeedback()}
        <p>{$messages.urlCatalogRequired}</p>
      </div>
    </main>
  {:else}
  <div class="site-panels" class:site-panels__editor={panel === WorkspacePanel.Editor}>
    <aside id="urls-drawer" class="page-drawer" aria-label={$messages.urlTree}
      inert={!desktop && panel !== WorkspacePanel.Tree} aria-hidden={!desktop && panel !== WorkspacePanel.Tree}>
      <div class="_drawer-heading">
        <div class="_drawer-context"><span class="_setup-kicker">{site.primaryDomain}</span>
          <button class="cms-circle" bind:this={treeToggle} disabled={busy} aria-label={$messages.openWorkspace}
            aria-controls="urls-workspace" onclick={() => {
              void showPanel(WorkspacePanel.Editor);
            }}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
        <div class="_drawer-title-row"><h2>{$messages.urls}</h2>
          {#if canList}<RefreshButton disabled={busy || loading || dirty} onclick={() => {
            void load(route);
          }} />{/if}
        </div>
        {#if canList}<label class="_form-field">{$messages.urlSearch}<input type="search" bind:value={query} /></label>
        <label class="_url-check"><input type="checkbox" bind:checked={sitemapOnly} />
          {$messages.urlSitemapOnly}</label>{/if}
      </div>
      <div use:scrollShadow class="_tree-scroll">
        {#if loading && !catalog}<p role="status">{$messages.loadingUrls}</p>
        {:else if catalog}<UrlTree nodes={visibleNodes} {selectedPath} disabled={busy || loading} onSelect={openNode} />
        {:else if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
      </div>
      <div class="_drawer-footer">{site.name}</div>
    </aside>
    <main id="urls-workspace" class="page-workspace" aria-label={$messages.urls} aria-busy={loading || busy}
      inert={!desktop && panel !== WorkspacePanel.Editor} aria-hidden={!desktop && panel !== WorkspacePanel.Editor}>
      <div class="_workspace-toolbar">
        <button class="cms-circle" bind:this={editorToggle} disabled={busy} aria-label={$messages.urlTree}
          aria-controls="urls-drawer" onclick={() => {
            void showPanel(WorkspacePanel.Tree);
          }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 class="_workspace-title">{selected ? selectedPath : $messages.urls}</h1>
        {@render routingApply(busy || loading || dirty || !catalog)}
      </div>
      <div use:scrollShadow class="_workspace-scroll urls-workspace" bind:this={detailScroll}>
        {@render routingFeedback()}
        {#if canReadSettings && catalog && !addresses.publicOrigin}
          <p class="cms-error" role="alert">{$messages.urlSitemapNeedsOrigin}
            <a href={sitePath(site.siteId) + '/settings'} onclick={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                event.preventDefault();
                navigateAdmin(sitePath(site.siteId) + '/settings');
              }
            }}>{$messages.settings}</a>
          </p>
        {:else if catalog?.published?.sitemapPaths === null}
          <p class="_url-publication-hint" role="status">{$messages.urlSitemapNeedsPublication}</p>
        {/if}
        {#if selected}
          {#if children.length || !row}
            <FolderContents summary={$messages.folderUrlsSummary.replace('{pages}', String(childPages.length))
              .replace('{redirects}', String(childRedirects.length))
              .replace('{folders}', String(children.length - childPages.length - childRedirects.length))}
              items={childItems} disabled={busy} onSelect={(id) => {
                const child = children.find((node) => node.path === id);

                if (child) {
                  openNode(child);
                }
              }} />
          {/if}
          {#if pending}<span class="cms-badge">{$messages.urlPending}</span>{/if}
          <dl class="_url-facts">
            <dt>{$messages.urlBehavior}</dt><dd>{row?.url.kind === UrlKind.Redirect ? $messages.urlRedirect
              : row ? $messages.urlPage : $messages.urlVirtualFolder}</dd>
            <dt>{$messages.urlPageExists}</dt><dd>{page ? page.title : row?.url.pageId ? $messages.urlMissingPage
              : $messages.urlNoPage}</dd>
            {#if page}<dt>{$messages.urlLanguage}</dt><dd>{page.language}</dd>
              <dt>{$messages.urlEditorialStatus}</dt><dd>{page.status}</dd>
              <dt>{$messages.urlDraftIndexing}</dt><dd>{page.robotsIndex ? $messages.urlYes : $messages.urlNo}</dd>{/if}
            <dt>{$messages.urlPublicBehavior}</dt><dd>{selected.live ? selected.live.kind === PublishedUrlKind.Redirect
              ? `${selected.live.status} → ${selected.live.targetPath}` : $messages.urlPage
              : $messages.urlNotPublished}</dd>
            <dt>sitemap.xml</dt><dd>{selected.inSitemap ? $messages.urlInSitemap
              : catalog?.published?.sitemapPaths === null ? $messages.urlSitemapAbsent : $messages.urlNotInSitemap}</dd>
            {#if row}
              <dt>{$messages.urlSegment}</dt><dd>{row.url.segment || '/'}</dd>
              <dt>{$messages.urlMark}</dt><dd>{row.url.mark}</dd>
              <dt>{$messages.urlParent}</dt><dd>{row.url.parentUrlId ? destination(row.url.parentUrlId) : '—'}</dd>
              <dt>{$messages.urlCreated}</dt><dd>{row.url.createdAt} (UTC)</dd>
              <dt>{$messages.urlUpdated}</dt><dd>{row.url.updatedAt} (UTC)</dd>
              <dt>ID</dt><dd>{row.url.urlId}</dd>
            {/if}
            {#if canReadSettings}<dt>{$messages.publicOrigin}</dt><dd>{publicHref ?? $messages.urlUnconfigured}</dd>
            <dt>{$messages.localOrigin}</dt>
            <dd>{siteLink(addresses.localOrigin, selectedPath) ?? $messages.urlUnconfigured}</dd>{/if}
            {#if catalog?.published}<dt>{$messages.urlActiveRelease}</dt><dd>{catalog.published.releaseId}</dd>{/if}
          </dl>
          {#if !row}<p>{$messages.urlVirtualHint}</p>{/if}
          {#if canCreatePageAtFolder && !row && !selected.live}
            <a class="cms-secondary _url-create-page"
              href={sitePath(site.siteId) + '/pages/new?urlPath=' + encodeURIComponent(selectedPath)}
              onclick={(event) => {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                  event.preventDefault();
                  navigateAdmin(event.currentTarget.pathname + event.currentTarget.search);
                }
              }}>{$messages.urlCreateFolderPage.replace('{path}', () => selectedPath)}</a>
          {/if}
          {#if linkedPageId && (!canReadDraft || linkedDraftReadable === false)}
            <p class="_hint">{$messages.urlLinkedDraftNeedsRead}</p>
          {/if}
          <div class="_url-actions">
            {#if linkedDraftReadable && linkedPageId}<a class="cms-secondary"
              href={sitePath(site.siteId) + '/pages/' + linkedPageId}
              onclick={(event) => {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                  event.preventDefault();
                  navigateAdmin(event.currentTarget.pathname);
                }
              }}>
              {$messages.urlEditPage}</a>{/if}
            {#if publicHref && (hasPage || row?.url.kind === UrlKind.Redirect || selected.live)}
              <a class="cms-secondary" href={publicHref} target="_blank"
                rel="noopener noreferrer">{$messages.urlOpenPublic} ↗</a>{/if}
            {#if localHref && (hasPage || row?.url.kind === UrlKind.Redirect || selected.live)}
              <a class="cms-secondary" href={localHref} target="_blank"
                rel="noopener noreferrer">{$messages.urlOpenLocal} ↗</a>{/if}
          </div>
          {#if canReadSettings && hasPage && !publicHref}<p>{$messages.urlConfigureAddresses}
            <a href={sitePath(site.siteId) + '/settings'} onclick={(event) => {
              event.preventDefault();
              navigateAdmin(sitePath(site.siteId) + '/settings');
            }}>{$messages.settings}</a></p>{/if}
          {#if row?.url.kind === UrlKind.Redirect}
            <h2>{$messages.urlRedirect} {row.url.redirectStatus}</h2>
            {#if target}<button class="cms-secondary _url-address" disabled={busy} onclick={() => openNode(target!)}>
              → {target.path}</button>{:else}<p class="cms-error">{$messages.urlMissingTarget}</p>{/if}
          {/if}
          <p class="_url-publication-hint">{$messages.urlPublicationHint}</p>
          {#if ['/sitemap.xml', '/robots.txt', '/llms.txt'].includes(selected.path)}
            <p class="_setup-description">{$messages.systemUrlFixed}</p>
          {:else if can('cms.urls.move') && row?.url.kind === UrlKind.Page}
            <form onsubmit={move} class="_url-form">
              <h2>{$messages.urlChangeAddress}</h2>
              <fieldset disabled={busy || loading} class="_url-fieldset">
                <label class="_form-field">{$messages.urlNewPath}<input required bind:value={path} maxlength="2048"
                  autocapitalize="none" spellcheck="false" /></label>
                {#if canSuggest}{#key row.url.urlId}
                  <UrlPicker siteId={site.siteId} currentUrlId={row.url.urlId} purpose={UrlSearchPurpose.Parent}
                    label={$messages.urlRoutingParent} bind:value={parentUrlId}
                    selectedPath={parentPath} disabled={busy || loading} {onUnauthorized} />
                {/key}{:else}
                  <label class="_form-field">{$messages.urlRoutingParent}
                    <input value={parentPath || parentUrlId || $messages.urlNoParent} readonly />
                  </label>
                  <small>{$messages.urlParentSearchRequired}</small>
                {/if}
                <fieldset class="_url-fieldset" disabled={path === row.url.path}>
                {#if childPageCount > 0}
                  <label class="_url-check"><input type="radio" bind:group={childrenAction}
                    value={ChildrenUrlAction.Keep} />{$messages.urlChildrenKeep}</label>
                  <label class="_url-check"><input type="radio" bind:group={childrenAction}
                    value={ChildrenUrlAction.PromoteWithRedirect} />{$messages.urlChildrenPromoteRedirect}
                      ({childPageCount})</label>
                  <label class="_url-check"><input type="radio" bind:group={childrenAction}
                    value={ChildrenUrlAction.PromoteWithoutRedirect} />{$messages.urlChildrenPromoteDelete}
                      ({childPageCount})</label>
                {/if}
                {#if childPageCount > 0 && childrenAction !== ChildrenUrlAction.Keep}
                  <p>{$messages.urlMovePreview}</p>
                  <ul class="_url-move-preview"><li>{row.url.path} → {path}</li>
                    {#each subtree as child (child.url.urlId)}<li>{child.url.path} →
                      {promotedPath(child.url.path)}</li>{/each}
                  </ul>
                {/if}
                <label class="_url-check"><input type="radio" bind:group={oldUrlAction}
                  value={OldUrlAction.Redirect} />{$messages.urlOldRedirect}</label>
                <label class="_url-check"><input type="radio" bind:group={oldUrlAction}
                  value={OldUrlAction.Delete} />{$messages.urlOldDelete}</label>
                {#if oldUrlAction === OldUrlAction.Redirect}
                  <label class="_form-field">{$messages.urlRedirectStatus}<select bind:value={redirectStatus}>
                    <option value={301}>301</option><option value={308}>308</option></select></label>
                  <p>{$messages.urlOldRedirectHint}</p>
                {:else}<p>{$messages.urlOldDeleteHint}</p>{/if}
                {#if affectedRedirects.length > 0}
                  <h3>{$messages.urlAffectedRedirects} ({affectedRedirects.length})</h3>
                  <ul class="_url-move-preview">{#each affectedRedirects as item (item.url.urlId)}
                    <li>{item.url.path} → {destination(item.url.redirectTargetUrlId)}</li>{/each}</ul>
                  <label class="_url-check"><input type="radio" bind:group={incomingRedirectAction}
                    value={IncomingRedirectAction.Retarget} />{$messages.urlIncomingRetarget}</label>
                  <label class="_url-check"><input type="radio" bind:group={incomingRedirectAction}
                    value={IncomingRedirectAction.Delete} />{$messages.urlIncomingDelete}</label>
                {/if}
                </fieldset>
                {#if path === row.url.path}<p>{$messages.urlParentOnlyHint}</p>{/if}
                <button class="cms-primary" disabled={busy || path === row.url.path
                  && parentUrlId === (row.url.parentUrlId ?? '')}>{$messages.urlChangeAddress}</button>
              </fieldset>
            </form>
          {/if}
          {#if canSetRedirect
            && !['/sitemap.xml', '/robots.txt', '/llms.txt'].includes(selected.path)}
            <form onsubmit={redirect} class="_url-form">
              <h2>{$messages.urlSetRedirect}</h2>
              <fieldset disabled={busy || loading} class="_url-fieldset">
                {#if canSuggest}{#key selectedPath}
                  <UrlPicker siteId={site.siteId} currentUrlId={row?.url.urlId ?? ''}
                    purpose={UrlSearchPurpose.Redirect}
                    label={$messages.urlRedirectTarget} bind:value={targetUrlId}
                    selectedPath={targetPath} disabled={busy || loading} {onUnauthorized} />
                {/key}{:else if savedTarget}
                  <label class="_form-field">{$messages.urlRedirectTarget}
                    <input value={targetPath || savedTarget} readonly />
                  </label>
                {/if}
                {#if canSuggest || savedTarget}
                  <label class="_form-field">{$messages.urlRedirectStatus}<select bind:value={redirectStatus}><option
                    value={301}>301</option><option value={308}>308</option></select></label>
                {/if}
                {#if canSuggest}
                  <small>{$messages.urlRedirectTargetHint}</small>
                {:else}<small>{$messages.urlTargetSearchRequired}</small>{/if}
                {#if canSuggest || savedTarget}
                  <button class="cms-primary" disabled={busy || !targetUrlId
                    || !canSuggest && redirectStatus === row?.url.redirectStatus}>{$messages.urlSaveRedirect}</button>
                {/if}
              </fieldset>
            </form>
          {/if}
          {#if incoming.length}<h2>{$messages.urlIncoming} ({incoming.length})</h2>
            <ul class="_url-related">{#each incoming as item (item.url.urlId)}<li><button disabled={busy}
              onclick={() => {
                const node = nodes.find((node) => node.path === item.url.path);

                if (node) {
                  openNode(node);
                }
              }}>{item.url.path}</button></li>{/each}</ul>{/if}
          {#if row && can('cms.urls.history')}<h2>{$messages.urlHistory}</h2>
            {#if historyLoading}<p role="status">{$messages.urlLoading}</p>
            {:else if historyError}<p class="cms-error" role="alert">{$messages.contentFailed}</p>
              <RefreshButton onclick={() => {
                if (row) {
                  void loadHistory(row.url.urlId);
                }
              }} />
            {:else if history.length}<ol class="_url-history">{#each history as entry, index (index)}
              <li><time datetime={entry.createdAt}>{entry.createdAt} (UTC)</time>
                <span>{entry.kind === UrlKind.Page ? $messages.urlPage + ': ' + (catalog?.pages.find((page) =>
                  page.pageId === entry.pageId)?.title ?? entry.pageId)
                  : `${entry.redirectStatus} → ${destination(entry.redirectTargetUrlId)}`}</span></li>{/each}</ol>
            {:else}<p>{$messages.urlNoHistory}</p>{/if}
          {/if}
        {/if}
      </div>
    </main>
  </div>
  {/if}
</div>

<style>
  ._url-create-page {
    display: inline-block;
    max-width: 100%;
    height: auto;
  }
</style>
