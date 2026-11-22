import { generateKeyPairSync, type KeyObject, verify } from 'node:crypto';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GitHubAppTokens } from '../../src/adapters/outbound/runtime/addons/github-app-tokens.adapter.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';

const clientId = 'Iv23SyntheticApplication';

const repo = 'example/synthetic';

const api = 'https://api.github.com';

const appRoute = api + '/repos/' + repo + '/installation';

const tokenRoute = api + '/app/installations/712/access_tokens';

function signedBy(init: RequestInit | undefined, key: KeyObject): boolean {
  const authorization = new Headers(init?.headers).get('Authorization');
  const [header, claims, signature] = authorization?.slice('Bearer '.length).split('.') ?? [];

  return !!header && !!claims && !!signature && verify('RSA-SHA256', Buffer.from(header + '.' + claims),
    key, Buffer.from(signature, 'base64url'));
}

describe('GitHub App repository credentials', () => {
  let root: string;

  beforeEach(async () => {
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/github-app-'));
  });

  afterEach(async () => {
    expect(path.dirname(root)).toBe(path.resolve('.tmp'));
    await rm(root, { recursive: true, force: true });
  });

  it('resolves the repository installation and uses a new PEM when the previous key is revoked', async () => {
    const oldKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const nextKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const previous = path.join(root, 'original-private-key.pem');
    const replacement = path.join(root, 'arbitrary filename with spaces.pem');
    const signal = AbortSignal.timeout(10000);
    let revoked = false;

    await writeFile(previous, oldKey.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    const peer = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const current = signedBy(init, nextKey.publicKey);
      const original = signedBy(init, oldKey.publicKey);
      const authorization = new Headers(init?.headers).get('Authorization');
      const claims: unknown = JSON.parse(Buffer.from(authorization?.split('.')[1] ?? '', 'base64url').toString());

      expect(claims).toMatchObject({ iss: clientId });
      expect(init).toMatchObject({ redirect: 'manual', signal });
      expect(current || original).toBe(true);

      if (original && revoked) {
        expect(url).toBe(appRoute);

        return new Response(null, { status: 401 });
      }
      if (url === appRoute) {
        return Response.json({ id: 712, account: { login: 'Example' }, suspended_at: null });
      }
      expect(url).toBe(tokenRoute);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        repositories: ['synthetic'], permissions: { contents: 'read' },
      });

      return Response.json({ token: current ? 'ghs_next' : 'ghs_original' }, { status: 201 });
    });
    const tokens = new GitHubAppTokens({ clientId, keysDirectory: root }, '0.16.0', peer);

    await expect(tokens.issue(repo, signal)).resolves.toBe('ghs_original');
    await writeFile(replacement, nextKey.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    await utimes(replacement, new Date(0), new Date(0));
    revoked = true;

    await expect(tokens.issue(repo, signal)).resolves.toBe('ghs_next');
    expect(peer.mock.calls.map(([url]) => url)).toEqual([appRoute, tokenRoute, appRoute, appRoute, tokenRoute]);
  });

  it('does not mint credentials for a different owner or for a repository outside the installation', async () => {
    const key = generateKeyPairSync('rsa', { modulusLength: 2048 });

    await writeFile(path.join(root, 'working.pem'), key.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    const peer = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 712, account: { login: 'foreign' } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const tokens = new GitHubAppTokens({ clientId, keysDirectory: root }, '0.16.0', peer);
    const signal = AbortSignal.timeout(10000);

    await expect(tokens.issue(repo, signal)).rejects.toMatchObject({ code: BusinessErrorCode.AddonUnavailable });
    await expect(tokens.issue(repo, signal)).rejects.toMatchObject({ code: BusinessErrorCode.NotFound });
    expect(peer.mock.calls.map(([url]) => url)).toEqual([appRoute, appRoute]);
  });

  it('does not contact GitHub with an unusable private key directory', async () => {
    await writeFile(path.join(root, 'incomplete.pem'), 'incomplete key');
    await writeFile(path.join(root, 'oversized.pem'), Buffer.alloc(20 * 1024));
    const peer = vi.fn<typeof fetch>();
    const tokens = new GitHubAppTokens({ clientId, keysDirectory: root }, '0.16.0', peer);

    await expect(tokens.issue(repo, AbortSignal.timeout(10000))).rejects.toMatchObject({
      code: BusinessErrorCode.AddonUnavailable,
    });
    expect(peer).not.toHaveBeenCalled();
  });
});
