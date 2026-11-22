import { createPrivateKey, type KeyObject, sign } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';

import { addonRepositoryUrl } from '../../../../domain/addons/addon-installation.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { packageObject } from './addon-package-manifest.js';
import type { IGitHubRepositoryTokens } from './github-addon-package-delivery.adapter.js';
import { githubApiOrigin, readGitHubJson } from './github-api-response.js';

export interface IGitHubAppSettings {
  readonly clientId: string;
  readonly keysDirectory: string;
}

const maxKeyBytes = 16 * 1024;

const maxKeyCount = 25;

async function readKey(filename: string): Promise<KeyObject | null> {
  const flags = process.platform === 'win32' ? constants.O_RDONLY
    : constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const file = await open(filename, flags).catch(() => null);

  if (!file) {
    return null;
  }

  const bytes = Buffer.alloc(maxKeyBytes + 1);

  try {
    const stat = await file.stat();

    if (!stat.isFile() || stat.size > maxKeyBytes) {
      return null;
    }

    let length = 0;

    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);

      if (bytesRead === 0) {
        break;
      }
      length += bytesRead;
    }

    if (length < 1 || length > maxKeyBytes) {
      return null;
    }

    try {
      const key = createPrivateKey(bytes.subarray(0, length));

      return key.asymmetricKeyType === 'rsa' ? key : null;
    } catch {
      return null;
    }
  } finally {
    bytes.fill(0);
    await file.close();
  }
}

export class GitHubAppTokens implements IGitHubRepositoryTokens {
  constructor(private readonly settings: IGitHubAppSettings, private readonly cmsVersion: string,
    private readonly fetcher: typeof fetch = fetch) {}

  async issue(repository: string, signal: AbortSignal): Promise<string> {
    const canonical = addonRepositoryUrl('https://github.com/' + repository);

    if (canonical !== 'https://github.com/' + repository) {
      throw new BusinessError(BusinessErrorCode.Validation, 'A canonical GitHub repository is required');
    }

    const files = await readdir(this.settings.keysDirectory, { withFileTypes: true }).catch(() => {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'GitHub App key directory is unavailable');
    });
    const candidates = files.filter(entry => entry.isFile() && /\.pem$/i.test(entry.name));

    if (!candidates.length || candidates.length > maxKeyCount) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Expected one to 25 GitHub App PEM files');
    }

    const paths = await Promise.all(candidates.map(async entry => {
      const filename = path.join(this.settings.keysDirectory, entry.name);
      const info = await lstat(filename).catch(() => null);

      return { filename, info };
    }));

    paths.sort((left, right) => (right.info?.mtimeMs ?? 0) - (left.info?.mtimeMs ?? 0));

    for (const { filename, info } of paths) {
      signal.throwIfAborted();

      if (!info?.isFile()) {
        continue;
      }

      const key = await readKey(filename);

      if (key) {
        const token = await this.exchange(repository, this.jwt(key), signal);

        if (token) {
          return token;
        }
      }
    }
    throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'No usable GitHub App signing key');
  }

  private jwt(key: KeyObject): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: this.settings.clientId, iat: now - 60, exp: now + 480 }))
      .toString('base64url');
    const message = header + '.' + payload;

    return message + '.' + sign('RSA-SHA256', Buffer.from(message), key).toString('base64url');
  }

  private request(route: string, jwt: string, signal: AbortSignal, body?: string): Promise<Response> {
    return this.fetcher(githubApiOrigin + route, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'manual',
      signal,
      headers: {
        Authorization: 'Bearer ' + jwt,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CMS-Zarya/' + this.cmsVersion,
        'X-GitHub-Api-Version': '2026-03-10',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
  }

  private async exchange(repository: string, jwt: string, signal: AbortSignal): Promise<string | null> {
    const [owner, name] = repository.split('/');
    const access = await this.request('/repos/' + repository + '/installation', jwt, signal);

    if (access.status !== 200 || !access.body) {
      await access.body?.cancel();

      if (access.status === 401) {
        return null;
      }
      throw new BusinessError(access.status === 404 ? BusinessErrorCode.NotFound : BusinessErrorCode.AddonUnavailable,
        'GitHub App access to the repository is unavailable');
    }

    const installation = await readGitHubJson(access.body);
    const account = packageObject(installation.account);

    if (
      !Number.isSafeInteger(installation.id)
      || Number(installation.id) < 1
      || typeof account.login !== 'string'
      || account.login.toLowerCase() !== owner
      || installation.suspended_at
    ) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Invalid GitHub App repository installation');
    }

    const issued = await this.request('/app/installations/' + String(installation.id) + '/access_tokens', jwt, signal,
      JSON.stringify({ repositories: [name], permissions: { contents: 'read' } }));

    if (issued.status !== 201 || !issued.body) {
      await issued.body?.cancel();

      if (issued.status === 401) {
        return null;
      }
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'GitHub App could not issue a repository token');
    }

    const { token } = await readGitHubJson(issued.body);

    if (typeof token !== 'string' || !/^[A-Za-z0-9_.-]{1,8192}$/.test(token)) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Invalid GitHub App repository token');
    }

    return token;
  }
}
