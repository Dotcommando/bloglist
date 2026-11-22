import { ContentRequestError, object, string } from '../../shared/api/content-api';

export interface IInstallationSettings {
  readonly adminOrigin: string;
  readonly version: string;
}

export async function installationSettings(body?: {
  adminAddress: string;
  expectedVersion: string;
}): Promise<IInstallationSettings> {
  const response = await fetch('/api/admin/installation/settings', {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-Zarya-Admin': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new ContentRequestError(response.status, 'InstallationSettings');
  }

  const value = object(await response.json());

  return { adminOrigin: string(value.adminOrigin), version: string(value.version) };
}
