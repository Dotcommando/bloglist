<script lang="ts">
  import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { messages } from '../../i18n/i18n';
  import type { IAdminPage, IPageAvailability, IPageEditorialState } from '../../shared/api/content.types';
  import { contentError, type ContentErrorMessage } from '../../shared/api/content-api';
  import { canMovePage, comparePages, visiblePageTree } from './page-tree';

  let { pages, availability, selectedId, disabled, onSelect, onMove, hideSystem = false, editorialStates = [] }: {
    editorialStates?: readonly IPageEditorialState[];
    hideSystem?: boolean;
    pages: readonly IAdminPage[];
    availability: readonly IPageAvailability[] | null;
    selectedId: string | null;
    disabled: boolean;
    onSelect?: ((page: IAdminPage) => void) | undefined;
    onMove?: ((page: IAdminPage, parentPageId: string | null) => Promise<void>) | undefined;
  } = $props();
  const expanded = new SvelteSet<string>();
  const shownPages = $derived(hideSystem ? pages.filter((page) => !page.systemDocument) : pages);
  const rows = $derived(visiblePageTree(shownPages, expanded));
  const choices = $derived(shownPages.toSorted(comparePages));
  const availabilityByPage = $derived(new Map(availability?.map((item) => [item.pageId, item]) ?? []));
  let focused = $state('');
  const focusId = $derived(rows.some((row) => row.page.pageId === focused) ? focused : rows[0]?.page.pageId);
  let sourceId = $state('');
  let destination = $state<string | null>(null);
  let draggingId = $state('');
  let hovered = $state('');
  let error = $state<ContentErrorMessage | null>(null);
  let moved = $state(false);
  let tree: HTMLUListElement;

  $effect(() => {
    const id = selectedId;
    const current = pages;

    untrack(() => {
      if (id) {
        sourceId = id;
        destination = current.find((page) => page.pageId === id)?.parentPageId ?? null;
        let parent = current.find((page) => page.pageId === id)?.parentPageId ?? null;
        const seen = new SvelteSet<string>();

        while (parent && !seen.has(parent)) {
          seen.add(parent);
          expanded.add(parent);
          parent = current.find((page) => page.pageId === parent)?.parentPageId ?? null;
        }
      }
    });
  });

  async function move(pageId: string, parentPageId: string | null): Promise<void> {
    const page = pages.find((page) => page.pageId === pageId);

    if (disabled || !onMove || !page || !canMovePage(pages, pageId, parentPageId)) {
      return;
    }
    error = null;
    moved = false;

    try {
      await onMove(page, parentPageId);

      if (parentPageId) {
        expanded.add(parentPageId);
      }
      moved = true;
    } catch (value) {
      error = contentError(value);
    }
  }

  function drag(node: HTMLElement, pageId: string): { destroy: () => void } {
    return {
      destroy: draggable({
        element: node,
        canDrag: () => Boolean(onMove) && !disabled && !pages.find((page) => page.pageId === pageId)?.systemDocument,
        getInitialData: () => ({ kind: 'zarya-page', pageId }),
        onDragStart: () => {
          draggingId = pageId;
          moved = false;
        },
        onDrop: () => {
          draggingId = '';
          hovered = '';
        },
      }),
    };
  }

  function target(node: HTMLElement, parentPageId: string | null): { destroy: () => void } {
    const key = parentPageId ?? '#root';

    return {
      destroy: dropTargetForElements({
        element: node,
        canDrop: ({ source }) => Boolean(onMove) && !disabled && source.data.kind === 'zarya-page'
        && typeof source.data.pageId === 'string' && canMovePage(pages, source.data.pageId, parentPageId),
        getData: () => ({ parentPageId }),
        onDragEnter: () => {
          hovered = key;
        },
        onDragLeave: () => {
          if (hovered === key) {
            hovered = '';
          }
        },
        onDrop: ({ source, location }) => {
          hovered = '';

          if (location.current.dropTargets[0]?.element === node && typeof source.data.pageId === 'string') {
            void move(source.data.pageId, parentPageId);
          }
        },
      }),
    };
  }

  function toggle(pageId: string): void {
    if (expanded.has(pageId)) {
      expanded.delete(pageId);
    } else {
      expanded.add(pageId);
    }
  }

  async function keydown(event: KeyboardEvent, index: number): Promise<void> {
    const row = rows[index]!;
    let next = row.page.pageId;

    if (event.key === 'ArrowDown') {
      next = rows[Math.min(rows.length - 1, index + 1)]!.page.pageId;
    } else if (event.key === 'ArrowUp') {
      next = rows[Math.max(0, index - 1)]!.page.pageId;
    } else if (event.key === 'Home') {
      next = rows[0]!.page.pageId;
    } else if (event.key === 'End') {
      next = rows.at(-1)!.page.pageId;
    } else if (event.key === 'ArrowRight' && row.hasChildren) {
      if (!expanded.has(row.page.pageId)) {
        expanded.add(row.page.pageId);
      } else {
        next = rows[index + 1]?.page.pageId ?? next;
      }
    } else if (event.key === 'ArrowLeft') {
      if (expanded.has(row.page.pageId)) {
        expanded.delete(row.page.pageId);
      } else {
        next = row.page.parentPageId ?? next;
      }
    } else {
      return;
    }
    event.preventDefault();
    focused = next;
    await tick();
    [...tree.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')]
      .find((element) => element.dataset.pageId === next)?.focus();
  }
</script>

<div class="page-hierarchy">
  <div class="_tree-root" class:_tree-root__over={hovered === '#root'} use:target={null}>
    {$messages.siteRoot}<small>{$messages.dropToRoot}</small>
  </div>
  <ul class="page-tree" role="tree" aria-label={$messages.pageTree} bind:this={tree}>
    {#each rows as row, index (row.page.pageId)}
      {@const currentAvailability = availabilityByPage.get(row.page.pageId)}
      <li role="none" style:padding-left={row.depth * 16 + 'px'}>
        <div class="_tree-entry" class:_tree-entry__over={hovered === row.page.pageId}
          class:_tree-entry__dragging={draggingId === row.page.pageId}
          data-tree-drag={row.page.pageId} use:drag={row.page.pageId} use:target={row.page.pageId}>
          <button class="_tree-page" class:_tree-page__folder={row.hasChildren}
            role="treeitem" {disabled} aria-selected={selectedId === row.page.pageId}
            aria-expanded={row.hasChildren ? expanded.has(row.page.pageId) : undefined}
            aria-level={row.depth + 1} aria-posinset={row.position} aria-setsize={row.siblings}
            tabindex={focusId === row.page.pageId ? 0 : -1} data-page-id={row.page.pageId}
            onfocus={() => {
              focused = row.page.pageId;
            }}
            onclick={(event) => {
              if (row.hasChildren && event.target instanceof Element && event.target.closest('[data-tree-toggle]')) {
                toggle(row.page.pageId);
              } else {
                onSelect?.(row.page);
              }
            }} onkeydown={(event) => {
              void keydown(event, index);
            }}>
            {#if row.hasChildren}
              <span class="tree-disclosure" data-tree-toggle aria-hidden="true"
                title={expanded.has(row.page.pageId) ? $messages.collapsePage : $messages.expandPage}>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d={expanded.has(row.page.pageId) ? 'M5 12h14' : 'M5 12h14M12 5v14'} />
                </svg>
              </span>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6" />
              </svg>
            {/if}
            <span class="_tree-title cms-drawer-label" title={row.page.title}>{row.page.title}</span>
            {#if row.page.pageNumber}
              <small class="_tree-number" title={$messages.pageNumber}>#{row.page.pageNumber}</small>
            {/if}
            <small>{row.page.language}</small>
            {#if editorialStates.some((item) => item.pageId === row.page.pageId && item.changedFields.length > 0)}
              <svg class="_draft-marker" viewBox="0 0 24 24" fill="none" role="img"
                aria-label={$messages.unpublishedChanges} aria-hidden={false}>
                <title>{$messages.unpublishedChanges}</title>
                <path d="M13 3H5v18h14v-8M14 5l3-3 5 5-9 9-5 1 1-5 5-5Zm3-3 5 5" />
              </svg>
            {/if}
            <span class="_page-state"
              class:_page-state__published={Boolean(currentAvailability?.assignedPath
                && currentAvailability.publicPath)}
              class:_page-state__unavailable={availability !== null && !currentAvailability?.assignedPath}
              role="img" aria-label={availability === null ? $messages.pageAvailabilityUnknown
                : !currentAvailability?.assignedPath ? $messages.pageNoUrl
                  : currentAvailability.publicPath ? $messages.pagePublic : $messages.pageNotPublic}
              title={availability === null ? $messages.pageAvailabilityUnknown
                : !currentAvailability?.assignedPath ? $messages.pageNoUrl
                  : currentAvailability.publicPath ? $messages.pagePublic : $messages.pageNotPublic}></span>
          </button>
        </div>
      </li>
    {/each}
  </ul>
  {#if hideSystem && rows.length === 0}<p class="cms-empty">{$messages.noVisiblePages}</p>{/if}
  {#if onMove}
  <details class="_tree-move">
    <summary>{$messages.movePage}</summary>
    <form class="cms-form" onsubmit={(event) => {
      event.preventDefault();
      void move(sourceId, destination);
    }}>
      <label for="move-source">{$messages.pageToMove}</label>
      <select id="move-source" bind:value={sourceId} {disabled} required>
        <option value="">{$messages.selectPage}</option>
        {#each choices as page (page.pageId)}
          <option value={page.pageId}>{page.title} #{page.pageNumber ?? ''}</option>
        {/each}
      </select>
      <label for="move-destination">{$messages.parentPage}</label>
      <select id="move-destination" bind:value={destination} {disabled}>
        <option value={null}>{$messages.siteRoot}</option>
        {#each choices as page (page.pageId)}
          <option value={page.pageId} disabled={!canMovePage(pages, sourceId, page.pageId)}>
            {page.title} #{page.pageNumber ?? ''}
          </option>
        {/each}
      </select>
      <p>{$messages.movePageHint}</p>
      <button class="cms-secondary" type="submit" disabled={disabled || !canMovePage(pages, sourceId, destination)}>
        {$messages.movePage}
      </button>
    </form>
  </details>
  {/if}
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if moved}<p class="cms-success" role="status">{$messages.pageMoved}</p>{/if}
</div>
<style>
  ._draft-marker { flex-shrink: 0; width: 15px; height: 15px; color: #8b5e19; }
</style>
