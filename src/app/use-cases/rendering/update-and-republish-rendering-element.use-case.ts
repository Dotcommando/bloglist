import { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import { ElementBackupState } from '../../../domain/rendering/rendering-element.js';
import type { IRepublishSnippetPages } from '../../../ports/inbound/publication/republish-snippet-pages.port.js';
import type { IUpdateRenderingElement } from '../../../ports/inbound/rendering/rendering-elements.port.js';

export class UpdateAndRepublishRenderingElementUseCase implements IUpdateRenderingElement {
  constructor(private readonly update: IUpdateRenderingElement,
    private readonly republication: IRepublishSnippetPages) {}

  async execute(input: Parameters<IUpdateRenderingElement['execute']>[0]):
  ReturnType<IUpdateRenderingElement['execute']> {
    const saved = await this.update.execute(input);

    if (
      !input.draftOnly
      && saved.kind === TemplateSourceKind.Snippet
      && saved.backupState === ElementBackupState.Ready
    ) {
      await this.republication.execute({ siteId: input.siteId, key: saved.key });
    }

    return saved;
  }
}
