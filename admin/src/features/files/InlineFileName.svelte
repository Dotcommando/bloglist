<script lang="ts">
  import { tick } from 'svelte';

  import { messages } from '../../i18n/i18n';

  let { value, disabled, onRename }: {
    value: string;
    disabled: boolean;
    onRename: (name: string) => void;
  } = $props();
  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement>();
  let button: HTMLButtonElement;

  async function edit(): Promise<void> {
    if (disabled) {
      return;
    }
    draft = value;
    editing = true;
    await tick();
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(draft.length, draft.length);
  }

  function apply(): void {
    if (!editing) {
      return;
    }
    editing = false;

    if (draft !== value) {
      onRename(draft);
    }
  }
</script>

<span class="inline-file-name">
  <button bind:this={button} type="button" class="_file-name-label" {disabled}
    style:visibility={editing ? 'hidden' : 'visible'} tabindex={editing ? -1 : 0}
    aria-label={$messages.renameFile + ': ' + value} title={$messages.renameFile} onclick={edit}>{value}</button>
  {#if editing}
    <input bind:this={input} bind:value={draft} class="_file-name-edit" aria-label={$messages.fileName}
      maxlength="180" onblur={apply} onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input?.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          editing = false;
          button.focus({ preventScroll: true });
        }
      }} />
  {/if}
</span>

<style>
  .inline-file-name { position: relative; display: inline-block; max-width: 100%; vertical-align: top; }
  ._file-name-label {
    display: block; max-width: 100%; padding: 0; margin: 0; border: 0;
    background: transparent; color: inherit; font: inherit; line-height: inherit;
    text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text;
  }
  ._file-name-label:focus-visible { outline: 2px solid var(--cms-accent); outline-offset: 4px; }
  ._file-name-edit {
    position: absolute; top: -5px; left: -9px; width: calc(100% + 18px); height: calc(100% + 10px);
    min-height: 0; padding: 4px 8px; margin: 0; border: 1px solid var(--cms-accent); border-radius: 4px;
    background: #fff; color: inherit; font: inherit; line-height: inherit; box-sizing: border-box;
  }
</style>
