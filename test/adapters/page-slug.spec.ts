import { pageSlug, suggestedPageMark, suggestedPagePath } from '../../admin/src/features/pages/page-slug.js';

describe('new page URL suggestions', () => {
  it('uses index for home, readable last URL segments and a short fallback without reusing occupied keys', () => {
    const fallback = 'Page12ab34cd';

    expect(suggestedPageMark('/', fallback, [])).toBe('index');
    expect(suggestedPageMark('/games/seksualnost-energiya-zhizni/', fallback, []))
      .toBe('SeksualnostEnergiyaZhizni');
    expect(suggestedPageMark('/games/%D0%B8%D0%B3%D1%80%D0%B0/', fallback, [])).toBe('Igra');
    expect(suggestedPageMark('/files/readme.txt', fallback, [])).toBe('ReadmeTxt');
    expect(suggestedPageMark('/2026/', fallback, [])).toBe('Page2026');
    expect(suggestedPageMark('', fallback, [])).toBe(fallback);
    expect(suggestedPageMark('/%zz/', fallback, [])).toBe(fallback);
    expect(suggestedPageMark('/🔥/', fallback, [])).toBe(fallback);
    expect(suggestedPageMark('/games/dura/', fallback, ['DURA'])).toBe(fallback);
  });
  it.each([
    ['Second Page', 'second-page'],
    ['  Hello, WORLD! 2026  ', 'hello-world-2026'],
    ['Русское название страницы', 'russkoe-nazvanie-stranitsy'],
    ['Ёж, йога и съёмка: щука, чай, юг, я!', 'yozh-yoga-i-syomka-shchuka-chay-yug-ya'],
    ['Подъезд и мышь', 'podezd-i-mysh'],
    ['Cafe\u0301 & déjà vu', 'cafe-deja-vu'],
    ['Русский / English — тест', 'russkiy-english-test'],
    ['🔥?!', ''],
  ])('converts %s to %s', (title, slug) => {
    expect(pageSlug(title)).toBe(slug);
  });
  it('keeps home, manual and existing paths stable', () => {
    expect(suggestedPagePath('New title', { path: '/', first: true, existing: false, manual: false })).toBe('/');
    expect(suggestedPagePath('New title', {
      path: '/old/', first: false, existing: true, manual: false,
    })).toBe('/old/');
    expect(suggestedPagePath('New title', {
      path: '/custom/', first: false, existing: false, manual: true,
    })).toBe('/custom/');
    expect(suggestedPagePath('New title', {
      path: '', first: false, existing: false, manual: false,
    })).toBe('/new-title/');
    expect(suggestedPagePath('?!', { path: '', first: false, existing: false, manual: false })).toBe('/');
  });
  it('starts at the parent prefix and appends automatic slugs within that prefix', () => {
    const state = { path: '/', first: false, existing: false, manual: false, parentPath: '/articles' };

    expect(suggestedPagePath('', state)).toBe('/articles/');
    expect(suggestedPagePath('New child', state)).toBe('/articles/new-child/');
    expect(suggestedPagePath('?!', state)).toBe('/articles/');
    expect(suggestedPagePath('New child', { ...state, path: '/manual/', manual: true })).toBe('/manual/');
  });
});
