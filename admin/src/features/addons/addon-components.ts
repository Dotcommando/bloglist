import type { IAddonAdminHost } from '@zarya/addon-contracts/addons';
import type { Component } from 'svelte';

export const addonAdminComponents = new Map<
  string, () => Promise<{ default: Component<{ host: IAddonAdminHost }> }>
>();
