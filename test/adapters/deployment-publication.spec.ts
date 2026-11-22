import {
  PublicationDeploymentSourceAdapter,
} from '../../src/adapters/outbound/publication/deployment/publication-deployment-source.adapter.js';

describe('committed deployment publication source', () => {
  const activation = { getActive: vi.fn(), activate: vi.fn(), findActivation: vi.fn() };
  const generations = { currentGeneration: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    generations.currentGeneration.mockResolvedValue('generation-a');
    activation.getActive.mockResolvedValue({ siteId: 'site-a', releaseId: 'release-a', activatedAt: new Date(0) });
  });

  it('uses the committed activation pointer, including activations before target configuration', async () => {
    expect(await new PublicationDeploymentSourceAdapter(activation, generations).current('site-a')).toEqual({
      releaseId: 'release-a',
      generation: 'generation-a',
    });
    expect(activation.getActive).toHaveBeenCalledWith('site-a');
  });

  it('does not select a publication across a restore-generation change', async () => {
    generations.currentGeneration.mockResolvedValueOnce('before').mockResolvedValue('after');

    await expect(new PublicationDeploymentSourceAdapter(activation, generations).current('site-a'))
      .rejects.toMatchObject({ code: 'StaleWrite' });
  });

  it('rejects a foreign activation and represents an unpublished site explicitly', async () => {
    activation.getActive.mockResolvedValueOnce({ siteId: 'foreign', releaseId: 'foreign-release' });

    await expect(new PublicationDeploymentSourceAdapter(activation, generations).current('site-a')).rejects.toThrow();
    activation.getActive.mockResolvedValue(null);
    expect(await new PublicationDeploymentSourceAdapter(activation, generations).current('site-a')).toBeNull();
  });
});
