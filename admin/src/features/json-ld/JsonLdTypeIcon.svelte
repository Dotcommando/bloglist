<script lang="ts">
  import { JsonLdPreset as Preset } from './json-ld-api';

  enum AdditionalType { WebSite = 'WebSite' }

  let { type, label = type }: { type: string; label?: string } = $props();
  const kind = $derived(Object.values(Preset).find((value) => value === type)
    ?? Object.values(AdditionalType).find((value) => value === type));
</script>

<svg class="json-ld-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
  data-jsonld-icon={kind ?? 'Custom'}>
  <title>{label}</title>
  {#if kind === Preset.Person}
    <circle cx="12" cy="7" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" />
  {:else if kind === Preset.Organization}
    <rect x="4" y="3" width="16" height="18" rx="1" />
    <path d="M9 21v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" />
  {:else if kind === Preset.WebPage}
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01m3 0h.01M7 13h10M7 16h6" />
  {:else if kind === AdditionalType.WebSite}
    <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" />
  {:else if kind === Preset.Article}
    <path d="M5 3h10l4 4v14H5ZM15 3v5h4M8 12h8M8 16h8" />
  {:else if kind === Preset.Service}
    <rect x="3" y="7" width="18" height="14" rx="2" />
    <path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0M12 11v4" />
  {:else}
    <path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16" />
  {/if}
</svg>

<style>
  .json-ld-type-icon { flex: 0 0 20px; width: 20px; height: 20px; stroke: currentColor;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
</style>
