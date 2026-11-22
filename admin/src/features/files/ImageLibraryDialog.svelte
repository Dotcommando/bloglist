<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import CmsDialog from '../../shared/ui/CmsDialog.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { type IFileLibrary, ImageUploadMode, type ISiteFile } from './files.types';
  import { fileContentUrl, listFiles, uploadImage } from './files-api';

  let { siteId, selectedFileId, canReadContent = true, onSelect, onLibraryChange, onClose, onUnauthorized }: {
    siteId: string;
    canReadContent?: boolean;
    selectedFileId: string;
    onSelect: (file: ISiteFile) => void;
    onLibraryChange: (library: IFileLibrary) => void;
    onClose: () => void;
    onUnauthorized: () => void;
  } = $props();
  const id = $props.id();
  const batchSize = 48;
  let library = $state<IFileLibrary | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let unsupported = $state(false);
  let query = $state('');
  let selectedId = $state(untrack(() => selectedFileId));
  let open = $state(true);
  let visibleCount = $state(batchSize);
  let brokenPreviews = $state<string[]>([]);
  const images = $derived((library?.files ?? []).filter((file) => file.mimeType.startsWith('image/')));
  const filtered = $derived(images.filter((file) => file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const visible = $derived(filtered.slice(0, visibleCount));
  const selection = $derived(images.find((file) => file.fileId === selectedId));
  let disposed = false;

  $effect(() => {
    void query;
    visibleCount = batchSize;
  });

  onMount(() => {
    void reload();

    return () => {
      disposed = true;
    };
  });

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
    }
  }

  async function reload(): Promise<void> {
    loading = true;
    error = null;
    unsupported = false;

    try {
      const next = await listFiles(siteId);

      if (!disposed) {
        library = next;
        brokenPreviews = [];
        onLibraryChange(next);
      }
    } catch (value) {
      if (!disposed) {
        failure(value);
      }
    } finally {
      loading = false;
    }
  }

  async function upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];

    input.value = '';

    if (!file || !library || busy || loading) {
      return;
    }
    error = null;
    unsupported = !/\.(?:jpe?g|png|webp|avif|svg|ico)$/i.test(file.name);

    if (unsupported) {
      return;
    }
    busy = true;

    try {
      const previousIds = new Set(library.files.map((item) => item.fileId));
      const next = await uploadImage(siteId, library.version, null, file, ImageUploadMode.Responsive);

      if (disposed) {
        return;
      }
      library = next;
      onLibraryChange(next);
      const added = next.files.filter((item) => !previousIds.has(item.fileId) && item.mimeType.startsWith('image/'));

      if (added.length !== 1 || !added[0]) {
        throw new Error('The uploaded image identity is unavailable');
      }
      onSelect(added[0]);
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

<CmsDialog {open} title={$messages.imageLibrary} {busy} wide {onClose}>
  <div class="image-library">
    <label for={id + '-search'}>{$messages.imageLibrarySearch}</label>
    <input id={id + '-search'} type="search" bind:value={query} disabled={busy}
      placeholder={$messages.imageLibrarySearchPlaceholder} onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
        } else if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          open = false;
        }
      }} />
    <div class="_image-library-tools">
      <label class="cms-secondary _image-library-upload" aria-disabled={busy || loading || !library}>
        {busy ? $messages.uploadingImages : $messages.imageLibraryUpload}
        <input class="_image-library-file" type="file" accept=".jpg,.jpeg,.png,.webp,.avif,.svg,.ico"
          aria-label={$messages.imageLibraryUpload} disabled={busy || loading || !library}
          onchange={(event) => void upload(event.currentTarget)} />
      </label>
      <RefreshButton disabled={busy || loading} onclick={() => void reload()} />
    </div>
    <small>{$messages.imageLibraryUploadHint}</small>
    {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
    {#if unsupported}<p class="cms-error" role="alert">{$messages.fileUnsupportedFormat}</p>{/if}
    {#if loading}<p role="status">{$messages.imageLibraryLoading}</p>
    {:else if library}
      <p class="_image-library-count" role="status">{$messages.imageLibraryCount
        .replace('{shown}', String(visible.length)).replace('{total}', String(filtered.length))}</p>
      {#if !canReadContent && filtered.length}
        <p class="_image-library-count">{$messages.imageLibraryPreviewNeedsContent}</p>
      {/if}
      {#if filtered.length === 0}
        <p>{$messages.imageLibraryEmpty}</p>
      {:else}
        <div class="_image-library-grid">
          {#each visible as file (file.fileId)}
            {@const output = file.outputs.find((item) => (item.dimensions?.width ?? 0) >= 160) ?? file.outputs.at(-1)}
            <button class="_image-library-item" class:_image-library-item__selected={selectedId === file.fileId}
              type="button" aria-label={file.name} aria-pressed={selectedId === file.fileId}
              disabled={busy} onclick={() => selectedId = file.fileId}>
              {#if canReadContent && output && !brokenPreviews.includes(file.fileId)}
                <img src={fileContentUrl(siteId, file.fileId, output.key) + '&v=' + library.version}
                  width={output.dimensions?.width} height={output.dimensions?.height} alt="" loading="lazy"
                  onerror={() => brokenPreviews = [...brokenPreviews, file.fileId]} />
              {:else}
                <span class="_image-library-preview-missing">{$messages.imageLibraryPreviewMissing}</span>
              {/if}
              <span class="_image-library-name" title={file.name}>{file.name}</span>
              {#if file.originalDimensions}
                <small>{file.originalDimensions.width} × {file.originalDimensions.height}</small>
              {/if}
            </button>
          {/each}
        </div>
        {#if visibleCount < filtered.length}
          <button class="cms-secondary" type="button" disabled={busy}
            onclick={() => visibleCount += batchSize}>{$messages.imageLibraryMore}</button>
        {/if}
      {/if}
    {/if}
    <div class="_image-library-actions">
      <button class="cms-secondary" type="button" disabled={busy}
        onclick={() => open = false}>{$messages.cancel}</button>
      <button class="cms-primary" type="button" disabled={!selection || loading || busy || Boolean(error)}
        onclick={() => {
          if (selection) {
            onSelect(selection);
            open = false;
          }
        }}>{$messages.imageLibraryUse}</button>
    </div>
  </div>
</CmsDialog>

<style>
  .image-library { display: grid; gap: 12px; min-width: 0; }
  .image-library > input { width: 100%; min-width: 0; }
  ._image-library-tools, ._image-library-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  ._image-library-actions { justify-content: flex-end; padding: 16px 0; background: var(--cms-surface); }
  ._image-library-upload {
    display: inline-flex;
    align-items: center;
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  ._image-library-upload:focus-within { outline: 2px solid var(--cms-accent); outline-offset: 3px; }
  ._image-library-upload[aria-disabled="true"] { opacity: .55; cursor: default; }
  ._image-library-file { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  ._image-library-count { margin: 0; font-size: 13px; color: var(--cms-muted); }
  ._image-library-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    max-height: 44vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2px;
  }
  ._image-library-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 8px;
    text-align: left;
    border: 1px solid var(--cms-border);
    border-radius: 8px;
    background: var(--cms-row);
    color: var(--cms-ink);
  }
  ._image-library-item:hover:not(:disabled) { background: var(--cms-row-hover); }
  ._image-library-item:focus-visible { outline: 2px solid var(--cms-accent); outline-offset: 1px; }
  ._image-library-item__selected { border-color: var(--cms-accent); background: var(--cms-row-hover); }
  ._image-library-item img, ._image-library-preview-missing {
    display: block;
    width: 100%;
    height: 112px;
    object-fit: contain;
  }
  ._image-library-preview-missing { padding: 12px; overflow-wrap: anywhere; font-size: 12px; }
  ._image-library-name {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  @media (min-width: 576px) { ._image-library-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (min-width: 992px) { ._image-library-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
