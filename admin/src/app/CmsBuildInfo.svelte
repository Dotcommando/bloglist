<script lang="ts">
  import { Popover } from 'bits-ui';

  import { messages } from '../i18n/i18n';
  import { cmsBuildInfo } from './cms-build-info';

</script>

<div class="cms-build-info">
  <Popover.Root>
    <Popover.Trigger type="button" class="cms-text-action _build-summary">
      CMS Zarya v.{cmsBuildInfo.version}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="cms-floating-surface _build-details" side="bottom" align="end" sideOffset={6}
        collisionPadding={12} aria-label={$messages.cmsBuildInfoCMSBuildInformation}>
        {#if cmsBuildInfo.commit && cmsBuildInfo.checksum}
          <dl>
            <dt>{$messages.cmsBuildInfoCMSCommit}</dt><dd>{cmsBuildInfo.commit}</dd>
            <dt>{$messages.cmsBuildInfoBuildPayloadSHA}</dt><dd>{cmsBuildInfo.checksum}</dd>
          </dl>
        {:else}
          <p>{$messages.cmsBuildInfoLocalBuildWithoutARelease}</p>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>

<style>
  .cms-build-info { margin-left: auto; font-size: 11px; color: #596459; flex-shrink: 0; }
  .cms-build-info :global(._build-summary) { cursor: pointer; min-height: 44px; padding: 8px 0;
    border: 0; background: transparent; font: inherit; }
  .cms-build-info :global(._build-summary:focus-visible) { outline: 2px solid #9b4926; outline-offset: 2px; }
  :global(._build-details) { z-index: 3; width: min(360px, 85vw); padding: 16px;
    font-size: 12px; }
  :global(._build-details dl), :global(._build-details p) { margin: 0; }
  :global(._build-details dt) { margin-bottom: 4px; font-weight: 600; }
  :global(._build-details dd) { margin: 0 0 12px; overflow-wrap: anywhere; }
</style>
