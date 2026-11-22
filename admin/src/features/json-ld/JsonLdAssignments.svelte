<script lang="ts">
  import { sitePath } from '../../app/admin-route';
  import { messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import { type IJsonLdCatalog, JsonLdSourceKind, loadJsonLdCatalog } from './json-ld-api';

  let { siteId, templateId, canSave, onUnauthorized }: {
    siteId: string;
    canSave: boolean;
    templateId: string;
    onUnauthorized?: () => void;
  } = $props();
  let catalog = $state<IJsonLdCatalog | null>(null);
  let loading = $state(false);
  let failed = $state(false);
  const assigned = $derived(catalog?.profiles.filter((profile) => profile.templateIds.includes(templateId)) ?? []);

  async function load(): Promise<void> {
    if (loading) {
      return;
    }
    loading = true;
    failed = false;

    try {
      catalog = await loadJsonLdCatalog(siteId);
    } catch (error) {
      if (error instanceof ContentRequestError && error.status === 401) {
        onUnauthorized?.();
      }
      failed = true;
    } finally {
      loading = false;
    }
  }
</script>

<details class="json-ld-assignments" ontoggle={(event) => {
  if (event.currentTarget.open && !catalog) {
    void load();
  }
}}>
  <summary>{$messages.jsonLdAssignmentsJSONLDProfilesAndInputs}</summary>
  {#if loading}<p role="status">{$messages.accessSettingsLoading}</p>{/if}
  {#if failed}
    <p role="alert">{$messages.jsonLdAssignmentsCouldNotLoadProfiles}</p>
    <button type="button" onclick={load}>{$messages.hooksRetry}</button>
  {:else if catalog}
    {#each assigned as profile (profile.profileId)}
      <h3>
        <a href={sitePath(siteId) + '/jsonLd?profile=' + encodeURIComponent(profile.profileId)}>{profile.name}</a>
      </h3>
      <ul>
        {#each profile.nodes as node (node.role)}
          <li>{node.type}
            <ul>
              {#each node.mappings as mapping (mapping.property)}
                <li>{mapping.property}{mapping.required ? ' *' : ''}
                  {#if mapping.source.kind === JsonLdSourceKind.TemplateVariable}
                    · TV: {mapping.source.name}
                  {:else if mapping.source.kind === JsonLdSourceKind.PageField}
                    · {$messages.jsonLdAssignmentsPageField}: {mapping.source.name}
                  {:else if mapping.source.kind === JsonLdSourceKind.Snippet}
                    · {$messages.jsonLdAssignmentsSnippet}: {mapping.source.name}
                  {:else if mapping.source.kind === JsonLdSourceKind.SharedObject}
                    · {catalog.objects.find((object) => object.objectId === mapping.source.objectId)?.name
                      ?? ($messages.jsonLdAssignmentsMissingObject)}
                  {/if}
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {:else}
      <p>{$messages.jsonLdAssignmentsNoProfilesAssignedToThis}</p>
    {/each}
    <p>{$messages.jsonLdAssignmentsRequiredValuesEditPageFields}</p>
  {/if}
  {#if canSave}<a href={sitePath(siteId) + '/jsonLd'}>
    {$messages.jsonLdAssignmentsConfigureJSONLDProfilesAnd}</a>{/if}
</details>

<style>
  .json-ld-assignments { margin-block: 20px; overflow-wrap: anywhere; }
  .json-ld-assignments summary { cursor: pointer; padding-block: 12px; }
</style>
