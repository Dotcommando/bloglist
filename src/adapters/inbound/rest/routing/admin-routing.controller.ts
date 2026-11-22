import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { OldUrlAction } from '../../../../domain/routing/old-url-action.enum.js';
import { RoutingConflictError } from '../../../../domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../../domain/routing/routing-scope.error.js';
import { UrlKind } from '../../../../domain/routing/url-kind.enum.js';
import { ChildrenUrlAction, IncomingRedirectAction } from '../../../../domain/routing/url-move-options.js';
import { UrlSearchPurpose } from '../../../../domain/routing/url-search.js';
import { type ISiteAddresses, siteAddresses } from '../../../../domain/sites/site-addresses.js';
import { SiteOriginMode } from '../../../../domain/sites/site-origin-mode.enum.js';
import { requireSiteTimeZone } from '../../../../domain/sites/site-time-zone.policy.js';
import {
  siteTransliterationTables, transliterationReplacementPattern,
} from '../../../../domain/sites/transliteration.policy.js';
import type { ISiteTransliterationUpdate } from '../../../../ports/inbound/sites/update-site.port.js';
import { parsePublicTarget } from '../../documents/http/publication/public-document.controller.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import type { IAdminRoutingOperationFactory } from './admin-routing-operations.factory.js';

const route =
  /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/(settings|urls)(?:\/([A-Za-z0-9_-]{1,128})\/(history|move|redirect))?$/;

const identifier = /^[A-Za-z0-9_-]{1,128}$/;

const publishRoute = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/urls\/publish$/;

const suggestionsRoute = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/urls\/suggestions$/;

const virtualRoute = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/urls\/virtual$/;

function exact(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).length !== keys.length || keys.some((key) => !Object.hasOwn(body, key))) {
    throw new HttpFailure(400, 'Invalid fields');
  }
}

function settingsObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpFailure(400, 'Invalid settings');
  }

  return Object.fromEntries(Object.entries(value));
}

function transliteration(value: unknown): ISiteTransliterationUpdate {
  const input = settingsObject(value);

  exact(input, ['language', 'rules', 'expectedRules', 'collapseHyphens', 'expectedCollapseHyphens']);

  if (
    typeof input.language !== 'string'
    || !/^[a-z]{2}$/.test(input.language)
    || typeof input.collapseHyphens !== 'boolean'
    || typeof input.expectedCollapseHyphens !== 'boolean'
  ) {
    throw new HttpFailure(400, 'Invalid transliteration settings');
  }

  function parseRules(rules: unknown): ISiteTransliterationUpdate['rules'] {
    if (!Array.isArray(rules) || rules.length > 96) {
      throw new HttpFailure(400, 'Invalid transliteration rules');
    }

    return rules.map((value: unknown) => {
      const rule = settingsObject(value);

      exact(rule, ['symbol', 'replacement']);

      if (
        typeof rule.symbol !== 'string'
        || rule.symbol.length < 1
        || rule.symbol.length > 3
        || typeof rule.replacement !== 'string'
        || !transliterationReplacementPattern.test(rule.replacement)
      ) {
        throw new HttpFailure(400, 'Invalid transliteration rule');
      }

      return { symbol: rule.symbol, replacement: rule.replacement };
    });
  }

  return {
    language: input.language,
    rules: parseRules(input.rules),
    expectedRules: parseRules(input.expectedRules),
    collapseHyphens: input.collapseHyphens,
    expectedCollapseHyphens: input.expectedCollapseHyphens,
  };
}

function addresses(value: unknown): ISiteAddresses {
  const row = settingsObject(value);

  exact(row, ['publicOrigin', 'localOrigin', ...(Object.hasOwn(row, 'originMode') ? ['originMode'] : [])]);
  const publicOrigin = row.publicOrigin;
  const localOrigin = row.localOrigin;

  if (
    publicOrigin !== null
    && (typeof publicOrigin !== 'string'
    || publicOrigin.length > 2048)
    || localOrigin !== null
    && (typeof localOrigin !== 'string'
    || localOrigin.length > 2048)
  ) {
    throw new HttpFailure(400, 'Invalid origin');
  }
  if (
    row.originMode !== undefined
    && row.originMode !== SiteOriginMode.Public
    && row.originMode !== SiteOriginMode.Local
  ) {
    throw new HttpFailure(400, 'Invalid serving origin choice');
  }

  return siteAddresses({
    publicOrigin,
    localOrigin,
    ...(row.originMode === undefined ? {} : { originMode: row.originMode }),
  });
}

