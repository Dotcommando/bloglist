<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import type { ISiteFile } from './files.types';
  import { missingFileReferences } from './missing-file-references';

  let { value, files }: { value: string; files: readonly ISiteFile[] | null } = $props();
  const missing = $derived(files === null ? [] : missingFileReferences(value, files));
</script>

{#each missing as url (url)}
  <p class="cms-error file-reference-warning" role="status">
    {$messages.missingFileAddress.replace('{url}', () => url)}
  </p>
{/each}

<style>
  .file-reference-warning { margin: 8px 0 0; overflow-wrap: anywhere; }
</style>
