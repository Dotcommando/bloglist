<script lang="ts">
  import { onMount } from 'svelte';

  import { ContentRequestError } from '../../shared/api/content-api';
  import { type IFileLibrary, mergeFiles } from '../files/files.types';
  import { listFiles } from '../files/files-api';
  import { isEmptyTvValue, type ITvCatalog, type TvValue } from '../template-variables/template-variables.types';
  import { listTemplateVariables, savePageTemplateVariables } from '../template-variables/template-variables-api';
  import TvValueEditor from '../template-variables/TvValueEditor.svelte';

  let { siteId, templateId, values = $bindable({}), disabled, readonly = false, onUnauthorized, onStateChange }: {
    siteId: string;
    templateId: string;
    values: Record<string, TvValue>;
    disabled: boolean;
    readonly?: boolean;
    onUnauthorized: () => void;
    onStateChange: (hasFields: boolean, failed: boolean) => void;
  } = $props();
  let catalog = $state<ITvCatalog | null>(null);
  let library = $state<IFileLibrary | null>(null);
  let failed = $state(false);
  let mediaVersion = $state('0');
  const fields = $derived((catalog?.fields ?? []).filter((field) => field.templateIds.includes(templateId))
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));

  $effect(() => onStateChange(fields.length > 0, failed));

  onMount(() => {
    let disposed = false;

    void Promise.all([listTemplateVariables(siteId),
      listFiles(siteId).catch(() => null)]).then(([definitions, files]) => {
      if (!disposed) {
        catalog = definitions;
        library ??= files;
        mediaVersion = library?.version ?? '0';
      }
    }).catch((error) => {
      if (error instanceof ContentRequestError && error.status === 401) {
        onUnauthorized();
      } else if (!disposed) {
        failed = true;
      }
    });

    return () => {
      disposed = true;
    };
  });

  export async function save(savedPageId: string, updatedAt: string | undefined): Promise<string | undefined> {
    if (!templateId || !catalog?.fields.length) {
      return updatedAt;
    }
    if (failed || !catalog || !updatedAt) {
      throw new Error('TV values are not loaded');
    }

    const next = { ...values };

    for (const field of fields) {
      if (isEmptyTvValue(next[field.name])) {
        delete next[field.name];
      }
    }
    values = next;

    return savePageTemplateVariables(siteId, savedPageId, templateId, values,
      updatedAt, catalog.version, mediaVersion);
  }

  export function updateLibrary(next: IFileLibrary): void {
    library = { ...next, files: mergeFiles(library?.files ?? [], next.files) };
    mediaVersion = next.version;
  }
</script>

{#if fields.length}
  <div class="tv-page-fields">
    {#each fields as field (field.name)}
      <section class="tv-page-field" data-editorial-field={'tvValues.' + field.name} aria-label={field.caption}>
        <h3>{field.caption}{field.required ? ' *' : ''}</h3>
        {#if field.description}<p>{field.description}</p>{/if}
        <TvValueEditor {field} value={values[field.name]} {siteId} id={'page-tv-' + field.name}
          files={library?.files ?? []} {disabled} {readonly} {onUnauthorized} onLibraryChange={updateLibrary}
          onChange={(value) => {
            if (readonly) {
              return;
            }
            if (value === undefined) {
              const next = { ...values };

              delete next[field.name];
              values = next;
            } else {
              values = { ...values, [field.name]: value };
            }
          }} />
      </section>
    {/each}
  </div>
{/if}

<style>
  .tv-page-fields { display: grid; gap: 20px; min-width: 0; }
  .tv-page-field { display: grid; gap: 10px; min-width: 0; }
  .tv-page-field h3, .tv-page-field p { margin: 0; }
</style>
