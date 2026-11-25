<script lang="ts">
  import type { IAddonAdminHost, IAddonConfiguration, IAddonFilePickerOptions } from '@zarya/addon-contracts/addons';
  import { onDestroy, onMount, untrack } from 'svelte';

  import { type IAdminRoute, sitePath } from '../../app/admin-route';
  import { adminLanguage, adminLocales, type AdminMessageKey, messages } from '../../i18n/i18n';
  import type { IAdminPage, IAdminSite } from '../../shared/api/content.types';
  import { ContentRequestError, object, request, string } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { showSnackBar, SnackBarVariant } from '../../shared/ui/snack-bar';
  import type { CanUseAction } from '../access/site-actions';
  import { MediaRoot } from '../files/files.types';
  import ImageLibraryDialog from '../files/ImageLibraryDialog.svelte';
  import { getSiteTimeZone } from '../urls/urls-api';
  import { addonAdminComponents } from './addon-components';
  import {
    AddonUpdatePhase, addonUpdateStorageKey, applyAddonUpdate, checkRepositoryAddonUpdate, getAddonUpdate,
    type IAddonUpdate, prepareAddonUpdate,
  } from './addon-updates-api';
  import AddonLoadingOverlay from './AddonLoadingOverlay.svelte';
  import {
    AddonInstallationStatus, type IAddonEntry, type IAddonInstallationSummary, type IAddonWorkspace,
    installAddonRepository, listAddonInstallations, listAddonWorkspaces, listSiteAddons, readAddonConfiguration,
  } from './addons-api';
  import AddonUpdatesPanel from './AddonUpdatesPanel.svelte';
  import RuntimeAddon from './RuntimeAddon.svelte';

  let { can, site, pages, route, active, systemAdmin, siteAdmin, timeZoneRevision, onUnauthorized, onItems, onBusy,
    loadWorkspaces, onWorkspaces,
    onDirtyChange, navigate, onBadgeChange }: {
    can: CanUseAction;
    site: IAdminSite;
    pages: readonly IAdminPage[];
    route: IAdminRoute;
    active: boolean;
    systemAdmin: boolean;
    siteAdmin: boolean;
    loadWorkspaces: boolean;
    onWorkspaces: (items: readonly IAddonWorkspace[]) => void;
    timeZoneRevision: number;
    onUnauthorized: () => void;
    onItems: (items: readonly IAddonEntry[]) => void;
    onBusy: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
    onBadgeChange: () => void;
    navigate: (path: string) => void;
  } = $props();
  const addonLanguage = $derived(adminLocales[$adminLanguage].addonLanguage);
  let items = $state<readonly IAddonEntry[]>([]);
  let workspaces = $state<readonly IAddonWorkspace[]>([]);
  let installations = $state<readonly IAddonInstallationSummary[]>([]);
  let repositoryUrl = $state('');
  let fileAddonKey = $state('');
  let linkAddonKey = $state('');
  let linkRepositoryUrl = $state('');
  let linkError = $state<AdminMessageKey | ''>('');
  let repositoryUpdates = $state<Record<string, { update?: IAddonUpdate; message?: AdminMessageKey }>>({});
  let installationError = $state('');
  let loading = $state(true);
  let operation = $state<{ addonKey: string | null; label: AdminMessageKey } | null>(null);
  const busy = $derived(operation !== null);
  let recoveringUpdate = $state(false);
  const catalogLoading = $derived((loading || recoveringUpdate) && !busy);
  let configurationRequests = $state(0);
  let error = $state(false);
  let timeZone = $state('UTC');
  let addonTimeZone = $state<string | null>(null);
  let connection = $state<{ version: string; configuration: IAddonConfiguration } | null>(null);
  let componentLoading = $state(false);
  let runtime = $state<{ base: string; entry: string; styles: string[] } | null>(null);
  let filePicker = $state<{ siteId: string;
    addonKey: string;
    options: IAddonFilePickerOptions;
    settle: (fileId: string | null) => void } | null>(null);
  let disposed = false;
  onDestroy(() => {
    disposed = true;
    loadGeneration++;
    closeFilePicker(null);
  });
  let selectedKey = '';
  let loadGeneration = 0;
  const selected = $derived(items.find((item) => item.addonKey === route.addonKey));
  const workspace = $derived(workspaces.find((item) => item.addonKey === route.addonKey));
  const query = $derived(new URLSearchParams(route.addonLocation));
  const requestedView = $derived(query.get('view'));
  const boundView = $derived(workspace && (requestedView === null || workspace.views.includes(requestedView))
    ? workspace : undefined);
  const boundRuntime = $derived(boundView ? {
    base: '/api/admin/sites/' + site.siteId + '/addon-workspaces/' + boundView.addonKey + '/' + boundView.digest,
    entry: boundView.entry,
    styles: boundView.styles,
  } : undefined);
  const canOpenScreen = $derived(siteAdmin && can('cms.addons.read')
    && can('cms.addon-runtime.read-view') && can('cms.addon-runtime.read-asset'));
  const component = $derived(canOpenScreen && selected?.definition?.adminComponentId
    ? addonAdminComponents.get(selected.definition.adminComponentId)?.() : undefined);
  const failureMessage = $derived($messages.addonsTheOperationFailedRefreshAnd);

  function failure(value: unknown): void {
    if (disposed) {
      return;
    }
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = true;
    }
  }

  async function reload(): Promise<void> {
    loading = true;
    error = false;

    try {
      const [result, packages, views] = await Promise.all([
        can('cms.addons.list') ? listSiteAddons(site.siteId) : Promise.resolve([]),
        systemAdmin ? listAddonInstallations(site.siteId) : Promise.resolve([]),
        loadWorkspaces ? listAddonWorkspaces(site.siteId) : Promise.resolve({ items: [], timeZone: null }),
      ]);

      if (!disposed) {
        items = result;
        installations = packages;
        onItems(items);
        workspaces = views.items;
        addonTimeZone = views.timeZone;
        onWorkspaces(workspaces);
      }
    } catch (value) {
      failure(value);
    } finally {
      loading = false;
    }
  }

  async function loadConnection(key: string): Promise<void> {
    const captured = ++loadGeneration;

    componentLoading = true;
    connection = null;
    runtime = null;
    error = false;

    try {
      const result = object(await request('/' + site.siteId + '/addons/' + key));
      const row = result.connection === null ? null : object(result.connection);
      const configuration = row ? readAddonConfiguration(row.configuration) : null;
      const response = await request('/' + site.siteId + '/addon-runtime/' + key);
      const view = response === null ? null : object(response);
      const loaded = !view || view.entry === null ? null : {
        base: '/api/admin/sites/' + site.siteId + '/addon-runtime/' + key + '/' + string(view.digest),
        entry: string(view.entry),
        styles: Array.isArray(view.styles) ? view.styles.map(string) : [],
      };

      if (captured === loadGeneration) {
        runtime = loaded;
        connection = row && configuration ? {
          version: string(row.version),
          configuration,
        } : null;
      }
    } catch (value) {
      if (captured === loadGeneration) {
        failure(value);
      }
    } finally {
      if (captured === loadGeneration) {
        componentLoading = false;
      }
    }
  }

  function startOperation(label: AdminMessageKey, addonKey: string | null): void {
    operation = { addonKey, label };
    onBusy(true);
  }

  function finishOperation(): void {
    operation = null;
    onBusy(false);
  }

  async function toggle(item: IAddonEntry): Promise<void> {
    if (busy) {
      return;
    }

    const enabled = item.connection?.status === 'Enabled';

    startOperation(enabled ? 'addonsDisabling' : 'addonsEnabling', item.addonKey);
    error = false;

    try {
      let configuration: unknown = { schemaVersion: item.definition?.configurationSchemaVersion, values: {} };

      if (!enabled && item.connection) {
        const saved = object(await request('/' + site.siteId + '/addons/' + item.addonKey));

        configuration = object(saved.connection).configuration;
      }
      await request('/' + site.siteId + '/addons/' + item.addonKey + (enabled ? '/disable' : '/enable'), {
        expectedVersion: item.connection?.version ?? null,
        ...(enabled ? {} : { configuration }),
      });
      await reload();
    } catch (value) {
      await reload();
      failure(value);
    } finally {
      finishOperation();
    }
  }

  async function installRepository(value = repositoryUrl,
    target?: { readonly addonKey: string; readonly link: boolean }): Promise<void> {
    if (busy) {
      return;
    }

    const installedAddonKey = target?.link ? target.addonKey : undefined;

    startOperation(installedAddonKey ? 'addonsConnectingSource' : 'addonsDownloadingAndInstalling',
      target?.addonKey ?? null);
    installationError = '';
    linkError = '';

    try {
      await installAddonRepository(site.siteId, value.trim(), installedAddonKey);
      await reload();

      if (installedAddonKey) {
        linkAddonKey = '';
      } else {
        repositoryUrl = '';
      }
      showSnackBar($messages[installedAddonKey ? 'addonsSourceConnected' : 'addonsTheAddOnIsInstalled'],
        SnackBarVariant.Success);
    } catch (value) {
      await reload();
      const status = value instanceof ContentRequestError ? value.status : 0;

      if (status === 401) {
        onUnauthorized();
      } else {
        const message = status === 404
          ? 'addonsTheRepositoryOrStableRelease'
          : status === 409
            ? installedAddonKey ? 'addonsSourcePackageMismatch' : 'addonsAnotherInstallationIsRunningOr'
            : status === 400 ? 'addonsCheckTheURLReleasePackage' : 'addonsInstallationFailedCheckTheConnection';

        if (installedAddonKey) {
          linkError = message;
        } else {
          installationError = $messages[message];
        }
      }
    } finally {
      finishOperation();
    }
  }

  async function runUpdate(addonKey: string, label: AdminMessageKey, work: () => Promise<IAddonUpdate | null>,
    failureMessage: (status: number) => AdminMessageKey): Promise<void> {
    if (busy) {
      return;
    }
    startOperation(label, addonKey);

    if (repositoryUpdates[addonKey]) {
      delete repositoryUpdates[addonKey].message;
    }

    try {
      const update = await work();

      if (update) {
        if (update.addonKey !== addonKey) {
          repositoryUpdates[addonKey] = { message: 'addonsFilePackageMismatch' };
        } else if (update.phase === AddonUpdatePhase.Completed) {
          if (localStorage.getItem(addonUpdateStorageKey) === update.updateId) {
            localStorage.removeItem(addonUpdateStorageKey);
          }
          delete repositoryUpdates[addonKey];
          fileAddonKey = '';
          await reload();
          showSnackBar($messages.addonsRepositoryUpdated, SnackBarVariant.Success);
        } else {
          repositoryUpdates[addonKey] = { update };
          fileAddonKey = '';
        }
      }
    } catch (value) {
      const status = value instanceof ContentRequestError ? value.status : 0;

      if (status === 401) {
        onUnauthorized();
      } else {
        if (status === 409) {
          await reload();
        }
        repositoryUpdates[addonKey] = { ...repositoryUpdates[addonKey], message: failureMessage(status) };
      }
    } finally {
      finishOperation();
    }
  }

  async function checkRepository(addonKey: string): Promise<void> {
    await runUpdate(addonKey, 'addonsCheckingUpdates', async () => {
      const result = await checkRepositoryAddonUpdate(addonKey);

      if (result.status === 'Available') {
        return result.update;
      }
      if (result.status === 'NoRepository') {
        await reload();
      }
      repositoryUpdates[addonKey] = {
        message: result.status === 'Current' ? 'addonsAlreadyCurrent' : 'addonsNoRepository',
      };

      return null;
    }, status => status === 400 ? 'addonsUpdatePackageInvalid'
      : status === 404 ? 'addonsTheRepositoryOrStableRelease' : 'addonsUpdateCheckFailed');
  }

  async function applyUpdate(update: IAddonUpdate): Promise<void> {
    await runUpdate(update.addonKey, 'addonsApplyingUpdate', async () => {
      localStorage.setItem(addonUpdateStorageKey, update.updateId);

      try {
        return await applyAddonUpdate(update.updateId);
      } catch (error) {
        if (error instanceof ContentRequestError && (error.status === 401 || error.status === 403)) {
          throw error;
        }

        const status = await getAddonUpdate(update.updateId).catch(() => null);

        if (!status || status.phase === AddonUpdatePhase.Prepared) {
          throw error;
        }

        return status;
      }
    }, () => 'addonsRepositoryUpdateFailed');
  }

  onMount(() => {
    if (!systemAdmin) {
      return;
    }

    const identity = localStorage.getItem(addonUpdateStorageKey);

    if (identity) {
      recoveringUpdate = true;
      void getAddonUpdate(identity).then((update) => {
        if (update.phase === AddonUpdatePhase.Completed) {
          if (localStorage.getItem(addonUpdateStorageKey) === identity) {
            localStorage.removeItem(addonUpdateStorageKey);
          }
        } else if (!disposed && !repositoryUpdates[update.addonKey]) {
          repositoryUpdates[update.addonKey] = { update };
        }
      }).catch((value: unknown) => {
        if (value instanceof ContentRequestError && value.status === 404) {
          localStorage.removeItem(addonUpdateStorageKey);
        } else if (!disposed) {
          failure(value);
        }
      }).finally(() => {
        recoveringUpdate = false;
      });
    }
  });

  async function addonRequest(path: string, body?: unknown, idempotencyKey?: string): Promise<unknown> {
    if (!/^\/[a-z][a-z0-9-]*(?:\/[A-Za-z0-9_-]+)*(?:\?[A-Za-z0-9%=&_.~+-]*)?$/.test(path)) {
      throw new Error('Unregistered add-on route');
    }

    try {
      const selectedAddon = selected;
      const result = await request('/' + site.siteId + path, body, 15000, idempotencyKey);

      if (!disposed && body !== undefined && (boundView?.menuBadge || selectedAddon?.menuBadge)) {
        onBadgeChange();
      }

      return result;
    } catch (value) {
      if (value instanceof ContentRequestError && value.status === 401) {
        onUnauthorized();
      }
      throw value;
    }
  }

  async function configure(configuration: IAddonConfiguration): Promise<void> {
    if (!connection || !selected) {
      throw new Error('Missing add-on connection');
    }

    configurationRequests++;

    try {
      const result = object(await request('/' + site.siteId + '/addons/' + selected.addonKey + '/configuration', {
        expectedVersion: connection.version,
        configuration,
      }));
      const saved = object(result.connection ?? result);

      connection = { version: string(saved.version), configuration };
      await reload();
    } finally {
      configurationRequests--;
    }
  }

  function closeFilePicker(fileId: string | null): void {
    const current = filePicker;

    filePicker = null;
    current?.settle(fileId);
  }

  function pickFile(options: IAddonFilePickerOptions = {}): Promise<string | null> {
    const addonKey = route.addonKey;

    if (!active || !addonKey || filePicker || !can('cms.files.list')) {
      return Promise.resolve(null);
    }

    return new Promise((settle) => {
      filePicker = { siteId: site.siteId, addonKey, options, settle };
    });
  }

  $effect(() => {
    if (filePicker && (!active || route.addonKey !== filePicker.addonKey || site.siteId !== filePicker.siteId)) {
      closeFilePicker(null);
    }
  });

  const host: IAddonAdminHost = $derived({
    siteId: site.siteId,
    language: addonLanguage,
    timeZone: addonTimeZone ?? timeZone,
    location: boundView && requestedView === null && boundView.views[0] !== 'main'
      ? '?' + new URLSearchParams([...query, ['view', boundView.views[0]!]]).toString() : route.addonLocation ?? '',
    configuration: connection?.configuration ?? { schemaVersion: 1, values: {} },
    enabled: boundView?.enabled ?? selected?.connection?.status === 'Enabled',
    can: (actionId) => boundView?.actionIds.includes(actionId) === true || siteAdmin && can(actionId),
    pages: pages.map((page) => ({
      pageId: page.pageId,
      title: page.title,
      systemDocument: page.systemDocument ?? null,
    })),
    request: addonRequest,
    navigate: (query: string) => {
      if (route.addonKey && (query === '' || query.startsWith('?')) && query.length <= 2048) {
        navigate(sitePath(site.siteId) + '/addons/' + route.addonKey + query);
      }
    },
    configure,
    scrollShadow,
    setDirty: onDirtyChange,
    setBusy: onBusy,
    pickFile,
  });

  $effect(() => {
    untrack(() => {
      void reload();
    });
  });
  $effect(() => {
    const revision = timeZoneRevision;

    untrack(() => {
      if (!can('cms.site-settings.read')) {
        return;
      }
      void getSiteTimeZone(site.siteId).then((zone) => {
        if (!disposed) {
          timeZone = zone;
        }
      }).catch(failure);
      void revision;
    });
  });
  $effect(() => {
    const key = route.addonKey ?? '';

    if (key !== selectedKey) {
      selectedKey = key;
      untrack(() => {
        if (key && canOpenScreen) {
          void loadConnection(key);
        }
      });
    }
  });
