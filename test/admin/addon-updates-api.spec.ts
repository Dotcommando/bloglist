import { afterEach, expect, it, vi } from 'vitest';

import { applyAddonUpdate, prepareAddonUpdate } from '../../admin/src/features/addons/addon-updates-api.js';

afterEach(() => vi.restoreAllMocks());

it('uploads the original file and applies the prepared identity without a replaceable request body', async () => {
  const response = {
    updateId: 'identity',
    addonKey: 'synthetic',
    fromVersion: '0.2.0',
    toVersion: '0.3.0',
    mode: 'Exclusive',
    phase: 'Prepared',
  };
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(response));
  const file = new File(['archive'], 'addon.runtime.gz');

  expect(await prepareAddonUpdate(file)).toMatchObject(response);
  expect(fetch.mock.calls[0]?.[1]?.body).toBe(file);
  await applyAddonUpdate('identity');
  expect(fetch.mock.calls[1]?.[0]).toBe('/api/admin/addon-updates/identity/apply');
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  expect(fetch.mock.calls[1]?.[1]?.body).toBeUndefined();
});
