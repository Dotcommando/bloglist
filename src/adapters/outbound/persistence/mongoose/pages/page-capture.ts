import type { IPageState } from '../../../../../domain/pages/page.js';

/** Legacy absent fields compare as their documented defaults without weakening other captured values. */
export function pageCapture(state: Omit<IPageState, 'pageId'>): Record<string, unknown> {
  return {
    ...Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'pageId')),
    mimeType: state.mimeType === undefined || state.mimeType === 'text/html'
      ? { $in: [null, 'text/html'] } : state.mimeType,
    excludeFromSitemap: state.excludeFromSitemap ? true : { $in: [null, false] },
    systemDocument: state.systemDocument ?? null,
  };
}
