<script lang="ts">
  import { tick, untrack } from 'svelte';

  import { followAdminLink, renderingUsagePath } from '../../app/admin-route';
  import { messages } from '../../i18n/i18n';
  import { RequestCacheScope } from '../../shared/api/content.types';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import SourceCode from '../../shared/ui/SourceCode.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import FileReferenceWarnings from '../files/FileReferenceWarnings.svelte';
  import type { ISiteFile } from '../files/files.types';
  import { listFiles } from '../files/files-api';
  import JsonLdAssignments from '../json-ld/JsonLdAssignments.svelte';
  import ElementHelp from './ElementHelp.svelte';
  import ParameterFields from './ParameterFields.svelte';
  import {
    BackupState, elementFingerprint, ElementSaveIntent, type IElementBuffer, type IRenderingElement, SnippetExecution,
    SourceFile,
  } from './rendering.types';

  let { can, canEdit, canApply, canPreview, canReadPreview, previewPages, buffer = $bindable(),
    elements, creating, busy, onSave, onPreview, onDirty, onCancel }: {
    can: CanUseAction;
    canEdit: boolean;
    canApply: boolean;
    canPreview: boolean;
    canReadPreview: boolean;
    previewPages: IRenderingElement['usages'];
    buffer: IElementBuffer;
    elements: readonly IRenderingElement[];
    creating: boolean;
    busy: boolean;
    onSave: (intent: ElementSaveIntent) => void;
    onPreview: (pageId: string) => void;
    onDirty: (dirty: boolean) => void;
    onCancel: () => void;
  } = $props();
  let form: HTMLFormElement;
  let pageId = $state('');
  const prefix = $derived('element-' + buffer.element.kind);
  const files = $derived(buffer.element.snippet
    ? [SourceFile.Server, SourceFile.Parameters, SourceFile.Output]
    : [SourceFile.Html, SourceFile.Css, SourceFile.Script, SourceFile.Parameters]);
  const locked = $derived(busy || !canEdit || buffer.element.backupState === BackupState.Pending);

  $effect(() => {
    const dirty = elementFingerprint(buffer.element) !== buffer.savedContent;

    untrack(() => onDirty(dirty));
  });

  let mediaFiles = $state<readonly ISiteFile[] | null>(null);
  let mediaFailed = $state(false);

  $effect(() => {
    const siteId = buffer.element.siteId;
    let current = true;

    mediaFiles = null;
    mediaFailed = false;
    void listFiles(siteId).then((library) => {
      if (current) {
        mediaFiles = library.files;
      }
    }, () => {
      if (current) {
        mediaFailed = true;
      }
    });

    return () => {
      current = false;
    };
  });

  function fileLabel(file: SourceFile): string {
    return file === SourceFile.Html ? $messages.htmlSource : file === SourceFile.Css ? $messages.cssSource
      : file === SourceFile.Script ? $messages.scriptSource : file === SourceFile.Server ? $messages.serverSource
        : file === SourceFile.Output ? $messages.snippetOutput : $messages.parameters;
  }

  async function save(intent = ElementSaveIntent.Draft): Promise<void> {
    if (busy || !canEdit || intent === ElementSaveIntent.Apply && !canApply) {
      return;
    }
    if (!form.checkValidity()) {
      const invalid = form.querySelector(':invalid');

      if (invalid?.closest('[data-source-file="parameters"]')) {
        buffer.file = SourceFile.Parameters;
      }
      await tick();
      form.reportValidity();

      return;
    }
    onSave(intent);
  }
</script>

