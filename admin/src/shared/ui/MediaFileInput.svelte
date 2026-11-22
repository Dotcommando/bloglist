<script lang="ts">
  import type { IFileOutput } from '../../features/files/files.types';
  import { messages } from '../../i18n/i18n';
  import { MediaFileInputVariant } from './media-file-input.types';

  let { id, label, filename, previewUrl = null, disabled = false, readonly = false, loading = false, onChoose, onClear,
    variant = MediaFileInputVariant.Image, outputs = [], outputKey = null, onOutputChange, describedBy }: {
    id: string;
    label: string;
    filename: string | null;
    previewUrl?: string | null;
    disabled?: boolean;
    readonly?: boolean;
    loading?: boolean;
    onChoose?: (() => void) | undefined;
    onClear?: (() => void) | undefined;
    variant?: MediaFileInputVariant;
    outputs?: readonly IFileOutput[];
    outputKey?: string | null;
    onOutputChange?: (key: string) => void;
    describedBy?: string | undefined;
  } = $props();
  let trigger = $state<HTMLButtonElement>();
  let previewFailed = $state(false);

  $effect(() => {
    void previewUrl;
    previewFailed = false;
  });

  export function focus(): void {
    trigger?.focus();
  }
</script>

{#snippet selectedFile()}
      {#if previewUrl && !previewFailed}
        <img class="_media-file-preview" src={previewUrl} alt="" onerror={() => previewFailed = true} />
      {:else}
        <svg class="_media-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" />
        </svg>
      {/if}
      <span id={id + '-filename'} class="_media-file-name" title={filename ?? undefined}
        class:_media-file-name__empty={!filename}>{filename ?? $messages.tvChooseImage}</span>
{/snippet}

<div class="media-file-input" aria-busy={loading}>
  <label id={id + '-label'} for={id}>{label}</label>
  <div class="_media-file-control" class:_media-file-control__disabled={disabled || loading}>
    {#if readonly}
      <div {id} class="_media-file-open" role="textbox" aria-readonly="true" tabindex="0"
        aria-labelledby={id + '-label'}>{@render selectedFile()}</div>
    {:else}
    <button bind:this={trigger} {id} type="button" class="_media-file-open" disabled={disabled || loading || !onChoose}
      aria-labelledby={id + '-label'} aria-describedby={id + '-filename' + (describedBy ? ' ' + describedBy : '')}
      aria-haspopup={readonly ? undefined : 'dialog'}
      onclick={() => {
        if (!readonly) {
          onChoose?.();
        }
      }}>
      {@render selectedFile()}
    </button>
    {/if}
    {#if filename && !readonly && onClear}
      <button type="button" class="_media-file-clear" disabled={disabled || loading} onclick={onClear}
        aria-label={$messages.tvRemoveImage + ': ' + label} title={$messages.tvRemoveImage}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    {/if}
  </div>
  {#if previewFailed}
    <p class="cms-error" role="status">
      {$messages.missingFileAddress.replace('{url}', () => previewUrl ?? filename ?? '')}
    </p>
  {/if}
  {#if filename && variant === MediaFileInputVariant.ImageSize && outputs.length}
    <fieldset class="media-size-choice" disabled={disabled || loading}>
      <legend>{$messages.imageSize}</legend>
      <div class="_media-size-options">
        {#each outputs.filter((item) => !readonly || item.key === outputKey) as output (output.key)}
          <label class="_media-size-chip" class:_media-size-chip__selected={outputKey === output.key}>
            {#if !readonly}<input class="_media-size-radio" type="radio" name={id + '-size'} value={output.key}
              checked={outputKey === output.key} onchange={() => onOutputChange?.(output.key)} />{/if}
            <span>{output.dimensions
              ? output.dimensions.width + ' × ' + output.dimensions.height + ' px' : $messages.imageOriginal}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}
</div>

<style>
  .media-file-input { display: grid; gap: 9px; min-width: 0; }
  .media-file-input label { font-size: 13px; font-weight: 600; }
  ._media-file-control {
    display: flex;
    min-width: 0;
    height: 48px;
    border: 1px solid #ced3cc;
    border-radius: 7px;
    background: #fff;
  }
  ._media-file-open {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #252d27;
    font: inherit;
    font-size: 16px;
    text-align: left;
    cursor: pointer;
  }
  ._media-file-open:hover:not(:disabled), ._media-file-clear:hover:not(:disabled) { background: #f2f5ed; }
  ._media-file-open:focus-visible, ._media-file-clear:focus-visible {
    outline: 2px solid var(--cms-accent);
    outline-offset: 2px;
  }
  ._media-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ._media-file-name__empty { color: #6e786f; }
  ._media-file-icon, ._media-file-preview { flex-shrink: 0; width: 32px; height: 32px; }
  ._media-file-preview { display: block; object-fit: cover; border-radius: 3px; }
  ._media-file-clear {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 44px;
    padding: 0;
    border: 0;
    border-left: 1px solid #ced3cc;
    border-radius: 0 6px 6px 0;
    background: transparent;
    color: #6e786f;
    cursor: pointer;
  }
  ._media-file-control__disabled { background: #f6f7f3; opacity: .6; }
  ._media-file-open:disabled, ._media-file-clear:disabled { cursor: default; }
  .media-size-choice { min-width: 0; margin: 2px 0 0; padding: 0; border: 0; }
  .media-size-choice legend { padding: 0; margin-bottom: 8px; font-size: 12px; color: #6e786f; }
  ._media-size-options { display: flex; flex-wrap: wrap; gap: 8px; }
  ._media-size-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid #ced3cc;
    border-radius: 24px;
    color: #3d493f;
    background: #fff;
    cursor: pointer;
  }
  ._media-size-chip:hover { background: #f2f5ed; }
  ._media-size-chip__selected { border-color: #244d37; background: #e9eee2; color: #244d37; }
  ._media-size-chip:has(input:focus-visible) { outline: 2px solid var(--cms-accent); outline-offset: 2px; }
  ._media-size-chip:has(input:disabled) { opacity: .6; cursor: default; }
  ._media-size-radio {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
    padding: 0;
    opacity: 0;
    cursor: inherit;
  }
</style>
