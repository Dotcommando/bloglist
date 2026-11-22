<script lang="ts">
  import { messages } from '../../i18n/i18n';
  import { AddonUpdateMode, AddonUpdatePhase, type IAddonUpdate } from './addon-updates-api';

  let { addonKey, disabled, showFile, update, onPrepare, onApply, onStatus, onCancel }: {
    addonKey: string;
    disabled: boolean;
    showFile: boolean;
    update: IAddonUpdate | undefined;
    onPrepare: (file: File) => Promise<void>;
    onApply: (update: IAddonUpdate) => Promise<void>;
    onStatus: (update: IAddonUpdate) => Promise<void>;
    onCancel: () => void;
  } = $props();
  let files = $state<FileList | undefined>();
  let uploadInput = $state<HTMLInputElement>();
  const uploadId = $derived('addon-update-archive-' + addonKey);
  const selectionId = $derived(uploadId + '-selection');
  const phaseLabels = $derived({
    [AddonUpdatePhase.Prepared]: $messages.addonUpdatesPanelReadyToUpdate,
    [AddonUpdatePhase.Quiescing]: $messages.addonUpdatesPanelFinishingOperations,
    [AddonUpdatePhase.Migrating]: $messages.addonUpdatesPanelUpdatingData,
    [AddonUpdatePhase.Activating]: $messages.addonUpdatesPanelActivatingVersion,
    [AddonUpdatePhase.Completed]: $messages.addonUpdatesPanelCompleted,
    [AddonUpdatePhase.Failed]: $messages.addonUpdatesPanelFailedAddOnPaused,
  });
</script>

{#if showFile}
  <form class="_addon-update" onsubmit={(event) => {
    event.preventDefault();
    const file = files?.[0];

    if (file && !disabled) {
      void onPrepare(file);
    }
  }}>
    <label for={uploadId}>{$messages.addonUpdatesPanelUpdatePackage}</label>
    <input id={uploadId} type="file" accept=".gz,application/gzip" bind:files bind:this={uploadInput}
      hidden {disabled} />
    <div class="cms-row _addon-file-row">
      <div class="_addon-file-selection">
        <button type="button" class="cms-secondary" aria-describedby={selectionId} {disabled}
          onclick={() => uploadInput?.click()}>
          {$messages.addonUpdatesPanelChoosePackage}
        </button>
        <span id={selectionId} class="_addon-file-name" aria-live="polite">
          {files?.[0]?.name ?? $messages.addonUpdatesPanelNoFileSelected}
        </span>
      </div>
      <div class="_addon-file-actions">
        <button type="submit" class="cms-secondary" disabled={disabled || !files?.length}>
          {$messages.addonUpdatesPanelCheckPackage}
        </button>
        <button type="button" class="cms-secondary" {disabled} onclick={onCancel}>{$messages.cancel}</button>
      </div>
    </div>
  </form>
{/if}
{#if update}
  {@const proposal = update}
  <div class="_addon-update cms-callout">
    <p><strong>{proposal.fromVersion} → {proposal.toVersion}</strong></p>
    <p>{$messages.addonsUpdateAllSites}</p>
    <p>{proposal.mode === AddonUpdateMode.Exclusive
      ? $messages.addonUpdatesPanelOperationsOfThisAddOn
      : $messages.addonUpdatesPanelCompatibleUpdateWithRollingProcess}</p>
    <p role="status">{$messages.addonUpdatesPanelStatus}: {phaseLabels[proposal.phase]}</p>
    <div class="cms-row">
      <button type="button" class="cms-primary" {disabled} onclick={() => {
        void onApply(proposal);
      }}>
        {proposal.phase === AddonUpdatePhase.Prepared ? $messages.addonsInstallUpdate
          : $messages.addonUpdatesPanelContinueUpdate}
      </button>
      <button type="button" class="cms-secondary" {disabled} onclick={() => {
        void onStatus(proposal);
      }}>
        {$messages.addonUpdatesPanelCheckStatus}
      </button>
    </div>
  </div>
{/if}

<style>
  ._addon-update { display: grid; gap: 8px; }
  ._addon-file-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 24px; }
  ._addon-file-selection, ._addon-file-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    max-width: 100%;
  }
  ._addon-file-selection { gap: 8px; }
  ._addon-file-actions { gap: 12px; }
  ._addon-file-name { min-width: 0; overflow-wrap: anywhere; }
  p { margin: 0; }
</style>
