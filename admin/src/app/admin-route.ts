import { writable } from 'svelte/store';

import { SourceFile } from '../features/rendering/rendering.types.js';

export enum AdminRouteKind {
  TemplateVariables = 'templateVariables',
  Hooks = 'hooks',
  JsonLd = 'jsonLd',
  Addons = 'addons',
  Home = 'home',
  Login = 'login',
  Sites = 'sites',
  CreateSite = 'create-site',
  Site = 'site',
  CreatePage = 'create-page',
  Page = 'page',
  Elements = 'elements',
  CreateElement = 'create-element',
  Element = 'element',
  Files = 'files',
  Urls = 'urls',
  Settings = 'settings',
  NotFound = 'not-found',
}

export enum AdminSection {
  TemplateVariables = 'templateVariables',
  Hooks = 'hooks',
  JsonLd = 'jsonLd',
  Addons = 'addons',
  Urls = 'urls',
  Settings = 'settings',
  Pages = 'pages',
  Templates = 'templates',
  Chunks = 'chunks',
  Snippets = 'snippets',
  Files = 'files',
}

export interface IAdminRoute {
  readonly jsonLdProfileId?: string | null;
  readonly hookKey?: string | null;
  readonly hookBindingId?: string | null;
  readonly addonLocation?: string;
  readonly addonKey?: string | null;
  readonly kind: AdminRouteKind;
  readonly siteId: string | null;
  readonly pageId: string | null;
  readonly section?: AdminSection;
  readonly elementId?: string | null;
  readonly sourceFile?: SourceFile;
  readonly fileId?: string | null;
  readonly urlId?: string | null;
  readonly urlPageId?: string | null;
  readonly virtualFolderPath?: string | null;
}

const siteCookie = 'zarya_admin_site';

const identifier = /^[A-Za-z0-9_-]{1,128}$/;

export function parseAdminRoute(pathname: string): IAdminRoute {
  const address = new URL(pathname, 'http://localhost');

  pathname = address.pathname;
  const jsonLd = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/jsonLd$/.exec(pathname);

  if (jsonLd) {
    const profile = address.searchParams.get('profile');

    return {
      kind: AdminRouteKind.JsonLd,
      section: AdminSection.JsonLd,
      siteId: jsonLd[1]!,
      pageId: null,
      jsonLdProfileId: profile && /^[A-Za-z0-9_-]{1,128}$/.test(profile) ? profile : null,
    };
  }

  const hooks = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/hooks(?:\/((?:cms|addon\.[a-z][a-z0-9-]*)\.[a-z][a-z0-9.-]*)(?:\/handlers\/([A-Za-z0-9_-]{1,128}))?)?$/.exec(pathname);

  if (hooks) {
    return {
      kind: AdminRouteKind.Hooks,
      section: AdminSection.Hooks,
      siteId: hooks[1]!,
      pageId: null,
      hookKey: hooks[2] ?? null,
      hookBindingId: hooks[3] ?? null,
    };
  }

  const addon = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/addons(?:\/([a-z][a-z0-9-]{0,63}))?$/.exec(pathname);

  if (addon) {
    return {
      kind: AdminRouteKind.Addons,
      section: AdminSection.Addons,
      siteId: addon[1]!,
      pageId: null,
      addonKey: addon[2] ?? null,
      addonLocation: address.search,
    };
  }

  const fixed = new Map([
    ['/admin', AdminRouteKind.Home], ['/admin/', AdminRouteKind.Home],
    ['/admin/login', AdminRouteKind.Login], ['/admin/sites', AdminRouteKind.Sites],
    ['/admin/sites/new', AdminRouteKind.CreateSite],
  ]);
  const kind = fixed.get(pathname);

  if (kind) {
    return { kind, siteId: null, pageId: null };
  }

  const urls = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/urls(?:\/([A-Za-z0-9_-]{1,128})|\/-\/page\/([A-Za-z0-9_-]{1,128}))?$/.exec(pathname);

  if (urls) {
    return {
      kind: AdminRouteKind.Urls,
      section: AdminSection.Urls,
      siteId: urls[1]!,
      pageId: null,
      urlId: urls[2] ?? null,
      urlPageId: urls[3] ?? null,
    };
  }

  const settings = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/settings$/.exec(pathname);

  if (settings) {
    return { kind: AdminRouteKind.Settings, section: AdminSection.Settings, siteId: settings[1]!, pageId: null };
  }

  const tv = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/template-variables$/.exec(pathname);

  if (tv) {
    return {
      kind: AdminRouteKind.TemplateVariables,
      section: AdminSection.TemplateVariables,
      siteId: tv[1]!,
      pageId: null,
    };
  }

  const files = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/files(?:\/([A-Za-z0-9_-]{1,128}))?$/.exec(pathname);

  if (files) {
    return {
      kind: AdminRouteKind.Files,
      siteId: files[1]!,
      pageId: null,
      section: AdminSection.Files,
      fileId: files[2] ?? null,
    };
  }

  const createElement = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/(templates|chunks|snippets)\/-\/new$/.exec(pathname);

  if (createElement) {
    return {
      kind: AdminRouteKind.CreateElement,
      siteId: createElement[1]!,
      pageId: null,
      section: createElement[2] === 'templates' ? AdminSection.Templates
        : createElement[2] === 'chunks' ? AdminSection.Chunks : AdminSection.Snippets,
      elementId: null,
    };
  }

  const element = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/(templates|chunks|snippets)(?:\/((?:[A-Za-z][A-Za-z0-9_-]{0,127}|[1-9][0-9]{0,18})))?$/.exec(pathname);

  if (element) {
    const sourceFile = address.searchParams.get('file') === SourceFile.Parameters ? SourceFile.Parameters : undefined;

    return {
      kind: element[3] ? AdminRouteKind.Element : AdminRouteKind.Elements,
      siteId: element[1]!,
      pageId: null,
      section: element[2] === 'templates' ? AdminSection.Templates
        : element[2] === 'chunks' ? AdminSection.Chunks : AdminSection.Snippets,
      elementId: element[3] ?? null,
      ...(sourceFile ? { sourceFile } : {}),
    };
  }

  const match = /^\/admin\/sites\/([A-Za-z0-9_-]{1,128})(?:\/pages\/([A-Za-z0-9_-]{1,128}))?$/.exec(pathname);

  return match ? {
    ...(match[2] === 'new' ? { virtualFolderPath: address.searchParams.get('urlPath') } : {}),
    kind: match[2] === 'new' ? AdminRouteKind.CreatePage : match[2] ? AdminRouteKind.Page : AdminRouteKind.Site,
    siteId: match[1]!,
    pageId: match[2] && match[2] !== 'new' ? match[2] : null,
  } : { kind: AdminRouteKind.NotFound, siteId: null, pageId: null };
}

