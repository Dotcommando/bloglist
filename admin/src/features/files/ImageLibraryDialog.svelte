<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import CmsDialog from '../../shared/ui/CmsDialog.svelte';
  import FileBrowser from './FileBrowser.svelte';
  import {
    fileRoot, FileValidationIssue, type IFileBrowsePage, type IFileLibrary, ImageUploadMode, type ISiteFile, MediaRoot,
  } from './files.types';
  import { getFile, uploadImage } from './files-api';

  let { siteId, selectedFileId, root = MediaRoot.Images, startFolder = null, mimeTypes, allowUpload = true,
    canReadContent = true, onSelect, onLibraryChange, onClose, onUnauthorized }: {
    siteId: string;
    canReadContent?: boolean;
    selectedFileId: string;
    root?: MediaRoot;
    startFolder?: string | null;
    mimeTypes?: readonly string[] | undefined;
    allowUpload?: boolean;
    onSelect: (file: ISiteFile) => void;
    onLibraryChange?: (library: IFileLibrary) => void;
    onClose: () => void;
    onUnauthorized: () => void;
  } = $props();
  const initialFileId = untrack(() => selectedFileId);
  let initializing = $state(true);
  let current = $state<IFileBrowsePage>();
  let folderId = $state<string | null>(untrack(() => startFolder));
  let busy = $state(false);
  let error = $state<ContentErrorMessage | 'filePickerType' | null>(null);
  let selection = $state<ISiteFile>();
  let open = $state(true);
  let disposed = false;

  onMount(() => {
    void initialize();

    return () => {
      disposed = true;
    };
  });

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else if (value instanceof ContentRequestError && value.code === FileValidationIssue.PickerType) {
      error = 'filePickerType';
    } else {
      error = contentError(value);
    }
  }

  async function initialize(): Promise<void> {
    try {
      if (initialFileId) {
        const file = await getFile(siteId, initialFileId);

        if (!disposed && matches(file)) {
          selection = file;
          folderId = file.folderId;
        }
      }
    } catch (value) {
      if (!disposed && !(value instanceof ContentRequestError && value.status === 404)) {
        failure(value);
      }
    } finally {
      if (!disposed) {
        initializing = false;
      }
    }
  }

  function matches(file: ISiteFile): boolean {
    return fileRoot(file) === root && (!mimeTypes?.length || mimeTypes.includes(file.mimeType));
  }

  function openFolder(id: string | null): void {
    current = undefined;
    folderId = id;
    selection = undefined;
    error = null;
  }

  async function upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];

    input.value = '';

    if (!file || !current || busy || current.pending) {
      return;
    }
    error = null;
    busy = true;

    try {
      const mode = root === MediaRoot.Images ? ImageUploadMode.Responsive : ImageUploadMode.Original;
      const next = await uploadImage(siteId, current.version, folderId, file, mode, mimeTypes);

      if (disposed) {
        return;
      }
      onLibraryChange?.(next);
      const name = file.name.normalize('NFC').toLowerCase();
      const added = next.files.find((item) =>
        item.folderId === folderId && matches(item)
        && item.name.normalize('NFC').toLowerCase() === name);

      if (!added) {
        throw new Error('The uploaded image identity is unavailable');
      }
      onSelect(added);
      open = false;
    } catch (value) {
      if (!disposed) {
        failure(value);
      }
    } finally {
      busy = false;
    }
  }
</script>

<CmsDialog {open} title={root === MediaRoot.Images ? $messages.imageLibrary : $messages.files} {busy} wide {onClose}>
  <div class="image-library">
    {#if initializing}
      <p role="status">{$messages.imageLibraryLoading}</p>
    {:else}
      <FileBrowser {siteId} {root} {folderId} {canReadContent} {mimeTypes} disabled={busy}
        selectedId={selection?.fileId ?? null} onFolder={openFolder} onFile={(file) => selection = file}
        onPage={(result) => current = result} {onUnauthorized} />
    {/if}
    {#if allowUpload}
      {@const images = root === MediaRoot.Images}
      {@const label = images ? $messages.imageLibraryUpload : $messages.uploadFiles}
      <label class="cms-secondary _image-library-upload" aria-disabled={busy || !current || current.pending}>
        {busy ? $messages.uploadingImages : label}
        <input class="_image-library-file" type="file"
          accept={mimeTypes?.length ? mimeTypes.join(',') : images ? '.jpg,.jpeg,.png,.webp,.avif,.svg,.ico'
            : '.doc,.docx,.xls,.xlsx,.csv,.pdf,.json,.woff2'}
          aria-label={label} disabled={busy || !current || current.pending}
          onchange={(event) => void upload(event.currentTarget)} />
      </label>
      <small>{images ? $messages.imageLibraryUploadHint : $messages.uploadFileHint}</small>
    {/if}
    {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
    <div class="_image-library-actions">
      <button class="cms-secondary" type="button" disabled={busy}
        onclick={() => open = false}>{$messages.cancel}</button>
      <button class="cms-primary" type="button" disabled={!selection || busy}
        onclick={() => {
          if (selection) {
            onSelect(selection);
            open = false;
          }
        }}>{root === MediaRoot.Images ? $messages.imageLibraryUse : $messages.fileBrowseUse}</button>
    </div>
  </div>
</CmsDialog>

<style>
  .image-library { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; min-width: 0; }
  ._image-library-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; padding: 16px 0; }
  ._image-library-upload { position: relative; overflow: hidden; justify-self: start; cursor: pointer; }
  ._image-library-upload:focus-within { outline: 2px solid var(--cms-accent); outline-offset: 3px; }
  ._image-library-upload[aria-disabled="true"] { opacity: .55; cursor: default; }
  ._image-library-file { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
</style>
