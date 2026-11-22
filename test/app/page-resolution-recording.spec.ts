import { describe, expect, it, vi } from 'vitest';

import { RecordPageResolutionUseCase } from '../../src/app/use-cases/diagnostics/record-page-resolution.use-case.js';
import {
  type IPageResolutionObservation, PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation,
} from '../../src/domain/diagnostics/page-resolution.js';

describe('record page resolution', () => {
  const input: IPageResolutionObservation = {
    siteId: 'site',
    path: '/page/',
    startedAt: new Date('2026-11-07T10:00:00Z'),
    durationMs: 12.25,
    completionMs: 14.5,
    method: ResolutionMethod.Get,
    representation: ResolutionRepresentation.Html,
    delivery: PageDelivery.Static,
    statusCode: 200,
    outcome: ResolutionOutcome.Success,
    stages: [],
    droppedStages: 0,
  } as const;

  it('stamps the configured CMS version and preserves measured time', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const operation = new RecordPageResolutionUseCase({ append }, '0.10.1');

    await operation.execute(input);
    expect(append).toHaveBeenCalledWith({ ...input, cmsVersion: '0.10.1' });
  });

  it.each([
    { durationMs: -1 }, { durationMs: Number.NaN }, { path: '/page/?secret=value' },
    { siteId: '' }, { completionMs: 1 }, { startedAt: new Date('invalid') },
  ])('rejects invalid observations before persistence: %j', async (change) => {
    const append = vi.fn();
    const operation = new RecordPageResolutionUseCase({ append }, '0.10.1');

    await expect(operation.execute({ ...input, ...change })).rejects.toThrow();
    expect(append).not.toHaveBeenCalled();
  });

  it('exposes storage failure to the deferred observer', async () => {
    const operation = new RecordPageResolutionUseCase({
      append: async () => {
        throw new Error('storage');
      },
    }, '0.10.1');

    await expect(operation.execute(input)).rejects.toThrow('storage');
  });
});
