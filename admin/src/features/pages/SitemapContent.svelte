<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import { sitemapLocations } from './sitemap-view';

  let { xml, loading, failed }: {
    xml: string | null;
    loading: boolean;
    failed: boolean;
  } = $props();
  const batchSize = 100;
  let visible = $derived(xml === null ? 0 : batchSize);
  const entries = $derived.by(() => {
    if (xml === null) {
      return null;
    }

    try {
      return sitemapLocations(xml);
    } catch {
      return null;
    }
  });

</script>

<section id="page-content" class="sitemap-content" aria-labelledby="page-content-label" aria-busy={loading}>
  {#if loading}
    <p role="status">{$messages.sitemapLoading}</p>
  {:else if failed || entries === null}
    <p role="alert">{$messages.sitemapDisplayError}</p>
  {:else}
    <div class="sitemap-heading">
      <h2>{$messages.xmlSitemap}</h2>
      <span>{$messages.sitemapUrlCount.replace('{shown}', String(Math.min(visible, entries.length)))
        .replace('{total}', String(entries.length))}</span>
    </div>
    {#if entries.length}
      <ol>
        {#each entries.slice(0, visible) as entry, index (index)}
          <li>
            <span class="sitemap-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <a href={entry.href} target="_blank" rel="noopener noreferrer">{entry.location}</a>
          </li>
        {/each}
      </ol>
      {#if visible < entries.length}
        <button type="button" class="cms-secondary"
          onclick={() => visible += batchSize}>{$messages.sitemapShowMore}</button>
      {/if}
    {:else}
      <p class="sitemap-empty">{$messages.sitemapEmpty}</p>
    {/if}
  {/if}
</section>

<style>
  .sitemap-content {
    min-width: 0;
    padding: clamp(1rem, 3vw, 1.5rem);
    background: #f3f6fa;
    border-radius: .75rem;
    color: #203047;
  }

  .sitemap-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: .5rem 1rem;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    letter-spacing: -.035em;
  }

  .sitemap-heading span, .sitemap-empty {
    color: #52647b;
    font-size: .875rem;
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 2.5rem minmax(0, 1fr);
    gap: .75rem;
    margin-block: .5rem;
    padding: 1rem;
    background: #fff;
    border-radius: .75rem;
  }

  .sitemap-number {
    color: #687c95;
    font-variant-numeric: tabular-nums;
  }

  a {
    min-width: 0;
    color: #245bc0;
    overflow-wrap: anywhere;
    text-decoration-thickness: 1px;
    text-underline-offset: .2em;
  }

  a:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
  }

  button {
    margin-top: 1rem;
  }
</style>
