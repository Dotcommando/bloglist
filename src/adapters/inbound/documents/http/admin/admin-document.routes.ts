export const ADMIN_DOCUMENT_ROUTES = Object.freeze({
  paths: Object.freeze([
    '/admin',
    '/admin/',
    '/admin/login',
    '/admin/sites',
    '/admin/sites/new',
  ]),
  sitePath: new RegExp('^/admin/sites/[A-Za-z0-9_-]{1,128}'
    + '(?:/hooks(?:/(?:cms|addon\\.[a-z][a-z0-9-]*)\\.[a-z][a-z0-9.-]*(?:/handlers/[A-Za-z0-9_-]{1,128})?)?'
    + '|(?:/addons(?:/[a-z][a-z0-9-]{0,63})?|/settings|/template-variables|/jsonLd|/urls(?:/[A-Za-z0-9_-]{1,128}|/-/page/[A-Za-z0-9_-]{1,128})?|/files(?:/[A-Za-z0-9_-]{1,128})?|/pages/[A-Za-z0-9_-]{1,128}|/(?:templates|chunks|snippets)'
    + '(?:/(?:-/new|[A-Za-z][A-Za-z0-9_]{0,127}|[1-9][0-9]{0,18}))?)?)?$'),
  assetPath: /^\/admin\/assets\/([A-Za-z0-9_-]+\.(js|css))$/,
});
