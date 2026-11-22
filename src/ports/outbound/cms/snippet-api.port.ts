import type { CmsApi } from '../../inbound/cms/cms-api.port.js';

export interface ICmsSnippetApiPort {
  forSnippet(siteId: string, snippetId: string, readOnly?: boolean): CmsApi;
}
