import { Temporal } from '@js-temporal/polyfill';

import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IResolutionCalendarPort } from '../../../ports/outbound/diagnostics/resolution-calendar.port.js';

export class ResolutionCalendarAdapter implements IResolutionCalendarPort {
  today(at: Date, timeZone: string): string {
    return Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(timeZone)
      .toPlainDate().toString();
  }

  range(from: string, to: string, timeZone: string): { from: Date; until: Date } {
    try {
      const first = Temporal.PlainDate.from(from);
      const last = Temporal.PlainDate.from(to);

      if (Temporal.PlainDate.compare(first, last) > 0) {
        throw new Error('Reversed calendar dates');
      }

      return {
        from: new Date(first.toZonedDateTime(timeZone).epochMilliseconds),
        until: new Date(last.add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds),
      };
    } catch {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid statistics calendar range');
    }
  }
}
