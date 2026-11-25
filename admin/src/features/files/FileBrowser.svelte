<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { adminLanguage, messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { formatFileSize } from './file-size';
  import FileIcon from './FileIcon.svelte';
  import { FileSort, type IFileBrowsePage, type ISiteFile, type MediaRoot } from './files.types';
  import { browseFiles, fileContentUrl } from './files-api';

  let { siteId, root, folderId, mimeTypes, version = '', selectedId = null, disabled = false, canReadContent = true,
    onFolder, onFile, onPage, onUnauthorized, fileHref }: {
    siteId: string;
    root: MediaRoot;
    folderId: string | null;
    mimeTypes?: readonly string[] | undefined;
    version?: string;
    selectedId?: string | null;
    disabled?: boolean;
    canReadContent?: boolean;
    onFolder: (id: string | null) => void;
    onFile: (file: ISiteFile) => void;
    onPage?: (result: IFileBrowsePage, folderId: string | null) => void;
    onUnauthorized: () => void;
    fileHref?: (file: ISiteFile) => string;
  } = $props();
  const id = $props.id();
  let query = $state('');
  let recursive = $state(false);
  let sort = $state(FileSort.Name);
  let descending = $state(false);
  let grid = $state(true);
  let page = $state(1);
  let pageSize = $state(25);
  let revision = $state(0);
  let result = $state<IFileBrowsePage>();
  let loading = $state(true);
  let error = $state<ContentErrorMessage | null>(null);
  const failed = new SvelteSet<string>();
  const pages = $derived(Math.max(1, Math.ceil((result?.total ?? 0) / pageSize)));
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
    let active = true;

    loading = true;
    error = null;

    const timer = setTimeout(() => {
      void browseFiles(scope, input).then((next) => {
        if (active) {
          const last = Math.max(1, Math.ceil(next.total / input.pageSize));

          if (input.page > last) {
            page = last;
          } else {
            result = next;
            failed.clear();
            onPage?.(next, input.folderId);
          }
        }
      }).catch((value: unknown) => {
        if (active) {
          if (value instanceof ContentRequestError && value.status === 401) {
            onUnauthorized();
          } else {
            error = contentError(value);
          }
        }
      }).finally(() => {
        if (active) {
          loading = false;
        }
      });
    }, 120);

    return () => {
      active = false;
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
  {#if recursive && result?.paths[itemId]}
    <small class="_file-path">{result.paths[itemId]}</small>
  {/if}
{/snippet}

{#snippet fileLabel(file: ISiteFile, thumbnail: boolean)}
  {@const preview = file.outputs.find((output) => output.key !== 'file') ?? file.outputs.find((output) =>
    output.mimeType.startsWith('image/') && output.byteSize != null && output.byteSize <= 128 * 1024
    && (output.dimensions?.width ?? Infinity) <= 640 && (output.dimensions?.height ?? Infinity) <= 640)}
  {#if thumbnail && canReadContent && preview && !failed.has(file.fileId)}
    <img src={fileContentUrl(siteId, file.fileId, preview.key) + '&v=' + encodeURIComponent(file.assetVersion ?? '')}
      alt="" loading="lazy" onerror={() => failed.add(file.fileId)} />
  {:else}
    <FileIcon mimeType={file.mimeType} />
  {/if}
  <span class="_file-name" title={file.name}>{file.name}</span>
  {@render itemPath(file.fileId)}
{/snippet}

{#snippet fileAction(file: ISiteFile, thumbnail: boolean)}
  {#if fileHref}
    <a class="_file-action" class:_file-selected={selectedId === file.fileId} href={fileHref(file)}
      aria-disabled={disabled || loading} tabindex={disabled || loading ? -1 : undefined}
      onclick={(event) => selectFile(event, file)}>{@render fileLabel(file, thumbnail)}</a>
  {:else}
    <button class="_file-action" class:_file-selected={selectedId === file.fileId} type="button"
      aria-pressed={selectedId === file.fileId} disabled={disabled || loading}
      onclick={() => onFile(file)}>{@render fileLabel(file, thumbnail)}</button>
  {/if}
{/snippet}

<section class="file-browser folder-contents" aria-label={$messages.folderContents} aria-busy={loading}>
  {#if fileHref}<h2>{$messages.folderContents}</h2>{/if}
  <nav class="_file-browser-bar" aria-label={$messages.folderContents}>
    {#if folderId === null}<span aria-current="location">assets/{root}</span>
    {:else}
      <button class="cms-secondary" type="button" {disabled} onclick={() => onFolder(null)}>assets/{root}</button>
    {/if}
    {#each result?.breadcrumbs ?? [] as folder (folder.folderId)}
      <span aria-hidden="true">/</span>
      <button class="cms-secondary" type="button" disabled={disabled || loading || folder.folderId === folderId}
        onclick={() => onFolder(folder.folderId)}>{folder.name}</button>
    {/each}
  </nav>
  <div class="_file-browser-bar">
    <label class="_file-filter" for={id + '-search'}>{$messages.fileBrowseSearch}
      <input id={id + '-search'} type="search" bind:value={query} maxlength="180" {disabled} />
    </label>
    <label><input type="checkbox" bind:checked={recursive} {disabled} /> {$messages.fileBrowseRecursive}</label>
    <label class="_file-filter">{$messages.fileBrowseSort}
      <select bind:value={sort} {disabled}>
        {#each Object.values(FileSort) as field (field)}
          <option value={field}>{labels[field]}</option>
        {/each}
      </select>
    </label>
    <button class="cms-secondary" type="button" aria-pressed={descending} {disabled}
      onclick={() => descending = !descending}>{descending ? '↓' : '↑'} {$messages.fileBrowseSort}</button>
    <button class="cms-secondary" type="button" aria-pressed={grid} {disabled}
      onclick={() => layout(true)}>{$messages.fileBrowseGrid}</button>
    <button class="cms-secondary" type="button" aria-pressed={!grid} {disabled}
      onclick={() => layout(false)}>{$messages.fileBrowseList}</button>
    <RefreshButton disabled={disabled || loading} onclick={() => revision++} />
  </div>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if loading}<p role="status">{$messages.loadingFiles}</p>{/if}
  {#if result}
    {#if fileHref && !recursive}
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
            {@render folderIcon()}<span class="_file-name" title={folder.name}>{folder.name}</span>
            {@render itemPath(folder.folderId)}
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
                  onclick={() => onFolder(folder.folderId)}>{@render folderIcon()}{folder.name}
                  {@render itemPath(folder.folderId)}
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
    <div class="_file-browser-bar">
      <button class="cms-secondary" type="button" disabled={disabled || loading || page <= 1}
        onclick={() => page--}>{$messages.fileBrowsePrevious}</button>
      <span role="status">{page} / {pages} · {result.total}</span>
      <button class="cms-secondary" type="button" disabled={disabled || loading || page >= pages}
        onclick={() => page++}>{$messages.fileBrowseNext}</button>
      <label>{$messages.fileBrowsePageSize}
        <select bind:value={pageSize} {disabled}>
          {#each [25, 50, 100] as size (size)}<option value={size}>{size}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
</section>

<style>
  .file-browser { display: grid; min-width: 0; gap: 12px; }
  .file-browser h2, .file-browser p { margin: 0; }
  ._file-browser-bar { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
  ._file-filter { display: grid; gap: 4px; min-width: 0; }
  ._file-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 128px), 1fr)); gap: 10px; }
  ._file-table { overflow-x: auto; }
  ._file-action {
    display: grid;
    justify-items: start;
    gap: 6px;
    min-width: 0;
    width: 100%;
    padding: 8px;
    text-align: left;
    color: var(--cms-ink);
    background: var(--cms-row);
    border: 1px solid var(--cms-border);
    border-radius: 8px;
  }
  ._file-action:hover, ._file-selected { background: var(--cms-row-hover); border-color: var(--cms-accent); }
  ._file-tiles ._file-action { min-height: 72px; }
  ._file-action img { width: 100%; height: 96px; object-fit: contain; }
  ._file-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ._file-path { max-width: 100%; color: var(--cms-muted); overflow-wrap: anywhere; }
</style>
