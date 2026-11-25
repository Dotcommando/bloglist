<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteURL } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import type { IAdminSite } from '../../shared/api/content.types';
  import { contentError, ContentErrorMessage, ContentRequestError, publishSite } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import AccessSettings from '../access/AccessSettings.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import type { ICalibrationRecommendation } from '../calibration/calibration.types';
  import CalibrationHistory from '../calibration/CalibrationHistory.svelte';
  import CalibrationWorkspace from '../calibration/CalibrationWorkspace.svelte';
  import CpuUsageWorkspace from '../cpu/CpuUsageWorkspace.svelte';
  import DeploymentWorkspace from '../deployment/DeploymentWorkspace.svelte';
  import DumpsWorkspace from '../dumps/DumpsWorkspace.svelte';
  import {
    defaultMediaPageSize, isMediaPageSize, type MediaPageSize, mediaPageSizes, readMediaPageSize, setMediaPageSize,
  } from '../files/media-page-size';
  import type PageResolutionsComponent from '../page-statistics/PageResolutionsWorkspace.svelte';
  import ResourceSettings from '../resources/ResourceSettings.svelte';
  import type { ISiteAddresses } from '../urls/urls.types';
  import { servingSiteOrigin, SiteOriginMode } from '../urls/urls.types';
  import { getSiteAddresses, getSiteTimeZone, saveSiteAddresses, saveSiteTimeZone } from '../urls/urls-api';
  import InstallationSettings from './InstallationSettings.svelte';
  import { SettingsTab } from './settings.types';
  import SiteFaviconInput from './SiteFaviconInput.svelte';
  import TransliterationSettings from './TransliterationSettings.svelte';

  let { can, site, active, systemAdmin, onUnauthorized, onBusy, onDirtyChange, onTimeZoneChanged = (): void => {},
    onAddressesChanged = (): void => {}, onRebuilt = (): void => {} }: {
    onRebuilt?: () => void;
    onAddressesChanged?: () => void;
    onTimeZoneChanged?: (zone: string) => void;
    can: CanUseAction;
    site: IAdminSite;
    systemAdmin: boolean;
    active: boolean;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
  } = $props();
  let timeZone = $state('UTC');
  let savedTimeZone = $state('UTC');
  let mediaPageSize = $state<MediaPageSize>(defaultMediaPageSize);
  const timeZones = [...new Set(['UTC', 'Asia/Nicosia', ...Intl.supportedValuesOf('timeZone')])].sort();
  let tab = $state(SettingsTab.General);
  const basicSettings = $derived(can('cms.site-settings.read'));
  const updateSettings = $derived(can('cms.site-settings.update'));
  const canRebuild = $derived(can('cms.publication.publish-site'));
  const canListDumps = $derived(can('cms.dumps.list'));
  const visibleTabs = $derived([
    ...(basicSettings ? [SettingsTab.General] : []),
    ...(can('cms.authorization.read') ? [SettingsTab.Access] : []),
    ...(systemAdmin
      ? [SettingsTab.Installation, SettingsTab.Calibration] : []),
    ...(canListDumps ? [SettingsTab.Dumps] : []),
    ...(can('cms.deployment.read') ? [SettingsTab.Deployment] : []),
    ...(can('cms.page-resolutions.list') ? [SettingsTab.PageResolutions] : []),
    ...(systemAdmin ? [SettingsTab.CpuUsage] : []),
    ...(basicSettings ? [SettingsTab.Transliteration] : []),
  ]);
  const tabLabels = $derived({
    [SettingsTab.General]: $messages.pageMainTab,
    [SettingsTab.Access]: $messages.accessSettingsAccess,
    [SettingsTab.Installation]: $messages.settingsGeneral,
    [SettingsTab.Calibration]: $messages.accessSettingsCalibration,
    [SettingsTab.Dumps]: $messages.accessSettingsDumps,
    [SettingsTab.Deployment]: $messages.accessSettingsDeployment,
    [SettingsTab.PageResolutions]: $messages.accessSettingsPageStatistics,
    [SettingsTab.CpuUsage]: $messages.cpuUsageLogicalCPUUsage,
    [SettingsTab.Transliteration]: $messages.settingsTransliteration,
  });

  $effect(() => {
    if (!visibleTabs.includes(tab) && visibleTabs[0]) {
      tab = visibleTabs[0];
    }
    if (active && tab === SettingsTab.PageResolutions) {
      statisticsComponent ??= import('../page-statistics/PageResolutionsWorkspace.svelte');
    }
  });
  $effect(() => {
    if (active) {
      mediaPageSize = readMediaPageSize(site.siteId);
    }
  });
  let statisticsComponent = $state<Promise<{ default: typeof PageResolutionsComponent }> | null>(null);
  let saved = $state<ISiteAddresses | null>(null);
  let publicOrigin = $state('');
  let localBase = $state('');
  let localPort = $state<number | null>(null);
  let originMode = $state<SiteOriginMode | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let success = $state(false);
  let rebuilding = $state(false);
  let rebuilt = $state(false);
  let sitemapNeedsRebuild = $state(false);
  const localOrigin = $derived.by(() => {
    if (!localBase.trim()) {
      return null;
    }

    try {
      const origin = new SvelteURL(localBase.trim());

      if (
        origin.pathname !== '/'
        || origin.search
        || origin.hash
        || origin.username
        || origin.password
        || origin.port
        || !['http:', 'https:'].includes(origin.protocol)
        || localPort !== null
        && (!Number.isInteger(localPort)
        || localPort < 1
        || localPort > 65535)
      ) {
        return '';
      }
      origin.port = localPort === null ? '' : String(localPort);

      return origin.origin;
    } catch {
      return '';
    }
  });
  const addressesDirty = $derived(saved !== null
    && (publicOrigin.trim() !== (saved.publicOrigin ?? '')
    || localOrigin !== saved.localOrigin || originMode !== (saved.originMode ?? null)));

  let accessDirty = $state(false);
  let transliterationDirty = $state(false);
  let deploymentDirty = $state(false);
  let installationDirty = $state(false);
  let resourceDirty = $state(false);
  let calibrationDirty = $state(false);
  let resourceRevision = $state(0);
  let recommendation = $state<ICalibrationRecommendation | null>(null);
  const generalDirty = $derived(addressesDirty || timeZone !== savedTimeZone);
  const dirty = $derived(generalDirty || accessDirty || transliterationDirty || deploymentDirty
    || installationDirty || resourceDirty || calibrationDirty);

  function fill(value: ISiteAddresses): void {
    saved = value;
    originMode = value.originMode ?? null;
    publicOrigin = value.publicOrigin ?? '';
    const local = value.localOrigin ? new SvelteURL(value.localOrigin) : null;

    localPort = local?.port ? Number(local.port) : null;

    if (local) {
      local.port = '';
    }
    localBase = local?.origin ?? '';
  }
  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
    }
  }
  async function rebuild(): Promise<void> {
    if (!canRebuild || busy) {
      return;
    }
    rebuilding = true;
    busy = true;
    onBusy(true);
    error = null;
    rebuilt = false;

    try {
      await publishSite(site.siteId);
      rebuilt = true;
      sitemapNeedsRebuild = false;
      onRebuilt();
    } catch (value) {
      failure(value);
    } finally {
      rebuilding = false;
      busy = false;
      onBusy(false);
    }
  }

  async function load(): Promise<void> {
    loading = true;
    error = null;

    try {
      const [addresses, zone] = await Promise.all([getSiteAddresses(site.siteId), getSiteTimeZone(site.siteId)]);

      fill(addresses);
      savedTimeZone = zone;
      timeZone = zone;
    } catch (value) {
      failure(value);
    } finally {
      loading = false;
    }
  }
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!updateSettings || !saved || busy || localOrigin === '') {
      return;
    }

    let normalizedPublic: string | null = null;

    if (publicOrigin.trim()) {
      try {
        const publicAddress = new SvelteURL(publicOrigin.trim());

        if (
          !['http:', 'https:'].includes(publicAddress.protocol)
          || publicAddress.pathname !== '/'
          || publicAddress.search
          || publicAddress.hash
          || publicAddress.username
          || publicAddress.password
        ) {
          error = ContentErrorMessage.Invalid;

          return;
        }
        normalizedPublic = publicAddress.origin;
      } catch {
        error = ContentErrorMessage.Invalid;

        return;
      }
    }
    busy = true;
    onBusy(true);
    error = null;
    success = false;

    try {
      if (addressesDirty) {
        const next = await saveSiteAddresses(site.siteId, {
          publicOrigin: normalizedPublic,
          localOrigin,
          ...(originMode === null ? {} : { originMode }),
        },
        saved);

        sitemapNeedsRebuild ||= next.publicOrigin !== saved.publicOrigin;
        fill(next);
        onAddressesChanged();
      }
      if (timeZone !== savedTimeZone) {
        savedTimeZone = await saveSiteTimeZone(site.siteId, timeZone, savedTimeZone);
        onTimeZoneChanged(savedTimeZone);
      }
      success = true;
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }
  $effect(() => {
    if (active && basicSettings) {
      untrack(() => {
        if (!saved) {
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

<div class="site-viewport" hidden={!active}>
  <main class="page-workspace" aria-label={$messages.settings} aria-busy={loading || busy}>
    <nav class="cms-tabs" aria-label={$messages.settings}>
      {#each visibleTabs as item (item)}
        <button type="button" class="cms-tab" aria-current={tab === item ? 'page' : undefined}
          disabled={busy || accessDirty} onclick={() => {
            tab = item;
          }}>{tabLabels[item]}</button>
      {/each}
    </nav>
    <div class="_workspace-toolbar">
      <h1 class="_workspace-title">{tab === SettingsTab.Access ? ($messages.settingsRolesAndPermissions)
        : tab === SettingsTab.Transliteration ? $messages.settingsTransliteration
          : tab === SettingsTab.General ? $messages.siteAddresses
            : tab === SettingsTab.Installation ? ($messages.installationSettingsGeneralInstallationSettings)
              : tab === SettingsTab.Calibration ? ($messages.settingsResourceCalibration)
                : tab === SettingsTab.CpuUsage ? ($messages.cpuUsageLogicalCPUUsage)
                  : tab === SettingsTab.PageResolutions ? ($messages.accessSettingsPageStatistics)
                    : tab === SettingsTab.Dumps ? ($messages.settingsSiteDumps)
                      : ($messages.deploymentSiteDeployment)}</h1>
    </div>
    <div use:scrollShadow class="_workspace-scroll settings-workspace">
      {#if basicSettings}
        {#key site.siteId}
          <TransliterationSettings siteId={site.siteId} active={active && tab === SettingsTab.Transliteration}
            editable={updateSettings} {onUnauthorized} onBusy={(value) => {
              busy = value;
              onBusy(value);
            }} onDirtyChange={(value) => {
              transliterationDirty = value;
            }} />
        {/key}
      {/if}
      {#if active && tab === SettingsTab.Access && can('cms.authorization.read')}
        {#key site.siteId}
          <AccessSettings {site} timeZone={savedTimeZone} {systemAdmin} {onUnauthorized} onBusy={(value) => {
            busy = value;
            onBusy(value);
          }} onDirtyChange={(value) => {
            accessDirty = value;
          }} />
        {/key}
      {/if}
      {#if basicSettings}<div class="settings-form" hidden={tab !== SettingsTab.General}>
      {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
      {#if success}<p class="cms-success" role="status">{$messages.settingsSaved}</p>{/if}
      {#if loading}<p role="status">{$messages.urlLoading}</p>
      {:else if saved}
        {#if !updateSettings}<p>{$messages.siteSettingsReadOnly}</p>{/if}
        <form onsubmit={submit}>
          <fieldset disabled={busy} class="_url-fieldset">
            <label class="_form-field">{$messages.settingsSiteTimeZone}
              <select bind:value={timeZone} disabled={!updateSettings}>
                {#each timeZones as zone (zone)}<option value={zone}>{zone}</option>{/each}
              </select>
              <small>{$messages.settingsUsedInCalendarsAndWhen}</small>
            </label>
            <div class="_site-identity-fields">
            <div class="_form-field">
              <label for="site-public-origin">{$messages.publicOrigin}</label>
              <input id="site-public-origin" type="url" bind:value={publicOrigin} readonly={!updateSettings}
                placeholder="https://example.com" autocapitalize="none" spellcheck="false" />
              <small>{$messages.publicOriginHint}</small>
            </div>
            {#if can('cms.favicon.read')}<SiteFaviconInput {can} siteId={site.siteId}
              origin={saved ? servingSiteOrigin(saved) : null}
              {onUnauthorized} onBusy={(value) => {
                busy = value;
                onBusy(value);
              }} />{/if}
            </div>
            <div class="_url-local-fields">
              <label class="_form-field">{$messages.localOrigin}
                <input type="url" bind:value={localBase} readonly={!updateSettings} placeholder="http://localhost"
                  autocapitalize="none" spellcheck="false" />
              </label>
              <label class="_form-field">{$messages.localPort}
                <input type="number" min="1" max="65535" step="1" bind:value={localPort}
                  readonly={!updateSettings} placeholder="3000" />
              </label>
            </div>
            <small>{$messages.localOriginHint}</small>
            {#if localOrigin}<p class="_url-address">{localOrigin}</p>{/if}
            {#if localOrigin === ''}<p class="cms-error" role="alert">{$messages.contentInvalid}</p>{/if}
            <fieldset class="_url-fieldset" disabled={!updateSettings}>
              <legend>{$messages.siteOriginChoice}</legend>
              <label class="_url-check"><input type="radio" bind:group={originMode}
                value={SiteOriginMode.Local} />{$messages.siteUseLocal}</label>
              <label class="_url-check"><input type="radio" bind:group={originMode}
                value={SiteOriginMode.Public} />{$messages.siteUsePublic}</label>
              <small>{$messages.siteOriginChoiceHint}</small>
            </fieldset>
            {#if updateSettings}
              <p>{canRebuild ? $messages.settingsPublicationHint : $messages.settingsOriginSaveHint}</p>
            {/if}
          </fieldset>
          <div class="_url-actions">
            {#if updateSettings}<button class="cms-primary" disabled={!generalDirty || localOrigin === ''}>
              {busy ? $messages.saving : $messages.settingsSave}</button>{/if}
            <RefreshButton disabled={busy || loading} onclick={() => void load()} />
          </div>
        </form>
        {#if !canRebuild && sitemapNeedsRebuild}<p>{$messages.siteSettingsNeedsPublisher}</p>{/if}
      {:else}<RefreshButton onclick={() => {
        void load();
      }} />{/if}
        <section class="_media-preferences" aria-labelledby="media-preferences-heading">
          <h2 id="media-preferences-heading">{$messages.settingsMediaLibrary}</h2>
          <div class="_form-field">
            <label for="media-page-size">{$messages.settingsMediaPageSize}</label>
            <select id="media-page-size" aria-describedby="media-page-size-scope" value={mediaPageSize}
              onchange={(event) => {
                const size = Number(event.currentTarget.value);

                if (isMediaPageSize(size)) {
                  mediaPageSize = size;
                  setMediaPageSize(site.siteId, size);
                }
              }}>
              {#each mediaPageSizes as size (size)}<option value={size}>{size}</option>{/each}
            </select>
            <small id="media-page-size-scope">{$messages.settingsMediaPageSizeScope}</small>
          </div>
        </section>
        {#if canRebuild}<section class="_site-rebuild" aria-labelledby="site-rebuild-heading">
          <h2 id="site-rebuild-heading">{$messages.rebuildSite}</h2>
          <p id="site-rebuild-hint">{$messages.rebuildFromSavedSettings} {$messages.rebuildSiteHint}</p>
          <button class="cms-secondary" type="button" disabled={busy || loading} aria-describedby="site-rebuild-hint"
            onclick={() => void rebuild()}>{rebuilding ? $messages.publishing : $messages.rebuildSite}</button>
          {#if rebuilt}<p class="cms-success" role="status">{$messages.sitePublished}</p>{/if}
        </section>{/if}
        {#if systemAdmin}<CalibrationHistory siteId={site.siteId}
          active={active && tab === SettingsTab.General} timeZone={savedTimeZone}
          revision={resourceRevision} {onUnauthorized} onBusy={value => {
            busy = value;
            onBusy(value);
          }}
          onApplied={() => {
            recommendation = null;
            resourceRevision++;
          }}
          onRecommendation={value => {
            recommendation = value;
            tab = SettingsTab.Installation;
          }} />{/if}
      </div>{/if}
      {#if statisticsComponent}
        {#await statisticsComponent}
          {#if tab === SettingsTab.PageResolutions}<p role="status">{$messages.accessSettingsLoading}</p>{/if}
        {:then component}
          <component.default siteId={site.siteId} active={active && tab === SettingsTab.PageResolutions}
            timeZone={savedTimeZone} {onUnauthorized} />
        {:catch}
          {#if tab === SettingsTab.PageResolutions}
            <p class="cms-error" role="alert">{$messages.settingsCouldNotLoadThisTab}</p>
          {/if}
        {/await}
      {/if}
      {#if systemAdmin}
      <InstallationSettings active={active && tab === SettingsTab.Installation} disabled={busy}
        {onUnauthorized} onBusy={(value) => {
          busy = value;
          onBusy(value);
        }} onDirtyChange={(value) => {
          installationDirty = value;
        }} />
      <CalibrationWorkspace active={active && tab === SettingsTab.Calibration} siteId={site.siteId}
        timeZone={savedTimeZone} {onUnauthorized} onBusy={value => {
          busy = value;
          onBusy(value);
        }}
        onDirtyChange={value => {
          calibrationDirty = value;
        }}
        onApplied={() => {
          recommendation = null;
          resourceRevision++;
        }}
        onRecommendation={value => {
          recommendation = value;
        }} />
      <ResourceSettings {recommendation} revision={resourceRevision} active={active && tab === SettingsTab.Installation}
        siteId={site.siteId}
        {onUnauthorized} onBusy={(value) => {
          busy = value;
          onBusy(value);
        }} onDirtyChange={(value) => {
          resourceDirty = value;
        }} />
      <CpuUsageWorkspace active={active && tab === SettingsTab.CpuUsage} timeZone={savedTimeZone} />
      {/if}
      <DeploymentWorkspace {can} siteId={site.siteId} active={active && tab === SettingsTab.Deployment}
        timeZone={savedTimeZone}
        {onUnauthorized} onBusy={(value) => {
          busy = value;
          onBusy(value);
        }}
        onDirtyChange={(value) => {
          deploymentDirty = value;
        }} />
      {#if canListDumps}
      <DumpsWorkspace siteId={site.siteId} active={active && tab === SettingsTab.Dumps} timeZone={savedTimeZone}
        siteOnly={!systemAdmin}
        {onUnauthorized} onBusy={(value) => {
          busy = value;
          onBusy(value);
        }} />
      {/if}
    </div>
  </main>
</div>

<style>
  ._workspace-toolbar { padding-block: 20px 4px; }
  ._media-preferences { display: grid; gap: 16px; margin-top: 32px; }
  ._media-preferences h2, ._media-preferences ._form-field { margin: 0; }
  ._media-preferences select { max-width: 240px; }

  @media (min-width: 992px) {
    ._workspace-toolbar { padding-block: 32px 8px; }
  }
</style>
