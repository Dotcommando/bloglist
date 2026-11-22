<script lang="ts">
  import '../shared/styles/styles.css';
  import '../shared/styles/tables.css';

  import { onMount, tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  import { canOpenSection, isSiteAdministrator, siteActionCheck } from '../features/access/site-actions';
  import AddonMenuItem from '../features/addons/AddonMenuItem.svelte';
  import type { IAddonEntry, IAddonWorkspace } from '../features/addons/addons-api';
  import AddonsWorkspace from '../features/addons/AddonsWorkspace.svelte';
  import FilesWorkspace from '../features/files/FilesWorkspace.svelte';
  import HooksWorkspace from '../features/hooks/HooksWorkspace.svelte';
  import JsonLdWorkspace from '../features/json-ld/JsonLdWorkspace.svelte';
  import PageEditor from '../features/pages/PageEditor.svelte';
  import PageTree from '../features/pages/PageTree.svelte';
  import { ElementKind } from '../features/rendering/rendering.types';
  import SourceWorkspace from '../features/rendering/SourceWorkspace.svelte';
  import SettingsWorkspace from '../features/settings/SettingsWorkspace.svelte';
  import SiteCreation from '../features/sites/SiteCreation.svelte';
  import TemplateVariablesWorkspace from '../features/template-variables/TemplateVariablesWorkspace.svelte';
  import { servingSiteOrigin } from '../features/urls/urls.types';
  import { getSiteAddresses } from '../features/urls/urls-api';
  import UrlsWorkspace from '../features/urls/UrlsWorkspace.svelte';
  import { adminLanguage, messages } from '../i18n/i18n';
  import LanguageSelect from '../i18n/LanguageSelect.svelte';
  import {
    type IAdminPage, type IAdminSite, type IPageAvailability, type IPageEditorBuffer, type IPageEditorialState,
    WorkspaceNotice, WorkspacePanel, WorkspaceView,
  } from '../shared/api/content.types';
  import {
    contentError, ContentErrorMessage, ContentRequestError, getPage, getPublicationOptions,
    listPages, listSites, movePage,
  } from '../shared/api/content-api';
  import { scrollShadow } from '../shared/browser/scroll-shadow';
  import Checkbox from '../shared/ui/Checkbox.svelte';
  import CreateButton from '../shared/ui/CreateButton.svelte';
  import RefreshButton from '../shared/ui/RefreshButton.svelte';
  import { showSnackBar, SnackBarVariant } from '../shared/ui/snack-bar';
  import {
    adminRoute, AdminRouteKind, AdminSection, type IAdminRoute, navigateAdmin, readLastSite, rememberSite, sitePath,
  } from './admin-route';
  import type { IAdminAuthorization } from './auth';
  import CmsBuildInfo from './CmsBuildInfo.svelte';

  let { authority, onUnauthorized }: { authority: IAdminAuthorization;
    onUnauthorized: () => void } = $props();
  const hideSystemKey = 'zarya.pages.hide-system';
  let hideSystem = $state(readHideSystem());
  let view = $state(WorkspaceView.Loading);

  function readHideSystem(): boolean {
    try {
      return globalThis.localStorage?.getItem(hideSystemKey) === 'true';
    } catch {
      return false;
    }
  }

  function setHideSystem(value: boolean): void {
    hideSystem = value;

    try {
      globalThis.localStorage?.setItem(hideSystemKey, String(value));
    } catch {
      // Filtering remains available when browser storage is blocked.
    }
  }
  let sites = $state<IAdminSite[]>([]);
  let currentSite = $state<IAdminSite | null>(null);
  let siteLinkOrigin = $state<string | null>(null);

  $effect(() => {
    const site = currentSite;
    const siteId = site?.siteId;

    void routingRevision;
    siteLinkOrigin = null;
    let active = true;

    if (siteId && siteActionCheck(authority, siteId)('cms.site-settings.read')) {
      void getSiteAddresses(siteId).then((addresses) => {
        if (active && site) {
          siteLinkOrigin = servingSiteOrigin(addresses) ?? 'https://' + site.primaryDomain;
        }
      }).catch((value: unknown) => {
        if (active && value instanceof ContentRequestError && value.status === 401) {
          onUnauthorized();
        }
      });
    }

    return () => {
      active = false;
    };
  });
  let pages = $state<IAdminPage[]>([]);
  let pageAvailability = $state<readonly IPageAvailability[] | null>(null);
  let editorialStates = $state<readonly IPageEditorialState[]>([]);
  let availabilityError = $state(false);
  let availabilityGeneration = 0;
  let selectedPage = $state<IAdminPage | null>(null);
  let editing = $state(false);
  let panel = $state(WorkspacePanel.Tree);
  let desktop = $state(false);
  let loading = $state(false);
  let pageLoading = $state(false);
  let busy = $state(false);
  let signingOut = $state(false);
  let sessionEnded = false;
  const signOutLabel = $derived(signingOut
    ? ($messages.adminSigningOut)
    : ($messages.adminSignOut));
  let error = $state<ContentErrorMessage | null>(null);
  let notice = $state<WorkspaceNotice | null>(null);
  let editorKey = $state('');
  let virtualFolderPath = $state<string | null>(null);
  let treeToggle = $state<HTMLButtonElement>();
  let editorToggle = $state<HTMLButtonElement>();
  let generation = 0;
  let activePath = currentAddress();
  let preserveEditorPath: string | null = null;
  let lastPagePath: string | null = null;
  const section = $derived($adminRoute.section ?? AdminSection.Pages);
  const allSections = [AdminSection.Pages, AdminSection.Templates, AdminSection.Chunks,
    AdminSection.Snippets, AdminSection.TemplateVariables, AdminSection.Hooks, AdminSection.JsonLd, AdminSection.Files,
    AdminSection.Urls, AdminSection.Addons,
    AdminSection.Settings];
  const can = $derived(siteActionCheck(authority, currentSite?.siteId ?? ''));
  const sections = $derived(allSections.filter((item) => canOpenSection(can, item)));
  const readPages = $derived(can('cms.pages.list'));
  const needsPageRead = $derived($adminRoute.kind === AdminRouteKind.Page && !can('cms.pages.read'));
  const sectionPaths = new SvelteMap<AdminSection, string>();
  const pageBuffers = new SvelteMap<string, IPageEditorBuffer>();
  const pageDirty = new SvelteMap<string, boolean>();
  let templateDirty = $state(false);
  let chunkDirty = $state(false);
  let snippetDirty = $state(false);
  let hooksDirty = $state(false);
  let jsonLdDirty = $state(false);
  let urlsDirty = $state(false);
  let sectionNavigation = $state<HTMLElement>();
  let acceptedAddonRoute = $state<IAdminRoute>($adminRoute);
  let addonItems = $state<readonly IAddonEntry[]>([]);
  let addonWorkspaces = $state<readonly IAddonWorkspace[]>([]);

  function hasAddonActions(siteId: string): boolean {
    const grants = authority.siteGrants?.find((grant) => grant.siteId === siteId)?.actionIds ?? [];

    return [...grants, ...(authority.systemActionIds ?? []),
      ...(authority.siteAdminSiteIds.includes(siteId) ? authority.siteAdminActionIds ?? [] : [])]
      .some((id) => !id.startsWith('cms.'));
  }
  let badgeRevision = $state(0);
  let addonDirty = $state(false);
  let timeZoneRevision = $state(0);
  let settingsDirty = $state(false);
  let tvDirty = $state(false);
  let routingRevision = $state(0);
  const unsaved = $derived(addonDirty || templateDirty || chunkDirty || snippetDirty || hooksDirty
    || urlsDirty || settingsDirty || tvDirty || jsonLdDirty
    || [...pageDirty.values()].some(Boolean));
  let closeEditorTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const nav = sectionNavigation;
    const selected = ($adminRoute.addonKey ?? section) + $adminLanguage;
    const menu = addonItems;

    if (!nav) {
      return;
    }

    const reveal = (): void => {
      const item = nav.querySelector('[aria-current="page"]');

      if (item instanceof HTMLElement) {
        nav.scrollLeft += item.getBoundingClientRect().left - nav.getBoundingClientRect().left
          - (nav.clientWidth - item.offsetWidth) / 2;
      }
    };
    const observer = new ResizeObserver(reveal);

    observer.observe(nav);
    void tick().then(() => {
      void selected;
      void menu;
      reveal();
    });

    return () => observer.disconnect();
  });

  async function signOut(): Promise<void> {
    if (busy || signingOut || unsaved && !window.confirm($messages.leaveUnsaved)) {
      return;
    }
    busy = true;
    signingOut = true;

    try {
      const response = await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Zarya-Admin': '1' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      });

      if (response.status !== 204 && response.status !== 401) {
        throw new Error('Sign out failed');
      }
      sessionEnded = true;
      window.location.replace('/admin/login');
    } catch {
      showSnackBar($messages.adminCouldNotSignOutTry, SnackBarVariant.Failure);
    } finally {
      if (!sessionEnded) {
        signingOut = false;
        busy = false;
      }
    }
  }

  function currentAddress(): string {
    return window.location.pathname + window.location.search;
  }

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
    }
  }

  function navigateTo(path: string): void {
    if (!busy) {
      if (addonDirty && path !== currentAddress()) {
        if (!window.confirm($messages.leaveUnsaved)) {
          return;
        }
        addonDirty = false;
      }
      notice = null;
      navigateAdmin(path);
    }
  }

  async function refreshAvailability(siteId: string): Promise<void> {
    const captured = ++availabilityGeneration;

    availabilityError = false;

    if (!siteActionCheck(authority, siteId)('cms.publication.site-options')) {
      pageAvailability = null;
      editorialStates = [];

      return;
    }

    try {
      const result = await getPublicationOptions(siteId);

      if (captured === availabilityGeneration && currentSite?.siteId === siteId) {
        pageAvailability = result.pageAvailability;
        editorialStates = result.editorial?.pages ?? [];
      }
    } catch (value) {
      if (captured === availabilityGeneration && currentSite?.siteId === siteId) {
        if (value instanceof ContentRequestError && value.status === 401) {
          onUnauthorized();
        } else {
          availabilityError = true;
        }
      }
    }
  }

  function routingChanged(): void {
    routingRevision++;

    if (currentSite) {
      void refreshAvailability(currentSite.siteId);
    }
  }

  async function loadRoute(route: IAdminRoute): Promise<void> {
    if (preserveEditorPath === currentAddress()) {
      activePath = preserveEditorPath;
      lastPagePath = activePath;
      sectionPaths.set(AdminSection.Pages, activePath);
      preserveEditorPath = null;

      return;
    }
    if (busy) {
      if (currentAddress() !== activePath) {
        navigateAdmin(activePath, true);
      }

      return;
    }
    if (currentSite && addonDirty && currentAddress() !== activePath) {
      if (!window.confirm($messages.leaveUnsaved)) {
        navigateAdmin(activePath, true);

        return;
      }
      addonDirty = false;
    }
    if (
      currentSite
      && route.siteId !== currentSite.siteId
      && unsaved
      && !window.confirm($messages.leaveUnsaved)
    ) {
      navigateAdmin(activePath, true);

      return;
    }
    if (currentSite && route.siteId !== currentSite.siteId) {
      addonItems = [];
      addonWorkspaces = [];
      templateDirty = false;
      chunkDirty = false;
      snippetDirty = false;
      hooksDirty = false;
      jsonLdDirty = false;
      urlsDirty = false;
      settingsDirty = false;
      tvDirty = false;
      pageDirty.clear();
      pageBuffers.clear();
      sectionPaths.clear();
      lastPagePath = null;
    }
    if (currentSite?.siteId === route.siteId && view === WorkspaceView.Site && currentSite) {
      const section = route.section ?? AdminSection.Pages;

      if (
        !canOpenSection(can, section)
        && !(section === AdminSection.Addons && hasAddonActions(currentSite.siteId))
        && sections[0]
      ) {
        openSection(sections[0]);

        return;
      }
    }
    acceptedAddonRoute = route;

    if (
      currentSite?.siteId === route.siteId
      && view === WorkspaceView.Site
      && (route.section
      || currentAddress() === lastPagePath
      && !error)
    ) {
      activePath = currentAddress();
      sectionPaths.set(route.section ?? AdminSection.Pages, activePath);

      return;
    }
    if (currentSite?.siteId === route.siteId && view === WorkspaceView.Site && !route.section) {
      const captured = ++generation;

      activePath = currentAddress();
      lastPagePath = activePath;
      sectionPaths.set(AdminSection.Pages, activePath);
      pageLoading = true;
      error = null;

      try {
        await selectPageRoute(route, captured);
      } catch (value) {
        if (captured === generation) {
          failure(value);

          if (error) {
            await showPanel(WorkspacePanel.Editor);
          }
        }
      } finally {
        if (captured === generation) {
          pageLoading = false;
        }
      }

      return;
    }

    const captured = ++generation;

    activePath = currentAddress();

    if (currentSite?.siteId !== route.siteId || view !== WorkspaceView.Site) {
      view = WorkspaceView.Loading;
    }
    pageLoading = false;
    loading = false;
    error = null;

    try {
      const available = await listSites();

      if (captured !== generation) {
        return;
      }
      sites = available;
      const remembered = readLastSite(document.cookie);

      if (remembered && !sites.some((item) => item.siteId === remembered)) {
        rememberSite(null);
      }
      if (
        authority.systemAdmin
        && !sites.length
        && route.kind !== AdminRouteKind.CreateSite
        && route.kind !== AdminRouteKind.NotFound
      ) {
        currentSite = null;
        navigateAdmin('/admin/sites/new', true);

        return;
      }
      if (route.kind === AdminRouteKind.Home || route.kind === AdminRouteKind.Login) {
        const site = sites.find((item) => item.siteId === remembered) ?? sites[0];

        navigateAdmin(site ? sitePath(site.siteId) : authority.systemAdmin ? '/admin/sites/new' : '/admin/sites', true);

        return;
      }
      if (route.kind === AdminRouteKind.NotFound) {
        view = WorkspaceView.NotFound;

        return;
      }
      if (route.kind === AdminRouteKind.Sites || route.kind === AdminRouteKind.CreateSite) {
        currentSite = null;
        view = route.kind === AdminRouteKind.CreateSite && authority.systemAdmin
          ? WorkspaceView.CreateSite : WorkspaceView.Sites;

        return;
      }

      const site = sites.find((item) => item.siteId === route.siteId);

      if (!site) {
        currentSite = null;
        view = WorkspaceView.NotFound;

        return;
      }
      currentSite = site;

      const canAtSite = siteActionCheck(authority, site.siteId);
      const reachable = allSections.filter((item) => canOpenSection(canAtSite, item)
        || item === AdminSection.Addons && hasAddonActions(site.siteId));

      if (!reachable.length) {
        view = WorkspaceView.NoSiteAccess;

        return;
      }
      if (!reachable.includes(route.section ?? AdminSection.Pages)) {
        const next = reachable[0]!;

        navigateAdmin(sitePath(site.siteId) + (next === AdminSection.TemplateVariables ? '/template-variables'
          : next === AdminSection.Pages ? '' : '/' + next), true);

        return;
      }
      if (sectionPaths.get(AdminSection.Pages)?.startsWith(sitePath(site.siteId)) !== true) {
        sectionPaths.clear();
        pageBuffers.clear();
        pageDirty.clear();
        templateDirty = false;
        chunkDirty = false;
      }
      sectionPaths.set(route.section ?? AdminSection.Pages, currentAddress());

      if (!route.section) {
        lastPagePath = currentAddress();
      }
      pages = [];
      pageAvailability = null;
      editorialStates = [];
      selectedPage = null;
      editing = false;
      panel = WorkspacePanel.Tree;
      view = WorkspaceView.Site;
      loading = true;
      const [result] = await Promise.all([
        canAtSite('cms.pages.list') ? listPages(site.siteId) : Promise.resolve([]),
        refreshAvailability(site.siteId),
      ]);

      if (captured !== generation) {
        return;
      }
      if (result.some((page) => page.siteId !== site.siteId)) {
        throw new Error('Unexpected site scope');
      }
      pages = result;
      rememberSite(site.siteId);
      loading = false;

      pageLoading = Boolean(route.pageId);
      await selectPageRoute(route, captured);
    } catch (value) {
      if (captured === generation) {
        failure(value);
      }
    } finally {
      if (captured === generation) {
        loading = false;
        pageLoading = false;
      }
    }
  }

  async function selectPageRoute(route: IAdminRoute, captured: number): Promise<void> {
    const page = route.kind === AdminRouteKind.Page && route.pageId && route.siteId && can('cms.pages.read')
      ? await getPage(route.siteId, route.pageId) : null;

    if (captured !== generation) {
      return;
    }
    if (page && (page.siteId !== route.siteId || page.pageId !== route.pageId)) {
      throw new Error('Unexpected page scope');
    }
    editorKey = route.pageId ?? (route.virtualFolderPath ? 'new:' + route.virtualFolderPath : 'new');
    virtualFolderPath = route.kind === AdminRouteKind.CreatePage && can('cms.urls.materialize')
      ? route.virtualFolderPath ?? null : null;
    selectedPage = page;
    editing = route.kind === AdminRouteKind.CreatePage && can('cms.pages.create') || page !== null;
    await showPanel(editing || route.kind === AdminRouteKind.Page ? WorkspacePanel.Editor : WorkspacePanel.Tree);
  }

  async function showPanel(next: WorkspacePanel): Promise<void> {
    panel = next;
    await tick();

    if (!desktop) {
      (next === WorkspacePanel.Tree ? treeToggle : editorToggle)?.focus({ preventScroll: true });
    }
  }

  function openSite(site: IAdminSite): void {
    navigateTo(sitePath(site.siteId));
  }

  function openSection(next: AdminSection): void {
    if (currentSite) {
      const base = sitePath(currentSite.siteId);

      navigateTo(next === AdminSection.TemplateVariables ? base + '/template-variables'
        : next === AdminSection.Addons ? base + '/addons'
          : sectionPaths.get(next) ?? base + (next === AdminSection.Pages ? '' : '/' + next));
    }
  }

  function openPage(page: IAdminPage): void {
    if (currentSite) {
      navigateTo(sitePath(currentSite.siteId) + '/pages/' + page.pageId);
    }
  }

  function newPage(): void {
    if (currentSite) {
      navigateTo(sitePath(currentSite.siteId) + '/pages/new');
    }
  }

  function cancelPage(): void {
    if (currentSite) {
      pageBuffers.delete(currentSite.siteId + ':' + editorKey);
      pageDirty.delete(currentSite.siteId + ':' + editorKey);
      navigateTo(sitePath(currentSite.siteId));
    }
  }

  function saved(page: IAdminPage | null, published: boolean, completed: boolean): void {
    if (!currentSite) {
      return;
    }
    if (!page) {
      const key = currentSite.siteId + ':' + editorKey;

      pageBuffers.delete(key);
      pageDirty.delete(key);
      selectedPage = null;
      editing = false;
      notice = WorkspaceNotice.DraftSaved;
      error = ContentErrorMessage.Forbidden;

      return;
    }
    if (page.siteId !== currentSite.siteId) {
      return;
    }
    pages = pages.some((item) => item.pageId === page.pageId)
      ? pages.map((item) => item.pageId === page.pageId ? page : item) : [...pages, page];
    selectedPage = page;

    routingChanged();

    if (completed) {
      busy = true;
      notice = published ? WorkspaceNotice.PagePublished : WorkspaceNotice.DraftSaved;
      closeEditorTimer = setTimeout(() => {
        busy = false;
        notice = null;
        pageBuffers.delete(page.siteId + ':' + editorKey);
        pageDirty.delete(page.siteId + ':' + editorKey);
        navigateAdmin(sitePath(page.siteId), true);
      }, 1000);

      return;
    }

    const path = sitePath(page.siteId) + '/pages/' + page.pageId;

    if (window.location.pathname !== path) {
      preserveEditorPath = path;
      navigateAdmin(path, true);
    }
  }

  function created(site: IAdminSite): void {
    busy = false;
    rememberSite(site.siteId);
    navigateTo(sitePath(site.siteId));
  }

  async function moveTreePage(page: IAdminPage, parentPageId: string | null): Promise<void> {
    if (!currentSite || busy) {
      return;
    }
    busy = true;

    try {
      const moved = await movePage(currentSite.siteId, page, parentPageId);

      pages = pages.map((item) => item.pageId === moved.pageId ? moved : item);

      if (selectedPage?.pageId === moved.pageId) {
        selectedPage = { ...selectedPage, parentPageId: moved.parentPageId };
      }
    } catch (value) {
      if (value instanceof ContentRequestError && value.status === 401) {
        onUnauthorized();
      }
      throw value;
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    const route = $adminRoute;

    untrack(() => {
      void loadRoute(route);
    });
  });

  onMount(() => {
    const query = window.matchMedia('(min-width: 992px)');
    const update = (): void => {
      desktop = query.matches;
    };

    update();
    query.addEventListener('change', update);
    const beforeLeave = (event: BeforeUnloadEvent): void => {
      if (unsaved && !sessionEnded) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', beforeLeave);

    return () => {
      generation++;
      clearTimeout(closeEditorTimer);
      query.removeEventListener('change', update);
      window.removeEventListener('beforeunload', beforeLeave);
    };
  });
</script>

<div class="cms-shell">
  <header class="cms-header">
    <div class="_header-location">
      <a class="_cms-brand" href="/admin/sites" onclick={(event) => {
        event.preventDefault();

        if (!busy) {
          navigateTo('/admin/sites');
        }
      }}>
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M4 29h32M9 24a11 11 0 0 1 22 0M20 3v6M5 9l5 5M35 9l-5 5M1 21h5M34 21h5" />
        </svg><span>ZARYA</span>
      </a>
      <span class="_header-divider" aria-hidden="true">/</span>
      <button class="_sites-link" disabled={busy} onclick={() => {
        navigateTo('/admin/sites');
      }}>{$messages.allSites}</button>
      {#if currentSite && view === WorkspaceView.Site}
        <span class="_header-divider" aria-hidden="true">/</span>
        {#if siteLinkOrigin}
          <a class="_current-site" href={siteLinkOrigin} target="_blank" rel="noopener noreferrer"
            aria-label={currentSite.name + ' (' + ($messages.adminOpensInANewTab) + ')'} title={currentSite.name}>
            <span class="_current-site-name">{currentSite.name}</span>
            <svg class="_site-external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" aria-hidden="true">
              <path d="M15 3h6v6M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
            </svg>
          </a>
        {:else}
          <span class="_current-site" title={currentSite.name}>
            <span class="_current-site-name">{currentSite.name}</span>
          </span>
        {/if}
      {/if}

    </div>
    <div class="_header-preferences">
      <CmsBuildInfo />
      <LanguageSelect />
      <button class="cms-secondary cms-action-square" type="button" aria-label={signOutLabel}
        title={signOutLabel} disabled={busy || signingOut} aria-busy={signingOut} onclick={() => {
          void signOut();
        }}>
        <svg class="cms-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" />
        </svg>
      </button>
    </div>
  </header>
  {#if view === WorkspaceView.Loading}
    <main use:scrollShadow class="cms-overview" aria-label={$messages.administration}>
      {#if error}
        <p class="cms-error" role="alert">{$messages[error]}</p>
        <button class="cms-secondary" onclick={() => {
          navigateTo('/admin/sites');
        }}>{$messages.retryLoading}</button>
      {:else}<p class="cms-loading" role="status">{$messages.loadingSites}</p>{/if}
    </main>
  {:else if view === WorkspaceView.CreateSite}
    <main use:scrollShadow class="cms-overview" aria-label={$messages.administration}>
      <SiteCreation onCreated={created} {onUnauthorized} onCancel={() => {
        navigateTo('/admin/sites');
      }}
        onBusy={(value) => {
          busy = value;
        }}
        first={sites.length === 0} />
    </main>
  {:else if view === WorkspaceView.Sites}
    <main use:scrollShadow class="cms-overview" aria-label={$messages.administration}>
      <section class="sites-list" aria-labelledby="sites-heading">
        <div class="_sites-heading">
          <div>
            <span class="_setup-kicker">{$messages.yourProjects}</span><h1 id="sites-heading">{$messages.sites}</h1>
          </div>
          {#if authority.systemAdmin}
            <CreateButton label={$messages.createSite} onclick={() => {
              navigateTo('/admin/sites/new');
            }} />
          {/if}
        </div>
        <p class="_setup-description">{$messages.selectSite}</p>
        <ul class="_site-cards">
          {#each sites as site (site.siteId)}
            <li><button class="site-card" onclick={() => {
              openSite(site);
            }}>
              <span class="_site-initial" aria-hidden="true">{site.name.slice(0, 1).toUpperCase()}</span>
              <span class="_site-summary"><strong>{site.name}</strong><span>{site.primaryDomain}</span></span>
              {#if site.status === 'ARCHIVED'}<span class="cms-badge">{$messages.archived}</span>{/if}
              <span class="_site-chevron" aria-hidden="true">›</span>
            </button></li>
          {/each}
        </ul>
      </section>
    </main>
  {:else if view === WorkspaceView.NoSiteAccess}
    <main class="_workspace-scroll">
      <p role="status">{$messages.adminYourRoleCurrentlyHasNo}</p>
    </main>
  {:else if view === WorkspaceView.NotFound}
    <main use:scrollShadow class="cms-overview"><p class="cms-error" role="alert">{$messages.contentMissing}</p></main>
  {:else if currentSite}
    <nav bind:this={sectionNavigation} class="site-sections" aria-label={$messages.siteSections}>
      {#each sections as item (item)}
        <button class="_section-link" aria-current={section === item && !($adminRoute.addonKey) ? 'page' : undefined}
          disabled={busy} onclick={() => {
            openSection(item);
          }}>{$messages[item]}</button>
      {/each}
      {#each addonWorkspaces as workspace (workspace.addonKey)}
        <AddonMenuItem addonKey={workspace.addonKey} label={workspace.label} enabled={workspace.enabled}
          menuBadge={workspace.menuBadge} siteId={currentSite.siteId}
          selected={$adminRoute.addonKey === workspace.addonKey} disabled={busy} {badgeRevision} {onUnauthorized}
          onclick={() => {
            navigateTo(sitePath(currentSite!.siteId) + '/addons/' + workspace.addonKey);
          }} />
      {/each}
      {#each addonItems.filter((item) => item.definition?.adminMenu && item.connection
        && !addonWorkspaces.some((view) => view.addonKey === item.addonKey)
        && !item.adminScreenPermissionsMissing && can('cms.addons.read') && can('cms.addon-runtime.read-view')
        && can('cms.addon-runtime.read-asset')) as item (item.addonKey)}
        {@const menu = item.definition!.adminMenu!}
        {@const labels = item.connection?.adminMenuLabels}
        <AddonMenuItem addonKey={item.addonKey} label={{ en: labels?.en || menu.en, ru: labels?.ru || menu.ru }}
          enabled={item.connection?.status === 'Enabled'} menuBadge={item.menuBadge}
          siteId={currentSite.siteId} selected={$adminRoute.addonKey === item.addonKey}
          disabled={busy} {badgeRevision} {onUnauthorized} onclick={() => {
            navigateTo(sitePath(currentSite!.siteId) + '/addons/' + item.addonKey);
          }} />
      {/each}
    </nav>
    {#key currentSite.siteId}
      <JsonLdWorkspace {can} site={currentSite} active={section === AdminSection.JsonLd} {desktop} {onUnauthorized}
        requestedProfileId={$adminRoute.jsonLdProfileId ?? null} onBusy={(value) => {
          busy = value;
        }} onDirtyChange={(value) => {
          jsonLdDirty = value;
        }} />
      <HooksWorkspace {can} site={currentSite} route={$adminRoute} active={section === AdminSection.Hooks}
        {desktop} {timeZoneRevision} {onUnauthorized} onBusy={(value) => {
          busy = value;
        }}
        onDirtyChange={(value) => {
          hooksDirty = value;
        }} />
      {#if can('cms.addons.list') || hasAddonActions(currentSite.siteId)}
      <AddonsWorkspace {can} site={currentSite} systemAdmin={authority.systemAdmin}
        loadWorkspaces={hasAddonActions(currentSite.siteId)} onWorkspaces={(items) => {
          addonWorkspaces = items;
        }}
        siteAdmin={isSiteAdministrator(authority, currentSite.siteId)} {pages} route={acceptedAddonRoute}
        active={section === AdminSection.Addons} {onUnauthorized} {timeZoneRevision} navigate={navigateTo}
        onBadgeChange={() => {
          badgeRevision++;
        }}
        onItems={(items) => {
          addonItems = items;
        }} onBusy={(value) => {
          busy = value;
        }}
        onDirtyChange={(value) => {
          addonDirty = value;
        }} />
      {/if}
      <UrlsWorkspace {can} site={currentSite} route={$adminRoute} active={section === AdminSection.Urls}
        {desktop} {onUnauthorized} onBusy={(value) => {
          busy = value;
        }}
        onDirtyChange={(value) => {
          urlsDirty = value;
        }} onChanged={routingChanged} />
      <SettingsWorkspace {can} systemAdmin={authority.systemAdmin} onRebuilt={routingChanged}
        onAddressesChanged={routingChanged} onTimeZoneChanged={() => {
          timeZoneRevision++;
        }} site={currentSite} active={section === AdminSection.Settings} {onUnauthorized}
        onBusy={(value) => {
          busy = value;
        }} onDirtyChange={(value) => {
          settingsDirty = value;
        }} />
      <TemplateVariablesWorkspace {can} site={currentSite} active={section === AdminSection.TemplateVariables}
        {onUnauthorized} onBusy={(value) => {
          busy = value;
        }} onDirtyChange={(value) => {
          tvDirty = value;
        }} />
      <FilesWorkspace {can} site={currentSite} route={$adminRoute} active={section === AdminSection.Files}
        {desktop} {onUnauthorized}
        onBusy={(value) => {
          busy = value;
        }} />
      <SourceWorkspace {can} site={currentSite} kind={ElementKind.Snippet} route={$adminRoute}
        active={section === AdminSection.Snippets} {desktop} {onUnauthorized} onBusy={(value) => {
          busy = value;
        }} onDirtyChange={(value) => {
          snippetDirty = value;
        }} />
      <SourceWorkspace {can} site={currentSite} kind={ElementKind.Template} route={$adminRoute}
        active={section === AdminSection.Templates} {desktop} {onUnauthorized} onBusy={(value) => {
          busy = value;
        }}
        onDirtyChange={(value) => {
          templateDirty = value;
        }} />
      <SourceWorkspace {can} site={currentSite} kind={ElementKind.Chunk} route={$adminRoute}
        active={section === AdminSection.Chunks} {desktop} {onUnauthorized} onBusy={(value) => {
          busy = value;
        }}
        onDirtyChange={(value) => {
          chunkDirty = value;
        }} />
    {/key}
    <div class="site-viewport" hidden={section !== AdminSection.Pages || !canOpenSection(can, AdminSection.Pages)}>
      <div class="site-panels" class:site-panels__editor={panel === WorkspacePanel.Editor}>
        <aside id="page-drawer" class="page-drawer" aria-label={$messages.sitePages}
          inert={!desktop && panel !== WorkspacePanel.Tree} aria-hidden={!desktop && panel !== WorkspacePanel.Tree}>
          <div class="_drawer-heading">
            <div class="_drawer-context">
              <span class="_setup-kicker">{currentSite.primaryDomain}</span>
              <button class="cms-circle" aria-label={$messages.openWorkspace} aria-controls="page-workspace"
                disabled={busy}
                bind:this={treeToggle} onclick={() => {
                  void showPanel(WorkspacePanel.Editor);
                }}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            </div>
            <div class="_drawer-title-row">
              <h2>{$messages.pages}</h2>
              {#if can('cms.pages.create')}
                <CreateButton label={!readPages || pages.some((page) => !page.systemDocument)
                  ? $messages.createPage : $messages.createHome}
                  disabled={busy || pageLoading || loading || error !== null} onclick={newPage} />
              {/if}
            </div>
            {#if readPages}
              <Checkbox checked={hideSystem} onCheckedChange={setHideSystem}>{$messages.hideSystemPages}</Checkbox>
            {/if}
          </div>
          {#if readPages}<div use:scrollShadow class="_tree-scroll">
            {#if pages.length}
              {#key currentSite.siteId}
                <PageTree {pages} {hideSystem} {editorialStates} availability={pageAvailability}
                  selectedId={selectedPage?.pageId ?? null}
                  disabled={busy || pageLoading}
                  onSelect={can('cms.pages.read') ? openPage : undefined}
                  onMove={can('cms.pages.set-position') ? moveTreePage : undefined} />
                {#if availabilityError}
                  <p class="cms-error" role="alert">{$messages.pageAvailabilityFailed}</p>
                  <RefreshButton onclick={() => {
                    if (currentSite) {
                      void refreshAvailability(currentSite.siteId);
                    }
                  }} />
                {/if}
              {/key}
            {/if}
            {#if loading && !pages.length}<p class="cms-loading" role="status">{$messages.loadingPages}</p>
            {:else if error && !pages.length}
              <p class="cms-error" role="alert">{$messages[error]}</p>
              <RefreshButton onclick={() => {
                if (currentSite) {
                  void loadRoute($adminRoute);
                }
              }} />
            {/if}
          </div>{/if}
          <div class="_drawer-footer"><span class="_site-live-dot" aria-hidden="true"></span>{currentSite.name}</div>
        </aside>
        <main id="page-workspace" class="page-workspace" aria-label={$messages.workspace} aria-busy={pageLoading}
          inert={!desktop && panel !== WorkspacePanel.Editor} aria-hidden={!desktop && panel !== WorkspacePanel.Editor}>
          {#snippet workspaceToolbar()}
            <div class="_workspace-toolbar" class:_workspace-toolbar__inline={editing}>
              <button class="cms-circle" aria-label={$messages.openPageTree} aria-controls="page-drawer"
                disabled={busy}
                bind:this={editorToggle} onclick={() => {
                  void showPanel(WorkspacePanel.Tree);
                }}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              </button>
              <h1 class="_workspace-title" id="page-editor-title" title={selectedPage?.title}>
                {pageLoading ? $messages.loadingPage
                  : editing ? selectedPage?.title ?? (!readPages || pages.some((page) => !page.systemDocument)
                    ? $messages.createPageHeading : $messages.createHomeHeading) : $messages.pages}
              </h1>

            </div>
          {/snippet}
          {#if !editing}{@render workspaceToolbar()}{/if}
          {#if notice}<p class="cms-success" role="status">{$messages[notice]}</p>{/if}
          {#if error && (pages.length || $adminRoute.kind === AdminRouteKind.Page)}
            <div class="_page-load-error" role="alert">
              <span class="cms-error">{$messages[error]}</span>
              <RefreshButton disabled={busy || pageLoading} onclick={() => {
                void loadRoute($adminRoute);
              }} />
            </div>
          {/if}
          {#if editing}
            {#key currentSite.siteId + ':' + editorKey}
              <PageEditor {can} site={currentSite} pages={readPages ? pages : []} page={selectedPage}
                first={readPages && !pages.some((page) => !page.systemDocument)}
                {virtualFolderPath} onUrlCreated={async () => {
                  if (currentSite) {
                    routingChanged();

                    if (readPages) {
                      pages = await listPages(currentSite.siteId);
                    }
                  }
                }}
                {pageAvailability} onOpenPage={openPage}
                {routingRevision}
                onOpenUrl={(pageId) => {
                  if (currentSite) {
                    navigateTo(sitePath(currentSite.siteId) + '/urls/-/page/' + pageId);
                  }
                }}
                toolbar={workspaceToolbar}
                buffer={pageBuffers.get(currentSite.siteId + ':' + editorKey)}
                onBuffer={(buffer) => {
                  if (currentSite) {
                    const key = currentSite.siteId + ':' + editorKey;

                    if (JSON.stringify(pageBuffers.get(key)) !== JSON.stringify(buffer)) {
                      pageBuffers.set(key, buffer);
                    }
                  }
                }} onDirtyChange={(dirty) => {
                  if (currentSite) {
                    pageDirty.set(currentSite.siteId + ':' + editorKey, dirty);
                  }
                }} onOpenTemplate={(id) => {
                  if (currentSite) {
                    navigateTo(sitePath(currentSite.siteId) + '/templates/' + id);
                  }
                }}
                onSaved={saved} onCancel={cancelPage} {onUnauthorized} onBusy={(value) => {
                  busy = value;

                  if (value) {
                    notice = null;
                  }
                }} />
            {/key}
          {:else}
            <div use:scrollShadow class="_workspace-scroll">
              <div class="workspace-welcome">
                <div class="_welcome-icon" aria-hidden="true">↖</div>
                {#if needsPageRead}
                  <p role="status">{$messages.pageReadPermissionRequired}</p>
                {:else if readPages}
                  <p>{pages.length ? $messages.selectPage : $messages.startWithHome}</p>
                  <p>{pages.length ? $messages.selectPageHint : $messages.startWithHomeHint}</p>
                {:else if can('cms.pages.create')}
                  <p>{$messages.createPageHeading}</p>
                  <p>{$messages.startWithHomeHint}</p>
                {/if}
              </div>
            </div>
          {/if}
          {#if busy && editing && !notice}
            <div class="page-saving-overlay" role="status">
              <span class="_saving-spinner" aria-hidden="true"></span>
              <span>{$messages.saving}</span>
            </div>
          {/if}
        </main>
      </div>
    </div>
  {/if}
</div>
