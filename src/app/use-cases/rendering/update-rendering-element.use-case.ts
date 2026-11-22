import { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import {
  ElementBackupState, elementRequirement, RenderingElement, validateElementContent,
} from '../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IUpdateRenderingElement } from '../../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IElementCatalog, IElementValues } from '../../../ports/outbound/rendering/element-sources.port.js';
import type { IElementStore } from '../../../ports/outbound/rendering/element-store.port.js';
import type { CompleteElementSaveService } from '../../services/rendering/complete-element-save.service.js';

export class UpdateRenderingElementUseCase implements IUpdateRenderingElement {
  constructor(private readonly sites: IGetSite, private readonly catalog: IElementCatalog,
    private readonly store: IElementStore, private readonly persistence: CompleteElementSaveService,
    private readonly values: IElementValues) {}

  async execute(input: Parameters<IUpdateRenderingElement['execute']>[0]):
  ReturnType<IUpdateRenderingElement['execute']> {
    const site = await this.sites.execute({ siteId: input.siteId });
    const previous = site?.siteId === input.siteId ? await this.catalog.find(input, input.authority) : null;

    if (previous?.siteId !== input.siteId || previous.kind !== input.kind || previous.key !== input.key) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Element not found');
    }
    if (previous.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Stale element');
    }
    validateElementContent(input);
    elementRequirement((input.kind === TemplateSourceKind.Snippet) === (input.snippet !== undefined),
      'Snippet source belongs only to a Snippet');
    const content = {
      name: input.name,
      html: input.html,
      css: input.css,
      browserTypeScript: input.browserTypeScript,
      parameters: input.parameters,
      ...(input.snippet ? { snippet: input.snippet } : {}),
    };

    if (previous.backupState === ElementBackupState.Pending) {
      const previousContent = {
        name: previous.name,
        html: previous.html,
        css: previous.css,
        browserTypeScript: previous.browserTypeScript,
        parameters: previous.parameters,
        ...(previous.snippet ? { snippet: previous.snippet } : {}),
      };

      if (JSON.stringify(content) !== JSON.stringify(previousContent)) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Complete the pending backup before editing');
      }

      return this.persistence.synchronize(previous, input.authority);
    }

    const stored = await this.store.find(input, input.authority);

    if (stored && stored.version !== previous.version) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Element changed before saving');
    }

    const next = new RenderingElement(previous).update(content, this.values.nextVersion(), this.values.now());

    return this.persistence.save(next.toState(), stored?.version ?? null, undefined,
      input.authority ? { authority: input.authority } : undefined);
  }
}
