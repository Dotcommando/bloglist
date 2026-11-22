import {
  ListTemplateVariablesUseCase,
} from '../../src/app/use-cases/template-variables/list-template-variables.use-case.js';
import {
  SaveTemplateVariablesUseCase,
} from '../../src/app/use-cases/template-variables/save-template-variables.use-case.js';
import type { ITemplateVariableCatalog } from '../../src/domain/template-variables/template-variable.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import { siteFixture } from '../support/sites.js';

describe('site template variable definitions', () => {
  it('assigns reusable fields to templates, preserves explicit empty defaults and guards writes', async () => {
    let state: ITemplateVariableCatalog = { siteId: 'site-1', version: '0', fields: [] };
    const store = {
      read: async () => structuredClone(state),
      save: vi.fn(async (next: ITemplateVariableCatalog, expected: string) => {
        if (expected !== state.version) {
          throw new Error('stale');
        }
        state = structuredClone(next);
      }),
    };
    const sites = { execute: async () => siteFixture() };
    const templates = { list: async () => [{ key: 'Home' }, { key: 'Game' }] };
    const save = new SaveTemplateVariablesUseCase(sites, store, templates, () => 'v1', {
      read: async () => ({ version: '0', pending: false, files: [] }),
    });
    const field = {
      name: 'gameImage',
      caption: 'Game image',
      description: '',
      kind: TemplateVariableKind.Image,
      templateIds: ['Home', 'Game'],
      required: false,
      sortOrder: 100,
      defaultValue: null,
    };
    const saved = await save.execute({ siteId: 'site-1', expectedVersion: '0', fields: [field] });

    expect(saved.fields).toEqual([field]);
    expect((await new ListTemplateVariablesUseCase(sites, store).execute({ siteId: 'site-1' })).version).toBe('v1');
    await expect(save.execute({ siteId: 'site-1', expectedVersion: '0', fields: [] }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await expect(save.execute({ siteId: 'site-1', expectedVersion: 'v1', fields: [field, field] }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(save.execute({
      siteId: 'site-1',
      expectedVersion: 'v1',
      fields: [{
        ...field,
        templateIds: ['foreign'],
      }],
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(save.execute({
      siteId: 'site-1',
      expectedVersion: 'v1',
      fields: [{
        ...field,
        defaultValue: {
          kind: TemplateVariableKind.Image, fileId: 'foreign-file', mode: 'Responsive', alt: '',
        },
      }],
    })).rejects.toMatchObject({ code: 'NotFound' });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('authorizes before reading definitions', async () => {
    const store = { read: vi.fn(), save: vi.fn() };
    const denied = { execute: async () => null };

    await expect(new ListTemplateVariablesUseCase(denied, store).execute({ siteId: 'site-1' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    expect(store.read).not.toHaveBeenCalled();
  });
});
