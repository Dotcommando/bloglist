import type { IHookDraft, IHookHandler, IHookHandlerVersion, IHookSubscription, IHookTree } from
  '../../../domain/hooks/hook.js';
import type { HookKind } from '../../../domain/hooks/hook.js';

export interface IHookActor { readonly siteId: string; readonly actorId: string; }

export interface IListHooks { execute(input: IHookActor): Promise<IHookTree>; }

export interface IGetHookHandler {
  execute(input: IHookActor & { readonly handlerId: string }): Promise<IHookHandler>;
}

export interface ICreateHookHandler {
  execute(input: IHookActor & { readonly title: string;
    readonly kind: HookKind;
    readonly draft: IHookDraft }): Promise<IHookHandler>;
}

export interface IUpdateHookHandler {
  execute(input: IHookActor & { readonly handlerId: string;
    readonly expectedVersion: string;
    readonly title: string;
    readonly draft: IHookDraft }): Promise<IHookHandler>;
}

export interface IApplyHookHandler {
  execute(input: IHookActor & { readonly handlerId: string; readonly expectedVersion: string }):
  Promise<IHookHandlerVersion>;
}

export interface ISetHookHandlerEnabled {
  execute(input: IHookActor & { readonly handlerId: string;
    readonly expectedVersion: string;
    readonly enabled: boolean }): Promise<IHookHandler>;
}

export interface ISaveHookSubscription {
  execute(input: IHookActor & { readonly subscription: Omit<IHookSubscription, 'siteId' | 'version' | 'createdAt'
    | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  readonly expectedVersion: string | null }): Promise<IHookSubscription>;
}

export interface IReorderHookSubscriptions {
  execute(input: IHookActor & { readonly hookKey: string;
    readonly ordered: readonly { readonly id: string; readonly version: string }[] }): Promise<void>;
}

export interface IHookConfigurationOperations {
  readonly get: IGetHookHandler;
  readonly list: IListHooks;
  readonly create: ICreateHookHandler;
  readonly update: IUpdateHookHandler;
  readonly apply: IApplyHookHandler;
  readonly setEnabled: ISetHookHandlerEnabled;
  readonly subscribe: ISaveHookSubscription;
  readonly reorder: IReorderHookSubscriptions;
}
