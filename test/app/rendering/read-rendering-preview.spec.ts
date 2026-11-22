import { ReadRenderingPreviewUseCase } from '../../../src/app/use-cases/rendering/read-rendering-preview.use-case.js';

describe('ReadRenderingPreview', () => {
  it('requires the current owner and site access on every document read', async () => {
    const documents = { read: vi.fn(async () => ({ siteId: 'site-1', pageId: 'page-1', html: '<html></html>' })) };
    const access = vi.fn(async () => {});
    const useCase = new ReadRenderingPreviewUseCase(documents, access);

    expect((await useCase.execute({ previewId: 'id', actorId: 'owner' })).siteId).toBe('site-1');
    expect(documents.read).toHaveBeenCalledWith('id', 'owner');
    expect(access).toHaveBeenCalledWith('site-1', 'page-1');
    access.mockRejectedValue(new Error('Expired session'));
    await expect(useCase.execute({ previewId: 'id', actorId: 'owner' })).rejects.toThrow('Expired session');
  });
});
