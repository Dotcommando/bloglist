import { AdminSection } from '../../app/admin-route';
import type { IAdminAuthorization } from '../../app/auth';

export type CanUseAction = (actionId: string) => boolean;

export function isSiteAdministrator(authority: IAdminAuthorization, siteId: string): boolean {
  return authority.systemAdmin || authority.siteAdminSiteIds.includes(siteId);
}

export function siteActionCheck(authority: IAdminAuthorization, siteId: string): CanUseAction {
  const administrator = isSiteAdministrator(authority, siteId);
  const grants = new Set(authority.siteGrants?.find((grant) => grant.siteId === siteId)?.actionIds);

  return (actionId) => administrator || grants.has(actionId);
}

const workspaceActions: Readonly<Record<AdminSection, readonly string[]>> = {
  [AdminSection.Pages]: ['cms.pages.list', 'cms.pages.read', 'cms.pages.create', 'cms.pages.update',
    'cms.pages.set-position'],
  [AdminSection.Templates]: ['cms.templates.list', 'cms.templates.read', 'cms.templates.create',
    'cms.templates.update'],
  [AdminSection.Chunks]: ['cms.chunks.list', 'cms.chunks.read', 'cms.chunks.create', 'cms.chunks.update'],
  [AdminSection.Snippets]: ['cms.snippets.list', 'cms.snippets.read', 'cms.snippets.create', 'cms.snippets.update'],
  [AdminSection.TemplateVariables]: ['cms.template-variables.list'],
  [AdminSection.Hooks]: ['cms.hooks.list', 'cms.hooks.create-handler', 'cms.hooks.history'],
  [AdminSection.JsonLd]: ['cms.json-ld.list'],
  [AdminSection.Files]: ['cms.files.list', 'cms.files.create-folder', 'cms.files.upload', 'cms.files.usages',
    'cms.files.read-content', 'cms.files.change-image', 'cms.files.move', 'cms.files.delete', 'cms.files.reconcile'],
  [AdminSection.Urls]: ['cms.urls.list', 'cms.urls.suggest', 'cms.urls.history', 'cms.urls.move',
    'cms.urls.set-redirect', 'cms.urls.materialize', 'cms.urls.publish'],
  [AdminSection.Addons]: ['cms.addons.list'],
  [AdminSection.Settings]: ['cms.site-settings.read', 'cms.deployment.read', 'cms.page-resolutions.list'],
};

export function canOpenSection(can: CanUseAction, section: AdminSection): boolean {
  return workspaceActions[section].some(can);
}
