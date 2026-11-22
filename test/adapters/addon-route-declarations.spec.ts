import { expect, it } from 'vitest';

import { readAddonPackageManifest } from '../../src/adapters/outbound/runtime/addons/addon-package-manifest.js';

function manifest(routes: readonly string[], authorization?: unknown): unknown {
  return {
    format: 'zarya-addon',
    version: 1,
    routes,
    ...(authorization === undefined ? {} : { authorization }),
    collections: [],
    dependencies: {},
    definition: {
      addonKey: 'fixture',
      implementationVersion: '1.0.0',
      contractVersion: 1,
      configurationSchemaVersion: 1,
      adminComponentId: null,
      snippetIds: [],
      name: { en: 'Fixture', ru: 'Fixture' },
      description: { en: 'Test', ru: 'Test' },
    },
    serverEntry: 'server.cjs',
    adminEntry: null,
    styles: [],
    files: { 'server.cjs': 'a'.repeat(64) },
  };
}

it('retains owned public URL namespaces without requiring a literal add-on key', () => {
  expect(readAddonPackageManifest(manifest(['/api/sessions', '/api/admin/sites/:siteId/session-series'])).routes)
    .toEqual(['/api/sessions', '/api/admin/sites/:siteId/session-series']);
});

it('retains declared add-on actions and rejects a foreign domain or route', () => {
  const prefix = '/api/admin/sites/:siteId/sessions';
  const action = {
    actionId: 'fixture.sessions.read',
    method: 'GET',
    route: prefix + '/:sessionId',
    scope: 'site',
    admission: 'admin',
    shortDescription: 'Read a session',
    description: 'Read a session from the selected site.',
    domains: ['fixture.sessions'],
    create: false,
    read: true,
    update: false,
    delete: false,
    execute: false,
    allowedObjectScopes: ['all'],
  };
  const declaration = {
    version: 1,
    domains: [{
      domainId: 'fixture.sessions',
      name: 'Sessions',
      description: 'Session administration.',
    }],
    actions: [action],
  };

  expect(readAddonPackageManifest(manifest([prefix], declaration))).toMatchObject({ authorization: declaration });
  expect(() => readAddonPackageManifest(manifest([prefix], {
    ...declaration, actions: [{ ...action, route: '/api/admin/sites/:siteId/foreign' }],
  }))).toThrow();
  expect(() => readAddonPackageManifest(manifest([prefix], {
    ...declaration, actions: [{ ...action, domains: ['another.sessions'] }],
  }))).toThrow();
  const pages = '/api/admin/sites/:siteId/pages';

  expect(() => readAddonPackageManifest(manifest([pages], {
    ...declaration, actions: [{ ...action, route: pages + '/fixture' }],
  }))).toThrow();
});

it.each([
  '/api/admin',
  '/api/admin/auth',
  '/api/admin/installation',
  '/api/admin/sites',
  '/api/health',
  '/api/admin/auth/login',
  '/api/admin/installation/resources',
])('rejects reserved service route %s', path => {
  expect(() => readAddonPackageManifest(manifest([path]))).toThrow();
});
