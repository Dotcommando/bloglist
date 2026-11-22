import {
  LocalPublicationAccessAdapter,
} from '../../src/adapters/outbound/access/local/publication/local-publication-access.adapter.js';
import { validateParameters } from '../../src/adapters/outbound/rendering/modx/parameters.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';

describe('rendering boundary contracts', () => {
  it('validates named values with defaults without coercing typed false or zero', () => {
    expect(validateParameters([{ name: 'enabled', kind: ParameterKind.Boolean, required: true }],
      { enabled: false })).toEqual({ enabled: false });
    expect(() => validateParameters([], { undeclared: 'x' })).toThrow();
    expect(() => validateParameters([{ name: 'enabled', kind: ParameterKind.Boolean, required: true }],
      { enabled: 'false' })).toThrow();
    expect(() => validateParameters([], { constructor: 'x' })).toThrow();
  });
  it('never treats a supplied actor as authority', async () => {
    const adapter = new LocalPublicationAccessAdapter({ operatorId: 'owner', platformAdministrator: true });

    await expect(adapter.assertEditor('site', 'owner')).resolves.toBeUndefined();
    await expect(adapter.assertEditor('site', 'other')).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(new LocalPublicationAccessAdapter({ operatorId: 'owner', platformAdministrator: false })
      .assertEditor('site', 'owner')).rejects.toThrow();
  });
});
