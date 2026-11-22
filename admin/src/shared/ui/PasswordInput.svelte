<script lang="ts">
  import { messages } from '../../i18n/i18n';

  let { id, descriptionId, value = $bindable(''), disabled = false }: {
    id: string;
    descriptionId?: string;
    value?: string;
    disabled?: boolean;
  } = $props();
  let visible = $state(false);
</script>

<div class="_password-wrap">
  <input {id} name="password" type={visible ? 'text' : 'password'} class="_password-input"
    autocomplete="new-password" required bind:value {disabled} spellcheck="false" aria-describedby={descriptionId} />
  <button class="_reveal" type="button" aria-label={visible ? $messages.hidePassword : $messages.showPassword}
    aria-pressed={visible} {disabled} onclick={() => {
      visible = !visible;
    }}>
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {#if visible}<path d="m3 3 18 18" />{/if}
    </svg>
  </button>
</div>
