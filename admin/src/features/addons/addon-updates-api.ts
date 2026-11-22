import { ContentRequestError, object, string } from '../../shared/api/content-api.js';

export enum AddonUpdateMode { Compatible = 'Compatible', Exclusive = 'Exclusive' }

export enum AddonUpdatePhase {
  Prepared = 'Prepared', Quiescing = 'Quiescing', Migrating = 'Migrating', Activating = 'Activating',
  Completed = 'Completed', Failed = 'Failed',
}

export interface IAddonUpdate {
  readonly updateId: string;
  readonly addonKey: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly mode: AddonUpdateMode;
  readonly phase: AddonUpdatePhase;
}

export const addonUpdateStorageKey = 'zarya-addon-update';

export type RepositoryAddonUpdate = { readonly status: 'NoRepository' | 'Current' }
  | { readonly status: 'Available'; readonly update: IAddonUpdate };

async function requestUpdateData(route: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch('/api/admin/addon-updates' + route, {
    ...init, credentials: 'same-origin', cache: 'no-store',
  });
  const value: unknown = await response.json();
  const data = object(value);

  if (!response.ok) {
    throw new ContentRequestError(response.status, typeof data.error === 'string' ? data.error : 'InternalError');
  }

  return data;
}

function decodeUpdate(data: Record<string, unknown>): IAddonUpdate {
  const mode = Object.values(AddonUpdateMode).find(value => value === data.mode);
  const phase = Object.values(AddonUpdatePhase).find(value => value === (data.phase ?? AddonUpdatePhase.Prepared));

  if (!mode || !phase) {
    throw new Error('Invalid add-on update response');
  }

  return {
    updateId: string(data.updateId),
    addonKey: string(data.addonKey),
    fromVersion: string(data.fromVersion),
    toVersion: string(data.toVersion),
    mode,
    phase,
  };
}

async function updateRequest(route: string, init: RequestInit): Promise<IAddonUpdate> {
  return decodeUpdate(await requestUpdateData(route, init));
}

export async function checkRepositoryAddonUpdate(addonKey: string): Promise<RepositoryAddonUpdate> {
  const result = await requestUpdateData('/repository/' + encodeURIComponent(addonKey), {
    method: 'POST', headers: { 'X-Zarya-Admin': '1' }, signal: AbortSignal.timeout(120000),
  });

  if (result.status === 'Current' || result.status === 'NoRepository') {
    return { status: result.status };
  }
  if (result.status !== 'Available') {
    throw new Error('Invalid repository update response');
  }

  return { status: 'Available', update: decodeUpdate(object(result.update)) };
}

export function prepareAddonUpdate(file: File): Promise<IAddonUpdate> {
  return updateRequest('', {
    method: 'POST',
    headers: { 'X-Zarya-Admin': '1', 'Content-Type': 'application/gzip' },
    body: file,
    signal: AbortSignal.timeout(120000),
  });
}

export function getAddonUpdate(updateId: string): Promise<IAddonUpdate> {
  return updateRequest('/' + encodeURIComponent(updateId), { method: 'GET' });
}

export function applyAddonUpdate(updateId: string): Promise<IAddonUpdate> {
  // The server continues an admitted update after a disconnect; the saved identity reconciles its outcome.
  return updateRequest('/' + encodeURIComponent(updateId) + '/apply', {
    method: 'POST', headers: { 'X-Zarya-Admin': '1' },
  });
}
