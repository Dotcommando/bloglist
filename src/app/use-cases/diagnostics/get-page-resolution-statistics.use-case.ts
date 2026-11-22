import {
  PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation,
} from '../../../domain/diagnostics/page-resolution.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IGetPageResolutionStatistics, IGetPageResolutionStatisticsInput, IPageResolutionStatistics,
} from '../../../ports/inbound/diagnostics/get-page-resolution-statistics.port.js';
import type { IPageResolutionReader } from '../../../ports/outbound/diagnostics/page-resolution-store.port.js';
import type { IResolutionCalendarPort } from '../../../ports/outbound/diagnostics/resolution-calendar.port.js';
import type { IResolutionSitePort } from '../../../ports/outbound/diagnostics/resolution-site.port.js';

export class GetPageResolutionStatisticsUseCase implements IGetPageResolutionStatistics {
  constructor(private readonly reader: IPageResolutionReader, private readonly sites: IResolutionSitePort,
    private readonly now: () => Date, private readonly calendar: IResolutionCalendarPort) {}

  async execute(input: IGetPageResolutionStatisticsInput): Promise<IPageResolutionStatistics> {
    const timeZone = await this.sites.timeZone(input.siteId);
    const instant = this.now();
    const today = this.calendar.today(instant, timeZone);
    const invalid = (): never => {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid statistics filter');
    };

    if ((input.from === undefined) !== (input.to === undefined)) {
      invalid();
    }

    const from = input.from ?? today;
    const to = input.to ?? today;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      invalid();
    }

    const range = this.calendar.range(from, to, timeZone);

    for (const [value, choices] of [
      [input.delivery, Object.values(PageDelivery)], [input.representation, Object.values(ResolutionRepresentation)],
      [input.method, Object.values(ResolutionMethod)], [input.outcome, Object.values(ResolutionOutcome)],
    ] as const) {
      if (value !== undefined && value !== null && !choices.some((choice) => choice === value)) {
        invalid();
      }
    }

    if (input.cmsVersion !== undefined && (input.cmsVersion.length > 80 || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(input.cmsVersion))) {
      invalid();
    }

    const retainedSince = new Date(instant.getTime() - 90 * 86400000);
    const start = range.from.getTime();
    const method = input.method === undefined ? ResolutionMethod.Get : input.method;
    const outcome = input.outcome === undefined ? ResolutionOutcome.Success : input.outcome;
    const result = await this.reader.statistics({
      siteId: input.siteId,
      from: new Date(Math.max(start, retainedSince.getTime())),
      until: range.until,
      ...(input.cmsVersion ? { cmsVersion: input.cmsVersion } : {}),
      ...(input.delivery ? { delivery: input.delivery } : {}),
      ...(input.representation ? { representation: input.representation } : {}),
      ...(method ? { method } : {}),
      ...(outcome ? { outcome } : {}),
    });

    return {
      ...result,
      from,
      to,
      timeZone,
      retainedSince: retainedSince.toISOString(),
      today,
    };
  }
}
