import type { ICmsCoreOperations } from '../../../ports/inbound/cms/cms-api.port.js';

const queries: { readonly [G in keyof ICmsCoreOperations]: readonly (keyof ICmsCoreOperations[G])[] } = {
  sites: ['get', 'resolve', 'list'],
  pages: ['get', 'getDraft', 'getPublished', 'list', 'listVersions', 'getPublicationOptions'],
  urls: ['findByPath', 'getHistory', 'getCatalog', 'search'],
  publication: ['resolvePath', 'getArtifact'],
  addons: ['list', 'get'],
  adminUsers: ['get', 'list'],
  templates: ['get', 'list'],
  chunks: ['get', 'list'],
  snippets: ['get', 'list'],
  tvs: ['list', 'getPage'],
  files: ['list', 'browse', 'getFile', 'getFiles', 'getAsset', 'readContent'],
  hooks: ['get', 'list', 'history'],
};

export function isCmsRead(group: string, method: string): boolean {
  return Object.entries(queries).some(([key, methods]) => key === group && methods.some((name) => name === method));
}
