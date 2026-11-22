<script lang="ts">
  import { onMount } from 'svelte';

  let { anchor, message }: { anchor: HTMLElement; message: string } = $props();
  let bubble: HTMLElement;
  let expired = $state(false);

  onMount(() => {
    const place = (): void => {
      if (!anchor.isConnected) {
        bubble.hidePopover();

        return;
      }

      const bounds = anchor.getBoundingClientRect();
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;

      bubble.style.left = Math.max(8, Math.min(bounds.right - width, innerWidth - width - 8)) + 'px';
      bubble.style.top = (bounds.top >= height + 8 ? bounds.top - height - 6 : bounds.bottom + 6) + 'px';
    };
    const dismiss = (): void => bubble.hidePopover();
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };

    bubble.showPopover();
    place();
    const timeout = window.setTimeout(() => {
      expired = true;
    }, 3000);

    window.addEventListener('keydown', escape);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  });
</script>

<div popover="manual" role="status" bind:this={bubble} class="cms-floating-surface _feedback"
  class:_expired={expired} ontransitionend={(event) => {
    if (event.propertyName === 'opacity' && expired) {
      bubble.hidePopover();
    }
  }}>{message}</div>

<style>
  ._feedback { position: fixed; inset: auto; width: max-content; max-width: min(240px, calc(100vw - 16px));
    padding: 8px 12px; margin: 0; border: 0; overflow-wrap: anywhere; pointer-events: none;
    opacity: 1; transition: opacity 160ms ease; }
  ._expired { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { ._feedback { transition-duration: 1ms; } }
</style>
