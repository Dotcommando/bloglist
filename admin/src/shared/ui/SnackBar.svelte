<script lang="ts">
  import { snackBar, SnackBarVariant } from './snack-bar';
</script>

<div class="snack-bar-region">
  {#if $snackBar}
    <div class="snack-bar" class:_snack-bar__failure={$snackBar.variant === SnackBarVariant.Failure}
      class:_snack-bar__success={$snackBar.variant === SnackBarVariant.Success}
      data-snack-bar={$snackBar.variant} role={$snackBar.variant === SnackBarVariant.Failure ? 'alert' : 'status'}
      aria-atomic="true">
      <svg class="_snack-bar-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {#if $snackBar.variant === SnackBarVariant.Success}
          <path d="m5 12 4 4L19 6" />
        {:else if $snackBar.variant === SnackBarVariant.Failure}
          <path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" />
        {:else}
          <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
        {/if}
      </svg>
      <span>{$snackBar.message}</span>
    </div>
  {/if}
</div>
