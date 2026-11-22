<script lang="ts">
  import { tick, untrack } from 'svelte';

  import { type AdminMessageKey, messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { type IInstallationSettings, installationSettings } from './installation-api';

  let { active, disabled, onUnauthorized, onBusy, onDirtyChange }: {
    active: boolean;
    disabled: boolean;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onDirtyChange: (value: boolean) => void;
  } = $props();
  let saved = $state<IInstallationSettings | null>(null);
  let address = $state('');
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<AdminMessageKey | ''>('');
  const dirty = $derived(saved !== null && address.trim() !== saved.adminOrigin + '/admin/');

  function failure(value: unknown): void {
    if (value instanceof ContentRequestError && value.status === 401) {
      onUnauthorized();
    } else if (value instanceof ContentRequestError && value.status === 409) {
      error = 'installationSettingsSettingsChangedRefreshBeforeSaving';
    } else {
      error = 'installationSettingsCouldNotVerifyOrSave';
    }
  }
  async function load(): Promise<void> {
    if (
      loading
      || busy
      || disabled
      || dirty
      && !window.confirm($messages.installationSettingsReplaceTheUnsavedAddress)
    ) {
      return;
    }
    error = '';
    loading = true;

    try {
      saved = await installationSettings();
      address = saved.adminOrigin + '/admin/';
    } catch (value) {
      failure(value);
    } finally {
      loading = false;
    }
  }
  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!saved || busy || disabled) {
      return;
    }
    busy = true;
    onBusy(true);
    error = '';

    try {
      const result = await installationSettings({ adminAddress: address.trim(), expectedVersion: saved.version });

      saved = result;
      address = result.adminOrigin + '/admin/';
      await tick();
      window.location.assign(result.adminOrigin + '/admin/');
    } catch (value) {
      failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }
  $effect(() => {
    if (active) {
      untrack(() => {
        if (!saved) {
          void load();
        }
      });
    }
  });
  $effect(() => {
    onDirtyChange(dirty);
  });
</script>

<section class="installation-settings settings-form" hidden={!active}
  aria-label={$messages.installationSettingsGeneralInstallationSettings}>
  <p>{$messages.installationSettingsTheseSettingsApplyToAll}</p>
  {#if loading}<p role="status">{$messages.accessSettingsLoading}</p>{/if}
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if saved}
    <form onsubmit={submit} aria-busy={busy}>
      <label class="_form-field">{$messages.installationSettingsAdministrationAddress}
        <input type="url" required bind:value={address} disabled={busy || disabled || loading} spellcheck="false"
          autocapitalize="none" aria-describedby="installation-address-hint" />
      </label>
      <p id="installation-address-hint">{$messages.installationSettingsUseAnHTTPSAddressEnding}</p>
      <div class="_form-actions _form-actions__inline">
        <button class="cms-secondary cms-icon-button" disabled={busy || disabled || loading || !dirty}>
          <svg class="cms-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8" />
          </svg>
          {busy ? $messages.installationSettingsChecking : $messages.accessSettingsSave}
        </button>
        <RefreshButton disabled={busy || disabled || loading} onclick={() => {
          void load();
        }} />
      </div>
    </form>
  {:else if !loading}
    <RefreshButton disabled={disabled} onclick={() => {
      void load();
    }} />
  {/if}
</section>
