<script lang="ts">
  let { mimeType }: { mimeType: string } = $props();
  const kind = $derived(mimeType.startsWith('image/') ? 'image'
    : mimeType === 'application/pdf' ? 'pdf'
      : mimeType === 'application/json' ? 'json'
        : mimeType === 'text/csv' ? 'csv'
          : /(?:msword|wordprocessingml)/.test(mimeType) ? 'word'
            : /(?:ms-excel|spreadsheetml)/.test(mimeType) ? 'excel' : 'file');
</script>

<svg class="_source-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-file-icon={kind}>
  <path d="M4 3h12l4 4v14H4ZM16 3v5h4" />
  {#if kind === 'image'}<path d="M7 17l4-5 3 3 3-4" /><circle cx="8" cy="8" r="1" />
  {:else if kind === 'word'}<path d="m6 11 2 7 3-5 3 5 2-7" />
  {:else if kind === 'excel'}<path d="M7 11h10v7H7ZM7 14h10M11 11v7" />
  {:else if kind === 'csv'}<path d="M7 11h3M7 15h3M14 11h3M14 15h3M11 18l1-2" />
  {:else if kind === 'pdf'}<path d="m8 18 4-8 2 7-7-1 10-1" />
  {:else if kind === 'json'}<path d="M10 10H8v3l-1 1 1 1v3h2M14 10h2v3l1 1-1 1v3h-2" />
  {:else}<path d="M8 12h8M8 16h6" />{/if}
</svg>
