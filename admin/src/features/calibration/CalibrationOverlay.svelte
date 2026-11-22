<script lang="ts">
  let { busy, target, label }: { busy: boolean; target: HTMLElement | undefined; label: string } = $props();
  let bounds = $state({ left: 0, top: 0, width: 0, height: 0 });

  $effect(() => {
    if (!busy || !target) {
      return;
    }

    const element = target;
    const update = (): void => {
      const box = element.getBoundingClientRect();
      const left = Math.max(0, box.left);
      const top = Math.max(0, box.top);

      bounds = {
        left,
        top,
        width: Math.max(0, Math.min(innerWidth, box.right) - left),
        height: Math.max(0, Math.min(innerHeight, box.bottom) - top),
      };
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  });
</script>

{#if busy}
  <div class="_calibration-overlay" role="status" aria-live="polite"
    style:left="{bounds.left}px" style:top="{bounds.top}px" style:width="{bounds.width}px"
    style:height="{bounds.height}px">
    <div><span class="_calibration-spinner" aria-hidden="true"></span><strong>{label}</strong></div>
  </div>
{/if}

<style>
  ._calibration-overlay { position: fixed; z-index: 25; display: grid; place-items: center;
    background: color-mix(in srgb, var(--cms-surface, white) 85%, transparent); cursor: progress; }
  ._calibration-overlay > div { display: grid; justify-items: center; gap: 1rem; padding: 1.5rem; }
  ._calibration-spinner { display: block; width: 2.5rem; height: 2.5rem; border-radius: 50%;
    border: 4px solid currentColor; border-right-color: transparent; animation: calibrating .75s linear infinite; }
  @keyframes calibrating { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { ._calibration-spinner { animation-duration: 2s; } }
</style>
