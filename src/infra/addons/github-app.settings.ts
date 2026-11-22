import path from 'node:path';

import type { IGitHubAppSettings } from '../../adapters/outbound/runtime/addons/github-app-tokens.adapter.js';

export type { IGitHubAppSettings } from '../../adapters/outbound/runtime/addons/github-app-tokens.adapter.js';

export function validateGitHubAppSettings(settings: IGitHubAppSettings): IGitHubAppSettings {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(settings.clientId) || !path.isAbsolute(settings.keysDirectory)) {
    throw new RangeError('GitHub App requires a Client ID and an absolute private key directory');
  }

  return Object.freeze({ clientId: settings.clientId, keysDirectory: path.normalize(settings.keysDirectory) });
}

export function readGitHubAppSettings(environment: NodeJS.ProcessEnv): IGitHubAppSettings | undefined {
  const clientId = environment.ZARYA_GITHUB_APP_CLIENT_ID?.trim() ?? '';
  const keysDirectory = environment.ZARYA_GITHUB_APP_KEYS_DIR?.trim() ?? '';

  return clientId || keysDirectory ? validateGitHubAppSettings({ clientId, keysDirectory }) : undefined;
}
