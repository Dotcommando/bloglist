import { derived, readonly, writable } from 'svelte/store';

import { type AdminLanguage, isAdminLanguage, messagesFor } from './catalog.js';

export { type AdminLanguage, adminLocales, type AdminMessageKey, formatMessage } from './catalog.js';

const defaultLanguage: AdminLanguage = 'en';

const preferenceKey = 'zarya.admin.language';

function preferredLanguage(): AdminLanguage {
  try {
    const stored = globalThis.localStorage?.getItem(preferenceKey) ?? null;

    return isAdminLanguage(stored) ? stored : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

const current = writable(preferredLanguage());

export const adminLanguage = readonly(current);

export const messages = derived(current, messagesFor);

export function setAdminLanguage(language: string): void {
  if (!isAdminLanguage(language)) {
    return;
  }
  current.set(language);

  try {
    globalThis.localStorage?.setItem(preferenceKey, language);
  } catch {
    // Language switching remains available when browser storage is blocked.
  }
}
