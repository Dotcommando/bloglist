<script lang="ts">
  interface ILabel {
    text: string;
    fixedSuffix?: string | undefined;
  }

  let { text, fixedSuffix }: ILabel = $props();

  function shorten(node: HTMLSpanElement, initial: ILabel): {
    update: (label: ILabel) => void;
    destroy: () => void;
  } {
    let label = initial;
    const range = document.createRange();
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const width = (): number => {
      range.selectNodeContents(node);

      return range.getBoundingClientRect().width;
    };
    const fit = (): void => {
      const { text: value, fixedSuffix: suffix = '' } = label;

      node.textContent = value;
      const available = node.getBoundingClientRect().width;

      if (!available || width() <= available) {
        return;
      }

      const source = suffix ? value.slice(0, -suffix.length) : value;
      const characters = Array.from(segmenter.segment(source), (part) => part.segment);
      const display = (count: number): string => {
        if (suffix) {
          return characters.slice(0, count).join('') + '...' + suffix;
        }

        const end = Math.floor(count / 2);

        return characters.slice(0, count - end).join('') + '...'
          + (end ? characters.slice(-end).join('') : '');
      };
      let low = suffix ? 1 : 0;
      let high = characters.length - 1;

      if (high < low) {
        return;
      }

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
        label = next;
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
  <span class="_ellipsis-visible" aria-hidden="true" use:shorten={{ text, fixedSuffix }}></span>
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
