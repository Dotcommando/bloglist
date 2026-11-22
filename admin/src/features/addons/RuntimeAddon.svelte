<script lang="ts">
  import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
  import { untrack } from 'svelte';

  import { messages } from '../../i18n/i18n';
  import AddonLoadingOverlay from './AddonLoadingOverlay.svelte';

  let { base, entry, styles, host }: {
    base: string;
    entry: string;
    styles: readonly string[];
    host: IAddonAdminHost;
  } = $props();
  let target: HTMLDivElement;
  let failed = $state(false);
  let loading = $state(true);
  let instance = $state<{ update: (host: IAddonAdminHost) => void; destroy: () => void } | null>(null);

  $effect(() => {
    const url = base + '/' + entry;
    const links = styles.map((style) => {
      const link = document.createElement('link');

      link.rel = 'stylesheet';
      link.href = base + '/' + style;
      document.head.append(link);

      return link;
    });
    let disposed = false;
    let mounted: typeof instance = null;

    failed = false;
    loading = true;
    void import(/* @vite-ignore */ url).then((module: unknown) => {
      if (disposed) {
        return;
      }
      if (!module || typeof module !== 'object' || !('mount' in module) || typeof module.mount !== 'function') {
        throw new Error('Invalid add-on view');
      }

      const result: unknown = module.mount(target, untrack(() => host));

      if (
        !result
        || typeof result !== 'object'
        || !('update' in result)
        || typeof result.update !== 'function'
        || !('destroy' in result)
        || typeof result.destroy !== 'function'
      ) {
        throw new Error('Invalid add-on mount');
      }

      const update = result.update;
      const destroy = result.destroy;

      mounted = {
        update: (value) => {
          update(value);
        },
        destroy: () => {
          destroy();
        },
      };
      instance = mounted;
    }).catch(() => {
      if (!disposed) {
        failed = true;
      }
    }).finally(() => {
      if (!disposed) {
        loading = false;
      }
    });

    return () => {
      disposed = true;
      mounted?.destroy();
      instance = null;
      links.forEach((link) => link.remove());
    };
  });
  $effect(() => {
    instance?.update(host);
  });
</script>

{#if failed}<p class="cms-error" role="alert">{$messages.runtimeAddonLoadFailed}</p>{/if}
<div class="runtime-addon-view" class:runtime-addon-view__loading={loading}>
  <div class="runtime-addon" bind:this={target} aria-busy={loading}></div>
  {#if loading}<AddonLoadingOverlay label="addonsLoadingScreen" />{/if}
</div>

<style>
  .runtime-addon-view { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; }
  .runtime-addon-view__loading { min-height: 104px; }
  .runtime-addon { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
</style>
