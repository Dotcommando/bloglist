import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import {
  ElementBackupState, type IElementIdentity, type IRenderingElementState,
} from '../../src/domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IElementStore } from '../../src/ports/outbound/rendering/element-store.port.js';

export function elementFixture(overrides: Partial<IRenderingElementState> = {}): IRenderingElementState {
  return {
    elementId: 'element-1',
    siteId: 'site-1',
    key: 'Home',
    name: 'Home',
    kind: TemplateSourceKind.Template,
    version: 'v1',
    html: '<html><head></head><body>[[*title]]</body></html>',
    css: '',
    browserTypeScript: null,
    parameters: [],
    createdAt: new Date('2026-10-26T00:00:00Z'),
    updatedAt: new Date('2026-10-26T00:00:00Z'),
    backupState: ElementBackupState.Ready,
    ...overrides,
  };
}

export class FakeElementStore implements IElementStore {
  readonly records = new Map<string, IRenderingElementState>();

  key(identity: IElementIdentity): string {
    return identity.siteId + ':' + identity.kind + ':' + identity.key;
  }

  async find(identity: IElementIdentity): Promise<IRenderingElementState | null> {
    return structuredClone(this.records.get(this.key(identity)) ?? null);
  }

  async list(siteId: string, kind?: TemplateSourceKind): Promise<readonly IRenderingElementState[]> {
    return structuredClone([...this.records.values()]
      .filter((item) => item.siteId === siteId && (!kind || item.kind === kind)));
  }

  async save(element: IRenderingElementState, expected: string | null): Promise<void> {
    if ((this.records.get(this.key(element))?.version ?? null) !== expected) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Stale element');
    }
    this.records.set(this.key(element), structuredClone(element));
  }

  async synchronizeBackup(identity: IElementIdentity, version: string,
    write: (element: IRenderingElementState) => Promise<void>): Promise<IRenderingElementState> {
    const element = await this.find(identity);

    if (element?.version !== version) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Stale backup');
    }
    await write(element);
    const ready = { ...element, backupState: ElementBackupState.Ready };

    this.records.set(this.key(element), ready);

    return structuredClone(ready);
  }
}
