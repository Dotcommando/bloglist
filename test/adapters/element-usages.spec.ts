import { RenderingElementUsagesAdapter } from '../../src/adapters/outbound/rendering/modx/element-usages.adapter.js';
import { Page } from '../../src/domain/pages/page.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { pageFixture } from '../support/pages.js';
import { source } from '../support/publication.js';

describe('element usages', () => {
  it('follows nested chunks and conditional/iteration dependencies to pages without looping', async () => {
    const snapshot = source('[[$Outer_Block]]');
    const sources = {
      read: async () => ({
        ...snapshot,
        templates: [...snapshot.templates,
          {
            id: 'Outer',
            name: 'Outer Block',
            kind: TemplateSourceKind.Chunk,
            revision: '1',
            parameters: [],
            html: '[[If? &condition=`true` &then=`Card`]]',
          }],
      }),
    };
    const pages = { execute: async () => [new Page({ ...pageFixture().toState(), ...snapshot.pages[0]! })] };
    const adapter = new RenderingElementUsagesAdapter(sources, pages);
    const usages = await adapter.find({ siteId: 'site-1', kind: TemplateSourceKind.Chunk, key: 'Card' });

    expect(usages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'Chunk', id: 'Outer' }),
      expect.objectContaining({ kind: 'Template', id: 'Home' }),
      expect.objectContaining({ kind: 'Page', id: 'page-1' }),
    ]));
  });
});
