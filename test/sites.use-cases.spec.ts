import { SiteConflictError } from '../src/app/errors/sites/site-conflict.error.js';
import { SiteNotFoundError } from '../src/app/errors/sites/site-not-found.error.js';
import { ArchiveSiteUseCase } from '../src/app/use-cases/sites/archive-site.use-case.js';
import { CreateSiteUseCase } from '../src/app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../src/app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../src/app/use-cases/sites/list-sites.use-case.js';
import { UpdateSiteUseCase } from '../src/app/use-cases/sites/update-site.use-case.js';
import { Site } from '../src/domain/sites/site.js';
import { SiteStatus } from '../src/domain/sites/site-status.enum.js';
import type { ICreateSiteInput } from '../src/ports/inbound/sites/create-site.port.js';
import type { IUpdateSiteInput } from '../src/ports/inbound/sites/update-site.port.js';
import { instant, siteState } from './domain.fixtures.js';
import { siteRepository as repository } from './sites.fixtures.js';

function createInput(overrides: Partial<ICreateSiteInput> = {}): ICreateSiteInput {
  return {
    mark: 'Wood',
    name: ' Wood ',
    primaryDomain: ' EXAMPLE.COM ',
    languages: [' EN ', 'DE'],
    defaultLanguage: ' EN ',
    ...overrides,
  };
}

const creationValues = {
  nextSiteId: (): string => 'site-new',
  currentInstant: instant,
};

describe('CreateSiteUseCase', () => {
  it('creates an active site with generated identity, UTC instants and normalized business values', async () => {
    const sites = repository();
    const input = createInput();
    const site = await new CreateSiteUseCase(sites, creationValues).execute(input);

    expect(site.toState()).toEqual(siteState({ siteId: 'site-new' }));
    expect(sites.findByMark).toHaveBeenCalledWith('Wood');
    expect(sites.findByPrimaryDomain).toHaveBeenCalledWith('example.com');
    expect(sites.save).toHaveBeenCalledExactlyOnceWith(site);
    input.languages.push('fr');
    expect(site.languages).toEqual(['en', 'de']);
  });

  it('checks uniqueness using the IDN-normalized primary domain', async () => {
    const sites = repository();

    await new CreateSiteUseCase(sites, creationValues).execute(createInput({ primaryDomain: 'b\u00fccher.example' }));
    expect(sites.findByPrimaryDomain).toHaveBeenCalledWith('xn--bcher-kva.example');
  });

  it.each(['mark', 'domain'])('rejects an existing %s without saving', async (field) => {
    const sites = repository();
    const existing = new Site(siteState());

    if (field === 'mark') {
      vi.mocked(sites.findByMark).mockResolvedValue(existing);
    } else {
      vi.mocked(sites.findByPrimaryDomain).mockResolvedValue(existing);
    }

    await expect(new CreateSiteUseCase(sites, creationValues).execute(createInput()))
      .rejects.toThrow(SiteConflictError);
    expect(sites.save).not.toHaveBeenCalled();
  });

  it.each<Partial<ICreateSiteInput>>([
    { mark: 'bad-mark' },
    { name: ' ' },
    { primaryDomain: 'example.com/path' },
    { languages: ['en', 'EN'] },
    { defaultLanguage: 'fr' },
  ])('rejects invalid input before accessing persistence: %j', async (input) => {
    const sites = repository();

    await expect(new CreateSiteUseCase(sites, creationValues).execute(createInput(input))).rejects.toThrow(RangeError);
    expect(sites.findByMark).not.toHaveBeenCalled();
    expect(sites.findByPrimaryDomain).not.toHaveBeenCalled();
    expect(sites.save).not.toHaveBeenCalled();
  });

  it('returns the persisted result including persistence-owned timestamps', async () => {
    const sites = repository();
    const saved = new Site(siteState({ siteId: 'site-new', updatedAt: new Date('2026-01-15T12:01:00Z') }));

    vi.mocked(sites.save).mockResolvedValue(saved);
    await expect(new CreateSiteUseCase(sites, creationValues).execute(createInput())).resolves.toBe(saved);
  });

  it('propagates persistence failures including conflicts detected during save', async () => {
    const sites = repository();
    const failure = new SiteConflictError('Concurrent registration');

    vi.mocked(sites.save).mockRejectedValue(failure);
    await expect(new CreateSiteUseCase(sites, creationValues).execute(createInput())).rejects.toBe(failure);
  });
});

