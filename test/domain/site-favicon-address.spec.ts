import { validatePublishedPages } from '../../src/domain/publication/published-page-summary.js';

it('reserves the root favicon address from published pages', () => {
  const page = {
    siteId: 'site-1',
    pageId: 'page-1',
    urlId: 'url-1',
    parentUrlId: null,
    title: 'Icon',
    language: 'en',
    path: '/favicon.ico',
  };

  expect(() => validatePublishedPages('site-1', [page])).toThrow('Reserved published page address');
  expect(() => validatePublishedPages('site-1', [{ ...page, path: '/article/favicon.ico' }])).not.toThrow();
});
