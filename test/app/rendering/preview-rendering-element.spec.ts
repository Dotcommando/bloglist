import {
  PreviewRenderingElementUseCase,
} from '../../../src/app/use-cases/rendering/preview-rendering-element.use-case.js';
import { ElementUsageKind } from '../../../src/domain/rendering/rendering-element.js';
import { elementFixture } from '../../support/rendering.js';

describe('PreviewRenderingElement', () => {
  it('previews an owned using page at the captured source version without any mutation', async () => {
    const item = elementFixture();
    const preview = {
      execute: vi.fn(async () => ({
        pageId: 'page-1',
        previewId: 'preview',
        url: '/preview',
        html: '',
        frontendSourceIds: [],
      })),
    };
    const useCase = new PreviewRenderingElementUseCase({
      execute: async () => ({
        ...item, usages: [{ kind: ElementUsageKind.Page, id: 'page-1', title: 'Home' }],
      }),
    }, preview);

    expect((await useCase.execute({ ...item, pageId: 'page-1', expectedVersion: 'v1' })).previewId).toBe('preview');
    await expect(useCase.execute({ ...item, pageId: 'foreign', expectedVersion: 'v1' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    await expect(useCase.execute({ ...item, pageId: 'page-1', expectedVersion: 'old' }))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect(preview.execute).toHaveBeenCalledTimes(1);
  });
});
