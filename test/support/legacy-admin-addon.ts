import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Simulates an immutable pre-0.10 bundle which forwards its cookie directly to the host.
export async function legacyAdminAddon(directory: string): Promise<void> {
  const server = `exports.validateConfiguration = () => {};
exports.defaultConfiguration = () => ({schemaVersion: 1, values: {}});
exports.createRuntime = async host => ({
  canHandle: pathname => pathname === '/api/admin/synthetic/legacy-session',
  handle: async (request, response) => {
    const token = request.headers.cookie?.split(';').map(value => value.trim())
      .find(value => value.startsWith('zarya_admin_session='))?.slice('zarya_admin_session='.length) ?? null;
    try {
      const user = await host.current.execute({token});
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(user));
    } catch {
      response.statusCode = 401;
      response.setHeader('Set-Cookie', 'zarya_admin_session=; Path=/api/admin; Max-Age=0');
      response.end();
    }
  }
});
`;
  const files = {
    'server/runtime.cjs': server,
    'migrations/0000-runtime.json': JSON.stringify({ id: '0000-runtime', collections: [] }),
  };

  for (const [name, value] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), value);
  }
  await writeFile(path.join(directory, 'addon.runtime.json'), JSON.stringify({
    format: 'zarya-addon',
    version: 1,
    cmsVersion: '0.8.0',
    collections: [],
    dependencies: {},
    definition: {
      addonKey: 'legacy-admin',
      implementationVersion: '1.0.0',
      contractVersion: 1,
      configurationSchemaVersion: 1,
      adminComponentId: null,
      snippetIds: [],
      name: { en: 'Synthetic legacy admin', ru: 'Synthetic legacy admin' },
      description: { en: 'Authentication regression', ru: 'Authentication regression' },
    },
    files: Object.fromEntries(Object.entries(files).map(([name, value]) =>
      [name, createHash('sha256').update(value).digest('hex')])),
    serverEntry: 'server/runtime.cjs',
    adminEntry: null,
    styles: [],
  }));
}
