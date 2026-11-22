import { createHash } from 'node:crypto';

import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { paginationParameters, paginationSnippetSource } from '../../../../domain/rendering/pagination-snippet.js';
import { requireText } from '../../../../domain/shared/validation.js';
import type {
  IRenderingSourcePort, IRenderingSources,
} from '../../../../ports/outbound/publication/rendering-source.port.js';
import { paginationSources } from './pagination-sources.js';

const html = '<!doctype html><html lang="[[*language]]"><head><meta charset="UTF-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>[[*seo.title]]</title>'
  + '<meta name="robots" content="[[*seo.robots]]">'
  + '[[If? &condition=`[[*seo.hasDescription]]` &then=`ZaryaBasicMetaDescription`]]'
  + '<meta property="og:title" content="[[*seo.ogTitle]]">'
  + '<meta property="og:type" content="[[*seo.ogType]]">'
  + '[[If? &condition=`[[*seo.hasOgDescription]]` &then=`ZaryaBasicOgDescription`]]'
  + '[[If? &condition=`[[*seo.hasOgImage]]` &then=`ZaryaBasicOgImage`]]'
  + '</head><body><main><h1>[[*seo.heading]]</h1>'
  + '[[*contentMd:markdown]]</main></body></html>';

const metadataChunks = [
  ['ZaryaBasicMetaDescription', '<meta name="description" content="[[*seo.description]]">'],
  ['ZaryaBasicOgDescription', '<meta property="og:description" content="[[*seo.ogDescription]]">'],
  ['ZaryaBasicOgImage', '<meta property="og:image" content="[[*seo.ogImage]]">'],
] as const;

export class BasicRenderingSourceAdapter implements IRenderingSourcePort {
  async read(siteId: string): Promise<IRenderingSources> {
    requireText(siteId, 'siteId');

    return {
      siteKey: 'Site' + createHash('sha256').update(siteId).digest('hex'),
      settings: {},
      requestParameters: [],
      frontendSources: paginationSources.frontendSources,
      templates: [{
        id: 'ZaryaBasic',
        kind: TemplateSourceKind.Template,
        revision: createHash('sha256').update(html).digest('hex'),
        html,
        parameters: [],
      }, ...metadataChunks.map(([id, markup]) => ({
        id,
        kind: TemplateSourceKind.Chunk,
        revision: createHash('sha256').update(markup).digest('hex'),
        html: markup,
        parameters: [],
      })), ...paginationSources.templates, {
        id: 'Pagination',
        name: 'Pagination',
        kind: TemplateSourceKind.Snippet,
        revision: createHash('sha256').update(paginationSnippetSource.code).digest('hex'),
        html: '',
        parameters: paginationParameters,
        snippet: paginationSnippetSource,
      }],
    };
  }
}