</script>

{#if filePicker}
  <ImageLibraryDialog siteId={filePicker.siteId} selectedFileId={filePicker.options.selectedFileId ?? ''}
    root={filePicker.options.root === 'files' ? MediaRoot.Files : MediaRoot.Images}
    startFolder={filePicker.options.folderId ?? null} mimeTypes={filePicker.options.mimeTypes}
    canReadContent={can('cms.files.read-content')} allowUpload={filePicker.options.allowUpload === true
      && can('cms.files.upload')} onSelect={(file) => closeFilePicker(file.fileId)}
    onClose={() => closeFilePicker(null)} {onUnauthorized} />
{/if}

<section class="addons-workspace" hidden={!active}>
  {#if !route.addonKey}
    <header class="_workspace-toolbar">
      <h1 class="_workspace-title">{$messages.addons}</h1>
      {#if catalogLoading}
        <AddonLoadingOverlay label={loading ? 'addonsLoadingCatalog' : 'addonsCheckingUpdateStatus'} inline />
      {/if}
      <RefreshButton disabled={loading || busy || recoveringUpdate} onclick={() => {
        void reload();
      }} />
    </header>
  {/if}
  <div use:scrollShadow class="_addon-scroll _workspace-scroll" class:_addon-scroll__component={!!route.addonKey}>
    {#if error}<p class="cms-error" role="alert">{failureMessage}</p>{/if}
    {#if !route.addonKey}
      {#if systemAdmin}
      <div class="_addon-install _addon-loading-region">
      <form aria-busy={operation?.addonKey === null} onsubmit={(event) => {
        event.preventDefault();

        if (!busy && !loading) {
          void installRepository();
        }
      }}>
        <label for="addon-repository">{$messages.addonsGitHubRepository}</label>
        <div class="_addon-install-controls">
          <input id="addon-repository" type="url" required maxlength="2048" bind:value={repositoryUrl}
            disabled={busy} placeholder="https://github.com/owner/addon" aria-describedby="addon-install-help" />
          <button class="cms-primary" type="submit" disabled={busy || loading || !repositoryUrl.trim()}>
            {$messages.addonsInstall}
          </button>
        </div>
        <p id="addon-install-help">{$messages.addonsLatestStableReleaseTheAdd}
        </p>
        {#if installationError}
          <p class="cms-error" role="alert">{installationError}</p>
        {/if}
      </form>
      {#if operation?.addonKey === null}<AddonLoadingOverlay label={operation.label} />{/if}
      </div>
      {/if}
      {#each installations.filter((item) => item.status === AddonInstallationStatus.Pending)
        as pending (pending.addonKey)}
        <div class="cms-callout _addon-loading-region">
          <p>{$messages.addonsInstallationIsIncomplete}
            {pending.addonKey} · {pending.releaseTag}</p>
          <button class="cms-secondary" disabled={busy || loading} onclick={() => {
            void installRepository(pending.repositoryUrl, { addonKey: pending.addonKey, link: false });
          }}>{$messages.addonsRetryInstallation}</button>
          {#if operation?.addonKey === pending.addonKey && !items.some(item => item.addonKey === pending.addonKey
            && item.definition)}
            <AddonLoadingOverlay label={operation.label} />
          {/if}
        </div>
      {/each}
      {#if !loading && !items.filter((item) => item.definition).length}
        <p role="status">{$messages.addonsNoAddOnsAreInstalled}</p>
      {/if}
      {#each items.filter((item) => item.definition) as item (item.addonKey)}
        {@const installation = installations.find((entry) => entry.addonKey === item.addonKey)}
        {@const repositoryUpdate = repositoryUpdates[item.addonKey]}
        {@const candidate = repositoryUpdate?.update}
        {@const update = candidate && (candidate.phase !== AddonUpdatePhase.Prepared
          || candidate.fromVersion === item.definition?.implementationVersion) ? candidate : undefined}
        {@const connected = installation?.status === AddonInstallationStatus.Installed}
        {@const cardOperation = operation?.addonKey === item.addonKey ? operation : null}
        <article class="cms-card _addon-card _addon-loading-region">
          <div><h2>{item.definition?.name[addonLanguage]}</h2>
            <p>{item.definition?.description[addonLanguage]}</p>
            {#if siteAdmin && item.adminScreenPermissionsMissing}
              <p>{$messages.addonsAdminScreenPermissionsMissing}</p>
            {/if}
            <p aria-live="polite">{$messages.addonsVersion} {item.definition?.implementationVersion}{#if update}.
              {$messages.addonsUpdateAvailable} {update.toVersion}{/if}</p>
            {#if connected && installation}
              <p>{$messages.addonsUpdateSource} <a href={installation.repositoryUrl} target="_blank" rel="noreferrer">
                {installation.repositoryUrl.replace('https://github.com/', '')}</a></p>
            {:else if systemAdmin}
              <p>{$messages.addonsSourceNotConnected}</p>
            {/if}
            {#if repositoryUpdate?.message}
              <p role="status">{$messages[repositoryUpdate.message]}</p>
            {/if}
            <span class="cms-badge">{item.connection?.status === 'Enabled' ? ($messages.addonsEnabled)
              : ($messages.addonsDisabled)}</span></div>
          <div class="_addon-actions" aria-busy={!!cardOperation}>
            {#if systemAdmin && can('cms.addons.check-update')}
              {#if connected}
                <button type="button" class="cms-secondary" disabled={busy || loading || !!update} onclick={() => {
                  void checkRepository(item.addonKey);
                }}>{$messages.addonsCheckUpdates}</button>
              {:else if !installation}
                <button type="button" class="cms-secondary" disabled={busy || loading} onclick={() => {
                  linkAddonKey = item.addonKey;
                  linkRepositoryUrl = '';
                  linkError = '';
                  fileAddonKey = '';
                }}>{$messages.addonsConnectGitHub}</button>
              {/if}
              <button type="button" class="cms-secondary" disabled={busy || loading} onclick={() => {
                fileAddonKey = item.addonKey;
                linkAddonKey = '';
              }}>{$messages.addonsUpdateFromFile}</button>
            {/if}
            {#if canOpenScreen}
            <button class="cms-secondary" disabled={busy || !item.connection} onclick={() => {
              navigate(sitePath(site.siteId) + '/addons/' + item.addonKey + '?view=settings');
            }}>{$messages.settings}</button>{/if}
            {#if can(item.connection?.status === 'Enabled' ? 'cms.addons.disable' : 'cms.addons.enable')}
            <button class="cms-secondary" disabled={busy} onclick={() => {
              void toggle(item);
            }}>
              {item.connection?.status === 'Enabled' ? ($messages.addonsDisable) : ($messages.addonsEnable)}
            </button>{/if}
          </div>
          {#if linkAddonKey === item.addonKey && !connected}
            <form class="_addon-card-form" onsubmit={(event) => {
              event.preventDefault();

              if (!busy && linkRepositoryUrl.trim()) {
                void installRepository(linkRepositoryUrl, { addonKey: item.addonKey, link: true });
              }
            }}>
              <label for={'addon-source-' + item.addonKey}>{$messages.addonsGitHubRepository}</label>
              <p>{$messages.addonsLinkExactPackage}</p>
              <div class="_addon-install-controls">
                <input id={'addon-source-' + item.addonKey} type="url" required maxlength="2048"
                  bind:value={linkRepositoryUrl} disabled={busy} placeholder="https://github.com/owner/addon" />
                <button type="submit" class="cms-primary" disabled={busy || !linkRepositoryUrl.trim()}>
                  {$messages.addonsConnectSource}
                </button>
                <button type="button" class="cms-secondary" disabled={busy} onclick={() => {
                  linkAddonKey = '';
                }}>{$messages.cancel}</button>
              </div>
              {#if linkError}<p role="alert" class="cms-error">{$messages[linkError]}</p>{/if}
            </form>
          {/if}
          {#if systemAdmin && can('cms.addons.check-update') && (fileAddonKey === item.addonKey || update)}
            <div class="_addon-card-form">
              <AddonUpdatesPanel addonKey={item.addonKey} disabled={busy || loading}
                showFile={fileAddonKey === item.addonKey} {update}
                onPrepare={(file) => runUpdate(item.addonKey, 'addonsCheckingPackage', () => prepareAddonUpdate(file),
                  () => 'addonUpdatesPanelTheCommandFailedCheckUpdate')}
                onApply={applyUpdate}
                onStatus={(current) => runUpdate(item.addonKey, 'addonsCheckingUpdateStatus',
                  () => getAddonUpdate(current.updateId),
                  () => 'addonUpdatesPanelTheCommandFailedCheckUpdate')}
                onCancel={() => {
                  fileAddonKey = '';
                }} />
            </div>
          {/if}
          {#if cardOperation}<AddonLoadingOverlay label={cardOperation.label} />{/if}
        </article>
      {/each}
    {:else if boundRuntime}
      {#key boundRuntime.base}<RuntimeAddon {...boundRuntime} {host} />{/key}
    {:else if workspace && requestedView !== 'settings' || !canOpenScreen}
      {#if !loading}<p role="status">{$messages.addonsAdminScreenUnavailable}</p>{/if}
    {:else if !componentLoading && (!loading || !!connection)}
      {#if selected?.connection && (component || runtime) && connection}
        {#if selected.connection.status !== 'Enabled'}
          <p class="cms-callout" role="status">{$messages.addonsTheAddOnIsDisabled}</p>
        {/if}
        {#if runtime}
          <RuntimeAddon {...runtime} {host} />
        {:else if component}
        {#await component}
          <AddonLoadingOverlay label="addonsLoadingScreen" />
        {:then module}<module.default {host} />
        {:catch}<p class="cms-error" role="alert">{failureMessage}</p>{/await}
        {/if}
      {:else if !error}
        <p role="status">{$messages.addonsTheAddOnIsUnavailable}</p>
      {/if}
    {/if}
    {#if route.addonKey}
      {#if configurationRequests}<AddonLoadingOverlay label="addonsSavingSettings" />
      {:else if !boundRuntime && (loading || componentLoading)}
        <AddonLoadingOverlay label="addonsLoadingScreen" />
      {/if}
    {/if}
  </div>
</section>

<style>
  .addons-workspace { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
  .addons-workspace[hidden] { display: none; }
  ._addon-scroll__component { position: relative; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
  ._addon-loading-region { position: relative; }
  ._addon-card { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  ._addon-card-form { flex: 1 0 100%; min-width: 0; }
  ._addon-card-form .cms-error { color: var(--cms-danger); }
  ._addon-card h2 { margin: 0; font-size: 18px; }
  ._addon-card p { font-size: 14px; color: var(--cms-muted); }
  ._addon-install { max-width: 800px; margin-bottom: 24px; }
  ._addon-install label { display: block; margin-bottom: 8px; }
  ._addon-install-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  ._addon-install-controls input { flex: 1; min-width: 180px; max-width: 100%; }
  ._addon-install p { font-size: 14px; color: var(--cms-muted); }
  ._addon-install .cms-error { color: var(--cms-danger); }
  ._addon-actions { display: flex; flex-wrap: wrap; align-self: flex-start; align-items: flex-start; gap: 8px; }
  .addons-workspace:has(> :global(._addon-scroll[data-scrolled="true"])) > :global(._workspace-toolbar) {
    box-shadow: 0 4px 8px #252d2720;
  }
</style>
