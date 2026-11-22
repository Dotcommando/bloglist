import { expect, it, vi } from 'vitest';

import { moveAddonDirectory } from '../../src/adapters/outbound/runtime/addons/addon-directory-move.js';

it('retries a temporary Windows directory lock without changing the candidate identity', async () => {
  const move = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Locked'), { code: 'EPERM' }))
    .mockResolvedValue(undefined);
  const pause = vi.fn(async () => {});

  await expect(moveAddonDirectory('staging', 'digest', move, pause)).resolves.toBeUndefined();
  expect(move).toHaveBeenNthCalledWith(1, 'staging', 'digest');
  expect(move).toHaveBeenNthCalledWith(2, 'staging', 'digest');
  expect(pause).toHaveBeenCalledWith(25);
});

it('propagates permanent failures and bounds repeated lock retries', async () => {
  const error = Object.assign(new Error('Denied'), { code: 'EACCES' });
  const move = vi.fn(async () => {
    throw error;
  });

  await expect(moveAddonDirectory('from', 'to', move, async () => {})).rejects.toBe(error);
  expect(move).toHaveBeenCalledOnce();
  const locked = vi.fn(async () => {
    throw Object.assign(new Error('Busy'), { code: 'EBUSY' });
  });

  await expect(moveAddonDirectory('from', 'to', locked, async () => {})).rejects.toMatchObject({ code: 'EBUSY' });
  expect(locked).toHaveBeenCalledTimes(5);
});
