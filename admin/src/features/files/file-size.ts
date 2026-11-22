import { type AdminLanguage, adminLocales, messagesFor } from '../../i18n/catalog.js';

const KIBIBYTE = 1024;

const MEBIBYTE = KIBIBYTE * KIBIBYTE;

export function formatFileSize(bytes: number, language: AdminLanguage): string {
  const mebibytes = bytes >= MEBIBYTE;
  const digits = mebibytes || bytes < 10 * KIBIBYTE ? 1 : 0;
  const number = new Intl.NumberFormat(adminLocales[language].numberLocale, {
    maximumFractionDigits: digits,
    roundingMode: digits === 1 ? 'halfEven' : 'halfExpand',
    useGrouping: false,
  });
  const copy = messagesFor(language);
  const unit = mebibytes ? copy.fileSizeMebibytes : copy.fileSizeKibibytes;

  return number.format(bytes / (mebibytes ? MEBIBYTE : KIBIBYTE)) + ' ' + unit;
}

export function formatKibibytes(bytes: number, language: AdminLanguage): string {
  return new Intl.NumberFormat(adminLocales[language].numberLocale, {
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(bytes / KIBIBYTE) + ' ' + messagesFor(language).fileSizeKibibytes;
}
