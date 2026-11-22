import { RegisteredAddonAvailabilityAdapter } from
  '../../src/adapters/outbound/runtime/addons/registered-addon-availability.adapter.js';

it('keeps a private prerequisite failure as the cause without diagnosing it as missing migrations', async () => {
  const failure = Object.assign(new Error('Synthetic private storage failure'), { code: 'EIO' });
  const verify = vi.fn(async () => {
    throw failure;
  });
  const adapter = new RegisteredAddonAvailabilityAdapter(['synthetic'], verify);
  const outcome = await adapter.requireAvailable('synthetic').catch((error: unknown) => error);

  expect(outcome).toMatchObject({ code: 'AddonUnavailable', cause: failure });
  expect(outcome).not.toHaveProperty('message', 'Apply the installed add-on migrations');
  expect(JSON.stringify(outcome)).not.toContain('Synthetic private storage failure');
  expect(verify).toHaveBeenCalledExactlyOnceWith('synthetic');
});

it('rejects unregistered keys before verification and accepts a current verified key', async () => {
  let keys: readonly string[] = [];
  const verify = vi.fn(async () => {});
  const adapter = new RegisteredAddonAvailabilityAdapter(() => keys, verify);

  await expect(adapter.requireAvailable('synthetic')).rejects.toMatchObject({ code: 'AddonUnavailable' });
  expect(verify).not.toHaveBeenCalled();
  keys = ['synthetic'];
  await expect(adapter.requireAvailable('synthetic')).resolves.toBeUndefined();
  expect(verify).toHaveBeenCalledExactlyOnceWith('synthetic');
});