describe('UpdateSiteUseCase', () => {
  it('updates details and replaces the default language without changing immutable or lifecycle fields', async () => {
    const sites = repository();
    const existing = new Site(siteState());

    vi.mocked(sites.findById).mockResolvedValue(existing);
    const saved = await new UpdateSiteUseCase(sites).execute({
      siteId: existing.siteId,
      name: ' Updated ',
      primaryDomain: ' NEW.EXAMPLE.COM ',
      addLanguages: [' FR '],
      defaultLanguage: ' FR ',
      removeLanguages: [' EN '],
    });

    expect(saved.toState()).toEqual(siteState({
      name: 'Updated',
      primaryDomain: 'new.example.com',
      languages: ['de', 'fr'],
      defaultLanguage: 'fr',
    }));
    expect(sites.findById).toHaveBeenCalledWith('site-1');
    expect(sites.findByPrimaryDomain).toHaveBeenCalledWith('new.example.com');
    expect(sites.save).toHaveBeenCalledExactlyOnceWith(saved);
    expect(existing.toState()).toEqual(siteState());
  });

  it('preserves omitted fields and permits the same normalized domain', async () => {
    const sites = repository();

    vi.mocked(sites.findById).mockResolvedValue(new Site(siteState()));
    const saved = await new UpdateSiteUseCase(sites).execute({ siteId: 'site-1', primaryDomain: ' EXAMPLE.COM ' });

    expect(saved.toState()).toEqual(siteState());
    expect(sites.findByPrimaryDomain).not.toHaveBeenCalled();
  });

  it('accepts a domain lookup belonging to the same site', async () => {
    const sites = repository();

    vi.mocked(sites.findById).mockResolvedValue(new Site(siteState()));
    vi.mocked(sites.findByPrimaryDomain).mockResolvedValue(new Site(siteState({ primaryDomain: 'new.example.com' })));
    await expect(new UpdateSiteUseCase(sites).execute({ siteId: 'site-1', primaryDomain: 'new.example.com' }))
      .resolves.toHaveProperty('primaryDomain', 'new.example.com');
  });

  it('rejects a primary domain owned by another site without altering the original', async () => {
    const sites = repository();
    const existing = new Site(siteState());

    vi.mocked(sites.findById).mockResolvedValue(existing);
    vi.mocked(sites.findByPrimaryDomain).mockResolvedValue(new Site(siteState({ siteId: 'site-2' })));
    await expect(new UpdateSiteUseCase(sites).execute({ siteId: 'site-1', primaryDomain: 'other.example.com' }))
      .rejects.toThrow(SiteConflictError);
    expect(sites.save).not.toHaveBeenCalled();
    expect(existing.toState()).toEqual(siteState());
  });

  it.each<Partial<IUpdateSiteInput>>([
    { addLanguages: ['EN'] },
    { addLanguages: ['fr', ' FR '] },
    { addLanguages: ['eng'] },
    { defaultLanguage: 'fr' },
    { removeLanguages: ['EN'] },
    { addLanguages: ['fr'], defaultLanguage: 'fr', removeLanguages: ['fr'] },
  ])('rejects invalid language changes without any partial write: %j', async (changes) => {
    const sites = repository();
    const existing = new Site(siteState());

    vi.mocked(sites.findById).mockResolvedValue(existing);
    await expect(new UpdateSiteUseCase(sites).execute({ siteId: 'site-1', name: 'Changed', ...changes }))
      .rejects.toThrow(RangeError);
    expect(sites.save).not.toHaveBeenCalled();
    expect(existing.toState()).toEqual(siteState());
  });

  it('treats removal of an absent non-default language as a no-op', async () => {
    const sites = repository();

    vi.mocked(sites.findById).mockResolvedValue(new Site(siteState()));
    await expect(new UpdateSiteUseCase(sites).execute({ siteId: 'site-1', removeLanguages: ['fr'] }))
      .resolves.toHaveProperty('languages', ['en', 'de']);
  });

  it('returns the saved entity and propagates save failures without altering the original', async () => {
    const sites = repository();
    const existing = new Site(siteState());
    const saved = new Site(siteState({ name: 'Saved' }));
    const failure = new Error('Save failed');
    const update = new UpdateSiteUseCase(sites);

    vi.mocked(sites.findById).mockResolvedValue(existing);
    vi.mocked(sites.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(update.execute({ siteId: 'site-1', name: 'Updated' })).resolves.toBe(saved);
    await expect(update.execute({ siteId: 'site-1', name: 'Updated' })).rejects.toBe(failure);
    expect(existing.toState()).toEqual(siteState());
  });
});

describe('ArchiveSiteUseCase', () => {
  it.each([SiteStatus.ACTIVE, SiteStatus.ARCHIVED])('archives a %s site, preserving all other data', async (status) => {
    const sites = repository();
    const existing = new Site(siteState({ status }));

    vi.mocked(sites.findById).mockResolvedValue(existing);
    const saved = await new ArchiveSiteUseCase(sites).execute({ siteId: 'site-1' });

    expect(saved.toState()).toEqual(siteState({ status: SiteStatus.ARCHIVED }));
    expect(sites.save).toHaveBeenCalledExactlyOnceWith(saved);
    expect(existing.status).toBe(status);
  });

  it('returns the persisted result and leaves the original intact on save failure', async () => {
    const sites = repository();
    const existing = new Site(siteState());
    const saved = new Site(siteState({ status: SiteStatus.ARCHIVED }));
    const failure = new Error('Save failed');
    const archive = new ArchiveSiteUseCase(sites);

    vi.mocked(sites.findById).mockResolvedValue(existing);
    vi.mocked(sites.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(archive.execute({ siteId: 'site-1' })).resolves.toBe(saved);
    await expect(archive.execute({ siteId: 'site-1' })).rejects.toBe(failure);
    expect(existing.status).toBe(SiteStatus.ACTIVE);
  });
});

describe('Site mutation preconditions', () => {
  it.each([UpdateSiteUseCase, ArchiveSiteUseCase])('rejects missing sites through %s', async (UseCase) => {
    const sites = repository();

    await expect(new UseCase(sites).execute({ siteId: 'missing' })).rejects.toMatchObject({
      name: 'SiteNotFoundError',
      siteId: 'missing',
    });
    await expect(new UseCase(sites).execute({ siteId: 'missing' })).rejects.toBeInstanceOf(SiteNotFoundError);
    expect(sites.save).not.toHaveBeenCalled();
  });

  it.each([UpdateSiteUseCase, ArchiveSiteUseCase])('propagates lookup failures through %s', async (UseCase) => {
    const sites = repository();
    const failure = new Error('Lookup failed');

    vi.mocked(sites.findById).mockRejectedValue(failure);
    await expect(new UseCase(sites).execute({ siteId: 'site-1' })).rejects.toBe(failure);
    expect(sites.save).not.toHaveBeenCalled();
  });
});

describe('Site queries', () => {
  it('gets the requested site and returns null when missing', async () => {
    const sites = repository();
    const site = new Site(siteState());
    const getSite = new GetSiteUseCase(sites);

    vi.mocked(sites.findById).mockResolvedValueOnce(site);
    await expect(getSite.execute({ siteId: site.siteId })).resolves.toBe(site);
    expect(sites.findById).toHaveBeenCalledWith(site.siteId);
    await expect(getSite.execute({ siteId: 'missing' })).resolves.toBeNull();
    expect(sites.save).not.toHaveBeenCalled();
  });

  it('returns every site including archived sites without truncation', async () => {
    const sites = repository();
    const all = [
      new Site(siteState()),
      new Site(siteState({ siteId: 'site-2', status: SiteStatus.ARCHIVED })),
    ];

    vi.mocked(sites.findAll).mockResolvedValue(all);
    await expect(new ListSitesUseCase(sites).execute()).resolves.toEqual(all);
    expect(sites.findAll).toHaveBeenCalledExactlyOnceWith();
    expect(sites.save).not.toHaveBeenCalled();
  });

  it('returns an empty list when no sites exist', async () => {
    await expect(new ListSitesUseCase(repository()).execute()).resolves.toEqual([]);
  });

  it('propagates read failures', async () => {
    const sites = repository();
    const failure = new Error('Read failed');

    vi.mocked(sites.findById).mockRejectedValue(failure);
    vi.mocked(sites.findAll).mockRejectedValue(failure);
    await expect(new GetSiteUseCase(sites).execute({ siteId: 'site-1' })).rejects.toBe(failure);
    await expect(new ListSitesUseCase(sites).execute()).rejects.toBe(failure);
  });
});
