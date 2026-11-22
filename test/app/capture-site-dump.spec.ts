import { expect, it, vi } from 'vitest';

import { CaptureSiteDumpUseCase } from '../../src/app/use-cases/resources/capture-site-dump.use-case.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import { DumpExecutionMode } from '../../src/domain/resources/site-process-allocation.js';

it.each(Object.values(DumpExecutionMode))('captures using %s and releases capacity after completion', async (mode) => {
  const release = vi.fn(async () => {});
  const result = { filename: 'dump', byteSize: 100, createdAt: new Date(), type: SiteDumpType.Site };
  const child = { capture: vi.fn(async () => result) };
  const inline = { capture: vi.fn(async () => result) };
  const useCase = new CaptureSiteDumpUseCase({ reserve: async () => ({ mode, release }) }, child, inline);

  expect(await useCase.execute({ siteId: 'a' })).toBe(result);
  expect(child.capture).toHaveBeenCalledTimes(mode === DumpExecutionMode.InProcess ? 0 : 1);
  expect(inline.capture).toHaveBeenCalledTimes(mode === DumpExecutionMode.InProcess ? 1 : 0);
  expect(release).toHaveBeenCalledOnce();
});

it('returns capacity after a rejected capture and reports replacement failure', async () => {
  const release = vi.fn(async () => {});
  const capture = {
    capture: async () => {
      throw new Error('capture failed');
    },
  };
  const useCase = new CaptureSiteDumpUseCase({
    reserve: async () => ({
      mode: DumpExecutionMode.BorrowedProcess, release,
    }),
  }, capture, capture);

  await expect(useCase.execute({ siteId: 'a' })).rejects.toThrow('capture failed');
  expect(release).toHaveBeenCalledOnce();
  release.mockRejectedValueOnce(new Error('replacement failed'));
  await expect(useCase.execute({ siteId: 'a' })).rejects.toBeInstanceOf(AggregateError);
});

it('does not admit cancelled work', async () => {
  const reserve = vi.fn();
  const capture = { capture: vi.fn() };
  const controller = new AbortController();

  controller.abort(new Error('cancelled'));
  await expect(new CaptureSiteDumpUseCase({ reserve }, capture, capture).execute({
    siteId: 'a', signal: controller.signal,
  })).rejects.toThrow('cancelled');
  expect(reserve).not.toHaveBeenCalled();
});
