import { describe, expect, it, vi } from 'vitest';

import { InspectJsonLdDraftUseCase } from '../../../src/app/use-cases/json-ld/inspect-json-ld-draft.use-case.js';

describe('saved draft JSON-LD inspection', () => {
  it('authorizes before reading a saved draft and returns the single rendered graph without saving', async () => {
    const source = { capture: vi.fn().mockResolvedValue({ siteId: 's' }) };
    const prepare = vi.fn().mockResolvedValue({ siteId: 's', pageId: 'p' });
    const render = vi.fn().mockResolvedValue({
      pageId: 'p',
      jsonLd: {
        result: {
          graph: { '@context': 'https://schema.org', '@graph': [] }, warnings: [],
        },
      },
    });
    const access = { assertEditor: vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined) };
    const operation = new InspectJsonLdDraftUseCase(access, source, { prepare, compose: vi.fn() }, { render });

    await expect(operation.execute({ siteId: 's', pageId: 'p', actorId: 'u' })).rejects.toThrow('denied');
    expect(source.capture).not.toHaveBeenCalled();
    expect(await operation.execute({ siteId: 's', pageId: 'p', actorId: 'u' })).toEqual({
      jsonLd: '{\n  "@context": "https://schema.org",\n  "@graph": []\n}', warnings: [],
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
