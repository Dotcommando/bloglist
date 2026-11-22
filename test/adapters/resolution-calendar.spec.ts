import { ResolutionCalendarAdapter } from '../../src/adapters/outbound/diagnostics/resolution-calendar.adapter.js';

describe('site calendar translation', () => {
  const calendar = new ResolutionCalendarAdapter();

  it('uses the configured calendar instead of the server time zone', () => {
    expect(calendar.today(new Date('2026-11-07T23:30Z'), 'Asia/Tokyo')).toBe('2026-11-08');
  });

  it('translates an inclusive date across a 25-hour daylight-saving day', () => {
    expect(calendar.range('2026-11-01', '2026-11-01', 'America/New_York')).toEqual({
      from: new Date('2026-11-01T04:00Z'), until: new Date('2026-11-02T05:00Z'),
    });
  });

  it('rejects impossible dates rather than normalizing them silently', () => {
    expect(() => calendar.range('2026-02-30', '2026-03-02', 'UTC')).toThrow();
  });
});
