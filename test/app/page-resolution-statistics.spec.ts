import { describe, expect, it, vi } from 'vitest';

import {
  GetPageResolutionStatisticsUseCase,
} from '../../src/app/use-cases/diagnostics/get-page-resolution-statistics.use-case.js';
import type {
  IPageResolutionReader,
} from '../../src/ports/outbound/diagnostics/page-resolution-store.port.js';
import type {
  IResolutionCalendarPort,
} from '../../src/ports/outbound/diagnostics/resolution-calendar.port.js';

describe('authorized page resolution statistics', () => {
  const now = (): Date => new Date('2026-11-07T23:30:00Z');

  function fixture(): {
    statistics: IPageResolutionReader['statistics'];
    calendar: IResolutionCalendarPort;
  } {
    return {
      statistics: vi.fn().mockResolvedValue({ rows: [], versions: [] }),
      calendar: {
        today: vi.fn().mockReturnValue('2026-11-08'),
        range: vi.fn().mockReturnValue({
          from: new Date('2026-11-07T15:00Z'), until: new Date('2026-11-08T15:00Z'),
        }),
      },
    };
  }
  it('defaults to successful GETs using the authorized site calendar port', async () => {
    const f = fixture();
    const operation = new GetPageResolutionStatisticsUseCase(
      { statistics: f.statistics }, { timeZone: async () => 'Asia/Tokyo' }, now, f.calendar,
    );
    const result = await operation.execute({ siteId: 'site' });

    expect(result.from).toBe('2026-11-08');
    expect(f.calendar.today).toHaveBeenCalledWith(now(), 'Asia/Tokyo');
    expect(f.calendar.range).toHaveBeenCalledWith('2026-11-08', '2026-11-08', 'Asia/Tokyo');
    expect(f.statistics).toHaveBeenCalledWith({
      siteId: 'site',
      from: new Date('2026-11-07T15:00Z'),
      until: new Date('2026-11-08T15:00Z'),
      method: 'GET',
      outcome: 'Success',
    });
  });
  it('passes explicit inclusive dates and removes filters only when requested', async () => {
    const f = fixture();
    const operation = new GetPageResolutionStatisticsUseCase(
      { statistics: f.statistics }, { timeZone: async () => 'Asia/Tokyo' }, now, f.calendar,
    );

    await operation.execute({
      siteId: 'site',
      from: '2026-11-01',
      to: '2026-11-03',
      method: null,
      outcome: null,
      cmsVersion: '0.10.1',
    });
    expect(f.calendar.range).toHaveBeenCalledWith('2026-11-01', '2026-11-03', 'Asia/Tokyo');
    expect(f.statistics).toHaveBeenCalledWith({
      siteId: 'site',
      from: new Date('2026-11-07T15:00Z'),
      until: new Date('2026-11-08T15:00Z'),
      cmsVersion: '0.10.1',
    });
  });
  it('authorizes before querying and preserves failure', async () => {
    const f = fixture();
    const operation = new GetPageResolutionStatisticsUseCase(
      { statistics: f.statistics }, {
        timeZone: async () => {
          throw new Error('denied');
        },
      }, now, f.calendar,
    );

    await expect(operation.execute({ siteId: 'foreign' })).rejects.toThrow('denied');
    expect(f.statistics).not.toHaveBeenCalled();
    expect(f.calendar.today).not.toHaveBeenCalled();
  });
  it.each([
    { from: '2026-11-01' }, { from: '2026-11-03', to: '2026-11-01' },
    { from: 'invalid', to: '2026-11-01' },
  ])('rejects invalid ranges %j', async (range) => {
    const f = fixture();
    const operation = new GetPageResolutionStatisticsUseCase(
      { statistics: f.statistics }, { timeZone: async () => 'UTC' }, now, f.calendar,
    );

    await expect(operation.execute({ siteId: 'site', ...range })).rejects.toThrow();
    expect(f.statistics).not.toHaveBeenCalled();
    expect(f.calendar.range).not.toHaveBeenCalled();
  });
});
