<script lang="ts">
  import { untrack } from 'svelte';

  import { adminLanguage, messages } from '../../i18n/i18n';
  import { contentError, ContentErrorMessage, ContentRequestError } from '../../shared/api/content-api';
  import MediaFileInput from '../../shared/ui/MediaFileInput.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import { formatKibibytes } from '../files/file-size';
  import { deleteSiteFavicon, type ISiteFavicon, siteFavicon } from './site-favicon-api';

  let { can, siteId, origin, onUnauthorized, onBusy }: {
    can: CanUseAction;
    siteId: string;
    origin: string | null;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
  } = $props();
  let icon = $state<ISiteFavicon | null>(null);
  let error = $state<ContentErrorMessage | null>(null);
  let loading = $state(true);
  let uploading = $state(false);
  let removing = $state(false);
  let generation = 0;
  let uploadInput = $state<HTMLInputElement>();
  const previewUrl = $derived(icon && origin ? origin + '/favicon.ico?v=' + icon.version : null);

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else {
      error = contentError(value);
    }
  }

  async function load(id: string, revision: number): Promise<void> {
    try {
      const result = await siteFavicon(id);

      if (revision === generation) {
        icon = result;
      }
    } catch (value) {
      if (revision === generation) {
        failure(value);
      }
    } finally {
      if (revision === generation) {
        loading = false;
      }
    }
  }

  $effect(() => {
    const id = siteId;

    untrack(() => {
      icon = null;
      error = null;
      loading = true;
      void load(id, ++generation);
    });

    return () => {
      generation++;
    };
  });

  async function remove(): Promise<void> {
    if (!icon || loading || uploading || removing) {
      return;
    }

    const id = siteId;
    const revision = ++generation;

    error = null;
    removing = true;
    onBusy(true);

    try {
      await deleteSiteFavicon(id);

      if (revision === generation) {
        icon = null;
      }
    } catch (value) {
      if (revision === generation) {
        failure(value);
      }
    } finally {
      removing = false;
      onBusy(false);
    }
  }

  async function upload(event: Event): Promise<void> {
    const input = event.currentTarget;

    if (!(input instanceof HTMLInputElement) || !input.files?.[0] || uploading || removing) {
      return;
    }

    const file = input.files[0];
    const id = siteId;
    const revision = ++generation;

    error = null;
    loading = false;
    uploading = true;
    onBusy(true);

    try {
      const result = await siteFavicon(id, file);

      if (revision === generation) {
        icon = result;
      }
    } catch (value) {
      if (revision === generation) {
        failure(value);
      }
    } finally {
      input.value = '';
      uploading = false;
      onBusy(false);
    }
  }
</script>

<div class="_favicon-field">
  <MediaFileInput id="site-favicon" label="Favicon" filename={icon ? 'favicon.ico' : null} {previewUrl}
    loading={loading || uploading || removing}
    onChoose={can('cms.favicon.save') ? () => uploadInput?.click() : undefined}
    onClear={can('cms.favicon.delete') ? () => void remove() : undefined} describedBy="site-favicon-hint" />
  <input bind:this={uploadInput} type="file" accept=".ico" hidden
    disabled={loading || uploading || removing || !can('cms.favicon.save')} onchange={upload} />
  {#if icon}
    <small>favicon.ico · {formatKibibytes(icon.byteSize, $adminLanguage)} · {icon.width} × {icon.height} px</small>
  {/if}
  <small id="site-favicon-hint">{uploading ? ($messages.siteFaviconInputUploading)
    : ($messages.siteFaviconInputICOFileUploadingImmediatelyReplaces)}</small>
  {#if error}
    <p class="_form-error" role="alert">
      {error === ContentErrorMessage.Invalid
        ? ($messages.siteFaviconInputChooseAValidICOFile)
        : $messages[error]}
    </p>
  {/if}
</div>

<style>
  ._favicon-field { min-width: 0; display: grid; gap: 8px; align-content: start; }
  small { color: var(--cms-muted); font-size: 12px; line-height: 1.6; }
</style>
