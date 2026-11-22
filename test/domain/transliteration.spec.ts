import { AutomaticPageUrlIssue } from '../../src/domain/routing/automatic-page-url.error.js';
import {
  automaticPageSlug, siteTransliterationTables, updateTransliteration,
} from '../../src/domain/sites/transliteration.policy.js';

describe('site transliteration', () => {
  it.each([
    ['ru', '«Ёж» — часть 2', 'yozh-chast-2'],
    ['en', 'One - two:three', 'one-twothree'],
    ['fr', 'Cafe\u0301 et cœur', 'cafe-et-coeur'],
    ['el', 'Αθήνα: Ψυχή', 'athina-psychi'],
    ['de', 'Über Größe', 'ueber-groesse'],
    ['es', 'Mañana: canción', 'manana-cancion'],
    ['it', 'Più città', 'piu-citta'],
    ['pl', 'Łódź: Żółć', 'lodz-zolc'],
    ['cs', 'Příliš žluťoučký', 'prilis-zlutoucky'],
    ['pt', 'Ação e coração', 'acao-e-coracao'],
  ])('creates a slug for %s', (language, heading, slug) => {
    expect(automaticPageSlug(heading, language, [])).toBe(slug);
  });

  it('uses lowercase defaults and dash separators, and preserves explicit case-specific rules', () => {
    const { rules } = siteTransliterationTables().find((table) => table.language === 'ru')!;

    expect(rules).toEqual(expect.arrayContaining([
      { symbol: 'Ё', replacement: 'yo' }, { symbol: ' - ', replacement: '-' }, { symbol: ';', replacement: '' },
    ]));
    const replacement = new Map([['Ё', 'jo'], [' - ', 'x'], [':', ''], [';', '-']]);
    const edited = rules.map((rule) => ({ ...rule, replacement: replacement.get(rule.symbol) ?? rule.replacement }));
    const site = updateTransliteration([], 'ru', edited, rules);

    expect(automaticPageSlug('Ёж - ёлка:дом;сад', 'ru', site)).toBe('jozhxyolkadom-sad');
    expect(automaticPageSlug('Ёж - ёлка:дом;сад', 'ru', [])).toBe('yozh-yolkadomsad');
    expect(() => updateTransliteration(site, 'ru', rules, rules)).toThrow('changed');
    expect(updateTransliteration(site, 'ru', rules, edited)).toEqual([]);
  });

  it('rejects spaces in written replacements and optionally keeps internal hyphen sequences', () => {
    const { rules } = siteTransliterationTables().find((table) => table.language === 'en')!;
    const edited = rules.map((rule) => rule.symbol === '-' || rule.symbol === ':'
      ? { ...rule, replacement: ' ' } : rule);

    expect(() => updateTransliteration([], 'en', edited, rules)).toThrow('Invalid transliteration table');
    expect(automaticPageSlug(' -- One---Two -  - Three -- ', 'en', [])).toBe('one-two-three');
    expect(automaticPageSlug(' -- One---Two -  - Three -- ', 'en', [], false)).toBe('one---two--three');
  });

  it('keeps path syntax out of the generated segment and bounds its length', () => {
    expect(automaticPageSlug('../one//two?redirect=https://example.test#frag', 'en', []))
      .toBe('one-tworedirect-https-exampletest-frag');
    expect(automaticPageSlug('x'.repeat(119) + ' + tail', 'en', [])).toBe('x'.repeat(119));
    expect(() => automaticPageSlug('« — 😀»', 'ru', [])).toThrow(AutomaticPageUrlIssue.Heading);
  });
});
