import { createHash } from 'node:crypto';

import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { paginationItemContract, paginationLinkContract } from '../../../../domain/rendering/pagination-contract.js';

const html = '<!doctype html><html lang="[[*language]]"><head><meta charset="UTF-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>[[*seo.title]]</title><meta name="robots" content="[[*seo.robots]]">'
  + '</head><body><main class="pagination-page"><h1>[[*seo.heading]]</h1>'
  + '[[*contentMd:markdown]]'
  + '[[!Pagination? &page=`[[+request.page]]` &as=`pagination`]]'
  + '<p class="_pagination-summary">[[+pagination.total]] · [[+pagination.page]] / [[+pagination.totalPages]]</p>'
  + '<ul class="pagination-items">[[Each? &items=`[[+pagination.items]]` &chunk=`ZaryaPaginationItem`]]</ul>'
  + '<nav class="pagination-nav" aria-label="Pagination">'
  + '[[Each? &items=`[[+pagination.links]]` &chunk=`ZaryaPaginationLink`]]</nav>'
  + '</main></body></html>';

const css = '.pagination-page{box-sizing:border-box;max-width:960px;margin:0 auto;padding:32px 20px;'
  + 'font-family:system-ui,sans-serif;line-height:1.6;color:#17342d;background-color:#fff}'
  + '.pagination-items{display:grid;gap:8px;padding:0;list-style:none}'
  + '._pagination-item-link{display:block;padding:12px 16px;border:1px solid #cadbd5;'
  + 'border-radius:8px;color:#165c46;text-decoration:none}'
  + '.pagination-nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}'
  + '._pagination-link{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;'
  + 'min-width:44px;min-height:44px;padding:8px;border:1px solid #cadbd5;border-radius:8px;color:#165c46;'
  + 'text-decoration:none}'
  + '._pagination-link[aria-current="page"]{background-color:#165c46;color:#fff}'
  + '._pagination-link:focus-visible,._pagination-item-link:focus-visible{outline:3px solid #bd5d21;outline-offset:3px}';

export const paginationSources = {
  templates: [
    {
      id: 'ZaryaPagination',
      name: 'Pagination',
      kind: TemplateSourceKind.Template,
      revision: createHash('sha256').update(html).digest('hex'),
      html,
      parameters: [],
      frontendSourceId: 'templates/ZaryaPagination',
    },
    {
      id: 'ZaryaPaginationItem',
      name: 'Pagination item',
      kind: TemplateSourceKind.Chunk,
      revision: '1',
      html: '<li><a class="_pagination-item-link" href="[[+item.path]]">[[+item.title]]</a></li>',
      parameters: [paginationItemContract],
    },
    {
      id: 'ZaryaPaginationLink',
      name: 'Pagination link',
      kind: TemplateSourceKind.Chunk,
      revision: '1',
      html: '<a class="_pagination-link" href="[[+item.href]]" aria-current="[[+item.ariaCurrent]]">[[+item.page]]</a>',
      parameters: [paginationLinkContract],
    },
  ],
  frontendSources: [{
    id: 'templates/ZaryaPagination',
    revision: createHash('sha256').update(css).digest('hex'),
    css,
    browserTypeScript: null,
  }],
};
