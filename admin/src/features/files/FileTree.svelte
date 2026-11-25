<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import { FileSort, type IFileBrowsePage, type IFileFolder, MediaRoot } from './files.types';
  import { browseFiles } from './files-api';

  let { siteId, version, selectedFolder, selectedRoot, onlyRoot, disabled, trail = [],
    onFolder, onFolders, onUnauthorized }: {
    siteId: string;
    version: string;
    selectedFolder: string | null;
    selectedRoot: MediaRoot;
    onlyRoot?: MediaRoot;
    trail?: readonly IFileFolder[];
    disabled: boolean;
    onFolder: (folderId: string | null, root: MediaRoot) => void;
    onFolders: (folders: readonly IFileFolder[]) => void;
    onUnauthorized: () => void;
  } = $props();
  const roots = $derived(onlyRoot ? [onlyRoot] : [MediaRoot.Images, MediaRoot.Files]);
  const pageSize = 25;
  const expanded = new SvelteSet<string>();
  const closedRoots = new SvelteSet<MediaRoot>();
  const branches = new SvelteMap<string, {
    root: MediaRoot;
    parent: string | null;
    page: number;
    result?: IFileBrowsePage;
    loading: boolean;
    error: boolean;
  }>();

  function key(root: MediaRoot, parent: string | null): string {
    return root + ':' + (parent ?? '');
  }

  async function load(root: MediaRoot, parent: string | null, page = 1): Promise<void> {
    const id = key(root, parent);
    const site = siteId;
    const previous = branches.get(id)?.result;
    const request = { root, parent, page, loading: true, error: false, ...(previous ? { result: previous } : {}) };

    branches.set(id, request);

    try {
      const result = await browseFiles(site, {
        root,
        folderId: parent,
        page,
        pageSize,
        foldersOnly: true,
        search: '',
        recursive: false,
        sort: FileSort.Name,
        descending: false,
      });

      if (site === siteId && branches.get(id) === request) {
        branches.set(id, { ...request, result, loading: false });
        onFolders([...result.breadcrumbs, ...result.folders]);
      }
    } catch (error) {
      if (site === siteId && branches.get(id) === request) {
        branches.set(id, { ...request, loading: false, error: true });

        if (error instanceof ContentRequestError && error.status === 401) {
          onUnauthorized();
        }
      }
    }
  }

  $effect(() => {
    void version;
    void siteId;
    void roots;

    untrack(() => {
      for (const root of roots) {
        if (!closedRoots.has(root)) {
          void load(root, null, branches.get(key(root, null))?.page);
        }
      }

      for (const value of [...branches.values()]) {
        if (value.parent && expanded.has(value.parent)) {
          void load(value.root, value.parent, value.page);
        }
      }
    });
  });

  function toggle(root: MediaRoot, folder: string): void {
    if (expanded.has(folder)) {
      expanded.delete(folder);
    } else {
      expanded.add(folder);

      if (!branches.has(key(root, folder))) {
        void load(root, folder);
      }
    }
  }

  $effect(() => {
    const path = trail;
    const root = selectedRoot;

    untrack(() => {
      for (const folder of path.slice(0, -1)) {
        expanded.add(folder.folderId);

        if (!branches.has(key(root, folder.folderId))) {
          void load(root, folder.folderId);
        }
      }
    });
  });
</script>

{#snippet branch(parent: string | null, root: MediaRoot)}
  {@const entry = branches.get(key(root, parent))}
  <ul class="file-tree-list" aria-busy={entry?.loading ?? false}>
    {#each entry?.result?.folders ?? [] as folder (folder.folderId)}
      <li>
        <div class="_file-tree-row" class:_file-tree-row__selected={selectedFolder === folder.folderId}>
          <button class="tree-disclosure" type="button" {disabled} data-folder-toggle={folder.folderId}
            aria-expanded={expanded.has(folder.folderId)}
            aria-label={$messages.folderToggle.replace('{name}', () => folder.name)}
            onclick={() => toggle(root, folder.folderId)}>{expanded.has(folder.folderId) ? '▾' : '▸'}</button>
          <button class="_file-tree-item _file-tree-item__folder"
            aria-current={selectedFolder === folder.folderId ? 'page' : undefined}
            {disabled} onclick={() => onFolder(folder.folderId, root)}>
            {@render folderIcon()}
            <span class="cms-drawer-label" title={folder.name}>{folder.name}</span>
          </button>
        </div>
        {#if expanded.has(folder.folderId)}{@render branch(folder.folderId, root)}{/if}
      </li>
    {/each}
    {#if entry?.error}
      <li><button class="cms-secondary" type="button" {disabled}
        onclick={() => void load(root, parent, entry.page)}>{$messages.fileBrowseRetry}</button></li>
    {/if}
    {#if entry?.result && entry.result.total > pageSize}
      <li class="_folder-pages">
        <button class="cms-secondary" type="button" disabled={disabled || entry.loading || entry.page === 1}
          onclick={() => void load(root, parent, entry.page - 1)}>{$messages.fileBrowsePrevious}</button>
        <span>{entry.page} / {Math.ceil(entry.result.total / pageSize)}</span>
        <button class="cms-secondary" type="button"
          disabled={disabled || entry.loading || entry.page * pageSize >= entry.result.total}
          onclick={() => void load(root, parent, entry.page + 1)}>{$messages.fileBrowseNext}</button>
      </li>
    {/if}
  </ul>
{/snippet}

{#snippet folderIcon()}
  <svg class="_source-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 7V5h7l2 2h9v13H3Z" />
  </svg>
{/snippet}

<nav aria-label={$messages.fileTree}>
  {#each roots as root (root)}
    <div class="_file-tree-row _file-tree-root"
      class:_file-tree-row__selected={selectedRoot === root && !selectedFolder}>
      <button class="tree-disclosure" type="button" {disabled} aria-expanded={!closedRoots.has(root)}
        aria-label={$messages.folderToggle.replace('{name}', () => 'assets/' + root)} onclick={() => {
          if (closedRoots.has(root)) {
            closedRoots.delete(root);

            if (!branches.has(key(root, null))) {
              void load(root, null);
            }
          } else {
            closedRoots.add(root);
          }
        }}>{closedRoots.has(root) ? '▸' : '▾'}</button>
      <button class="_file-tree-item _file-tree-item__folder"
        aria-current={selectedRoot === root && !selectedFolder ? 'page' : undefined}
        {disabled} onclick={() => onFolder(null, root)}>{@render folderIcon()}assets/{root}</button>
    </div>
    {#if !closedRoots.has(root)}{@render branch(null, root)}{/if}
  {/each}
</nav>

<style>
  ._folder-pages { display: flex; align-items: center; gap: 6px; }
</style>
