import { readCatalogActions } from './action-catalog.js';
import inventory from './core-actions.json' with { type: 'json' };

export const coreActions = readCatalogActions(inventory);
