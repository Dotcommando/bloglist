<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { adminLanguage, adminLocales, type AdminMessageKey, formatMessage, messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { DumpType, type IDumpReview } from './dumps.types';
  import {
    createInstallationDump, createSiteDump, deleteSiteDump, dumpDownloadUrl, formatDumpSize, getDumpExportItems,
    importSiteDump,
    inspectSiteDump, installationDumpDownloadUrl, type ISiteDumpRow, listSiteDumps, restoreInstallationDump,
    restoreSiteDump,
  } from './dumps-api';

  let { siteId, active, timeZone, siteOnly, onUnauthorized, onBusy }: {
    siteId: string;
    active: boolean;
    timeZone: string;
    siteOnly: boolean;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
  } = $props();
  const types = $derived(siteOnly
    ? [DumpType.Site] : Object.values(DumpType).filter((type) => type !== DumpType.Unknown));
  let rows = $state<ISiteDumpRow[]>([]);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let success = $state<AdminMessageKey | ''>('');
  let selection = $state<FileList | undefined>();
  let installationSelection = $state<FileList | undefined>();
  let installationFilename = $state<string>();
  let type = $state(DumpType.Site);
  let catalogue = $state<IDumpReview | null>(null);
  let selected = $state<ReadonlySet<string>>(new Set());
  let review = $state<IDumpReview | null>(null);
  let importing = $state<ISiteDumpRow | null>(null);
  let importIds = $state<ReadonlySet<string>>(new Set());
  let targets = $state<Record<string, string>>({});
  let pageMappings = $state<Record<string, string>>({});
  let configuration = $state(true);
  let businessData = $state(true);
  let includePackage = $state(false);
  let importConfiguration = $state(true);
  let importBusinessData = $state(true);
  let importPackage = $state(false);
  let generation = 0;
  const selectable = $derived(![DumpType.Site, DumpType.Files].includes(type));

  function typeName(value: DumpType): string {
    const names = {
      [DumpType.Site]: $messages.dumpsFullSite,
      [DumpType.Snippets]: $messages.snippets,
      [DumpType.Chunks]: $messages.chunks,
      [DumpType.Templates]: $messages.templates,
      [DumpType.Addons]: $messages.addons,
      [DumpType.Files]: $messages.files,
      [DumpType.Unknown]: $messages.dumpsUnknown,
    };

    return names[value];
  }
  function actionName(value: string | undefined): string {
    return value === 'Replace' ? $messages.tvReplaceImage
      : value === 'ChooseTarget' ? $messages.dumpsChooseReplacementTarget
        : $messages.adminUsersCreate;
  }
  function toggle(values: ReadonlySet<string>, id: string, checked: boolean): ReadonlySet<string> {
    const next = new SvelteSet(values);

    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }

    return next;
  }
  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
    }
  }
  async function refresh(): Promise<void> {
    loading = true;
    error = null;

    try {
      const result = await listSiteDumps(siteId);

      rows = siteOnly ? result.filter((dump) => dump.type === DumpType.Site) : result;
    } catch (value) {
      failure(value);
    } finally {
      loading = false;
    }
  }
  async function loadCatalogue(category: DumpType, site: string): Promise<void> {
    const captured = ++generation;

    catalogue = null;
    selected = new Set();

    if ([DumpType.Site, DumpType.Files].includes(category)) {
      return;
    }

    try {
      const result = await getDumpExportItems(site, category);

      if (captured === generation) {
        catalogue = result;
      }
    } catch (value) {
      if (captured === generation) {
        failure(value);
      }
    }
  }
  async function run(action: () => Promise<void>): Promise<void> {
    if (busy || loading) {
      return;
    }
    busy = true;
    onBusy(true);
    error = null;
    success = '';

    try {
      await action();
      const result = await listSiteDumps(siteId);

      rows = siteOnly ? result.filter((dump) => dump.type === DumpType.Site) : result;
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }
  async function inspect(row: ISiteDumpRow): Promise<void> {
    const details = await inspectSiteDump(siteId, row.filename);

    review = details;
    importing = row;
    importIds = new Set();
    targets = Object.fromEntries(details.items.map((item) => [item.id, item.targetId ?? '']));
    pageMappings = {};
    importConfiguration = details.addonParts?.configuration ?? true;
    importBusinessData = details.addonParts?.businessData ?? true;
    importPackage = details.addonParts?.package ?? false;
  }
  async function restore(row: ISiteDumpRow): Promise<void> {
    if (row.type !== DumpType.Site) {
      await run(() => inspect(row));

      return;
    }
    if (
      !window.confirm(formatMessage($messages.dumpsReplaceAllDataAndFiles, { filename: row.filename }))
    ) {
      return;
    }
    await run(async () => {
      await restoreSiteDump(siteId, row.filename);
      window.location.reload();
    });
  }
  async function applyImport(): Promise<void> {
    const details = review;
    const row = importing;

    if (!details || !row) {
      return;
    }
    if (
      !window.confirm($messages.dumpsImportTheSelectedDataAnd)
    ) {
      return;
    }
    await run(async () => {
      await restoreSiteDump(siteId, row.filename, {
        version: details.version,
        choices: details.items.filter((item) => importIds.has(item.id))
          .map((item) => ({ id: item.id, targetId: targets[item.id] || null })),
        ...(details.type === DumpType.Addons ? {
          pageMappings,
          addonParts: { configuration: importConfiguration, businessData: importBusinessData, package: importPackage },
        } : {}),
      });
      window.location.reload();
    });
  }
  $effect(() => {
    if (active) {
      untrack(() => {
        void refresh();
      });
    }
  });
  $effect(() => {
    const category = type;
    const site = siteId;

    if (active) {
      untrack(() => {
        void loadCatalogue(category, site);
      });
    }
  });
</script>

<section class="site-dumps" hidden={!active} aria-busy={loading || busy} aria-label={$messages.accessSettingsDumps}>
  <header class="_dump-heading">
    <p class="_dump-intro">{$messages.dumpsEachPartialDumpContainsOne}</p>
  </header>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if success}<p class="cms-success" role="status">{$messages[success]}</p>{/if}
  {#if !siteOnly}
    <form class="_dump-panel" aria-label={$messages.dumpsInstallation} onsubmit={(event) => {
      event.preventDefault();
      const file = installationSelection?.[0];

      if (file && window.confirm($messages.dumpsConfirmInstallationRestore)) {
        void run(async () => {
          await restoreInstallationDump(siteId, file);
          window.location.reload();
        });
      }
    }}>
      <h2 class="_dump-section-title">{$messages.dumpsInstallation}</h2>
      <button type="button" class="cms-primary" disabled={busy || loading} onclick={() => {
        void run(async () => {
          installationFilename = await createInstallationDump(siteId);
        });
      }}>{$messages.dumpsCreateInstallation}</button>
      {#if installationFilename}
        <a href={installationDumpDownloadUrl(siteId, installationFilename)} download={installationFilename}>
          {installationFilename}
        </a>
      {/if}
      <label class="_form-field">{$messages.dumpsInstallationFile}
        <input type="file" accept=".gz" bind:files={installationSelection} disabled={busy || loading} />
      </label>
      <button type="submit" class="cms-secondary" disabled={busy || loading || !installationSelection?.length}>
        {$messages.dumpsRestoreInstallation}
      </button>
    </form>
  {/if}
  <div class="_dump-transfers">
  <form class="_dump-panel" aria-label={$messages.dumpsExport} onsubmit={(event) => {
    event.preventDefault();
    void run(async () => {
      await createSiteDump(siteId, type === DumpType.Site ? undefined : {
        type,
        ...(selectable ? { itemIds: [...selected] } : {}),
        ...(type === DumpType.Addons ? { addonParts: { configuration, businessData, package: includePackage } } : {}),
      });
      success = 'dumpsDumpCreated';
    });
  }}>
    <h2 class="_dump-section-title">{$messages.dumpsExport}</h2>
    <fieldset class="_url-fieldset _dump-fields" disabled={busy || loading}>
      <label class="_form-field">{$messages.dumpsDumpType}
        <select bind:value={type} aria-label={$messages.dumpsDumpType}>{#each types as category (category)}
          <option value={category}>{typeName(category)}</option>{/each}</select>
      </label>
      {#if selectable}
        {#if !catalogue}<p role="status">{$messages.loadingSites}</p>
        {:else if !catalogue.items.length}<p>{$messages.dumpsNoItemsToExport}</p>
        {:else}
          <Checkbox checked={selected.size === catalogue.items.length} onCheckedChange={(checked) => {
            selected = new SvelteSet(checked ? catalogue!.items.map((item) => item.id) : []);
          }}>{$messages.dumpsSelectAll}</Checkbox>
          <div class="_dump-table-scroll"><table class="_dump-table"
            aria-label={$messages.dumpsExportItems}>
            <thead><tr><th scope="col">{$messages.parameterName}</th>
              <th scope="col">{$messages.accessSettingsKey}</th></tr></thead>
            <tbody>{#each catalogue.items as item (item.id)}
              <tr class="_dump-select-row" aria-selected={selected.has(item.id)}>
                <td><Checkbox checked={selected.has(item.id)} onCheckedChange={(checked) => {
                  selected = toggle(selected, item.id, checked);
                }}>{item.name}</Checkbox></td><td>{item.key}</td></tr>
            {/each}</tbody></table></div>
        {/if}
      {:else if type === DumpType.Files}
        <p>{$messages.dumpsAllFilesAreExportedTogether}</p>{/if}
      {#if type === DumpType.Addons}
        <fieldset class="_url-fieldset"><legend>{$messages.dumpsAddOnContents}</legend>
          <Checkbox bind:checked={configuration}>{$messages.dumpsSettingsAndConfiguration}</Checkbox>
          <Checkbox bind:checked={businessData}>{$messages.dumpsBusinessData}</Checkbox>
          <Checkbox bind:checked={includePackage}>{$messages.dumpsInstallationPackage}</Checkbox>
        </fieldset>
      {/if}
      <div class="_dump-actions"><button class="cms-primary" disabled={selectable && !selected.size
        || type === DumpType.Addons && !configuration && !businessData && !includePackage}>
        {$messages.dumpsCreateDump}</button>
      </div>
    </fieldset>
  </form>
  <form class="_dump-panel" aria-label={$messages.dumpsImport} onsubmit={(event) => {
    event.preventDefault();
    const file = selection?.[0];

    if (file) {
      void run(async () => {
        const saved = await importSiteDump(siteId, file);

        selection = undefined;

        if (saved.type !== DumpType.Site) {
          await inspect(saved);
        }
        success = saved.type === DumpType.Site
          ? 'dumpsDumpUploadedAndVerifiedChoose'
          : 'dumpsDumpUploadedAndVerifiedSelect';
      });
    }
  }}>
    <h2 class="_dump-section-title">{$messages.dumpsImport}</h2>
    <fieldset class="_url-fieldset _dump-fields" disabled={busy || loading}>
      <label class="_form-field">{$messages.dumpsUploadADumpFromYour}
        <input class="_dump-file" type="file" accept=".gz,application/gzip" bind:files={selection} />
      </label>
      <div class="_dump-actions"><button class="cms-secondary" disabled={!selection?.length}>
        {$messages.dumpsUploadDump}</button></div>
    </fieldset>
  </form>
  </div>
  {#if review && importing}
    <section class="_dump-panel _dump-review" aria-label={$messages.dumpsImportDump}>
      <h2>{$messages.dumpsImport2}{typeName(review.type)}</h2>
      {#if review.type === DumpType.Files}<p>{$messages.dumpsAllFilesAreAddedOr}</p>
      {:else}
        <Checkbox disabled={busy || loading} checked={importIds.size === review.items.length}
          onCheckedChange={(checked) => {
            importIds = new SvelteSet(checked ? review!.items.map((item) => item.id) : []);
          }}>{$messages.dumpsSelectAllToImport}</Checkbox>
        <div class="_dump-table-scroll"><table class="_dump-table"
          aria-label={$messages.dumpsImportItems}>
          <thead><tr><th scope="col">{$messages.parameterName}</th>
            <th scope="col">{$messages.accessSettingsAction}</th></tr></thead>
          <tbody>{#each review.items as item (item.id)}
            <tr class="_dump-select-row" aria-selected={importIds.has(item.id)}>
              <td><Checkbox checked={importIds.has(item.id)} disabled={busy || loading}
                onCheckedChange={(checked) => {
                  importIds = toggle(importIds, item.id, checked);
                }}>{item.name}</Checkbox><small>{item.key}</small></td><td>{actionName(item.action)}
                {#if (item.targets?.length ?? 0) > 1}
                  <select aria-label={formatMessage($messages.dumpsReplaceTargetName, { name: item.name })}
                    value={targets[item.id] ?? ''} disabled={busy || loading} onchange={(event) => {
                      targets = { ...targets, [item.id]: event.currentTarget.value };
                    }}><option value="">{$messages.dumpsChooseTarget}</option>
                    {#each item.targets ?? [] as target (target.id)}
                      <option value={target.id}>{target.name} ({target.key})</option>{/each}</select>
                {/if}
              </td></tr>
          {/each}</tbody></table></div>
      {/if}
      {#if review.type === DumpType.Addons && review.addonParts}
        <fieldset class="_url-fieldset" disabled={busy || loading}>
          <legend>{$messages.dumpsImportFromArchive}</legend>
          {#if review.addonParts.configuration}<Checkbox bind:checked={importConfiguration}>
            {$messages.dumpsSettingsAndConfiguration}</Checkbox>{/if}
          {#if review.addonParts.businessData}<Checkbox bind:checked={importBusinessData}>
            {$messages.dumpsBusinessData}</Checkbox>{/if}
          {#if review.addonParts.package}<Checkbox bind:checked={importPackage}>
            {$messages.dumpsInstallAndConnectPackage}</Checkbox>{/if}
        </fieldset>
        {#if importBusinessData && review.pages.length}
          <fieldset class="_url-fieldset" disabled={busy || loading}>
            <legend>{$messages.dumpsPageMapping}</legend>
            {#each review.pages as source (source.pageId)}
              <label class="_form-field">{source.title}
                <select value={pageMappings[source.pageId] ?? ''} onchange={(event) => {
                  pageMappings = { ...pageMappings, [source.pageId]: event.currentTarget.value };
                }}><option value="">{$messages.dumpsChooseTargetPage}</option>
                  {#each review.targetPages as target (target.pageId)}
                    <option value={target.pageId}>{target.title}</option>{/each}</select>
              </label>
            {/each}
          </fieldset>
        {/if}
      {/if}
      <div class="_dump-actions"><button type="button" class="cms-primary" disabled={busy || loading
        || review.type !== DumpType.Files && !importIds.size} onclick={() => {
          void applyImport();
        }}>
        {$messages.dumpsImportSelected}</button>
        <button type="button" class="cms-secondary" disabled={busy} onclick={() => {
          review = null;
          importing = null;
        }}>
          {$messages.cancel}</button></div>
    </section>
  {/if}
  {#if busy}<p role="status">{$messages.dumpsProcessingSiteDump}</p>{/if}
  {#if loading}<p role="status">{$messages.dumpsCheckingFiles}</p>{/if}
  <section class="_dump-archives" aria-label={$messages.dumpsSavedDumps}>
  <div class="_workspace-toolbar _workspace-toolbar__inline">
    <h2 class="_workspace-title _dump-section-title">{$messages.dumpsSavedDumps}</h2>
    <RefreshButton disabled={busy || loading} onclick={() => {
      void refresh();
    }} />
  </div>
  <p class="_dump-zone">{$messages.dumpsDatesShownIn}{timeZone}</p>
  {#if !rows.length && !loading}<p>{$messages.dumpsNoDumpsYet}</p>
  {:else if rows.length}
    <div class="_dump-table-scroll"><table class="_dump-table"
      aria-label={$messages.dumpsExistingDumps}>
      <thead><tr><th scope="col">{$messages.tvFile}</th><th scope="col">{$messages.dumpsDumpType}</th>
        <th scope="col">{$messages.dumpsSize}</th><th scope="col">{$messages.dumpsCreated}</th>
        <th scope="col">{$messages.dumpsActions}</th></tr></thead>
      <tbody>{#each rows as row (row.filename)}
        <tr><td>{#if siteOnly}{row.filename}
          {:else}<a href={dumpDownloadUrl(siteId, row.filename)} download={row.filename}>{row.filename}</a>{/if}</td>
          <td>{typeName(row.type)}</td><td>{formatDumpSize(row.byteSize)}</td>
          <td><time datetime={row.createdAt}>{new Intl.DateTimeFormat(adminLocales[$adminLanguage].calendarLocale, {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date(row.createdAt))}</time></td>
          <td><div class="_dump-row-actions"><button type="button" class="cms-secondary"
            disabled={busy || loading || row.type === DumpType.Unknown}
            onclick={() => {
              void restore(row);
            }}>{row.type === DumpType.Site ? $messages.dumpsRestore
              : $messages.dumpsSelectForImport}</button>
          {#if !siteOnly}<button type="button" class="cms-secondary _dump-delete" disabled={busy || loading}
            title={$messages.dumpsDeleteDump}
            aria-label={$messages.dumpsDeleteDump2 + row.filename}
            onclick={() => {
              if (window.confirm($messages.dumpsDeleteDumpFile + row.filename + '?')) {
                void run(async () => {
                  await deleteSiteDump(siteId, row.filename);

                  if (importing?.filename === row.filename) {
                    importing = null;
                    review = null;
                  }
                });
              }
            }}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"
              aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
              </svg></button>{/if}</div></td></tr>
      {/each}</tbody></table></div>
  {/if}
  </section>
</section>
