<script lang="ts">
  import { type AdminMessageKey, messages } from '../../i18n/i18n';

  let { label, inline = false }: { label: AdminMessageKey; inline?: boolean } = $props();
</script>

<div class="page-saving-overlay _addon-loading-overlay" class:_addon-loading-overlay__inline={inline} role="status">
  <span class="_saving-spinner" aria-hidden="true"></span>
  <span>{$messages[label]}</span>
</div>

<style>
  ._addon-loading-overlay { border-radius: inherit; padding: 12px; text-align: center; }
  ._addon-loading-overlay__inline {
    position: static;
    flex-direction: row;
    gap: 8px;
    padding: 0;
    background: transparent;
  }
  ._addon-loading-overlay__inline ._saving-spinner { width: 24px; height: 24px; }
</style>
