<script lang="ts">
  import { tick } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import { MediaFileInputVariant } from '../../shared/ui/media-file-input.types';
  import MediaFileInput from '../../shared/ui/MediaFileInput.svelte';
  import FileReferenceWarnings from '../files/FileReferenceWarnings.svelte';
  import type { IFileLibrary, ISiteFile } from '../files/files.types';
  import { fileContentUrl } from '../files/files-api';
  import { defaultImageOutput, imageOutputs } from '../files/image-outputs';
  import ImageLibraryDialog from '../files/ImageLibraryDialog.svelte';
  import { isEmptyTvValue, type ITvField, TvImageMode, TvKind, type TvValue } from './template-variables.types';

  let { field, value, onChange, files, siteId, id, disabled = false, readonly = false, allowDefault = true,
    onLibraryChange, onUnauthorized }: {
    field: ITvField;
    value: TvValue | undefined;
    onChange: (value: TvValue | undefined) => void;
    files: readonly ISiteFile[];
    onLibraryChange: (library: IFileLibrary) => void;
    onUnauthorized: () => void;
    siteId: string;
    id: string;
    disabled?: boolean;
    readonly?: boolean;
    allowDefault?: boolean;
  } = $props();
  const media = $derived.by(() => {
    const candidate = value ?? initial();

    return candidate && typeof candidate === 'object' && candidate.kind !== TvKind.Markdown ? candidate : null;
  });
  const defaultValue = $derived(allowDefault && isEmptyTvValue(value) && !isEmptyTvValue(field.defaultValue)
    ? field.defaultValue : undefined);
  const defaultCaption = $derived(typeof defaultValue === 'string' ? defaultValue
    : defaultValue?.kind === TvKind.Markdown ? defaultValue.text
      : defaultValue ? files.find((item) => item.fileId === defaultValue.fileId)?.name ?? defaultValue.fileId : '');
  const file = $derived(files.find((file) => file.fileId === media?.fileId));
  const literalValue = $derived(defaultValue ?? value);
  const choices = $derived(files.filter((file) => field.kind !== TvKind.Image || file.mimeType.startsWith('image/')));
  let libraryOpen = $state(false);
  let mediaInput = $state<MediaFileInput>();

  function initial(): TvValue {
    if (field.kind === TvKind.Text) {
      return '';
    }
    if (field.kind === TvKind.Markdown) {
      return { kind: TvKind.Markdown, text: '' };
    }
    if (field.kind === TvKind.File) {
      return { kind: TvKind.File, fileId: '', label: '' };
    }

    return { kind: TvKind.Image, fileId: '', mode: TvImageMode.Responsive, alt: '' };
  }

  function selectFile(fileId: string, selection?: ISiteFile): void {
    if (!fileId) {
      onChange(undefined);

      return;
    }
    if (!media) {
      return;
    }

    const selected = selection ?? files.find((item) => item.fileId === fileId);

    onChange(media.kind === TvKind.File ? { ...media, fileId, label: media.label || selected?.name || '' } : {
      ...media,
      fileId,
      ...(media.mode === TvImageMode.Single ? { key: defaultImageOutput(selected?.outputs ?? [])?.key ?? 'file' } : {}),
    });
  }
</script>

