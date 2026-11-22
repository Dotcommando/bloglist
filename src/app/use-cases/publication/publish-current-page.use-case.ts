import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { BrowserInteraction, HtmlDelivery } from '../../../domain/pages/page-rendering.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { requireUrlPath } from '../../../domain/routing/url-path.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IConfigurePageRendering } from '../../../ports/inbound/pages/configure-page-rendering.port.js';
import type { IGetPage } from '../../../ports/inbound/pages/get-page.port.js';
import type {
  IPublishCurrentPage, IPublishCurrentPageInput,
} from '../../../ports/inbound/publication/publish-current-page.port.js';
import type {
  IPublishPageRelease, IPublishPageReleaseResult,
} from '../../../ports/inbound/publication/publish-page-release.port.js';
import type { IAssignInitialPageUrl } from '../../../ports/inbound/routing/assign-initial-page-url.port.js';
import type { IRoutingSourcePort } from '../../../ports/outbound/routing/routing-source.port.js';
import type { IUrlCreationValues } from '../../../ports/outbound/routing/url-creation-values.port.js';

export class PublishCurrentPageUseCase implements IPublishCurrentPage {
  constructor(private readonly pages: IGetPage, private readonly rendering: IConfigurePageRendering,
    private readonly assignUrl: IAssignInitialPageUrl, private readonly routing: IRoutingSourcePort,
    private readonly values: IUrlCreationValues, private readonly publish: IPublishPageRelease) {}

  async execute(input: IPublishCurrentPageInput): Promise<IPublishPageReleaseResult> {
    const page = await this.pages.execute({ siteId: input.siteId, pageId: input.pageId });

    if (!page) {
      throw new PageNotFoundError('Page not found');
    }
    if (page.pageId !== input.pageId || page.siteId !== input.siteId) {
      throw new PageScopeError('Foreign page');
    }

    const urls = await this.routing.readUrls(input.siteId);

    if (urls.some((url) => url.siteId !== input.siteId)) {
      throw new PageScopeError('Foreign page routing');
    }

    const current = urls.find((url) => url.kind === UrlKind.PAGE && url.pageId === input.pageId);
    const path = input.path ?? current?.path;

    if (!path || /^\/(?:(?:api|admin|assets)(?:\/|$)|favicon\.ico$)/.test(path)) {
      throw new BusinessError(BusinessErrorCode.Validation, 'A non-reserved public URL is required');
    }
    requireUrlPath(path);

    if (current && current.path !== path) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Use ChangePageUrl to change an existing address');
    }

    const rendering = page.toState().rendering;

    if (page.mimeType === 'text/html' && !rendering && !input.templateId) {
      throw new BusinessError(BusinessErrorCode.Validation, 'An explicit template is required');
    }
    if (page.mimeType === 'text/html' && input.templateId && input.templateId !== rendering?.templateId) {
      await this.rendering.execute({
        siteId: input.siteId,
        pageId: input.pageId,
        actorId: input.actorId,
        rendering: {
          templateId: input.templateId,
          delivery: HtmlDelivery.Static,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      });
    }
    if (!current) {
      await this.assignUrl.execute({
        siteId: input.siteId,
        pageId: input.pageId,
        mark: this.values.nextUrlMark(),
        path,
        segment: path.split('/').filter(Boolean).at(-1) ?? '/',
        parentUrlId: null,
      });
    }

    return this.publish.execute({ siteId: input.siteId, pageId: input.pageId, actorId: input.actorId });
  }
}
