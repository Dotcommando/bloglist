import type { RequestOptions } from 'node:https';

import { readMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  AdminAddressReachabilityAdapter, type AdminProbeTransport, isGlobalAddress,
} from '../../src/adapters/outbound/security/installation/admin-address-reachability.adapter.js';
import { adminAddressProof } from '../../src/adapters/shared/admin-address-proof.js';

describe('administration address verification', () => {
  it.each([
    '127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '192.0.2.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1',
  ])(
    'rejects non-global destination %s', (address) => {
      expect(isGlobalAddress(address)).toBe(false);
    });
  it.each(['1.1.1.1', '2.31.163.142', '2606:4700::1111'])('allows global destination %s', (address) => {
    expect(isGlobalAddress(address)).toBe(true);
  });
  it('pins verified DNS answers, requires installation proof and sends no credentials', async () => {
    const key = 'a'.repeat(64);
    let mode = 'ok';
    const transport = vi.fn<AdminProbeTransport>((url, _options, callback) => ({
      on: vi.fn(),
      end: () => {
        const nonce = url.searchParams.get('zarya-admin-probe')!;

        callback({
          statusCode: mode === 'redirect' ? 302 : 200,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'x-zarya-admin-proof': mode === 'wrong' ? 'wrong' : adminAddressProof(key, url.host, nonce),
          },
          on: vi.fn(),
          resume: vi.fn(),
        });
      },
    }));
    const resolve = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }]);
    const adapter = new AdminAddressReachabilityAdapter(async () => key, resolve, transport);

    await adapter.verify('https://public.example.com');
    const options: RequestOptions = transport.mock.calls[0]![1];

    expect(options).toMatchObject({ method: 'HEAD', agent: false });
    expect(options).not.toHaveProperty('headers');
    const callback = vi.fn();

    options.lookup?.('public.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    callback.mockClear();
    options.lookup?.('public.example.com', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '1.1.1.1', family: 4 }]);

    for (mode of ['wrong', 'redirect']) {
      await expect(adapter.verify('https://public.example.com')).rejects.toMatchObject({ code: 'Validation' });
    }
    resolve.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    transport.mockClear();
    await expect(adapter.verify('https://public.example.com')).rejects.toMatchObject({ code: 'Validation' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('bounds the whole verification even when the local key is pending and observes its late failure', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    let rejectKey: (reason: Error) => void = () => {};
    const key = new Promise<string>((_resolve, reject) => {
      rejectKey = reject;
    });
    const resolve = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }]);
    const transport = vi.fn<AdminProbeTransport>();
    const adapter = new AdminAddressReachabilityAdapter(() => key, resolve, transport);
    const operation = adapter.verify('https://public.example.com');
    const observed = Promise.allSettled([operation]);

    try {
      expect(timeout).toHaveBeenCalledWith(10000);
      controller.abort();
      await expect(operation).rejects.toMatchObject({ name: 'Error', message: 'Address verification timed out' });
      expect(resolve).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      rejectKey(new Error('Late key read failure'));
      await observed;
      timeout.mockRestore();
    }
  });
  it('propagates key-store failure before attempting remote address verification', async () => {
    const failure = new Error('Installation storage unavailable');
    const resolve = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }]);
    const transport = vi.fn<AdminProbeTransport>();
    const adapter = new AdminAddressReachabilityAdapter(async () => {
      throw failure;
    }, resolve, transport);

    await expect(adapter.verify('https://public.example.com')).rejects.toBe(failure);
    expect(resolve).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
  it('keeps the singleton and verification key global and outside site dumps', async () => {
    const migrations = await readMigrations('migrations');
    const migration = migrations.find((item) => item.id === '0005-installation-settings');

    expect(migration?.collections).toEqual([expect.objectContaining({
      name: 'installation_settings',
      dumpRole: 'Global',
      validator: expect.objectContaining({
        $jsonSchema: expect.objectContaining({
          required: expect.arrayContaining(['_id', 'adminOrigin', 'previousOrigin', 'version', 'probeKey']),
        }),
      }),
    })]);
  });
});
