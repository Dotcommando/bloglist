import { calibrationApiPath } from '../../../../domain/calibration/calibration-api.policy.js';
import { CalibrationPageReferenceKind, type ICalibrationProfile } from
  '../../../../domain/calibration/calibration-profile.js';
import type { ICalibrationResolvedTarget } from '../../../../domain/calibration/calibration-run.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { servingSiteAuthority } from '../../../../domain/sites/site-addresses.js';
import type { IListPages } from '../../../../ports/inbound/pages/list-pages.port.js';
import type { IGetUrlCatalog } from '../../../../ports/inbound/routing/get-url-catalog.port.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type { ICalibrationPageResolverPort } from '../../../../ports/outbound/calibration/calibration-runtime.port.js';
import type { ISiteResourceCatalogPort } from '../../../../ports/outbound/resources/site-resource-catalog.port.js';

export class CalibrationPageResolver implements ICalibrationPageResolverPort {
  constructor(private readonly operations: (token: string | null) => {
    readonly site: IGetSite; readonly pages: IListPages; readonly catalog: IGetUrlCatalog;
  }, private readonly addons?: ISiteResourceCatalogPort) {}

  async resolve(profile: ICalibrationProfile, token: string | null): Promise<readonly ICalibrationResolvedTarget[]> {
    const operations = this.operations(token);
    const total = profile.targets.reduce((sum, target) => sum + target.share, 0);

    if (!total) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Calibration requires a positive traffic share');
    }

    const targets: ICalibrationResolvedTarget[] = [];
    const compositions = await this.addons?.list();
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    for (const siteId of new Set(profile.targets.filter(target => target.share > 0).map(target => target.siteId))) {
      const site = await operations.site.execute({ siteId });
      const catalog = await operations.catalog.execute({ siteId });
      const pages = await operations.pages.execute({ siteId });

      if (!site || !catalog.published) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Calibration requires published sites');
      }

      const state = site.toState();
      const authority = servingSiteAuthority(state.addresses) ?? state.primaryDomain;
      const permitted = [state.addresses?.publicOrigin, state.addresses?.localOrigin].filter(origin => !!origin);

      for (const target of profile.targets.filter(row => row.siteId === siteId && row.share > 0)) {
        let path = target.reference;

        if (target.kind === CalibrationPageReferenceKind.AbsoluteUrl) {
          const url = new URL(target.reference);

          if (
            url.username
            || url.password
            || !['http:', 'https:'].includes(url.protocol)
            || !permitted.includes(url.origin)
            && url.host !== state.primaryDomain
          ) {
            throw new BusinessError(BusinessErrorCode.Validation, 'Calibration URL belongs to another site');
          }
          path = url.pathname + url.search;
        } else if (target.kind === CalibrationPageReferenceKind.PageNumber) {
          const page = pages.find(page => page.pageNumber === target.reference && page.siteId === siteId);
          const route = catalog.published.routes.find(route => route.kind !== PublishedRouteKind.Redirect
            && route.pageId === page?.pageId);

          if (!route) {
            throw new BusinessError(BusinessErrorCode.Validation, 'Page number has no published URL in this site');
          }
          path = route.path;
        }

        const url = new URL(path, 'http://calibration.invalid');
        const route = catalog.published.routes.find(route => route.path === url.pathname
          && route.kind !== PublishedRouteKind.Redirect);

        if (
          url.origin !== 'http://calibration.invalid'
          || url.username
          || url.password
          || path.includes('\\')
          || url.hash
          || !route
          || /^\/(?:api|admin)(?:\/|$)/i.test(url.pathname)
        ) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Calibration target must be a published page');
        }
        targets.push({
          siteId,
          authority,
          path: url.pathname + url.search,
          share: target.share,
          effectiveShare: target.share / total * 100,
          releaseId: catalog.published.releaseId,
          ...(target.apiSteps?.length ? {
            apiSteps: target.apiSteps.map(step => {
              const addon = compositions?.find(site => site.siteId === siteId)?.addons
                ?.find(addon => addon.addonKey === step.addonKey);
              const query = addon?.queries.find(query => query.queryId === step.queryId);

              if (!query || route.kind === PublishedRouteKind.Redirect) {
                throw new BusinessError(BusinessErrorCode.Validation, 'Public add-on query unavailable for this site');
              }

              return {
                ...step,
                path: calibrationApiPath(query.path
                  .replaceAll('{siteId}', encodeURIComponent(siteId))
                  .replaceAll('{pageId}', encodeURIComponent(route.pageId))
                  .replaceAll('{now}', encodeURIComponent(now.toISOString()))
                  .replaceAll('{in30Days}', encodeURIComponent(in30Days.toISOString()))),
              };
            }),
          } : {}),
        });
      }
    }

    return targets;
  }
}
