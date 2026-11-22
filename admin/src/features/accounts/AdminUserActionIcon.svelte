<script lang="ts">
  import { AdminUserAction as Action } from './admin-users.types';

  let { action }: { action: Action } = $props();
</script>

<svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  {#if action === Action.Delete}
    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
  {:else if action === Action.Block}
    <circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" />
  {:else if action === Action.Unblock}
    <path d="M7 10V7a5 5 0 0 1 9-3M5 10h14v11H5zM12 14v3" />
  {:else if action === Action.Password}
    <circle cx="8" cy="15" r="5" /><path d="m12 11 8-8 2 2-2 2 2 2-3 3-2-2M6 15h.01" />
  {:else}
    <path d="M12 5v14M5 12h14" />
  {/if}
</svg>
