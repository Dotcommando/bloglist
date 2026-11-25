<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { followAdminLink } from '../../app/admin-route';
  import { adminLanguage, messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import MiddleEllipsis from '../../shared/ui/MiddleEllipsis.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import ResultsLoadingOverlay from '../../shared/ui/ResultsLoadingOverlay.svelte';
  import { fileNameSuffix } from './file-name-suffix';
  import { formatFileSize } from './file-size';
  import FileIcon from './FileIcon.svelte';
  import { FileSort, type IFileBrowsePage, type ISiteFile, type MediaRoot } from './files.types';
  import { browseFiles, fileContentUrl } from './files-api';
  import { defaultMediaPageSize, type MediaPageSize, readMediaPageSize } from './media-page-size';

  let { siteId, root, folderId, mimeTypes, version = '', active = true, selectedId = null,
    disabled = false, canReadContent = true,
    onFolder, onFile, onPage, onUnauthorized, onDragFile, fileHref, folderHref }: {
    siteId: string;
    root: MediaRoot;
    folderId: string | null;
    mimeTypes?: readonly string[] | undefined;
    version?: string;
    active?: boolean;
    selectedId?: string | null;
    disabled?: boolean;
    canReadContent?: boolean;
    onFolder: (id: string | null) => void;
    onFile: (file: ISiteFile) => void;
    onPage?: (result: IFileBrowsePage, folderId: string | null) => void;
    onUnauthorized: () => void;
    onDragFile?: ((file: ISiteFile | null) => void) | undefined;
    fileHref?: (file: ISiteFile) => string;
    folderHref?: (folderId: string | null) => string;
  } = $props();
  const id = $props.id();
  let query = $state('');
  let recursive = $state(false);
  let sort = $state(FileSort.Name);
  let descending = $state(false);
  let grid = $state(true);
  let page = $state(1);
  let pageSize = $state<MediaPageSize>(defaultMediaPageSize);
  let revision = $state(0);
  let result = $state<IFileBrowsePage & {
    loadedPage: number;
    loadedPageSize: MediaPageSize;
    loadedRecursive: boolean;
  }>();
  let loading = $state(true);
  let error = $state<ContentErrorMessage | null>(null);
  const failed = new SvelteSet<string>();
  const pages = $derived(result ? Math.max(1, Math.ceil(result.total / result.loadedPageSize)) : 1);
  const trail = $derived.by(() => {
    const folders = result?.breadcrumbs ?? [];
    const current = folders.findIndex((folder) => folder.folderId === folderId);

    return folders.slice(0, current + 1);
  });
  const labels = $derived({
    [FileSort.Name]: $messages.fileBrowseName,
    [FileSort.Created]: $messages.fileBrowseCreated,
    [FileSort.Updated]: $messages.fileBrowseUpdated,
    [FileSort.Type]: $messages.fileBrowseType,
    [FileSort.Size]: $messages.fileBrowseSize,
  });
  const dateFormat = $derived(new Intl.DateTimeFormat($adminLanguage, {
    dateStyle: 'medium', timeZone: result?.timeZone ?? 'UTC',
  }));

  $effect(() => {
    if (active) {
      pageSize = readMediaPageSize(siteId);
    }
  });

  $effect(() => {
    try {
      grid = localStorage.getItem('zarya.files.layout.' + siteId) !== 'list';
    } catch {
      grid = true;
    }
  });

  function layout(tiles: boolean): void {
    grid = tiles;

    try {
      localStorage.setItem('zarya.files.layout.' + siteId, tiles ? 'grid' : 'list');
    } catch {
      // The active mode remains available when browser storage is disabled.
    }
  }

  $effect(() => {
    void siteId;
    void root;
    void folderId;
    void query;
    void recursive;
    void sort;
    void descending;
    void pageSize;
    page = 1;
  });

  $effect(() => {
    if (!active) {
      return;
    }
    void version;
    void revision;
    const scope = siteId;
    const input = {
      root,
      folderId,
      search: query,
      recursive,
      sort,
      descending,
      page,
      pageSize,
      ...(mimeTypes ? { mimeTypes } : {}),
    };
    let current = true;

    loading = true;
    error = null;

    const timer = setTimeout(() => {
      void browseFiles(scope, input).then((next) => {
        if (current) {
          const last = Math.max(1, Math.ceil(next.total / input.pageSize));

          if (input.page > last) {
            page = last;
          } else {
            result = {
              ...next,
              loadedPage: input.page,
              loadedPageSize: input.pageSize,
              loadedRecursive: input.recursive,
            };
            failed.clear();
            onPage?.(next, input.folderId);
          }
        }
      }).catch((value: unknown) => {
        if (current) {
          if (value instanceof ContentRequestError && value.status === 401) {
            onUnauthorized();
          } else {
            error = contentError(value);
          }
        }
      }).finally(() => {
        if (current) {
          loading = false;
        }
      });
    }, 120);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  });

  function date(value: string | undefined): string {
    return value ? dateFormat.format(new Date(value)) : '—';
  }

  function selectFile(event: MouseEvent, file: ISiteFile): void {
    if (disabled || loading) {
      event.preventDefault();
    } else if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onFile(file);
    }
  }
