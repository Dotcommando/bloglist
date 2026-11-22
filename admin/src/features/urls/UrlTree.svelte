<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import { type IUrlNode, UrlKind } from './urls.types';

  let { nodes, selectedPath, disabled, onSelect }: {
    nodes: readonly IUrlNode[];
    selectedPath: string;
    disabled: boolean;
    onSelect: (node: IUrlNode) => void;
  } = $props();
  const closed = new SvelteSet<string>();
</script>

{#snippet branch(parent: string | null)}
  <ul class="url-tree-list">
    {#each nodes.filter((node) => node.parent === parent) as node (node.path)}
      {@const children = nodes.some((child) => child.parent === node.path)}
      <li>
        <div class="_url-tree-row" class:_url-tree-row__selected={node.path === selectedPath}>
          {#if children}
            <button class="_url-tree-toggle tree-disclosure" {disabled} aria-expanded={!closed.has(node.path)}
              aria-label={$messages.urlToggle.replace('{path}', () => node.path)} onclick={() => {
                if (closed.has(node.path)) {
                  closed.delete(node.path);
                } else {
                  closed.add(node.path);
                }
              }}>{closed.has(node.path) ? '▸' : '▾'}</button>
          {:else}<span class="_url-tree-spacer"></span>{/if}
          <button class="_url-tree-select" {disabled} aria-current={selectedPath === node.path ? 'page' : undefined}
            title={node.path} data-url-path={node.path} onclick={() => onSelect(node)}>
            <span aria-hidden="true">{node.row?.url.kind === UrlKind.Redirect ? '↪' : children || !node.row ? '▱'
              : '◇'}</span>
            <span class="cms-drawer-label">{node.path === '/' ? '/' : node.path.slice(node.parent?.length ?? 0)}</span>
            {#if node.inSitemap}<span class="_url-tree-index" title="sitemap.xml" aria-label="sitemap.xml">●</span>{/if}
          </button>
        </div>
        {#if children && !closed.has(node.path)}{@render branch(node.path)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<nav aria-label={$messages.urlTree}>{@render branch(null)}</nav>
