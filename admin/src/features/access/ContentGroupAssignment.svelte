<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import { ContentRequestError, object, request, string } from '../../shared/api/content-api';

  let { siteId, groupId, disabled, onUnauthorized }: {
    siteId: string;
    groupId: string;
    disabled: boolean;
    onUnauthorized: () => void;
  } = $props();

  const kinds = ['pages', 'chunks', 'snippets'] as const;
  type Kind = typeof kinds[number];
  let kind = $state<Kind>('pages');
  let items = $state<{ id: string; name: string }[]>([]);
  let selected = $state('');
  let sending = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let saved = $state(false);

  $effect(() => {
    const actual = kind;
    const site = siteId;
    let stale = false;

    loading = true;
    selected = '';
    failed = false;
    saved = false;
    items = [];
    void request('/' + encodeURIComponent(site) + '/' + actual).then((response) => {
      if (!stale) {
        const values = object(response).items;

        items = Array.isArray(values) ? values.map((input: unknown) => {
          const row = object(input);

          return {
            id: string(actual === 'pages' ? row.pageId : row.key),
            name: string(actual === 'pages' ? row.title : row.name),
          };
        }) : [];
      }
    }).catch((error: unknown) => {
      if (!stale) {
        report(error);
      }
    }).finally(() => {
      if (!stale) {
        loading = false;
      }
    });

    return () => {
      stale = true;
    };
  });

  function report(error: unknown): void {
    if (error instanceof ContentRequestError && error.status === 401) {
      onUnauthorized();
    } else {
      failed = true;
    }
  }

  async function assign(clear: boolean): Promise<void> {
    sending = true;
    failed = false;
    saved = false;

    try {
      await request('/' + encodeURIComponent(siteId) + '/access/object-group', {
        domain: kind, objectId: selected, accessGroupId: clear ? null : groupId,
      });
      saved = true;
    } catch (error) {
      report(error);
    } finally {
      sending = false;
    }
  }
</script>

<fieldset class="cms-fieldset _content-groups" disabled={disabled || sending} aria-busy={loading || sending}>
  <legend>{$messages.contentGroupAssignmentGroupAccessToContent}</legend>
  <label>
    {$messages.contentGroupAssignmentContentType}
    <select bind:value={kind}>
      {#each kinds as item (item)}
        <option value={item}>{item === 'pages' ? ($messages.pages)
          : item === 'chunks' ? ($messages.chunks) : ($messages.snippets)}</option>
      {/each}
    </select>
  </label>
  <label>
    {$messages.contentGroupAssignmentContent}
    <select bind:value={selected} disabled={loading}>
      <option value="">{$messages.contentGroupAssignmentSelectContent}</option>
      {#each items as item (item.id)}
        <option value={item.id}>{item.name}</option>
      {/each}
    </select>
  </label>
  <div class="_buttons">
    <button type="button" class="cms-primary" disabled={!selected || loading} onclick={() => void assign(false)}>
      {$messages.contentGroupAssignmentAssignGroup}
    </button>
    <button type="button" class="cms-secondary" disabled={!selected || loading} onclick={() => void assign(true)}>
      {$messages.contentGroupAssignmentClearGroupAssignment}
    </button>
  </div>
  {#if saved}<p role="status">{$messages.contentGroupAssignmentGroupAssignmentSaved}</p>{/if}
  {#if failed}<p role="alert">{$messages.contentGroupAssignmentUnableToUpdateTheAssignment}</p>{/if}
</fieldset>

<style>
  ._content-groups { display: grid; gap: 12px; max-width: 560px; margin: 0 0 16px; }
  label { display: grid; gap: 4px; }
  select { min-height: 44px; font: inherit; }
  ._buttons { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