<div class="tv-value">
    {#if field.kind === TvKind.Text}
      <label for={id}>{field.caption}</label>
      <input {id} value={typeof value === 'string' ? value : ''} {disabled} {readonly}
        aria-describedby={defaultValue !== undefined ? id + '-default-hint' : undefined}
        oninput={(event) => onChange(event.currentTarget.value || undefined)} />
    {:else if field.kind === TvKind.Markdown}
      <label for={id}>{field.caption}</label>
      <textarea {id} rows="6" {disabled} {readonly}
        value={value && typeof value === 'object' && value.kind === TvKind.Markdown ? value.text : ''}
        aria-describedby={defaultValue !== undefined ? id + '-default-hint' : undefined}
        oninput={(event) => onChange(event.currentTarget.value
          ? { kind: TvKind.Markdown, text: event.currentTarget.value } : undefined)}></textarea>
    {:else if media}
      {#if media.kind === TvKind.Image}
        <MediaFileInput bind:this={mediaInput} {id} label={field.caption}
          filename={media.fileId ? file?.name ?? media.fileId : null}
          previewUrl={file ? fileContentUrl(siteId, file.fileId,
            media.mode === TvImageMode.Single ? media.key : defaultImageOutput(file.outputs)?.key) : null}
          {disabled} {readonly} onChoose={() => libraryOpen = true} onClear={() => onChange(undefined)}
          describedBy={defaultValue !== undefined ? id + '-default-hint' : undefined}
          variant={media.mode === TvImageMode.Single ? MediaFileInputVariant.ImageSize : MediaFileInputVariant.Image}
          outputs={imageOutputs(file?.outputs ?? [])}
          outputKey={media.mode === TvImageMode.Single ? media.key ?? null : null}
          onOutputChange={(key) => {
            if (media?.kind === TvKind.Image && media.mode === TvImageMode.Single) {
              onChange({ ...media, key });
            }
          }} />
      {:else}
      <label for={id}>{$messages.tvSelectFile}</label>
      <select {id} value={media.fileId} disabled={disabled || readonly}
        aria-describedby={defaultValue !== undefined ? id + '-default-hint' : undefined}
        onchange={(event) => selectFile(event.currentTarget.value)}>
        <option value="">{$messages.tvSelectFile}</option>
        {#if media.fileId && !file}<option value={media.fileId}>{$messages.tvMissingFile}: {media.fileId}</option>{/if}
        {#each choices as item (item.fileId)}
          <option value={item.fileId}>{item.name} · {item.outputs[0]?.url ?? ''}</option>
        {/each}
      </select>
      {/if}
      {#if media.fileId && (!file || media.kind === TvKind.Image && media.mode === TvImageMode.Single
        && !file.outputs.some((output) => output.key === media.key))}
        <p class="cms-error" role="status">{$messages.tvMissingFile}</p>
      {/if}
      {#if media.fileId}
      {#if media.kind === TvKind.Image}
        <div class="tv-image-settings">
          <div class="tv-image-setting">
            <label for={id + '-mode'}>{$messages.tvImageBinding}</label>
            <select id={id + '-mode'} value={media.mode} disabled={disabled || readonly} onchange={(event) => {
              if (media?.kind === TvKind.Image) {
                onChange(event.currentTarget.value === TvImageMode.Single
                  ? { ...media, mode: TvImageMode.Single, key: defaultImageOutput(file?.outputs ?? [])?.key ?? 'file' }
                  : { kind: TvKind.Image, fileId: media.fileId, mode: TvImageMode.Responsive, alt: media.alt });
              }
            }}>
              <option value={TvImageMode.Single}>{$messages.tvSingleImage}</option>
              <option value={TvImageMode.Responsive}>{$messages.tvResponsiveImage}</option>
            </select>
          </div>
          <div class="tv-image-setting">
            <label for={id + '-alt'}>{$messages.tvAlt}</label>
            <input id={id + '-alt'} value={media.alt} {disabled} {readonly} oninput={(event) => {
              if (media?.kind === TvKind.Image) {
                onChange({ ...media, alt: event.currentTarget.value });
              }
            }} />
          </div>
        </div>

      {:else}
        <label for={id + '-label'}>{$messages.tvLinkCaption}</label>
        <input id={id + '-label'} value={media.label} {disabled} {readonly} oninput={(event) => {
          if (media?.kind === TvKind.File) {
            onChange({ ...media, label: event.currentTarget.value });
          }
        }} />
      {/if}
      {#if file}<small class="tv-path">{file.outputs.at(-1)?.url}</small>{/if}
      {/if}
    {/if}
  <FileReferenceWarnings {files} value={typeof literalValue === 'string' ? literalValue
    : literalValue && typeof literalValue === 'object' && literalValue.kind === TvKind.Markdown
      ? literalValue.text : ''} />
  {#if defaultValue !== undefined}
    <small id={id + '-default-hint'} role="status">
      {$messages.tvDefaultHint.replace('{value}', () => defaultCaption)}
    </small>
  {/if}
</div>

{#if libraryOpen && !readonly}
  <ImageLibraryDialog {siteId} selectedFileId={media?.fileId ?? ''} {onLibraryChange} {onUnauthorized}
    onSelect={(selected) => selectFile(selected.fileId, selected)} onClose={() => {
      libraryOpen = false;
      void tick().then(() => mediaInput?.focus());
    }} />
{/if}

<style>
  .tv-value { display: grid; gap: 8px; min-width: 0; }
  .tv-value input, .tv-value select, .tv-value textarea { width: 100%; min-width: 0; }
  .tv-path { overflow-wrap: anywhere; }
  .tv-image-settings { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .tv-image-setting { display: grid; gap: 8px; min-width: 0; }
  @media (min-width: 768px) {
    .tv-image-settings { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; }
  }
</style>
