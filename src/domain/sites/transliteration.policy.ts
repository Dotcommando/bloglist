import { AutomaticPageUrlError, AutomaticPageUrlIssue } from '../routing/automatic-page-url.error.js';
import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export interface ITransliterationRule {
  readonly symbol: string;
  readonly replacement: string;
}

export interface ITransliterationOverride extends ITransliterationRule {
  readonly language: string;
}

const latin = 'abcdefghijklmnopqrstuvwxyz';

const common = [
  [' - ', '-'], [' — ', '-'], [' – ', '-'], ['«', ''], ['»', ''], ['"', ''], ["'", ''], ['’', ''],
  [':', ''], [';', ''], [',', ''], ['.', ''], ['!', ''], ['?', ''],
] as const;

function alphabet(symbols: string, replacements: readonly string[]): readonly (readonly [string, string])[] {
  return Array.from(symbols, (symbol, index) => [symbol, replacements[index] ?? ''] as const);
}

function latinAlphabet(extras = '', replacements?: readonly string[]): readonly (readonly [string, string])[] {
  return [...alphabet(latin, [...latin]), ...alphabet(extras, replacements
    ?? [...extras].map((character) => character.normalize('NFD').replace(/\p{M}/gu, '')))];
}

const alphabets = {
  ru: alphabet('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    'a b v g d e yo zh z i y k l m n o p r s t u f kh ts ch sh shch  y  e yu ya'.split(' ')),
  en: latinAlphabet(),
  fr: latinAlphabet('àâæçéèêëîïôœùûüÿ', 'a a ae c e e e e i i o oe u u u y'.split(' ')),
  el: alphabet('αβγδεζηθικλμνξοπρσςτυφχψωάέήίόύώϊϋΐΰ',
    'a v g d e z i th i k l m n x o p r s s t y f ch ps o a e i i o y o i y i y'.split(' ')),
  de: latinAlphabet('äöüß', ['ae', 'oe', 'ue', 'ss']),
  es: latinAlphabet('áéíóúüñ'),
  it: latinAlphabet('àèéìíîòóùú'),
  pl: latinAlphabet('ąćęłńóśźż', 'a c e l n o s z z'.split(' ')),
  cs: latinAlphabet('áčďéěíňóřšťúůýž'),
  pt: latinAlphabet('áâãàçéêíóôõúü'),
};

const defaults = new Map(Object.entries(alphabets).map(([language, lower]) => {
  const upper = lower.map(([symbol, replacement]) =>
    [symbol === 'ß' ? 'ẞ' : symbol.toUpperCase(), replacement] as const);
  const letters = [...new Map([...upper.filter(([symbol]) => [...symbol].length === 1), ...lower])];

  return [language, [...letters, ...common].map(([symbol, replacement]) => ({ symbol, replacement }))];
}));

const commonRules = common.map(([symbol, replacement]) => ({ symbol, replacement }));

export const transliterationReplacementPattern = /^[a-zA-Z0-9-]{0,16}$/;

export function siteTransliterationTables(overrides: readonly ITransliterationOverride[] = []):
{ language: string; rules: ITransliterationRule[] }[] {
  return [...defaults.keys()].map((language) => ({ language, rules: table(language, overrides) }));
}

function table(language: string, overrides: readonly ITransliterationOverride[]): ITransliterationRule[] {
  const substitutions = new Map(overrides.filter((rule) => rule.language === language)
    .map(({ symbol, replacement }) => [symbol, replacement]));

  return (defaults.get(language) ?? commonRules).map(({ symbol, replacement }) => ({
    symbol, replacement: substitutions.get(symbol) ?? replacement,
  }));
}

export function updateTransliteration(overrides: readonly ITransliterationOverride[], language: string,
  rules: readonly ITransliterationRule[], expectedRules: readonly ITransliterationRule[]): ITransliterationOverride[] {
  const base = defaults.get(language);

  if (
    !base
    || ![rules, expectedRules].every((list) => list.length === base.length
    && list.every((rule, index) => rule.symbol === base[index]?.symbol
      && transliterationReplacementPattern.test(rule.replacement)))
  ) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid transliteration table');
  }

  const current = table(language, overrides);

  if (expectedRules.some((rule, index) => rule.replacement !== current[index]?.replacement)) {
    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Transliteration table changed');
  }

  return [
    ...overrides.filter((rule) => rule.language !== language),
    ...rules.filter((rule, index) => rule.replacement !== base[index]?.replacement)
      .map(({ symbol, replacement }) => ({ language, symbol, replacement })),
  ];
}

export function automaticPageSlug(heading: string, language: string,
  overrides: readonly ITransliterationOverride[], collapseHyphens = true): string {
  const rules = table(language, overrides);
  const letters = new Map(rules.filter(({ symbol }) => [...symbol].length === 1)
    .map(({ symbol, replacement }) => [symbol, replacement]));
  const sequences = rules.filter(({ symbol }) => [...symbol].length > 1)
    .sort((first, second) => second.symbol.length - first.symbol.length);
  const text = heading.normalize('NFC');
  let transliterated = '';

  for (let offset = 0; offset < text.length;) {
    const match = text[offset] === ' ' ? sequences.find(({ symbol }) => text.startsWith(symbol, offset)) : undefined;

    if (match) {
      transliterated += match.replacement;
      offset += match.symbol.length;
    } else {
      const character = String.fromCodePoint(text.codePointAt(offset)!);

      transliterated += letters.get(character) ?? character.normalize('NFKD').replace(/\p{M}/gu, '');
      offset += character.length;
    }
  }
  const separated = transliterated.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const slug = (collapseHyphens ? separated.replace(/-{2,}/g, '-') : separated).replace(/^-+/, '')
    .slice(0, 120).replace(/-+$/, '');

  if (!slug) {
    throw new AutomaticPageUrlError(AutomaticPageUrlIssue.Heading);
  }

  return slug;
}
