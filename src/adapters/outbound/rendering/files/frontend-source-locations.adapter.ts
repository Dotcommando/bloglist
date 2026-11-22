import path from 'node:path';

import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IFrontendSourceLocations } from '../vite/frontend-source-locations.js';

export class FileFrontendSourceLocationsAdapter implements IFrontendSourceLocations {
  constructor(private readonly root: string) {}

  directory(siteKey: string, sourceId: string): string | undefined {
    requireCondition(/^[A-Za-z][A-Za-z0-9_-]*$/.test(siteKey), 'Invalid site source identity');
    const site = path.resolve(this.root, siteKey);

    if (sourceId === 'site') {
      return site;
    }
    if (
      !/^(?:templates|chunks)\/[A-Za-z0-9_-]+$/.test(sourceId)
      && !/^pages\/[A-Za-z][A-Za-z0-9]*$/.test(sourceId)
    ) {
      return undefined;
    }

    return path.join(site, ...sourceId.split('/'));
  }
}
