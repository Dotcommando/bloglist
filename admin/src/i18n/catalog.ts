import { en } from './locales/en/index.js';
import { ru } from './locales/ru/index.js';

export type AdminMessages = typeof en;

export type AdminMessageKey = keyof AdminMessages;

interface IAdminLocale {
  readonly name: string;
  readonly numberLocale: string;
  readonly calendarLocale: string;
  readonly addonLanguage: 'en' | 'ru';
  readonly messages: AdminMessages;
}

export const adminLocales = {
  en: {
    name: 'English',
    numberLocale: 'en-US',
    calendarLocale: 'en-GB',
    addonLanguage: 'en',
    messages: en,
  },
  ru: {
    name: 'Русский',
    numberLocale: 'ru-RU',
    calendarLocale: 'ru-RU',
    addonLanguage: 'ru',
    messages: ru,
  },
} satisfies Record<string, IAdminLocale>;

export type AdminLanguage = keyof typeof adminLocales;

export function isAdminLanguage(value: string | null): value is AdminLanguage {
  return value !== null && Object.hasOwn(adminLocales, value);
}

export function messagesFor(language: AdminLanguage): AdminMessages {
  return adminLocales[language].messages;
}

export function formatMessage(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}
