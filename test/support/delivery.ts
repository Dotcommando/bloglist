import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import type { IStoredRequestPlan } from '../../src/domain/publication/published-document.js';
import { pageFixture } from './pages.js';
import { source } from './publication.js';
import { instant } from './sites.js';

export function requestPlanFixture(): IStoredRequestPlan {
  const fixture = source('Published body');
  const page = pageFixture();

  page.configureRendering({
    ...page.toState().rendering ?? fixture.pages[0]!.rendering!,
    delivery: HtmlDelivery.Request,
  });
  page.publish(instant);

  return {
    siteId: 'site-1',
    releaseId: 'release-1',
    assets: { head: '', body: '' },
    plan: {
      planId: 'page-1',
      siteId: 'site-1',
      pageId: 'page-1',
      page: page.toState(),
      rendering: page.toState().rendering!,
      settings: {},
      requestParameters: [],
      buildValues: {},
      templates: fixture.templates,
      loaders: [],
      frontendSourceIds: [],
    },
  };
}
