<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { followAdminLink, type IAdminRoute, navigateAdmin, sitePath } from '../../app/admin-route';
  import { adminLanguage, messages } from '../../i18n/i18n';
  import { type IAdminSite, WorkspacePanel } from '../../shared/api/content.types';
  import { contentError, ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import CmsDialog from '../../shared/ui/CmsDialog.svelte';
  import FolderContents from '../../shared/ui/FolderContents.svelte';
  import MiddleEllipsis from '../../shared/ui/MiddleEllipsis.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { showSnackBar, SnackBarVariant } from '../../shared/ui/snack-bar';
  import type { CanUseAction } from '../access/site-actions';
  import { formatFileSize } from './file-size';
  import {
    fileRoot, FileUsageGroup, FileValidationIssue, type IFileLibrary, type IFileReview, ImageUploadMode,
    type ISiteFile, MediaRoot,
  } from './files.types';
  import { changeImage, fileCommand, fileContentUrl, imageUsages, listFiles, uploadImage } from './files-api';
  import FileTree from './FileTree.svelte';
  import { imageMarkup } from './image-markup';
  import InlineFileName from './InlineFileName.svelte';

  let { can, site, route, active, desktop, onUnauthorized, onBusy }: {
    can: CanUseAction;
    site: IAdminSite;
    route: IAdminRoute;
    active: boolean;
    desktop: boolean;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
  } = $props();
  let library = $state<IFileLibrary>({ version: '0', pending: false, folders: [], files: [] });
  let loaded = $state(false);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let fileIssue = $state<FileValidationIssue | null>(null);
  let failedFilename = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let folderId = $state<string | null>(null);
  let selectedRoot = $state(MediaRoot.Images);
  let name = $state('');
  let destination = $state('');
  let folderSaved = $state(false);
  let folderName = $state('');
  let queue = $state<{ id: number; file: File; mode: ImageUploadMode; root: MediaRoot }[]>([]);
  let review = $state<IFileReview | null>(null);
  let deleteReviewed = $state(false);
  let usagesLoading = $state(false);
  let alt = $state('');
  let sizes = $state('');
  let sizesMissing = $state(false);
  let sizesInput = $state<HTMLInputElement>();
  let markup = $state('');
  let panel = $state(WorkspacePanel.Tree);
  let treeToggle = $state<HTMLButtonElement>();
  let editorToggle = $state<HTMLButtonElement>();
  let generation = 0;
  let queueId = 0;
  const canList = $derived(can('cms.files.list'));
  const canUpload = $derived(can('cms.files.upload'));
  const canCreateFolder = $derived(can('cms.files.create-folder'));
  const canReadContent = $derived(can('cms.files.read-content'));
  const canReview = $derived(can('cms.files.usages'));
  const mayMove = $derived(can('cms.files.move'));
  const mayDelete = $derived(can('cms.files.delete'));
  const canMove = $derived(canReview && mayMove);
  const canDelete = $derived(canReview && mayDelete);
  const file = $derived(library.files.find((item) => item.fileId === selectedId) ?? null);
  const basePath = $derived(sitePath(site.siteId) + '/files');
  const preview = $derived(file ? file.outputs.at(-1) : null);
  const isImage = $derived(file?.mimeType.startsWith('image/') ?? false);
  const rootLabel = $derived('assets/' + selectedRoot);
  const childFolders = $derived(library.folders.filter((item) => item.parentId === folderId
    && (item.root ?? MediaRoot.Images) === selectedRoot).toSorted((a, b) => a.name.localeCompare(b.name)));
  const childFiles = $derived(library.files.filter((item) => item.folderId === folderId
    && fileRoot(item) === selectedRoot).toSorted((a, b) => a.name.localeCompare(b.name)));
  const folderItems = $derived([
    ...childFolders.map((item) => ({
      id: item.folderId, label: item.name, detail: $messages.fileFolder,
    })),
    ...childFiles.map((item) => ({
      id: item.fileId,
      label: item.name,
      href: basePath + '/' + item.fileId,
      detail: item.mimeType + ' · ' + formatFileSize(item.byteSize, $adminLanguage),
    })),
  ]);
  const acceptedFiles = $derived(selectedRoot === MediaRoot.Images
    ? '.jpg,.jpeg,.png,.webp,.avif,.svg,.ico' : '.doc,.docx,.xls,.xlsx,.csv,.pdf,.json,.woff2');
  const visibleQueue = $derived(queue.filter((entry) => entry.root === selectedRoot));
  const imageWidths = $derived(file
    ? [...new SvelteSet(file.outputs.flatMap((output) => output.dimensions ? [output.dimensions.width] : []))]
      .sort((a, b) => a - b) : []);
  const nameDirty = $derived(file !== null && name !== file.name);
  const folderDirty = $derived(file !== null && destination !== (file.folderId ?? ''));
  const issueMessages = $derived({
    [FileValidationIssue.InvalidName]: $messages.fileInvalidName,
    [FileValidationIssue.NameTooLong]: $messages.fileNameTooLong,
    [FileValidationIssue.ReservedName]: $messages.fileReservedName,
    [FileValidationIssue.Empty]: $messages.fileEmpty,
    [FileValidationIssue.ImageTooLarge]: $messages.fileImageTooLarge,
    [FileValidationIssue.DocumentTooLarge]: $messages.fileDocumentTooLarge,
    [FileValidationIssue.UnsupportedFormat]: $messages.fileUnsupportedFormat,
    [FileValidationIssue.ContentMismatch]: $messages.fileContentMismatch,
    [FileValidationIssue.CsvEncoding]: $messages.fileCsvEncoding,
    [FileValidationIssue.CsvContent]: $messages.fileCsvContent,
    [FileValidationIssue.JsonContent]: $messages.fileJsonContent,
    [FileValidationIssue.ImageContent]: $messages.fileImageContent,
    [FileValidationIssue.ReadFailed]: $messages.fileReadFailed,
  });
  const errorText = $derived(fileIssue ? issueMessages[fileIssue]
    : error === ContentErrorMessage.Conflict ? $messages.filesConflict
      : error === ContentErrorMessage.Invalid ? $messages.filesInvalid
        : error === ContentErrorMessage.Missing ? $messages.filesMissing
          : error === ContentErrorMessage.Failed ? $messages.filesFailed : error ? $messages[error] : '');

  let moveRequest = $state<{
    selected: ISiteFile;
    name: string;
    folderId: string | null;
    expectedVersion: string;
    usages: IFileReview['usages'];
  } | null>(null);
  let referenceFailure = $state(false);

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      fileIssue = value instanceof ContentRequestError
        ? Object.values(FileValidationIssue).find((issue) => issue === value.code) ?? null : null;
      failedFilename = null;
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

  async function loadUsages(selected: ISiteFile): Promise<void> {
    if (!canReview) {
      return;
    }

    const captured = generation;
    const version = library.version;

    usagesLoading = true;
    review = null;

    try {
      const result = await imageUsages(site.siteId, selected.fileId, version);

      if (captured === generation && selectedId === selected.fileId && library.version === version) {
        review = result;
      }
    } catch (value) {
      if (captured === generation) {
        failure(value);
      }
    } finally {
      if (captured === generation) {
        usagesLoading = false;
      }
    }
  }

  function select(id: string | null): void {
    if (selectedId === id) {
      return;
    }
    generation++;
    selectedId = id;
    folderSaved = false;
    const selected = library.files.find((item) => item.fileId === id);

    if (selected) {
      selectedRoot = fileRoot(selected);
    }

    name = selected?.name ?? '';
    folderId = selected ? selected.folderId : folderId;
    destination = selected?.folderId ?? '';
    sizes = selected?.hasVariants
      ? Math.max(...selected.outputs.map((output) => output.dimensions?.width ?? 0)) + 'px' : '';
    review = null;
    deleteReviewed = false;
    markup = '';
    error = null;
    sizesMissing = false;

    if (selected) {
      void loadUsages(selected);
      void showPanel(WorkspacePanel.Editor);
    }
  }

  async function load(id: string | null): Promise<void> {
    if (!canList) {
      return;
    }

    const captured = ++generation;

    loading = true;
    error = null;

    try {
      const result = await listFiles(site.siteId);

      if (captured !== generation) {
        return;
      }
      library = result;
      loaded = true;
      selectedId = null;
      select(id);
    } catch (value) {
      if (captured === generation) {
        failure(value);
      }
    } finally {
      loading = false;
    }
  }

  async function perform(action: () => Promise<IFileLibrary>, filename: string | null = null): Promise<boolean> {
    if (busy) {
      return false;
    }
    busy = true;
    folderSaved = false;
    error = null;
    onBusy(true);

    try {
      library = await action();
      deleteReviewed = false;
      markup = '';
      review = null;

      if (file) {
        void loadUsages(file);
      }

      return true;
    } catch (value) {
      failure(value);
      failedFilename = filename;

      return false;
    } finally {
      busy = false;
      onBusy(false);
    }
  }

  function openFile(selected: ISiteFile): void {
    navigateAdmin(basePath + '/' + selected.fileId);
  }
  function openFolder(id: string | null, root: MediaRoot): void {
    selectedRoot = root;
    folderId = id;
    select(null);
    navigateAdmin(basePath);
    void showPanel(WorkspacePanel.Editor);
  }

  async function uploadQueue(): Promise<void> {
    if (!canList || !canUpload || !loaded) {
      return;
    }

    for (const entry of [...visibleQueue]) {
      const success = await perform(() => uploadImage(site.siteId, library.version, folderId, entry.file, entry.mode),
        entry.file.name);

      if (!success) {
        return;
      }
      queue = queue.filter((item) => item.id !== entry.id);
    }
  }

  async function replace(event: Event): Promise<void> {
    const input = event.currentTarget;

    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const replacement = input.files?.[0];
    const selected = file;

    if (!replacement || !selected) {
      return;
    }
    await perform(() => changeImage(site.siteId, selected.fileId, library.version, replacement), replacement.name);
    input.value = '';
  }

  async function remove(force: boolean): Promise<void> {
    const selected = file;

    if (!canDelete || !selected || busy) {
      return;
    }
    if (force && (!deleteReviewed || !review?.usages.length || review.version !== library.version)) {
      return;
    }
    if (!force) {
      await loadUsages(selected);

      if (!review || selectedId !== selected.fileId) {
        return;
      }
      deleteReviewed = true;

      if (review.usages.length) {
        return;
      }
    }
    if (
      await perform(() => fileCommand(site.siteId, '/' + selected.fileId + '/delete', {
        expectedVersion: library.version, force,
      }))
    ) {
      navigateAdmin(basePath);
    }
  }

  async function copy(picture: boolean): Promise<void> {
    if (!file) {
      return;
    }
    if (file.hasVariants && !sizes.trim()) {
      sizesMissing = true;
      sizesInput?.focus();

      return;
    }
    sizesMissing = false;
    markup = imageMarkup(file, picture, sizes, alt);

    try {
      await navigator.clipboard.writeText(markup);
      showSnackBar($messages.imageCodeCopied, SnackBarVariant.Success, 2000);
    } catch {
      showSnackBar($messages.imageCodeCopyFailed, SnackBarVariant.Failure, 2000);
    }
  }

  function folderLabel(id: string): string {
    const result: string[] = [];
    const visited = new SvelteSet<string>();
    let next: string | null = id;

    while (next && !visited.has(next)) {
      visited.add(next);
      const folder = library.folders.find((item) => item.folderId === next);

      if (!folder) {
        break;
      }
      result.unshift(folder.name);
      next = folder.parentId;
    }

    return '/' + result.join('/');
  }

  function moveAddresses(selected: ISiteFile, name: string, nextFolder: string | null):
  { from: string; to: string }[] {
    const removedSegments = selected.folderId ? folderLabel(selected.folderId).split('/').length + 1 : 1;
    const destination = nextFolder ? folderLabel(nextFolder).split('/').map(encodeURIComponent) : [];
    const stem = name.replace(/\.[^.]+$/, '');

    return selected.outputs.map((output) => {
      const parent = output.url.split('/').slice(0, -removedSegments);
      const filename = output.key === 'file' ? name : stem + '--' + output.key + '.webp';

      return { from: output.url, to: [...parent, ...destination, encodeURIComponent(filename)].join('/') };
    });
  }

  async function saveOrganization(event: SubmitEvent, rename: boolean): Promise<void> {
    event.preventDefault();
    const selected = file;

    if (!selected || busy || !(rename ? nameDirty : folderDirty)) {
      return;
    }
    await requestMove(selected, rename ? name : selected.name, rename ? selected.folderId : destination || null);
  }

  async function requestMove(selected: ISiteFile, nextName: string, nextFolder: string | null): Promise<void> {
    if (!canMove || busy || moveRequest || selected.name === nextName && selected.folderId === nextFolder) {
      return;
    }

    const captured = generation;
    const expectedVersion = library.version;

    busy = true;
    error = null;
    referenceFailure = false;
    onBusy(true);

    try {
      const found = await imageUsages(site.siteId, selected.fileId, expectedVersion);

      if (captured !== generation || library.version !== expectedVersion) {
        return;
      }
      moveRequest = { selected, name: nextName, folderId: nextFolder, expectedVersion, usages: found.usages };
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }

    if (moveRequest && !moveRequest.usages.length) {
      await applyMove(false);
    }
  }

  async function applyMove(updateReferences: boolean): Promise<void> {
    const pending = moveRequest;

    if (!canMove || !pending || busy) {
      return;
    }

    const renamed = pending.name !== pending.selected.name;
    const draftName = name;
    const draftDestination = destination;
    const saved = await perform(() => fileCommand(site.siteId, '/' + pending.selected.fileId + '/move', {
      expectedVersion: pending.expectedVersion,
      name: pending.name,
      folderId: pending.folderId,
      updateReferences,
    }));

    if (saved) {
      if (selectedId === pending.selected.fileId) {
        folderId = pending.folderId;
        destination = renamed ? draftDestination : pending.folderId ?? '';
        name = renamed ? pending.name : draftName;
        folderSaved = !renamed;
      }
      showSnackBar(renamed
        ? $messages.fileRenamed.replace('{old}', () => pending.selected.name).replace('{new}', () => pending.name)
        : $messages.fileMoved.replace('{name}', () => pending.name), SnackBarVariant.Success);
    } else if (updateReferences) {
      referenceFailure = true;
    }
    moveRequest = null;
  }

  function createFolder(event: SubmitEvent): void {
    event.preventDefault();

    if (!canList || !canCreateFolder || !loaded) {
      return;
    }

    void perform(() => fileCommand(site.siteId, '/folders', {
      expectedVersion: library.version, name: folderName, parentId: folderId, root: selectedRoot,
    })).then((saved) => {
      if (saved) {
        folderName = '';
      }
    });
  }

  function chooseFiles(event: Event): void {
    const input = event.currentTarget;

    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    queue = [...queue, ...Array.from(input.files ?? []).map((file) => ({
      id: ++queueId,
      file,
      root: selectedRoot,
      mode: selectedRoot === MediaRoot.Images ? ImageUploadMode.Responsive : ImageUploadMode.Original,
    }))];
    input.value = '';
  }

  function usageLabel(group: FileUsageGroup): string {
    return group === FileUsageGroup.Content ? $messages.imageUsageContent
      : group === FileUsageGroup.OpenGraph ? $messages.imageUsageOg : $messages.imageUsageTemplates;
  }

  $effect(() => {
    const id = route.fileId ?? null;

    if (active) {
      untrack(() => {
        if (!loaded) {
          void load(id);
        } else {
          select(id);
        }
      });
    }
  });
  onDestroy(() => {
    generation++;
  });
</script>

{#snippet copyIcon()}
  <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="9" width="11" height="12" rx="2" />
    <path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
  </svg>
{/snippet}
{#snippet deleteIcon()}
  <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
  </svg>
{/snippet}

<div class="site-viewport" hidden={!active}>
  {#if !canList}
    <main class="page-workspace" aria-label={$messages.files}>
      <div class="_workspace-toolbar"><h1 class="_workspace-title">{$messages.files}</h1></div>
      <div class="_workspace-scroll files-workspace">
        <p class="_file-hint">
          {canUpload && canCreateFolder ? $messages.filesWriteNeedsList
            : canUpload ? $messages.filesUploadNeedsList
              : canCreateFolder ? $messages.filesFolderNeedsList : $messages.filesNeedList}
        </p>
      </div>
    </main>
  {:else}
  <div class="site-panels" class:site-panels__editor={panel === WorkspacePanel.Editor}>
    <aside id="files-drawer" class="page-drawer" aria-label={$messages.fileTree}
      inert={!desktop && panel !== WorkspacePanel.Tree} aria-hidden={!desktop && panel !== WorkspacePanel.Tree}>
      <div class="_drawer-heading">
        <div class="_drawer-context"><span class="_setup-kicker">{site.primaryDomain}</span>
          <button class="cms-circle" bind:this={treeToggle} disabled={busy} aria-label={$messages.openWorkspace}
            aria-controls="files-workspace" onclick={() => {
              void showPanel(WorkspacePanel.Editor);
            }}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
        <div class="_drawer-title-row"><h2>{$messages.files}</h2>
          {#if canList}<RefreshButton disabled={busy || loading} onclick={() => {
            void load(selectedId);
          }} />{/if}
        </div>
      </div>
      {#if canList}<div use:scrollShadow class="_tree-scroll">
        {#if loading && !loaded}<p role="status" class="cms-loading">{$messages.loadingFiles}</p>
        {:else}<FileTree folders={library.folders} files={library.files} {selectedId}
          selectedFolder={folderId} {selectedRoot}
          disabled={busy || loading || library.pending || moveRequest !== null}
          onSelect={openFile} onFolder={openFolder}
          onMove={canMove ? (selected, folderId) => {
            void requestMove(selected, selected.name, folderId);
          } : undefined} />{/if}
      </div>
      {/if}<div class="_drawer-footer">{site.name}</div>
    </aside>
    <main id="files-workspace" class="page-workspace" aria-label={$messages.files} aria-busy={busy}
      inert={!desktop && panel !== WorkspacePanel.Editor} aria-hidden={!desktop && panel !== WorkspacePanel.Editor}>
      <div class="_workspace-toolbar">
        <button class="cms-circle" bind:this={editorToggle} disabled={busy} aria-label={$messages.fileTree}
          aria-controls="files-drawer" onclick={() => {
            void showPanel(WorkspacePanel.Tree);
          }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 class="_workspace-title">
          {#if file && canMove}
            {#key file.fileId}<InlineFileName value={file.name} disabled={busy || moveRequest !== null}
              onRename={(next) => {
                if (file) {
                  void requestMove(file, next, file.folderId);
                }
              }} />{/key}
          {:else if file}{file.name}
          {:else}{folderId ? folderLabel(folderId) : rootLabel}{/if}
        </h1>
      </div>
      <div use:scrollShadow class="_workspace-scroll files-workspace">
        {#if referenceFailure}<p class="cms-error" role="alert">{$messages.fileReferencesFailed}</p>{/if}
        {#if error}<p class="cms-error" role="alert">{failedFilename ? failedFilename + ': ' : ''}{errorText}</p>{/if}
        {#if library.pending}
          <p class="cms-error" role="alert">{$messages.filesPending}</p>
          {#if can('cms.files.reconcile')}<button class="cms-secondary" disabled={busy} onclick={() => {
            void perform(() => fileCommand(site.siteId, '/reconcile', {}));
          }}>{$messages.reconcileFiles}</button>{/if}
        {:else if file}
          {#if preview?.dimensions && canReadContent}
            <img class="_file-preview"
              src={fileContentUrl(site.siteId, file.fileId, preview.key) + '&v=' + library.version}
              width={preview.dimensions.width} height={preview.dimensions.height} alt="" />
          {/if}
          <p class="_file-metadata">
            {file.mimeType}
            {#if file.originalDimensions} · {file.originalDimensions.width} × {file.originalDimensions.height}{/if}
            · {formatFileSize(file.byteSize, $adminLanguage)}
          </p>
          {#if !canReview && (mayMove || mayDelete)}
            <p class="_file-hint">
              {mayMove && mayDelete ? $messages.fileChangeNeedsUsages
                : mayMove ? $messages.fileMoveNeedsUsages : $messages.fileDeleteNeedsUsages}
            </p>
          {/if}
          {#if can('cms.files.change-image')}<label class="cms-secondary _file-input-label">
              {isImage ? $messages.changeImage : $messages.changeFile}
            <input type="file" accept={acceptedFiles} disabled={busy} onchange={(event) => {
              void replace(event);
            }} />
          </label>{/if}
          {#if canReadContent}<a class="_file-original" href={fileContentUrl(site.siteId, file.fileId)}
            download={file.name}>
            {$messages.downloadOriginal}
          </a>{:else}<p class="_file-hint">{$messages.fileContentReadHint}</p>{/if}
          {#if canMove}<div class="_file-organization">
            <form class="cms-form" onsubmit={(event) => saveOrganization(event, true)}>
              <label class="_form-field" for="file-name">{$messages.fileName}</label>
              <div class="_file-save-row">
                <input id="file-name" bind:value={name} required disabled={busy} maxlength="180" />
                <button class={nameDirty ? 'cms-primary' : 'cms-secondary'} disabled={busy || !nameDirty}>
                  {$messages.saveFileName}
                </button>
              </div>
            </form>
            <form class="cms-form" onsubmit={(event) => saveOrganization(event, false)}>
              <label class="_form-field" for="file-folder">{$messages.fileFolder}</label>
              <div class="_file-save-row">
                <select id="file-folder" bind:value={destination} disabled={busy}>
                  <option value="">{rootLabel}</option>
                  {#each library.folders.filter((item) => (item.root ?? MediaRoot.Images) === selectedRoot) as folder
                    (folder.folderId)}
                    <option value={folder.folderId}>{folderLabel(folder.folderId)}</option>
                  {/each}
                </select>
                <button class={folderDirty ? 'cms-primary' : 'cms-secondary'} disabled={busy || !folderDirty}>
                  {$messages.saveFileFolder}
                </button>
              </div>
              {#if !busy && folderSaved && !folderDirty}
                <p class="cms-success" role="status">{$messages.fileFolderSaved}</p>
              {/if}
            </form>
            <p class="_file-hint">{$messages.fileMoveHint}</p>
          </div>
          {/if}{#if file.originalDimensions}
          <section class="file-variants" aria-labelledby="variants-heading">
            <h2 id="variants-heading">{$messages.imageVariants}</h2>
            <p>{$messages.originalImage}: {file.originalDimensions.width} × {file.originalDimensions.height}</p>
            <p class="_file-hint">{file.hasVariants ? $messages.responsiveImage : $messages.originalImageOnly}</p>
            <ul>{#each file.outputs as output (output.key)}
              <li>
                {#if canReadContent}
                  <a href={fileContentUrl(site.siteId, file.fileId, output.key)} target="_blank" rel="noopener">
                    {output.url.split('/').at(-1)}
                  </a>
                {:else}{output.url.split('/').at(-1)}{/if}
                <span>{output.dimensions?.width} × {output.dimensions?.height} · {output.mimeType}
                  {#if typeof output.byteSize === 'number'} · {formatFileSize(output.byteSize, $adminLanguage)}{/if}
                </span>
              </li>
            {/each}</ul>
          </section>
          {/if}
          {#if isImage}
          <section class="file-code" aria-labelledby="code-heading"><h2 id="code-heading">{$messages.imageCode}</h2>
            <label class="_form-field">{$messages.imageAlt}<input bind:value={alt} disabled={busy} /></label>
            {#if file.hasVariants}
              <div class="_file-size-options" role="group" aria-label={$messages.imageSizesPresets}>
                {#each imageWidths as width (width)}
                  <button type="button" class={sizes.trim() === width + 'px' ? 'cms-primary' : 'cms-secondary'}
                    aria-pressed={sizes.trim() === width + 'px'} disabled={busy} onclick={() => {
                      sizes = width + 'px';
                      sizesMissing = false;
                    }}>{width}px</button>
                {/each}
              </div>
              <label class="_form-field">sizes
              <input bind:this={sizesInput} bind:value={sizes} placeholder="(min-width: 992px) 50vw, 100vw"
                disabled={busy} aria-invalid={sizesMissing && !sizes.trim()}
                aria-describedby={sizesMissing && !sizes.trim()
                  ? 'file-sizes-hint file-sizes-error' : 'file-sizes-hint'} />
            </label>
              <p id="file-sizes-hint" class="_file-hint">{$messages.imageSizesHint}</p>
              {#if sizesMissing && !sizes.trim()}
                <p id="file-sizes-error" class="cms-error" role="alert">{$messages.imageSizesRequired}</p>
              {/if}
            {/if}
            <div class="_file-actions">
              <button class="cms-secondary cms-icon-button" disabled={busy} onclick={() => {
                void copy(false);
              }}>{@render copyIcon()}{$messages.copyImg}</button>
              <button class="cms-secondary cms-icon-button" disabled={busy} onclick={() => {
                void copy(true);
              }}>{@render copyIcon()}{$messages.copyPicture}</button></div>
            {#if markup}<label class="_form-field">HTML
              <textarea class="_source-input" value={markup} readonly rows="5"
                onclick={(event) => event.currentTarget.select()}></textarea>
            </label>{/if}
          </section>
          {:else}
            <section class="file-code">
              <h2>{$messages.publicFileUrl}</h2>
              <label class="_form-field">URL<input value={file.outputs[0]?.url ?? ''} readonly /></label>
              <button class="cms-secondary cms-icon-button" disabled={busy} onclick={async () => {
                try {
                  await navigator.clipboard.writeText(file!.outputs[0]!.url);
                  showSnackBar($messages.fileUrlCopied, SnackBarVariant.Success, 2000);
                } catch {
                  showSnackBar($messages.fileUrlCopyFailed, SnackBarVariant.Failure, 2000);
                }
              }}>{@render copyIcon()}{$messages.copyFileUrl}</button>
            </section>
          {/if}
          {#if canReview}<section class="file-usages" aria-labelledby="file-usages-heading">
            <h2 id="file-usages-heading">{$messages.whereImageUsed}</h2>
            {#if usagesLoading}<p role="status">{$messages.loadingFiles}</p>
            {:else if review}
              {#each [FileUsageGroup.Content, FileUsageGroup.OpenGraph, FileUsageGroup.Templates] as group (group)}
                <div class="_file-usage-group"><h3>{usageLabel(group)}</h3>
                  {#if review.usages.some((usage) => usage.group === group)}
                    <ul>{#each review.usages.filter((usage) => usage.group === group) as usage
                      (usage.editorPath + ':' + usage.field + ':' + usage.state)}
                    <li>{#if usage.readable}
                        <a href={usage.editorPath} onclick={followAdminLink}>{usage.title}</a>
                      {:else}<span>{usage.title}</span>{/if}
                      <span>{usage.field} · {usage.state}</span></li>{/each}</ul>
                  {:else}<p class="_file-hint">{$messages.imageNotUsedHere}</p>{/if}
                </div>
              {/each}
            {/if}
            {#if review?.usages.some((usage) => !usage.readable)}
              <p class="_file-hint">{$messages.sourceUsageReadHint}</p>
            {/if}
            <p class="_file-hint">{$messages.dynamicImageUsageHint}</p>
          </section>{/if}
          {#if canDelete}<div class="_file-delete">
            {#if deleteReviewed && review?.usages.length}
              <p role="status">{$messages.forceDeleteHint}</p>
              <button class="cms-danger cms-icon-button" disabled={busy} onclick={() => {
                void remove(true);
              }}>{@render deleteIcon()}{$messages.forceDelete}</button>
            {:else}<button class="cms-danger cms-icon-button" disabled={busy || usagesLoading} onclick={() => {
              void remove(false);
            }}>{@render deleteIcon()}{isImage ? $messages.deleteImage : $messages.deleteFile}</button>{/if}
          </div>{/if}
        {:else}
          <p class="_file-hint">{$messages.filesIntro}</p>
          {#if loaded}
            <FolderContents summary={$messages.folderFilesSummary.replace('{folders}', String(childFolders.length))
              .replace('{files}', String(childFiles.length))} items={folderItems} disabled={busy}
              onSelect={(id) => {
                const folder = childFolders.find((item) => item.folderId === id);
                const child = childFiles.find((item) => item.fileId === id);

                if (folder) {
                  openFolder(folder.folderId, selectedRoot);
                } else if (child) {
                  openFile(child);
                }
              }} />
          {/if}
          {#if canCreateFolder}
          <form class="cms-form _file-folder-form" onsubmit={createFolder}>
            <label class="_form-field">{$messages.newFolder}
              <input bind:value={folderName} required maxlength="180" disabled={busy} />
            </label>
            <button class="cms-secondary" disabled={busy || !loaded}>{$messages.createFolder}</button>
          </form>{/if}
          {#if canUpload}<section class="file-upload" aria-labelledby="upload-heading">
            <h2 id="upload-heading">
              {selectedRoot === MediaRoot.Images ? $messages.uploadImages : $messages.uploadFiles}
            </h2>
            <label class="cms-secondary _file-input-label">
              {selectedRoot === MediaRoot.Images ? $messages.chooseImages : $messages.chooseFiles}
              <input type="file" multiple accept={acceptedFiles}
                disabled={busy} onchange={chooseFiles} />
            </label>
            <p class="_file-hint">
              {selectedRoot === MediaRoot.Images ? $messages.uploadImageHint : $messages.uploadFileHint}
            </p>
            {#each visibleQueue as entry (entry.id)}<div class="_file-upload-row"><span>{entry.file.name}</span>
              <div class="_file-upload-controls">
                {#if selectedRoot === MediaRoot.Images}<label>{$messages.imageProcessing}<select
                  bind:value={entry.mode} disabled={busy}>
                  <option value={ImageUploadMode.Responsive}>{$messages.responsiveImage}</option>
                  <option value={ImageUploadMode.Original}>{$messages.originalImageOnly}</option>
                </select></label>{/if}
                <button class="cms-secondary" disabled={busy} onclick={() => {
                  queue = queue.filter((item) => item.id !== entry.id);
                }}>{$messages.cancel}</button>
              </div>
            </div>{/each}
            {#if visibleQueue.length}<button class="cms-primary" disabled={busy || !loaded} onclick={() => {
              void uploadQueue();
            }}>{busy ? $messages.uploadingImages
              : selectedRoot === MediaRoot.Images ? $messages.uploadImages : $messages.uploadFiles}</button>{/if}
          </section>{/if}
        {/if}
      </div>
    </main>
  </div>
  {/if}
</div>

<CmsDialog open={moveRequest !== null} title={$messages.fileAddressChange} {busy}
  onClose={() => {
    if (!busy) {
      moveRequest = null;
    }
  }}>
  {#if moveRequest}
    {@const addresses = moveAddresses(moveRequest.selected, moveRequest.name, moveRequest.folderId)}
    <p>{$messages.fileReferencesQuestion}</p>
    <dl class="file-address-changes">
      {#each addresses as { from, to } (from)}
        <dt>{$messages.fileCurrentAddress}</dt>
        <dd><code>{from}</code></dd>
        <dt>{$messages.fileNewAddress}</dt>
        <dd><code>{to}</code></dd>
      {/each}
    </dl>
    <ul class="file-address-usages">
      {#each moveRequest.usages as usage (usage.editorPath + ':' + usage.field + ':' + usage.state)}
        <li class="_file-address-usage">
          {#if usage.readable && !busy}
            <a href={usage.editorPath} onclick={(event) => {
              followAdminLink(event);

              if (event.defaultPrevented) {
                moveRequest = null;
              }
            }}><MiddleEllipsis text={usage.title} /></a>
          {:else}<MiddleEllipsis text={usage.title} />{/if}
          <div class="_file-reference-meta">
            <span class="_file-reference-part"><MiddleEllipsis text={usage.field} /></span>
            <span aria-hidden="true">·</span>
            <span class="_file-reference-part"><MiddleEllipsis text={usage.state} /></span>
          </div>
        </li>
      {/each}
    </ul>
    {#if moveRequest.usages.some((usage) => !usage.readable)}<p>{$messages.sourceUsageReadHint}</p>{/if}
    <p>{$messages.fileReferencesHint}</p>
    <div class="_form-actions">
      <button type="button" class="cms-secondary _file-reference-action" disabled={busy}
        onclick={() => moveRequest = null}>{$messages.cancel}</button>
      <button type="button" class="cms-secondary _file-reference-action" disabled={busy} onclick={() => {
        void applyMove(false);
      }}>
        {$messages.keepFileReferences}
      </button>
      <button type="button" class="cms-primary _file-reference-action" disabled={busy} onclick={() => {
        void applyMove(true);
      }}>
        {$messages.updateFileReferences}
      </button>
    </div>
  {/if}
</CmsDialog>

<style>
  .file-address-changes dd { margin: 0 0 8px; overflow-wrap: anywhere; }
  .file-address-usages { min-width: 0; max-width: 100%; padding-left: 20px; box-sizing: border-box; }
  ._file-address-usage { min-width: 0; margin-bottom: 8px; }
  ._file-reference-meta { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
  ._file-reference-part { flex: 1; min-width: 0; }
  ._file-reference-action { max-width: 100%; height: auto; white-space: normal; overflow-wrap: anywhere; }
</style>
