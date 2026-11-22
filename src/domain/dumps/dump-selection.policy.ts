import { requireCondition } from '../shared/validation.js';
import type { ISiteDumpApplication, ISiteDumpCreation } from './site-dump.js';
import { SiteDumpType } from './site-dump.js';

export function validateDumpCreation(options: ISiteDumpCreation): void {
  requireCondition(Object.values(SiteDumpType).includes(options.type) && options.type !== SiteDumpType.Unknown,
    'Expected one supported dump type');
  const all = [SiteDumpType.Site, SiteDumpType.Files, SiteDumpType.Installation].includes(options.type);
  const ids = options.itemIds;

  requireCondition(all ? ids === undefined : Array.isArray(ids) && ids.length > 0
    && ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256)
    && new Set(ids).size === ids.length, 'Select items from one category');
  requireCondition(options.addonParts === undefined || options.type === SiteDumpType.Addons,
    'Add-on options belong only to add-on dumps');

  if (options.addonParts) {
    requireCondition(Object.values(options.addonParts).every((value) => typeof value === 'boolean')
      && Object.values(options.addonParts).some(Boolean), 'Select add-on dump contents');
  }
}

export function validateDumpApplication(options: ISiteDumpApplication): void {
  requireCondition(typeof options.version === 'string' && options.version.length > 0 && options.version.length <= 256
    && Array.isArray(options.choices)
    && options.choices.every((item) => typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 256
      && (item.targetId === null || typeof item.targetId === 'string' && item.targetId.length > 0))
    && new Set(options.choices.map((item) => item.id)).size === options.choices.length, 'Invalid dump selection');

  if (options.pageMappings) {
    requireCondition(Object.entries(options.pageMappings).every(([from, to]) => from.length > 0
      && from.length <= 128 && typeof to === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(to)),
    'Invalid page mapping');
  }
}
