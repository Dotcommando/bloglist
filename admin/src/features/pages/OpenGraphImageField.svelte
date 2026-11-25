<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import { contentError, type ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import { MediaFileInputVariant } from '../../shared/ui/media-file-input.types';
  import MediaFileInput from '../../shared/ui/MediaFileInput.svelte';
  import { type IFileLibrary, type ISiteFile, mergeFiles } from '../files/files.types';
  import { fileContentUrl, listFiles } from '../files/files-api';
  import { imageOutputs } from '../files/image-outputs';
  import ImageLibraryDialog from '../files/ImageLibraryDialog.svelte';
  import { getSiteAddresses } from '../urls/urls-api';
  import { openGraphImageUrl } from './open-graph-image';

  let { siteId, value, disabled, readonly = false, canReadContent, onChange, onLibraryChange, onUnauthorized }: {
    siteId: string;
    canReadContent: boolean;
    value: string | null;
    disabled: boolean;
    readonly?: boolean;
    onChange: (url: string | null) => void;
    onLibraryChange: (library: IFileLibrary) => void;
    onUnauthorized: () => void;
  } = $props();
  let library = $state<IFileLibrary | null>(null);
  let publicOrigin = $state<string | null>(null);
  let open = $state(false);
  let loading = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let unavailable = $state(false);
  let disposed = false;
  let input = $state<MediaFileInput>();
  const selection = $derived.by(() => {
    for (const file of library?.files ?? []) {
      for (const output of imageOutputs(file.outputs)) {
        try {
          if (openGraphImageUrl(file, publicOrigin, output.key) === value) {
            return { file, output };
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  });
  const selected = $derived(selection?.file);

  onDestroy(() => disposed = true);
  onMount(() => {
    if (value) {
      void choose(false);
    }
  });

  const filename = $derived.by(() => {
    if (!value) {
      return null;
    }
    if (selected) {
      return selected.name;
    }

    try {
      const url = new URL(value);

      return decodeURIComponent(url.pathname.split('/').at(-1) ?? '') || url.hostname;
    } catch {
      return value;
    }
  });
  const previewUrl = $derived(canReadContent && selected
    ? fileContentUrl(siteId, selected.fileId, selection?.output.key) : null);

  async function choose(showDialog = true): Promise<void> {
    if (showDialog && readonly) {
      return;
    }
    loading = true;
    error = null;
    unavailable = false;

    try {
      const [addresses, files] = await Promise.all([getSiteAddresses(siteId), listFiles(siteId)]);

      if (!disposed) {
        publicOrigin = addresses.publicOrigin;
        updateLibrary(files);
        loading = false;
        await tick();

        if (!disposed && showDialog) {
          input?.focus();
          open = true;
        }
      }
    } catch (failure) {
      if (!disposed) {
        if (failure instanceof ContentRequestError && failure.status === 401) {
          onUnauthorized();
        } else {
          error = contentError(failure);
        }
      }
    } finally {
      loading = false;
    }
  }

  function updateLibrary(next: IFileLibrary): void {
    library = next;
    onLibraryChange(next);
  }

  function select(file: ISiteFile, outputKey?: string): void {
    if (readonly) {
      return;
    }

    try {
      onChange(openGraphImageUrl(file, publicOrigin, outputKey));
      unavailable = false;
    } catch {
      unavailable = true;
    }
  }
</script>

<div class="og-image-field">
  <MediaFileInput bind:this={input} id="page-og-image" label={$messages.ogImage} {filename} {previewUrl}
    {disabled} {readonly} {loading} onChoose={() => void choose()} onClear={() => onChange(null)}
    variant={MediaFileInputVariant.ImageSize} outputs={selected ? imageOutputs(selected.outputs) : []}
    outputKey={selection?.output.key ?? null} onOutputChange={(key) => {
      if (selected) {
        select(selected, key);
      }
    }} />
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if unavailable}<p class="cms-error" role="alert">{$messages.ogImageUnavailable}</p>{/if}
</div>

{#if open && !readonly}
  <ImageLibraryDialog {siteId} {canReadContent} selectedFileId={selected?.fileId ?? ''} onSelect={select}
    onLibraryChange={(next) => updateLibrary({ ...next, files: mergeFiles(library?.files ?? [], next.files) })}
    {onUnauthorized} onClose={() => open = false} />
{/if}

<style>
  .og-image-field { min-width: 0; margin-bottom: 24px; }
</style>
