import { ListPagesUseCase } from '../../../src/app/use-cases/pages/list-pages.use-case.js';
import { PageStatus } from '../../../src/domain/pages/page-status.enum.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('ListPages', () => {
  const access = {
    assertCanReadPage: async () => {},
    assertCanCreatePage: async () => {},
    assertCanUpdatePage: async () => {},
  };

  it('returns all owned draft pages with explicit supported filters', async () => {
    const pages = new FakePageRepository();

    pages.records.set('page-1', pageFixture());
    pages.records.set('foreign', pageFixture('foreign', 'other-site', 'Foreign'));
    const query = vi.spyOn(pages, 'findBySite');
    const result = await new ListPagesUseCase(pages, access).execute({
      siteId: 'site-1',
      filter: { language: ' EN ', clusterId: null, status: PageStatus.DRAFT },
    });

    expect(result.map((page) => page.pageId)).toEqual(['page-1']);
    expect(query).toHaveBeenCalledWith('site-1', {
      language: 'en', clusterId: null, status: PageStatus.DRAFT,
    }, undefined);
  });
  it('rejects mixed-site results and denies before reading', async () => {
    const pages = new FakePageRepository();
    const query = vi.spyOn(pages, 'findBySite').mockResolvedValue([pageFixture(), pageFixture(
      'foreign', 'other', 'Foreign')]);

    await expect(new ListPagesUseCase(pages, access).execute({ siteId: 'site-1' })).rejects.toThrow();
    query.mockClear();
    await expect(new ListPagesUseCase(pages, {
      ...access,
      assertCanReadPage: async () => {
        throw new Error('Denied');
      },
    })
      .execute({ siteId: 'site-1' })).rejects.toThrow('Denied');
    expect(query).not.toHaveBeenCalled();
  });
});
