import type { ICrawlerDiagnostics } from '../../../domain/publication/crawler-diagnostics.js';
import type { IPageAvailability } from '../../../domain/publication/page-availability.js';

export interface IPublicationTemplateOption {
  readonly templateId: string;
  readonly name: string;
  readonly requiresParameters: boolean;
}

export interface IGetPublicationOptionsInput {
  readonly siteId: string;
  readonly pageId?: string;
}

import type { IRequestCachePolicy } from '../../../domain/publication/request-cache.policy.js';
import type { IPageEditorialStates } from '../pages/get-page-editorial-states.port.js';

export interface IPublicationOptions {
  readonly editorial?: IPageEditorialStates;
  readonly requestDelivery?: boolean;
  readonly requestCache?: IRequestCachePolicy | null;
  readonly mimeTypes?: readonly string[];
  readonly crawlerDiagnostics?: readonly ICrawlerDiagnostics[];
  readonly generatedContent?: string | null;
  /** Complete current routing availability, or the requested page only. Missing site-list entries have no routes. */
  readonly pageAvailability: readonly IPageAvailability[];
  readonly templates: readonly IPublicationTemplateOption[];
  readonly templateId: string | null;
  readonly path: string | null;
}

export interface IGetPublicationOptions {
  execute(input: IGetPublicationOptionsInput): Promise<IPublicationOptions>;
}