export function sitePath(siteId: string): string {
  if (!identifier.test(siteId)) {
    throw new Error('Invalid administration site identity');
  }

  return '/admin/sites/' + siteId;
}

export function renderingUsagePath(siteId: string, kind: string, id: string): string {
  const section = kind === 'Page' ? 'pages' : kind === 'Template' ? 'templates' : 'chunks';

  return sitePath(siteId) + '/' + section + '/' + encodeURIComponent(id);
}

export function followAdminLink(event: MouseEvent): void {
  if (
    event.currentTarget instanceof HTMLAnchorElement
    && event.button === 0
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.altKey
  ) {
    event.preventDefault();
    navigateAdmin(event.currentTarget.getAttribute('href')!);
  }
}

export function readLastSite(cookie: string): string | null {
  const matches = cookie.split(';').map((entry) => entry.trim()).filter((entry) => entry.startsWith(siteCookie + '='));
  const value = matches[0]?.slice(siteCookie.length + 1);

  return matches.length === 1 && value && identifier.test(value) ? value : null;
}

export function rememberSite(siteId: string | null): void {
  if (siteId !== null && !identifier.test(siteId)) {
    return;
  }
  document.cookie = `${siteCookie}=${siteId ?? ''}; Path=/admin; SameSite=Strict; Max-Age=${siteId ? 31536000 : 0}`
    + (location.protocol === 'https:' ? '; Secure' : '');
}

const initialPath = typeof window === 'undefined' ? '/admin/' : window.location.pathname + window.location.search;

export const adminRoute = writable(parseAdminRoute(initialPath));

export function syncAdminRoute(): void {
  adminRoute.set(parseAdminRoute(window.location.pathname + window.location.search));
}

export function navigateAdmin(pathname: string, replace = false): void {
  if (window.location.pathname + window.location.search !== pathname) {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', pathname);
  }
  syncAdminRoute();
}