</script>

{#snippet folderIcon()}
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none"
    stroke="currentColor" stroke-width="1.6">
    <path d="M3 6h6l2 2h10v11H3z" />
  </svg>
{/snippet}

{#snippet itemPath(itemId: string)}
  {#if result?.loadedRecursive && result.paths[itemId]}
    <small class="_file-path">{result.paths[itemId]}</small>
  {/if}
{/snippet}

{#snippet fileLabel(file: ISiteFile, thumbnail: boolean)}
  {@const preview = file.outputs.find((output) => output.key !== 'file') ?? file.outputs.find((output) =>
    output.mimeType.startsWith('image/') && output.byteSize != null && output.byteSize <= 128 * 1024
    && (output.dimensions?.width ?? Infinity) <= 640 && (output.dimensions?.height ?? Infinity) <= 640)}
  <span class="_file-visual">
    {#if thumbnail && canReadContent && preview && !failed.has(file.fileId)}
      <img src={fileContentUrl(siteId, file.fileId, preview.key) + '&v=' + encodeURIComponent(file.assetVersion ?? '')}
        alt="" loading="lazy" onerror={() => failed.add(file.fileId)} />
    {:else}
      <FileIcon mimeType={file.mimeType} />
    {/if}
  </span>
  <span class="_file-info">
    <span class="_file-name cms-file-label">
      <MiddleEllipsis text={file.name} fixedSuffix={fileNameSuffix(file.name)} />
    </span>
    {@render itemPath(file.fileId)}
  </span>
{/snippet}

{#snippet fileAction(file: ISiteFile, thumbnail: boolean)}
  {#if fileHref}
    <a class="_file-action" class:_file-selected={selectedId === file.fileId} href={fileHref(file)}
      aria-disabled={disabled || loading} tabindex={disabled || loading ? -1 : undefined}
      draggable={!!onDragFile && !disabled && !loading && !file.referencesPending}
      ondragstart={(event) => {
        if (event.dataTransfer && onDragFile) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-zarya-file', file.fileId);
          onDragFile(file);
        }
      }}
      ondragend={() => onDragFile?.(null)}
      onclick={(event) => selectFile(event, file)}>{@render fileLabel(file, thumbnail)}</a>
  {:else}
    <button class="_file-action" class:_file-selected={selectedId === file.fileId} type="button"
      aria-pressed={selectedId === file.fileId} disabled={disabled || loading}
      onclick={() => onFile(file)}>{@render fileLabel(file, thumbnail)}</button>
  {/if}
{/snippet}

{#snippet parentFolder(label: string, id: string | null)}
  {#if folderHref}
    <a href={folderHref(id)} aria-disabled={disabled || undefined} onclick={(event) => {
      if (disabled) {
        event.preventDefault();
      } else {
        followAdminLink(event);
      }
    }}>{label}</a>
  {:else}
    <button class="cms-breadcrumb-action" type="button" {disabled} onclick={() => onFolder(id)}>{label}</button>
  {/if}
{/snippet}

<section class="file-browser folder-contents" aria-label={$messages.folderContents}>
  {#if fileHref}<h2>{$messages.folderContents}</h2>{/if}
  {#if folderId !== null || !fileHref}
    <nav class="cms-breadcrumbs cms-file-label" aria-label={$messages.fileBreadcrumbs}>
      <ol>
        <li aria-current={folderId === null ? 'page' : undefined}>
          {#if folderId === null}<span>assets/{root}</span>
          {:else}{@render parentFolder('assets/' + root, null)}{/if}
        </li>
        {#each trail as folder (folder.folderId)}
          <li aria-current={folder.folderId === folderId ? 'page' : undefined}>
            <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
            {#if folder.folderId === folderId}<span>{folder.name}</span>
            {:else}{@render parentFolder(folder.name, folder.folderId)}{/if}
          </li>
        {/each}
      </ol>
    </nav>
  {/if}
  <div class="_file-controls">
    <div class="_file-toolbar">
      <div class="_file-fields">
        <label class="_form-field" for={id + '-search'}>{$messages.fileBrowseSearch}
          <input id={id + '-search'} type="search" class="cms-compact" bind:value={query} maxlength="180" {disabled}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
              }
            }} />
        </label>
        <div class="_file-sort">
          <label class="_form-field">{$messages.fileBrowseSort}
            <select class="cms-compact" bind:value={sort} {disabled}>
              {#each Object.values(FileSort) as field (field)}
                <option value={field}>{labels[field]}</option>
              {/each}
            </select>
          </label>
          <button class="cms-secondary cms-action-square cms-compact" type="button" {disabled}
            aria-label={$messages.fileBrowseDescending} aria-pressed={descending}
            title={descending ? $messages.fileBrowseDescending : $messages.fileBrowseAscending}
            onclick={() => descending = !descending}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              stroke-width="1.7" aria-hidden="true">
              <path d={descending ? 'M12 5v14m-5-5 5 5 5-5' : 'M12 19V5m-5 5 5-5 5 5'} />
            </svg>
          </button>
        </div>
      </div>
      <div class="_file-options">
        <Checkbox bind:checked={recursive} {disabled}>{$messages.fileBrowseRecursive}</Checkbox>
        <div class="_file-tools">
          <div class="_file-views" role="group" aria-label={$messages.fileBrowseView}>
            <button class="cms-secondary cms-compact _file-view-button" type="button" aria-pressed={grid} {disabled}
              onclick={() => layout(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                stroke-width="1.7" aria-hidden="true">
                <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />
              </svg>
              {$messages.fileBrowseGrid}
            </button>
            <button class="cms-secondary cms-compact _file-view-button" type="button" aria-pressed={!grid} {disabled}
              onclick={() => layout(false)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
                <path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" />
              </svg>
              {$messages.fileBrowseList}
            </button>
          </div>
          <RefreshButton compact disabled={disabled || loading} onclick={() => revision++} />
        </div>
      </div>
    </div>
  </div>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if result || loading}
    <div class="_file-results" class:_file-results__initial={!result}>
      <div class="_file-result-content" aria-busy={loading}>
        {#if result}
          {#if fileHref && !result.loadedRecursive}
            <p>{$messages.folderFilesSummary.replace('{folders}', String(result.folderTotal))
              .replace('{files}', String(result.fileTotal))}</p>
          {/if}
          {#if !result.total}
            <p>{$messages.folderEmpty}</p>
          {:else if grid}
            <div class="_file-tiles">
              {#each result.folders as folder (folder.folderId)}
                <button type="button" class="_file-action" disabled={disabled || loading}
                  onclick={() => onFolder(folder.folderId)}>
                  <span class="_file-visual">{@render folderIcon()}</span>
                  <span class="_file-info">
                    <span class="_file-name cms-file-label" title={folder.name}>{folder.name}</span>
                    {@render itemPath(folder.folderId)}
                  </span>
                </button>
              {/each}
              {#each result.files as file (file.fileId)}
                {@render fileAction(file, true)}
              {/each}
            </div>
          {:else}
            <div class="_file-table">
              <table class="cms-table">
                <thead><tr>
                  {#each Object.values(FileSort) as field (field)}<th scope="col">{labels[field]}</th>{/each}
                </tr></thead>
                <tbody>
                  {#each result.folders as folder (folder.folderId)}
                    <tr>
                      <td><button type="button" class="_file-action" disabled={disabled || loading}
                        onclick={() => onFolder(folder.folderId)}>
                        <span class="_file-visual">{@render folderIcon()}</span>
                        <span class="_file-info">
                          <span class="_file-name cms-file-label" title={folder.name}>{folder.name}</span>
                          {@render itemPath(folder.folderId)}
                        </span>
                      </button></td>
                      <td>—</td><td>—</td><td>{$messages.fileFolder}</td><td>—</td>
                    </tr>
                  {/each}
                  {#each result.files as file (file.fileId)}
                    <tr>
                      <td>{@render fileAction(file, false)}</td><td>{date(file.createdAt)}</td>
                      <td>{date(file.updatedAt)}</td><td>{file.mimeType}</td>
                      <td>{formatFileSize(file.byteSize, $adminLanguage)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          <nav class="_file-pagination" aria-label={$messages.fileBrowsePagination}>
            <button class="cms-secondary" type="button" disabled={disabled || loading || result.loadedPage <= 1}
              onclick={() => page = (result?.loadedPage ?? page) - 1}>{$messages.fileBrowsePrevious}</button>
            <span class="_file-page-status" role="status">{result.loadedPage} / {pages} · {result.total}</span>
            <button class="cms-secondary" type="button" disabled={disabled || loading || result.loadedPage >= pages}
              onclick={() => page = (result?.loadedPage ?? page) + 1}>{$messages.fileBrowseNext}</button>
          </nav>
        {/if}
      </div>
      <ResultsLoadingOverlay active={loading} label={$messages.loadingFiles} />
    </div>
  {/if}
</section>

<style>
  .file-browser { display: grid; min-width: 0; gap: 12px; }
  .file-browser h2, .file-browser p { margin: 0; }
  ._file-options, ._file-tools, ._file-views, ._file-pagination {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  }
  ._file-controls { min-width: 0; container-type: inline-size; }
  ._file-toolbar, ._file-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  ._file-fields ._form-field { min-width: 0; margin: 0; gap: 4px; font-size: 13px; font-weight: 600; }
  ._file-sort { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
  ._file-options { justify-content: space-between; }
  @container (min-width: 576px) {
    ._file-fields { grid-template-columns: minmax(0, 280px) minmax(0, 176px); }
  }
  @container (min-width: 992px) {
    ._file-toolbar { grid-template-columns: minmax(0, 448px) minmax(0, 1fr); align-items: end; gap: 16px; }
  }
  @media (pointer: fine) {
    ._file-options :global(.cms-checkbox) { min-height: 36px; padding: 6px 0; }
  }
  @media (pointer: coarse) {
    ._file-toolbar :global(.cms-compact) { height: 44px; min-height: 44px; }
    ._file-fields input.cms-compact, ._file-fields select.cms-compact { font-size: 16px; }
    ._file-toolbar .cms-action-square { width: 44px; }
  }
  ._file-view-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  ._file-view-button[aria-pressed='true'], ._file-view-button[aria-pressed='true']:hover:not(:disabled) {
    background: var(--cms-accent); color: var(--cms-surface); border-color: var(--cms-accent);
  }
  ._file-results { position: relative; min-width: 0; }
  ._file-results__initial { min-height: 96px; }
  ._file-result-content { display: grid; min-width: 0; gap: 12px; }
  ._file-pagination { justify-content: center; margin-top: 4px; }
  ._file-page-status { display: flex; align-items: center; min-height: 44px; font-variant-numeric: tabular-nums; }
  ._file-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 128px), 1fr)); gap: 10px; }
  ._file-table { overflow-x: auto; }
  ._file-table th:first-child { width: 35%; }
  ._file-action {
    display: grid;
    justify-items: start;
    gap: 6px;
    min-width: 0;
    width: 100%;
    padding: 8px;
    text-align: left;
    color: var(--cms-ink);
    text-decoration: none;
    background: var(--cms-row);
    border: 1px solid var(--cms-border);
    border-radius: 8px;
  }
  ._file-action:hover, ._file-selected { background: var(--cms-row-hover); border-color: var(--cms-accent); }
  ._file-tiles ._file-action { align-content: start; min-height: 128px; }
  ._file-visual { display: grid; place-items: center; }
  ._file-tiles ._file-visual { width: 100%; height: 96px; border-radius: 4px; background: var(--cms-surface); }
  ._file-tiles ._file-visual :global(svg) { width: 32px; height: 32px; color: var(--cms-muted); }
  ._file-table ._file-action {
    grid-template-columns: auto minmax(0, 1fr); align-items: center; min-width: 128px; min-height: 44px; gap: 8px;
  }
  ._file-action img { width: 100%; height: 96px; object-fit: contain; }
  ._file-info { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; width: 100%; gap: 2px; }
  /* Keep the measured text from sizing its own table column. */
  ._file-table ._file-info { contain: inline-size; }
  ._file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ._file-path { max-width: 100%; color: var(--cms-muted); overflow-wrap: anywhere; }
</style>
