<script lang="ts">
  import { messages } from '../../i18n/i18n';

  let { disabled = false, compact = false, onclick }: {
    disabled?: boolean;
    compact?: boolean;
    onclick: () => void;
  } = $props();
</script>

<button type="button" class="cms-secondary cms-icon-button" class:cms-compact={compact} {disabled} {onclick}>
  <!-- Lucide Refresh CW (ISC). See admin/public/THIRD_PARTY_NOTICES.txt. -->
  <svg class="cms-icon _refresh-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
  {$messages.refresh}
</button>

<style>
  ._refresh-icon { stroke-width: 2; }
</style>
