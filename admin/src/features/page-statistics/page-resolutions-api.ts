import { ContentRequestError, object, string } from '../../shared/api/content-api';
import type { IResolutionFilters, IResolutionStatistics } from './page-resolutions.types';

export async function getPageResolutions(siteId: string, filters: IResolutionFilters): Promise<IResolutionStatistics> {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, value);
    }
  }
  const response = await fetch('/api/admin/sites/' + encodeURIComponent(siteId) + '/page-resolutions?' + query, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-Zarya-Admin': '1' },
    signal: AbortSignal.timeout(15000),
  });
  const value: unknown = await response.json();

  if (!response.ok) {
    throw new ContentRequestError(response.status, 'RequestFailed');
  }

  const result = object(value);

  if (!Array.isArray(result.rows) || !Array.isArray(result.versions)) {
    throw new Error('Invalid statistics response');
  }

  const number = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error('Invalid statistics value');
    }

    return value;
  };
  const diagnostics = object(result.diagnostics);

  return {
    from: string(result.from),
    to: string(result.to),
    today: string(result.today),
    timeZone: string(result.timeZone),
    retainedSince: string(result.retainedSince),
    versions: result.versions.map(string),
    rows: result.rows.map((value) => {
      const row = object(value);

      return {
        path: string(row.path),
        calls: number(row.calls),
        averageMs: number(row.averageMs),
        medianMs: number(row.medianMs),
        p95Ms: number(row.p95Ms),
        p99Ms: number(row.p99Ms),
      };
    }),
    diagnostics: {
      dropped: number(diagnostics.dropped), failed: number(diagnostics.failed), pending: number(diagnostics.pending),
    },
  };
}
