<script lang="ts">
  let { active, label }: { active: boolean; label: string } = $props();

  function centerInView(overlay: HTMLElement): { destroy(): void } {
    const clips: { element: HTMLElement; x: boolean; y: boolean }[] = [];

    for (let ancestor = overlay.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(ancestor);

      if (overflowX !== 'visible' || overflowY !== 'visible') {
        clips.push({ element: ancestor, x: overflowX !== 'visible', y: overflowY !== 'visible' });
      }
    }

    const viewport = window.visualViewport;
    const update = (): void => {
      const bounds = overlay.getBoundingClientRect();
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      let left = Math.max(bounds.left, viewportLeft);
      let top = Math.max(bounds.top, viewportTop);
      let right = Math.min(bounds.right, viewportLeft + (viewport?.width ?? window.innerWidth));
      let bottom = Math.min(bounds.bottom, viewportTop + (viewport?.height ?? window.innerHeight));

      for (const { element, x, y } of clips) {
        const rect = element.getBoundingClientRect();

        if (x) {
          const clipLeft = rect.left + element.clientLeft;

          left = Math.max(left, clipLeft);
          right = Math.min(right, clipLeft + element.clientWidth);
        }
        if (y) {
          const clipTop = rect.top + element.clientTop;

          top = Math.max(top, clipTop);
          bottom = Math.min(bottom, clipTop + element.clientHeight);
        }
      }

      overlay.style.setProperty('--results-center-x', right > left ? (left + right) / 2 - bounds.left + 'px' : '50%');
      overlay.style.setProperty('--results-center-y', bottom > top ? (top + bottom) / 2 - bounds.top + 'px' : '50%');
    };
    const observer = new ResizeObserver(update);

    observer.observe(overlay);
    observer.observe(document.documentElement);

    for (const { element } of clips) {
      observer.observe(element);
    }
    document.addEventListener('scroll', update, { capture: true, passive: true });
    viewport?.addEventListener('scroll', update);
    viewport?.addEventListener('resize', update);
    update();

    return {
      destroy(): void {
        observer.disconnect();
        document.removeEventListener('scroll', update, true);
        viewport?.removeEventListener('scroll', update);
        viewport?.removeEventListener('resize', update);
      },
    };
  }
</script>

<span class="_visually-hidden" role="status">{active ? label : ''}</span>
{#if active}
  <div class="page-saving-overlay _results-loading" aria-hidden="true" use:centerInView>
    <span class="_results-indicator"><span class="_saving-spinner"></span></span>
  </div>
{/if}

<style>
  ._results-loading { background: color-mix(in srgb, var(--cms-ink) 18%, transparent); }
  ._results-indicator {
    position: absolute;
    top: var(--results-center-y, 50%);
    left: var(--results-center-x, 50%);
    display: grid;
    transform: translate(-50%, -50%);
  }
</style>
