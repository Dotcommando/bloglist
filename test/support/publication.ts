import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import type { IActivePublication, IPublicationReleaseState } from '../../src/domain/publication/publication-release.js';
import {
  type IPublicationSnapshot,
  ParameterKind,
  TemplateSourceKind,
} from '../../src/domain/publication/render-plan.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type {
  IActivateReleaseInput,
  IReleaseActivationPort,
} from '../../src/ports/outbound/publication/release-activation.port.js';
import { pageFixture } from './pages.js';

export class FakePublicationStore implements IPublicationStorePort {
  readonly records = new Map<string, IPublicationReleaseState>();

  async stage(release: IPublicationReleaseState): Promise<void> {
    this.records.set(release.releaseId, structuredClone(release));
  }

  async read(siteId: string, releaseId: string): Promise<IPublicationReleaseState | null> {
    const record = this.records.get(releaseId);

    return record?.siteId === siteId ? structuredClone(record) : null;
  }
}

export class FakeReleaseActivation implements IReleaseActivationPort {
  readonly active = new Map<string, IActivePublication>();
  readonly receipts = new Map<string, IActivePublication>();

  async getActive(siteId: string): Promise<IActivePublication | null> {
    return this.active.get(siteId) ?? null;
  }

  async findActivation(siteId: string, releaseId: string): Promise<IActivePublication | null> {
    const receipt = this.receipts.get(releaseId);

    return receipt?.siteId === siteId ? receipt : null;
  }

  async activate(input: IActivateReleaseInput): Promise<IActivePublication> {
    if ((this.active.get(input.siteId)?.releaseId ?? null) !== input.expectedActiveReleaseId) {
      throw new Error('Stale');
    }

    const active = { siteId: input.siteId, releaseId: input.releaseId, activatedAt: input.activatedAt };

    this.active.set(input.siteId, active);
    this.receipts.set(input.releaseId, active);

    return active;
  }
}

export function source(html: string, chunk = '<p>[[+title]]</p>'): IPublicationSnapshot {
  return {
    siteId: 'site-1',
    siteKey: 'demo',
    settings: { locale: 'en' },
    requestParameters: [],
    pages: [{
      ...pageFixture().toState(),
      rendering: {
        templateId: 'Home',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    }],
    urls: [],
    frontendSources: [],
    templates: [{
      id: 'Home',
      kind: TemplateSourceKind.Template,
      revision: '1',
      parameters: [],
      html: `<!doctype html><html><head><title>[[*title]]</title></head><body>${html}</body></html>`,
    },
    {
      id: 'Card',
      kind: TemplateSourceKind.Chunk,
      revision: '1',
      parameters: [{ name: 'title', kind: ParameterKind.String, required: true }],
      html: chunk,
    }],
  };
}
