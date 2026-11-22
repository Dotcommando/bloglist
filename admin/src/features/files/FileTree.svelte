<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import FileIcon from './FileIcon.svelte';
  import { fileRoot, type IFileFolder, type ISiteFile, MediaRoot } from './files.types';

  let { folders, files, selectedId, selectedFolder, selectedRoot = MediaRoot.Images,
    disabled, onSelect, onFolder, onMove }: {
    folders: readonly IFileFolder[];
    files: readonly ISiteFile[];
    selectedId: string | null;
    selectedFolder: string | null;
    selectedRoot?: MediaRoot;
    disabled: boolean;
    onMove?: ((file: ISiteFile, folderId: string | null) => void) | undefined;
    onSelect: (file: ISiteFile) => void;
    onFolder: (folderId: string | null, root: MediaRoot) => void;
  } = $props();
  const expanded = new SvelteSet<string>();
  const closedRoots = new SvelteSet<MediaRoot>();

  let draggedId = $state<string | null>(null);
  let dropTarget = $state<string | null>(null);

  function canDrop(folderId: string | null, root: MediaRoot): ISiteFile | undefined {
    const file = files.find((item) => item.fileId === draggedId);

    return onMove && !disabled && file && fileRoot(file) === root && file.folderId !== folderId ? file : undefined;
  }

  function dragOver(event: DragEvent, folderId: string | null, root: MediaRoot): void {
    if (canDrop(folderId, root)) {
      event.preventDefault();
      dropTarget = folderId ?? root;

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
    }
  }

  function drop(event: DragEvent, folderId: string | null, root: MediaRoot): void {
    const file = canDrop(folderId, root);

    event.preventDefault();
    dropTarget = null;
    draggedId = null;

    if (file) {
      if (folderId) {
        expanded.add(folderId);
      }
      closedRoots.delete(root);
      onMove?.(file, folderId);
    }
  }

  function toggle(folderId: string): void {
    if (expanded.has(folderId)) {
      expanded.delete(folderId);
    } else {
      expanded.add(folderId);
    }
  }

  function childFolders(parentId: string | null, root: MediaRoot): IFileFolder[] {
    return folders.filter((folder) => folder.parentId === parentId && (folder.root ?? MediaRoot.Images) === root)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function childFiles(parentId: string | null, root: MediaRoot): ISiteFile[] {
    return files.filter((file) => file.folderId === parentId && fileRoot(file) === root)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  $effect(() => {
    const currentFolders = folders;
    const currentFolder = selectedFolder;
    const currentFile = selectedId;

    untrack(() => {
      let id = currentFolders.find((folder) => folder.folderId === currentFolder)?.folderId;
      const visited = new SvelteSet<string>();

      if (currentFile && id) {
        expanded.add(id);
      }

      while (id && !visited.has(id)) {
        visited.add(id);
        const parent = currentFolders.find((folder) => folder.folderId === id)?.parentId;

        if (parent) {
          expanded.add(parent);
        }
        id = parent ?? undefined;
      }
    });
  });
</script>

{#snippet branch(parentId: string | null, root: MediaRoot)}
  <ul class="file-tree-list">
    {#each childFolders(parentId, root) as folder (folder.folderId)}
      <li>
        <div class="_file-tree-row"
          class:_file-tree-row__selected={selectedFolder === folder.folderId && !selectedId}>
          <button class="tree-disclosure" type="button" {disabled} data-folder-toggle={folder.folderId}
            aria-expanded={expanded.has(folder.folderId)}
            aria-label={$messages.folderToggle.replace('{name}', () => folder.name)}
            onclick={() => toggle(folder.folderId)}>{expanded.has(folder.folderId) ? '▾' : '▸'}</button>
          <button class="_file-tree-item _file-tree-item__folder"
            aria-current={selectedFolder === folder.folderId && !selectedId ? 'page' : undefined}
            class:_file-tree-item__drop={dropTarget === folder.folderId}
            ondragover={(event) => dragOver(event, folder.folderId, root)}
            ondragleave={() => dropTarget = null} ondrop={(event) => drop(event, folder.folderId, root)}
            {disabled} onclick={() => onFolder(folder.folderId, folder.root ?? MediaRoot.Images)}>
            <svg class="_source-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 7V5h7l2 2h9v13H3Z" />
            </svg>
            <span class="cms-drawer-label" title={folder.name}>{folder.name}</span>
          </button>
        </div>
        {#if expanded.has(folder.folderId)}{@render branch(folder.folderId, root)}{/if}
      </li>
    {/each}
    {#each childFiles(parentId, root) as file (file.fileId)}
      <li><button class="_file-tree-item _file-tree-item__file"
        aria-current={selectedId === file.fileId ? 'page' : undefined}
        draggable={Boolean(onMove) && !disabled}
        ondragstart={(event) => {
          draggedId = file.fileId;

          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', file.fileId);
          }
        }}
        ondragend={() => {
          draggedId = null;
          dropTarget = null;
        }}
        {disabled} onclick={() => onSelect(file)}>
        <FileIcon mimeType={file.mimeType} />
        <span class="cms-drawer-label" title={file.name}>{file.name}</span>
      </button></li>
    {/each}
  </ul>
{/snippet}

<nav aria-label={$messages.fileTree}>
  {#each [MediaRoot.Images, MediaRoot.Files] as root (root)}
    <div class="_file-tree-row _file-tree-root"
      class:_file-tree-row__selected={selectedRoot === root && !selectedFolder && !selectedId}>
      <button class="tree-disclosure" type="button" {disabled} aria-expanded={!closedRoots.has(root)}
        aria-label={$messages.folderToggle.replace('{name}', () => 'assets/' + root)} onclick={() => {
          if (closedRoots.has(root)) {
            closedRoots.delete(root);
          } else {
            closedRoots.add(root);
          }
        }}>{closedRoots.has(root) ? '▸' : '▾'}</button>
      <button class="_file-tree-item _file-tree-item__folder"
        aria-current={selectedRoot === root && !selectedFolder && !selectedId ? 'page' : undefined}
        class:_file-tree-item__drop={dropTarget === root}
        ondragover={(event) => dragOver(event, null, root)}
        ondragleave={() => dropTarget = null} ondrop={(event) => drop(event, null, root)}
        {disabled} onclick={() => onFolder(null, root)}>
        <svg class="_source-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7V5h7l2 2h9v13H3Z" />
        </svg>
        assets/{root}
      </button>
    </div>
    {#if !closedRoots.has(root)}{@render branch(null, root)}{/if}
  {/each}
</nav>

<style>
  ._file-tree-item__drop { outline: 2px solid var(--cms-accent); outline-offset: -2px; }
</style>
