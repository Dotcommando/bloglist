import { adminLocales, formatMessage, messagesFor } from '../../admin/src/i18n/catalog.js';

function placeholders(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g), (match) => match[1]!))].sort();
}

it('keeps every declared admin locale complete and independently editable', () => {
  const reference: Readonly<Record<string, string>> = messagesFor('en');
  const keys = Object.keys(reference).sort();

  for (const [code, locale] of Object.entries(adminLocales)) {
    expect(Object.keys(locale.messages).sort(), code).toEqual(keys);

    for (const [key, translation] of Object.entries(locale.messages)) {
      expect(translation.trim(), code + '/' + key).not.toBe('');
      expect(placeholders(translation), code + '/' + key)
        .toEqual(placeholders(reference[key]!));
    }
  }
});

it('formats named values in the selected translation without interpreting inserted text', () => {
  const english = messagesFor('en').loginLimited;
  const russian = messagesFor('ru').loginLimited;

  expect(formatMessage(english, { minutes: 3 })).toBe('Too many attempts. Try again in 3 min.');
  expect(formatMessage(russian, { minutes: 3 })).toBe('Слишком много попыток. Попробуйте через 3 мин.');
  expect(formatMessage('{second} {first}', { first: '<name>', second: '{first}' })).toBe('{first} <name>');
});