<section class="element-editor" aria-labelledby={prefix + '-title'}>
  <ElementHelp element={buffer.element} {elements} {busy} />
  <form bind:this={form} class="cms-form" novalidate onsubmit={(event) => {
    event.preventDefault();
    void save(canApply ? ElementSaveIntent.Apply : ElementSaveIntent.Draft);
  }} aria-busy={busy}>
    <div class="_form-field">
      <label for={prefix + '-name'}>{$messages.elementName}</label>
      <input id={prefix + '-name'} bind:value={buffer.element.name} required maxlength="200" disabled={locked} />
    </div>
    {#if !creating && buffer.element.kind === 'Template' && can('cms.json-ld.list')}
      {#key buffer.element.siteId + ':' + buffer.element.id}
        <JsonLdAssignments siteId={buffer.element.siteId} templateId={buffer.element.id}
          canSave={can('cms.json-ld.save')} />
      {/key}
    {/if}
    <div class="source-tabs" aria-label={$messages.content}>
      {#each files as file (file)}
        <button type="button" class="_source-tab" aria-pressed={buffer.file === file} disabled={busy}
          onclick={() => {
            buffer.file = file;
          }}>{fileLabel(file)}</button>
      {/each}
    </div>
    {#each files as file (file)}
      <div class="source-panel" hidden={buffer.file !== file} data-source-file={file}>
        {#if file === SourceFile.Parameters}
          <ParameterFields bind:fields={buffer.element.parameters} {prefix} disabled={locked} />
        {:else if file === SourceFile.Server && buffer.element.snippet}
          <p>{$messages.snippetCodeHint}</p>
          <fieldset class="_parameter-options" disabled={locked}>
            <legend>{$messages.snippetPhases}</legend>
            {#each ['Build', 'Request'] as phase (phase)}
              <label><input type="checkbox" checked={buffer.element.snippet.phases.includes(phase)}
                onchange={(event) => {
                  if (buffer.element.snippet) {
                    buffer.element.snippet.phases = event.currentTarget.checked
                      ? [...buffer.element.snippet.phases, phase]
                      : buffer.element.snippet.phases.filter((value) => value !== phase);
                  }
                }} />{phase}</label>
            {/each}
          </fieldset>
          <Checkbox checked={buffer.element.snippet.execution === SnippetExecution.ParallelRead} disabled={locked}
            onCheckedChange={(checked) => {
              if (buffer.element.snippet) {
                buffer.element.snippet.execution = checked
                  ? SnippetExecution.ParallelRead : SnippetExecution.Sequential;
              }
            }}>{$messages.snippetParallelRead}</Checkbox>
          <Checkbox checked={Boolean(buffer.element.snippet.cache)} disabled={locked}
            onCheckedChange={(value) => {
              if (!buffer.element.snippet) {
                return;
              }
              if (value) {
                buffer.element.snippet.cache = { scope: RequestCacheScope.SharedPublic, maxAgeMs: 60000 };
              } else {
                delete buffer.element.snippet.cache;
              }
            }}>{$messages.snippetCacheEnabled}</Checkbox>
          <p class="_hint">{$messages.snippetCacheHint}</p>
          {#if buffer.element.snippet.cache}
            <label for={prefix + '-cache-age'}>{$messages.snippetCacheMaxAge}</label>
            <input id={prefix + '-cache-age'} type="number" min="1" max="3600" step="1" disabled={locked}
              value={buffer.element.snippet.cache.maxAgeMs / 1000}
              oninput={(event) => {
                if (buffer.element.snippet?.cache) {
                  buffer.element.snippet.cache.maxAgeMs = Number(event.currentTarget.value) * 1000;
                }
              }} />
          {/if}
          <SourceCode id={prefix + '-server'} bind:value={buffer.element.snippet.code} label={fileLabel(file)}
            disabled={locked} position={buffer.selection[file]} onPosition={(position) => {
              buffer.selection[file] = position;
            }} onSave={save} />
        {:else if file === SourceFile.Output && buffer.element.snippet}
          <ParameterFields bind:fields={() => [buffer.element.snippet!.output], (fields) => {
            buffer.element.snippet!.output = fields[0]!;
          }} prefix={prefix + '-output'} disabled={locked} itemOnly />
        {:else if file === SourceFile.Script}
          <SourceCode id={prefix + '-' + file} bind:value={() => buffer.element.browserTypeScript ?? '', (value) => {
            buffer.element.browserTypeScript = value || null;
          }}
            onPosition={(position) => {
              buffer.selection[file] = position;
            }} position={buffer.selection[file]} label={fileLabel(file)} disabled={locked} onSave={save}
            />
        {:else if file === SourceFile.Html || file === SourceFile.Css}
          <SourceCode id={prefix + '-' + file} bind:value={buffer.element[file]} label={fileLabel(file)}
            disabled={locked} position={buffer.selection[file]} onPosition={(position) => {
              buffer.selection[file] = position;
            }} onSave={save} />
        {/if}
        <FileReferenceWarnings files={mediaFiles} value={file === SourceFile.Parameters
          ? JSON.stringify(buffer.element.parameters) : file === SourceFile.Script
            ? buffer.element.browserTypeScript ?? '' : file === SourceFile.Html || file === SourceFile.Css
              ? buffer.element[file] : ''} />
      </div>
    {/each}
    {#if mediaFailed}<p class="cms-error" role="status">{$messages.filesFailed}</p>{/if}
    <div class="_element-state" aria-live="polite">{buffer.dirty ? $messages.sourceUnsaved : ''}</div>
    <details class="element-usages">
      <summary>{$messages.whereUsed}</summary>
      <ul>
        {#each buffer.element.usages as usage (usage.kind + ':' + usage.id)}
          <li>{#if usage.readable && !busy}
            <a class="_usage-link" href={renderingUsagePath(buffer.element.siteId, usage.kind, usage.id)}
              onclick={followAdminLink}>{usage.title || usage.id}</a>
          {:else}{usage.title || usage.id}{/if}</li>
        {:else}<li>{$messages.notUsed}</li>{/each}
      </ul>
      {#if buffer.element.usages.some((usage) => !usage.readable)}<p>{$messages.sourceUsageReadHint}</p>{/if}
    </details>
    <div class="_element-actions">
      <button type="button" class="cms-secondary" disabled={busy} onclick={onCancel}>{$messages.cancel}</button>
      {#if canEdit}<button type={canApply ? 'button' : 'submit'}
        class={canApply ? 'cms-secondary' : 'cms-primary'} disabled={busy} onclick={() => {
          if (canApply) {
            void save(ElementSaveIntent.Draft);
          }
        }}>{buffer.element.backupState === BackupState.Pending ? $messages.retryBackup : $messages.saveDraft}</button>
      {#if canApply}<button type="submit" class="cms-primary" disabled={busy}>
        {busy ? $messages.saving : $messages.saveApply}</button>{/if}
      {/if}
    </div>
    {#if canEdit && canApply}<p class="_element-save-hint">{$messages.sourceDraftHint}</p>{/if}
  </form>
  {#if canPreview && !creating}<div class="_preview-controls">
    {#if !canReadPreview}<p>{$messages.sourcePreviewNeedsResult}</p>
    {:else if !previewPages.length}<p>{$messages.sourcePreviewNeedsPage}</p>
    {:else}
      <div class="_form-field">
        <label for={prefix + '-page'}>{$messages.previewPage}</label>
        <select id={prefix + '-page'} bind:value={pageId} disabled={busy}>
          <option value="">{$messages.selectPage}</option>
          {#each previewPages as usage (usage.id)}
            <option value={usage.id}>{usage.title}</option>
          {/each}
        </select>
      </div>
      <button type="button" class="cms-secondary"
        disabled={busy || buffer.dirty || !previewPages.some((page) => page.id === pageId)}
        onclick={() => {
          onPreview(pageId);
        }}>{$messages.preview}</button>
    {/if}
  </div>{/if}
</section>
