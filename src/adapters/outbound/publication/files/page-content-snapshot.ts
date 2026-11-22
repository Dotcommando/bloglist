import { createHash } from 'node:crypto';

import type { IPageState } from '../../../../domain/pages/page.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import { decodePublishedPage } from './plan-decoder.js';

export function pageSnapshotPath(pageId: string): string {
  return 'content/pages/' + createHash('sha256').update(pageId).digest('hex') + '.json';
}

export function decodePageSnapshot(value: unknown, siteId: string, pageId: string): IPageState {
  const state = decodePublishedPage(value).toState();

  requireCondition(state.siteId === siteId && state.pageId === pageId, 'Foreign published page content');

  return state;
}

export function pageVersionId(page: IPageState): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;

  return createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(page))))).digest('hex');
}
