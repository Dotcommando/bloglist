<script lang="ts">
  import type { Snippet } from 'svelte';

  let { open, title, busy = false, wide = false, onClose, children }: {
    open: boolean;
    title: string;
    busy?: boolean;
    wide?: boolean;
    onClose: () => void;
    children: Snippet;
  } = $props();
  let dialog = $state<HTMLDialogElement | undefined>();
  const id = $props.id();

  $effect(() => {
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });
</script>

<dialog bind:this={dialog} class="cms-dialog" class:cms-dialog__wide={wide} aria-labelledby={id} aria-busy={busy}
  onclose={onClose} oncancel={(event) => {
    if (busy) {
      event.preventDefault();
    }
  }}>
  <h2 id={id} class="_dialog-title">{title}</h2>
  {@render children()}
</dialog>
