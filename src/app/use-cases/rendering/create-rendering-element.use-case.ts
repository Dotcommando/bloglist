import { authorizeContentCreation } from '../../../domain/authorization/content-access.js';
import { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import {
  ElementBackupState, elementRequirement, maximumElementOrdinal, RenderingElement, validateElementContent,
} from '../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ICreateRenderingElement } from '../../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IElementKeys } from '../../../ports/outbound/rendering/element-keys.port.js';
import type { IElementCatalog, IElementValues } from '../../../ports/outbound/rendering/element-sources.port.js';
import type { CompleteElementSaveService } from '../../services/rendering/complete-element-save.service.js';

export class CreateRenderingElementUseCase implements ICreateRenderingElement {
  constructor(private readonly sites: IGetSite, private readonly catalog: IElementCatalog,
    private readonly persistence: CompleteElementSaveService, private readonly values: IElementValues,
    private readonly keys: IElementKeys) {}

  async execute(input: Parameters<ICreateRenderingElement['execute']>[0]):
  ReturnType<ICreateRenderingElement['execute']> {
    const site = await this.sites.execute({ siteId: input.siteId });

    if (site?.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    authorizeContentCreation(input.siteId, input);
    validateElementContent(input);
    elementRequirement((input.kind === TemplateSourceKind.Snippet) === (input.snippet !== undefined),
      'Snippet source belongs only to a Snippet');
    elementRequirement(Object.values(TemplateSourceKind).includes(input.kind), 'Invalid element kind');
    const existing = await this.catalog.list(input.siteId, input.kind);
    const after = existing.reduce((maximum, item) => /^[1-9][0-9]{0,18}$/.test(item.key)
      && BigInt(item.key) > maximum ? BigInt(item.key) : maximum, 0n);

    if (after >= maximumElementOrdinal) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Element key sequence exhausted');
    }

    const key = await this.keys.reserve({ siteId: input.siteId, kind: input.kind, after });
    const now = this.values.now();
    const element = new RenderingElement({
      siteId: input.siteId,
      kind: input.kind,
      key,
      name: input.name,
      html: input.html,
      css: input.css,
      browserTypeScript: input.browserTypeScript,
      parameters: input.parameters,
      ...(input.snippet ? { snippet: input.snippet } : {}),
      elementId: this.values.nextId(),
      version: this.values.nextVersion(),
      createdAt: now,
      updatedAt: now,
      backupState: ElementBackupState.Pending,
    });

    if (await this.catalog.find({ siteId: input.siteId, kind: input.kind, key })) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Element key already exists');
    }

    return this.persistence.save(element.toState(), null, undefined, input);
  }
}
