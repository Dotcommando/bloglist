import type { ClientSession } from 'mongoose';

import type { Page } from '../../../../../domain/pages/page.js';
import { PageConflictError } from '../../../../../domain/pages/page-conflict.error.js';
import {
  AutomaticPageUrlError, AutomaticPageUrlIssue,
} from '../../../../../domain/routing/automatic-page-url.error.js';
import { Url } from '../../../../../domain/routing/url.js';
import { UrlKind } from '../../../../../domain/routing/url-kind.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import {
  automaticPageSlug, type ITransliterationOverride,
} from '../../../../../domain/sites/transliteration.policy.js';
import type { IPrepareAutomaticPageUrl } from '../../../../../ports/outbound/pages/page-creation.port.js';
import type { IUrlCreationValues } from '../../../../../ports/outbound/routing/url-creation-values.port.js';
import { advanceRoutingVersion, type IRoutingModels } from './routing.models.js';
import { toRecord } from './url.repository.js';

interface IAutomaticUrlPlacement {
  readonly parentUrlId: string | null;
  readonly path: string;
  readonly segment: string;
}

export class MongooseAutomaticPageUrl implements IPrepareAutomaticPageUrl {
  constructor(private readonly models: IRoutingModels, private readonly values: IUrlCreationValues) {}

  async prepare(page: Page, overrides: readonly ITransliterationOverride[], collapseHyphens: boolean): Promise<Url> {
    const placement = await this.findPlacement(page, overrides, collapseHyphens, null);
    const at = this.values.currentInstant();

    return new Url({
      ...placement,
      urlId: this.values.nextUrlId(),
      mark: this.values.nextUrlMark(),
      siteId: page.siteId,
      pageId: page.pageId,
      kind: UrlKind.PAGE,
      redirectTargetUrlId: null,
      redirectStatus: null,
      firstPublishedAt: at,
      createdAt: at,
      updatedAt: at,
    });
  }

  async commit(page: Page, url: Url, overrides: readonly ITransliterationOverride[], collapseHyphens: boolean,
    session: ClientSession):
  Promise<void> {
    await advanceRoutingVersion(this.models, page.siteId, this.values.currentInstant(), session);
    const placement = await this.findPlacement(page, overrides, collapseHyphens, session);
    const candidate = url.toState();

    if (
      candidate.siteId !== page.siteId
      || candidate.pageId !== page.pageId
      || candidate.kind !== UrlKind.PAGE
      || candidate.path !== placement.path
      || candidate.parentUrlId !== placement.parentUrlId
      || candidate.segment !== placement.segment
    ) {
      throw new PageConflictError('Automatic URL changed while saving the draft');
    }
    await this.models.urls.insertOne(toRecord(url), { session });
  }

  private async findPlacement(page: Page, overrides: readonly ITransliterationOverride[],
    collapseHyphens: boolean, session: ClientSession | null): Promise<IAutomaticUrlPlacement> {
    const { siteId, language, h1 } = page.toState();
    const base = automaticPageSlug(h1 ?? '', language, overrides, collapseHyphens);
    const parent = page.parentPageId === null ? null : await this.models.urls.findOne({
      siteId, pageId: page.parentPageId, kind: UrlKind.PAGE,
    }).session(session).lean().exec();

    if (page.parentPageId !== null && !parent) {
      throw new AutomaticPageUrlError(AutomaticPageUrlIssue.Parent);
    }

    const prefix = parent ? parent.path.replace(/\/+$/, '') : '';

    for (let ordinal = 1; ordinal <= 100; ordinal++) {
      const segment = ordinal === 1 ? base : base + '-' + ordinal;
      const path = prefix + '/' + segment;

      if (path.length > 2048) {
        throw new AutomaticPageUrlError(AutomaticPageUrlIssue.Parent);
      }
      if (/^\/(?:api|admin|assets)(?:\/|$)/.test(path)) {
        if (prefix) {
          throw new AutomaticPageUrlError(AutomaticPageUrlIssue.Parent);
        }
        continue;
      }

      // Descendant paths also reserve an implicit virtual folder.
      const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const occupied = await this.models.urls.exists({
        siteId, path: new RegExp('^' + escapedPath + '(?:$|/)'),
      }).session(session).exec();

      if (occupied) {
        continue;
      }

      return { parentUrlId: parent?._id ?? null, segment, path };
    }
    throw new BusinessError(BusinessErrorCode.Conflict, 'No available URL for this heading');
  }
}
