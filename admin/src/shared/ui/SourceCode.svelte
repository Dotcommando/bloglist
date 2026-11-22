<script lang="ts">
  import { tick, untrack } from 'svelte';

  import { messages } from '../../i18n/i18n';

  let { value = $bindable(), label, disabled, position, onPosition, onSave, id }: {
    value: string;
    label: string;
    disabled: boolean;
    position: { start: number; end: number; scrollTop: number; scrollLeft: number } | undefined;
    onPosition: (position: { start: number; end: number; scrollTop: number; scrollLeft: number }) => void;
    onSave: () => void;
    id: string;
  } = $props();
  let input: HTMLTextAreaElement;
  let wrap = $state(true);

  function remember(): void {
    if (input) {
      const next = {
        start: input.selectionStart,
        end: input.selectionEnd,
        scrollTop: input.scrollTop,
        scrollLeft: input.scrollLeft,
      };

      if (
        next.start !== position?.start
        || next.end !== position.end
        || next.scrollTop !== position.scrollTop
        || next.scrollLeft !== position.scrollLeft
      ) {
        onPosition(next);
      }
    }
  }

  $effect(() => {
    const next = position;

    untrack(() => {
      if (input && next && document.activeElement !== input) {
        if (input.selectionStart !== next.start || input.selectionEnd !== next.end) {
          input.setSelectionRange(next.start, next.end);
        }
        input.scrollTop = next.scrollTop;
        input.scrollLeft = next.scrollLeft;
      }
    });
  });

  async function keydown(event: KeyboardEvent): Promise<void> {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const start = input.selectionStart;

      value = value.slice(0, start) + '  ' + value.slice(input.selectionEnd);
      await tick();
      input.setSelectionRange(start + 2, start + 2);
      remember();
    }
  }
</script>

<div class="source-code">
  <div class="_code-toolbar">
    <label for={id + '-wrap'}>
      <input id={id + '-wrap'} type="checkbox" bind:checked={wrap} />{$messages.wrapLines}
    </label>
    <span>{$messages.codeKeyboardHint}</span>
  </div>
  <textarea {id} class="_source-input" aria-label={label} bind:this={input} bind:value {disabled}
    wrap={wrap ? 'soft' : 'off'} spellcheck="false" autocapitalize="none" autocomplete="off"
    onkeydown={keydown} onselect={remember} onscroll={remember} onblur={remember}></textarea>
</div>