export class AdminRoutingController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminRoutingOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname) || publishRoute.test(pathname)
      || suggestionsRoute.test(pathname) || virtualRoute.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const parsed = new URL(target, this.boundary.origin);
      const virtual = virtualRoute.exec(target);

      if (virtual) {
        this.boundary.method(request, response, 'POST');
        const body = await readAdminBody(request);
        const operation = this.operations.forSession(this.boundary.token(request));

        if (typeof body.path !== 'string' || body.path.length > 2048) {
          throw new HttpFailure(400, 'Invalid virtual path');
        }

        let result;

        if (body.kind === UrlKind.PAGE) {
          exact(body, ['kind', 'path', 'pageId']);

          if (typeof body.pageId !== 'string' || !identifier.test(body.pageId)) {
            throw new HttpFailure(400, 'Invalid page');
          }
          result = await operation.materialize.execute({
            siteId: virtual[1]!, kind: UrlKind.PAGE, path: body.path, pageId: body.pageId,
          });
        } else if (body.kind === UrlKind.REDIRECT) {
          exact(body, ['kind', 'path', 'targetUrlId', 'redirectStatus']);

          if (
            typeof body.targetUrlId !== 'string'
            || !identifier.test(body.targetUrlId)
            || body.redirectStatus !== 301
            && body.redirectStatus !== 308
          ) {
            throw new HttpFailure(400, 'Invalid redirect');
          }
          result = await operation.materialize.execute({
            siteId: virtual[1]!,
            kind: UrlKind.REDIRECT,
            path: body.path,
            targetUrlId: body.targetUrlId,
            redirectStatus: body.redirectStatus,
          });
        } else {
          throw new HttpFailure(400, 'Invalid virtual URL behavior');
        }
        sendJson(response, result.publicationFailed ? 202 : 200, {
          url: result.url.toState(), publication: result.publication, publicationFailed: result.publicationFailed,
        });

        return;
      }

      const suggestions = suggestionsRoute.exec(parsed.pathname);

      if (suggestions) {
        this.boundary.method(request, response, 'GET');
        const params = parsed.searchParams;
        const allowed = ['currentUrlId', 'purpose', 'q', 'limit', 'offset'];

        if ([...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)) {
          throw new HttpFailure(400, 'Invalid search fields');
        }

        const currentUrlId = params.get('currentUrlId') ?? '';
        const purpose = params.get('purpose');
        const query = params.get('q') ?? '';
        const limit = params.get('limit') ?? '10';
        const offset = params.get('offset') ?? '0';

        if (
          (!identifier.test(currentUrlId)
          && !(currentUrlId === '' && purpose === UrlSearchPurpose.Redirect))
          || purpose !== UrlSearchPurpose.Parent
          && purpose !== UrlSearchPurpose.Redirect
          || query.length > 2048
          || !/^[1-9][0-9]*$/.test(limit)
          || Number(limit) > 10
          || !/^(0|[1-9][0-9]*)$/.test(offset)
          || !Number.isSafeInteger(Number(offset))
        ) {
          throw new HttpFailure(400, 'Invalid search');
        }

        const operation = this.operations.forSession(this.boundary.token(request));

        sendJson(response, 200, await operation.search.execute({
          siteId: suggestions[1]!, currentUrlId, purpose, query, limit: Number(limit), offset: Number(offset),
        }));

        return;
      }

      const publish = publishRoute.exec(target);

      if (publish) {
        this.boundary.method(request, response, 'POST');
        exact(await readAdminBody(request), []);
        const operation = this.operations.forSession(this.boundary.token(request));

        sendJson(response, 200, { publication: await operation.publishRouting.execute(publish[1]!) });

        return;
      }

      const match = route.exec(target);

      if (!match || match[2] === 'settings' && match[3]) {
        throw new HttpFailure(400, 'Invalid routing request');
      }

      const [, siteId, section, urlId, action] = match;
      const operations = this.operations.forSession(this.boundary.token(request));

      if (section === 'settings') {
        if (request.method === 'GET') {
          const site = await operations.getSite.execute({ siteId: siteId! });

          if (!site || site.siteId !== siteId) {
            throw new HttpFailure(404, 'NotFound');
          }
          sendJson(response, 200, {
            siteId,
            timeZone: site.timeZone,
            addresses: siteAddresses(site.toState().addresses),
            transliteration: siteTransliterationTables(site.toState().transliteration),
            collapseTransliterationHyphens: site.toState().collapseTransliterationHyphens ?? true,
          });
        } else {
          this.boundary.method(request, response, 'POST');
          const body = await readAdminBody(request);
          const changingZone = Object.hasOwn(body, 'timeZone');
          const changingTransliteration = Object.hasOwn(body, 'transliteration');

          exact(body, changingTransliteration ? ['transliteration']
            : changingZone ? ['timeZone', 'expectedTimeZone'] : ['addresses', 'expectedAddresses']);

          if (changingZone) {
            if (typeof body.timeZone !== 'string' || typeof body.expectedTimeZone !== 'string') {
              throw new HttpFailure(400, 'A time zone and its captured value are required');
            }
            requireSiteTimeZone(body.timeZone);
            requireSiteTimeZone(body.expectedTimeZone);
          }

          const saved = await operations.updateSite.execute({
            siteId: siteId!,
            ...(changingTransliteration ? { transliteration: transliteration(body.transliteration) }
              : changingZone ? { timeZone: String(body.timeZone), expectedTimeZone: String(body.expectedTimeZone) } : {
                addresses: addresses(body.addresses),
                expectedAddresses: addresses(body.expectedAddresses),
              }),
          });

          sendJson(response, 200, {
            siteId: saved.siteId,
            timeZone: saved.timeZone,
            addresses: siteAddresses(saved.toState().addresses),
            ...(changingTransliteration
              ? {
                transliteration: siteTransliterationTables(saved.toState().transliteration),
                collapseTransliterationHyphens: saved.toState().collapseTransliterationHyphens ?? true,
              } : {}),
          });
        }

        return;
      }
      if (!urlId || action === 'history') {
        this.boundary.method(request, response, 'GET');
        sendJson(response, 200, urlId ? { items: await operations.history.execute({ siteId: siteId!, urlId }) }
          : await operations.catalog.execute({ siteId: siteId! }));

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request);

      if (body.redirectStatus !== 301 && body.redirectStatus !== 308) {
        throw new HttpFailure(400, 'Invalid redirect status');
      }
      if (action === 'redirect') {
        exact(body, ['expectedVersion', 'targetUrlId', 'redirectStatus']);

        if (
          typeof body.expectedVersion !== 'string'
          || !body.expectedVersion
          || body.expectedVersion.length > 256
          || typeof body.targetUrlId !== 'string'
          || !identifier.test(body.targetUrlId)
        ) {
          throw new HttpFailure(400, 'Invalid redirect');
        }

        const saved = await operations.redirect.execute({
          siteId: siteId!,
          urlId,
          expectedVersion: body.expectedVersion,
          targetUrlId: body.targetUrlId,
          redirectStatus: body.redirectStatus,
        });

        sendJson(response, saved.publicationFailed ? 202 : 200, {
          url: saved.url.toState(), publication: saved.publication, publicationFailed: saved.publicationFailed,
        });
      } else {
        exact(body, ['pageId', 'path', 'parentUrlId', 'moveSubtree', 'redirectStatus',
          ...['oldUrlAction', 'childrenAction', 'incomingRedirectAction'].filter((key) => Object.hasOwn(body, key))]);
        const oldUrlAction = Object.hasOwn(body, 'oldUrlAction') ? body.oldUrlAction : OldUrlAction.Redirect;
        const childrenAction = Object.hasOwn(body, 'childrenAction') ? body.childrenAction : ChildrenUrlAction.Keep;
        const incomingRedirectAction = Object.hasOwn(body, 'incomingRedirectAction')
          ? body.incomingRedirectAction : IncomingRedirectAction.Retarget;

        if (
          oldUrlAction !== OldUrlAction.Redirect
          && oldUrlAction !== OldUrlAction.Delete
          || childrenAction !== ChildrenUrlAction.Keep
          && childrenAction !== ChildrenUrlAction.PromoteWithRedirect
            && childrenAction !== ChildrenUrlAction.PromoteWithoutRedirect
          || incomingRedirectAction !== IncomingRedirectAction.Retarget
          && incomingRedirectAction
            !== IncomingRedirectAction.Delete
        ) {
          throw new HttpFailure(400, 'Invalid old URL action');
        }
        if (
          typeof body.pageId !== 'string'
          || !identifier.test(body.pageId)
          || typeof body.path !== 'string'
          || body.path.length > 2048
          || typeof body.moveSubtree !== 'boolean'
          || body.parentUrlId !== null
          && (typeof body.parentUrlId !== 'string'
            || !identifier.test(body.parentUrlId))
        ) {
          throw new HttpFailure(400, 'Invalid URL move');
        }

        const path = parsePublicTarget(body.path, 'validation.invalid').path;

        if (
          path !== body.path
          || path === '/sitemap.xml'
          || /^\/(?:api|admin|assets)(?:\/|$)/.test(path)
          || Object.keys(parsePublicTarget(body.path, 'validation.invalid').query).length
        ) {
          throw new HttpFailure(400, 'Invalid public path');
        }

        const saved = await operations.change.execute({
          siteId: siteId!,
          pageId: body.pageId,
          expectedUrlId: urlId,
          mark: 'Url' + randomUUID().replaceAll('-', ''),
          path,
          segment: path.split('/').filter(Boolean).at(-1) ?? '',
          parentUrlId: body.parentUrlId,
          moveSubtree: body.moveSubtree,
          oldUrlAction,
          ...(Object.hasOwn(body, 'childrenAction') ? { childrenAction } : {}),
          incomingRedirectAction,
          redirectStatus: body.redirectStatus,
        });

        sendJson(response, saved.publicationFailed ? 202 : 200, {
          url: saved.url.toState(), publication: saved.publication, publicationFailed: saved.publicationFailed,
        });
      }
    } catch (error) {
      this.boundary.failure(response, error instanceof RoutingScopeError || error instanceof RoutingNotFoundError
        ? new HttpFailure(404, 'NotFound') : error instanceof RoutingConflictError
          ? new HttpFailure(409, 'Conflict') : error instanceof RangeError ? new HttpFailure(400, 'Validation')
            : error);
    }
  }
}
