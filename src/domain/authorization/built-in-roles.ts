export enum BuiltInRoleId {
  SystemAdmin = 'cms.system.admin',
  SiteAdmin = 'cms.system.site-admin',
  Manager = 'cms.system.manager',
}

export enum BuiltInAdminGroupId {
  Global = 'cms.system.group.global',
  Site = 'cms.system.group.site',
}

export const builtInAdminGroups = [
  {
    groupId: BuiltInAdminGroupId.Global,
    roleId: BuiltInRoleId.SystemAdmin,
    key: 'global',
    name: 'Global',
    description: 'System administrators for the installation and all its sites.',
  },
  {
    groupId: BuiltInAdminGroupId.Site,
    roleId: BuiltInRoleId.SiteAdmin,
    key: 'site',
    name: 'Site',
    description: 'Site administrators assigned to the selected site.',
  },
] as const;

export const legacyAddonAdminActionId = 'cms.addons.dispatch-legacy-admin';

export const defaultManagerActionIds = [
  'cms.pages.list',
  'cms.pages.create',
  'cms.pages.read',
  'cms.pages.update',
  'cms.pages.set-position',
  'cms.publication.site-options',
  'cms.publication.page-options',
  'cms.publication.publish-page',
  'cms.chunks.list',
  'cms.chunks.create',
  'cms.chunks.read',
  'cms.chunks.update',
  'cms.snippets.list',
  'cms.snippets.create',
  'cms.snippets.read',
  'cms.snippets.update',
  'cms.files.list',
  'cms.files.upload',
  'cms.files.create-folder',
  'cms.files.usages',
  'cms.files.read-content',
  'cms.files.change-image',
  'cms.files.move',
  'cms.files.delete',
  'cms.urls.list',
  'cms.urls.suggest',
  'cms.urls.history',
  'cms.urls.move',
  'cms.urls.set-redirect',
  'cms.urls.materialize',
  'cms.urls.publish',
  'cms.site-settings.read',
] as const;

export enum AuthorizationScope {
  Installation = 'installation',
  Site = 'site',
}
