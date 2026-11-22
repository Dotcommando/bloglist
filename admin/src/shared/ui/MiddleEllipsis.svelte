<script lang="ts">
  let { text }: { text: string } = $props();

  function shorten(node: HTMLSpanElement, initial: string): {
    update: (value: string) => void;
    destroy: () => void;
  } {
    let value = initial;
    const range = document.createRange();
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const width = (): number => {
      range.selectNodeContents(node);

      return range.getBoundingClientRect().width;
    };
    const fit = (): void => {
      node.textContent = value;
      const available = node.clientWidth;

      if (!available || width() <= available) {
        return;
      }

      const characters = Array.from(segmenter.segment(value), (part) => part.segment);
      const display = (count: number): string => {
        const end = Math.floor(count / 2);

        return characters.slice(0, count - end).join('') + '...'
          + (end ? characters.slice(-end).join('') : '');
      };
      let low = 0;
      let high = characters.length - 1;

      while (low < high) {
        const count = Math.ceil((low + high) / 2);

        node.textContent = display(count);

        if (width() <= available) {
          low = count;
        } else {
          high = count - 1;
        }
      }
      node.textContent = display(low);
    };
    const observer = new ResizeObserver(fit);

    observer.observe(node);
    document.fonts.addEventListener('loadingdone', fit);
    fit();

    return {
      update: (next) => {
        value = next;
        fit();
      },
      destroy: () => {
        observer.disconnect();
        document.fonts.removeEventListener('loadingdone', fit);
      },
    };
  }
</script>

<span class="middle-ellipsis" title={text}>
  <span class="_ellipsis-visible" aria-hidden="true" use:shorten={text}></span>
  <span class="_ellipsis-full">{text}</span>
</span>

<style>
  .middle-ellipsis { display: block; position: relative; min-width: 0; max-width: 100%; }
  ._ellipsis-visible { display: block; min-width: 0; overflow: hidden; white-space: nowrap; }
  ._ellipsis-full {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
</style>
