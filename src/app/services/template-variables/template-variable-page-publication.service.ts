import type { IPagePublicationPort } from '../../../ports/outbound/pages/page-publication.port.js';
import type {
  ITemplateVariablePublication,
} from '../../../ports/outbound/template-variables/template-variables.port.js';

/** Captures effective defaults in retained page content without changing the editable default selection. */
export class TemplateVariablePagePublicationService implements IPagePublicationPort {
  constructor(private readonly publications: IPagePublicationPort,
    private readonly variables: ITemplateVariablePublication) {}

  async publish(...args: Parameters<IPagePublicationPort['publish']>): ReturnType<IPagePublicationPort['publish']> {
    const [expected, at, hookChange] = args;
    const values = (expected.mimeType ?? 'text/html') === 'text/html'
      ? await this.variables.freeze(expected) : expected.tvValues ?? {};

    return this.publications.publish(expected, at, hookChange, values);
  }

  versions(...args: Parameters<IPagePublicationPort['versions']>): ReturnType<IPagePublicationPort['versions']> {
    return this.publications.versions(...args);
  }

  restore(...args: Parameters<IPagePublicationPort['restore']>): ReturnType<IPagePublicationPort['restore']> {
    return this.publications.restore(...args);
  }
}
