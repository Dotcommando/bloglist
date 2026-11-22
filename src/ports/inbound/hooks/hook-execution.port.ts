import type { IAddonObject } from '@zarya/addon-contracts/addons';

import type { IHookActor } from './hook-configuration.port.js';

export interface IProcessHookDeliveries {
  execute(input: { readonly maximum: number }): Promise<{ readonly dispatched: number; readonly processed: number }>;
}

export interface IGetHookHistory { execute(input: IHookActor): Promise<readonly IAddonObject[]>; }

export interface IRetryHookDelivery {
  execute(input: IHookActor & { readonly deliveryId: string; readonly version: string }): Promise<void>;
}

export interface ISkipHookDelivery {
  execute(input: IHookActor & { readonly deliveryId: string;
    readonly version: string;
    readonly reason: string }): Promise<void>;
}
