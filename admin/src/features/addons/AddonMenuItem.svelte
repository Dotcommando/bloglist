<script lang="ts">
  import { adminLanguage, adminLocales, formatMessage, messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import { getAddonMenuBadge } from './addons-api';

  let { addonKey, label, enabled, menuBadge, siteId, selected, disabled, badgeRevision, onUnauthorized, onclick }: {
    addonKey: string;
    label: { en: string; ru: string };
    enabled: boolean;
    menuBadge: boolean;
    siteId: string;
    selected: boolean;
    disabled: boolean;
    badgeRevision: number;
    onUnauthorized: () => void;
    onclick: () => void;
  } = $props();

  let badge = $state<{ siteId: string; count: number }>();
  const count = $derived(enabled && menuBadge && badge?.siteId === siteId ? badge.count : 0);
  const descriptionId = $derived('addon-menu-count-' + addonKey);
  const language = $derived(adminLocales[$adminLanguage].addonLanguage);

  $effect(() => {
    const site = siteId;
    const key = addonKey;
    const supportsBadge = menuBadge && enabled;

    void badgeRevision;

    if (!supportsBadge) {
      badge = undefined;

      return;
    }

    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async (): Promise<void> => {
      if (disposed || pending || document.hidden) {
        return;
      }
      clearTimeout(timer);
      pending = true;

      try {
        const value = await getAddonMenuBadge(site, key);

        if (!disposed) {
          badge = { siteId: site, count: value };
        }
      } catch (error) {
        if (!disposed) {
          badge = undefined;

          if (error instanceof ContentRequestError && error.status === 401) {
            onUnauthorized();
          }
        }
      } finally {
        pending = false;

        if (!disposed) {
          timer = setTimeout(() => {
            void refresh();
          }, 20000);
        }
      }
    };
    const resume = (): void => {
      void refresh();
    };

    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    resume();

    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  });
</script>

<button class="_section-link _section-addon" class:_section-addon__badge={count > 0}
  aria-current={selected ? 'page' : undefined} aria-describedby={count ? descriptionId : undefined}
  {disabled} {onclick}>
  <span class="_addon-menu-label">
    {language === 'en' ? label.en : label.ru}
    {#if !enabled}<span class="_addon-off"> · {$messages.adminOff}</span>{/if}
  </span>
  {#if count}
    <span class="_addon-menu-badge" aria-hidden="true">{count}</span>
    <span id={descriptionId} hidden>{formatMessage($messages.addonsMenuCount, { count })}</span>
  {/if}
</button>
