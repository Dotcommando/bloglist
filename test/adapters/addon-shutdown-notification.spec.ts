import { AddonShutdownReason } from '@zarya/addon-contracts/addons';
import { expect, it, vi } from 'vitest';

import { AddonRuntimeLifecycle } from '../../src/adapters/outbound/runtime/addons/addon-runtime-lifecycle.js';

it('notifies once while already admitted HTTP requests can arrive, then seals admission at drain', async () => {
  const notify = vi.fn(async () => {});
  const dispose = vi.fn(async () => {});
  const runtime = new AddonRuntimeLifecycle(notify, dispose);
  const request = { reason: AddonShutdownReason.Update, deadlineAt: Date.now() + 20000 };

  await runtime.notify(request);
  await expect(runtime.run(async () => 'admitted')).resolves.toBe('admitted');
  await runtime.shutdown(request);
  expect(notify).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  await expect(runtime.run(async () => 'late')).rejects.toMatchObject({ code: 'AddonUnavailable' });
});
