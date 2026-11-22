import type { IContentAccess, IContentCreationAccess } from '../../../domain/authorization/content-access.js';
import type { IRenderingElementState } from '../../../domain/rendering/rendering-element.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IElementBackup } from '../../../ports/outbound/rendering/element-sources.port.js';
import type { IElementStore } from '../../../ports/outbound/rendering/element-store.port.js';
import { prepareCoreHook } from '../hooks/core-hook-change.service.js';

export class CompleteElementSaveService {
  constructor(private readonly store: IElementStore, private readonly backup: IElementBackup,
    private readonly hooks: IHookChangesPort) {}

  async save(element: IRenderingElementState, expectedVersion: string | null, event = 'cms.element.updated',
    access?: IContentCreationAccess):
  Promise<IRenderingElementState> {
    const intent = await prepareCoreHook(this.hooks, element.siteId, 'element:' + element.elementId,
      event === 'cms.element.created' ? 'cms.element.create.check' : 'cms.element.update.check',
      {
        kind: element.kind,
        key: element.key,
        name: element.name,
        version: element.version,
        backupState:
        element.backupState,
      }, event);

    try {
      await this.store.save(element, expectedVersion, intent, access);
    } catch (error) {
      const recorded = await this.store.find(element, access?.authority);

      if (recorded?.version !== element.version) {
        throw error;
      }
    }

    return this.synchronize(element, access?.authority);
  }

  async synchronize(element: IRenderingElementState, access?: IContentAccess): Promise<IRenderingElementState> {
    try {
      return await this.store.synchronizeBackup(element, element.version,
        (current) => this.backup.write(current), access);
    } catch (error) {
      const recorded = await this.store.find(element, access);

      if (recorded?.version !== element.version) {
        throw error;
      }

      return recorded;
    }
  }
}
