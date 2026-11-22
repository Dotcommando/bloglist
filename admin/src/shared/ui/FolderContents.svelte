<script lang="ts">
  import { messages } from '../../i18n/i18n';

  interface IFolderContentItem {
    id: string;
    label: string;
    detail: string;
    href?: string;
  }

  let { summary, items, disabled = false, onSelect }: {
    summary: string;
    items: readonly IFolderContentItem[];
    disabled?: boolean;
    onSelect: (id: string) => void;
  } = $props();
  const headingId = $props.id();
</script>

<section class="folder-contents" aria-labelledby={headingId}>
  <h2 id={headingId}>{$messages.folderContents}</h2>
  <p class="_folder-summary">{summary}</p>
  {#if items.length}
    <ul class="_folder-items">
      {#each items as item (item.id)}
        <li>
          {#if item.href}
            <a href={item.href} aria-disabled={disabled} tabindex={disabled ? -1 : undefined} onclick={(event) => {
              if (disabled) {
                event.preventDefault();
              } else if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                onSelect(item.id);
              }
            }}>{item.label}</a>
          {:else}
            <button type="button" {disabled} onclick={() => onSelect(item.id)}>{item.label}</button>
          {/if}
          <span>{item.detail}</span>
        </li>
      {/each}
    </ul>
  {:else}<p class="_folder-empty">{$messages.folderEmpty}</p>{/if}
</section>
