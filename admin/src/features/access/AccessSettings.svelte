<script lang="ts">
  import { onMount } from 'svelte';

  import { adminLanguage, formatMessage, messages } from '../../i18n/i18n';
  import type { IAdminSite } from '../../shared/api/content.types';
  import { ContentRequestError, object, request, string } from '../../shared/api/content-api';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import CmsDialog from '../../shared/ui/CmsDialog.svelte';
  import FeedbackTooltip from '../../shared/ui/FeedbackTooltip.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import AdminUsersWorkspace from '../accounts/AdminUsersWorkspace.svelte';
  import AccessUserCreation from './AccessUserCreation.svelte';
  import ContentGroupAssignment from './ContentGroupAssignment.svelte';

  let { site, timeZone, systemAdmin, onUnauthorized, onDirtyChange, onBusy }: {
    site: IAdminSite;
    timeZone: string;
    systemAdmin: boolean;
    onUnauthorized: () => void;
    onDirtyChange: (dirty: boolean) => void;
    onBusy: (busy: boolean) => void;
  } = $props();

  const siteId = $derived(site.siteId);
  const selectionId = $props.id();
  const flags = ['create', 'read', 'update', 'delete', 'execute'] as const;
  const builtInRoles = [
    { roleId: 'cms.system.admin', name: 'System Admin' },
    { roleId: 'cms.system.site-admin', name: 'Site Admin' },
  ];
  const accessTabs = ['roles', 'groups', 'catalog', 'users', 'create'] as const;
  type AccessTab = typeof accessTabs[number];
  const tabs = $derived(systemAdmin ? accessTabs : accessTabs.filter((item) => item !== 'users' && item !== 'create'));
  const tabLabels = $derived({
    roles: $messages.accessSettingsRolesAndPermissions,
    groups: $messages.accessSettingsAccessGroups,
    catalog: $messages.accessSettingsActionsCatalog,
    users: $messages.accessSettingsUsers,
    create: $messages.accessSettingsCreateUser,
  });
  const domainNames = $derived<Record<string, string>>({
    'cms.admin-ui': $messages.accessSettingsAdministration,
    'cms.admin-users': $messages.accessSettingsUsers,
    'cms.auth-sessions': $messages.accessSettingsSessions,
    'cms.calibration': $messages.accessSettingsCalibration,
    'cms.deployment': $messages.accessSettingsDeployment,
    'cms.dumps': $messages.accessSettingsDumps,
    'cms.health': $messages.accessSettingsHealth,
    'cms.installation-settings': $messages.accessSettingsInstallationSettings,
    'cms.json-ld': 'JSON-LD',
    'cms.page-resolutions': $messages.accessSettingsPageStatistics,
    'cms.resources': $messages.accessSettingsResources,
    'cms.addons': $messages.addons,
    'cms.addon-packages': $messages.accessSettingsAddOnPackages,
    'cms.authorization': $messages.accessSettingsAccess,
    'cms.chunks': $messages.chunks,
    'cms.files': $messages.files,
    'cms.hooks': 'Hooks',
    'cms.pages': $messages.pages,
    'cms.publication': $messages.accessSettingsPublication,
    'cms.sites': $messages.sites,
    'cms.site-settings': $messages.accessSettingsSiteSettings,
    'cms.snippets': $messages.snippets,
    'cms.templates': $messages.templates,
    'cms.template-variables': $messages.accessSettingsTVFields,
    'cms.urls': 'URLs',
  });
  const headings = ['C', 'R', 'U', 'D', 'E'];
  const pageOutputActions = new Set([
    'cms.pages.preview-markdown', 'cms.pages.read-published-markdown',
    'cms.json-ld.preview-page', 'cms.json-ld.read-published-page',
  ]);
  const scopeValues = ['all', 'own', 'groups'] as const;
  type Scope = typeof scopeValues[number];
  type Grants = Record<string, readonly Scope[]>;
  interface IActionRow {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly route: string;
    readonly scope: string;
    readonly admission: string;
    readonly domains: readonly string[];
    readonly effects: readonly boolean[];
    readonly allowedScopes: readonly Scope[];
  }

  interface IRoleDraft {
    key: string;
    name: string;
    description: string;
    actorIds: string[];
  }
  interface IRoleRow extends IRoleDraft {
    roleId: string;
    grants: Grants;
    builtInGroup: 'installation' | 'site' | undefined;
    memberEmails: string[];
  }

  let revision = $state<string | null>(null);
  let actions = $state<IActionRow[]>([]);
  let delegable = $state<string[]>([]);
  let selected = $state<Grants>({});
  let saved = $state<Grants>({});
  let managerGrants = $state<Grants>({});
  let administratorActionIds = $state<Record<string, unknown>>({});
  let roles = $state<IRoleRow[]>([]);
  let groups = $state<IRoleRow[]>([]);
  let groupMode = $state(false);
  let actors = $state<{ id: string; email: string }[]>([]);
  let roleSelection = $state('manager');
  let draft = $state<IRoleDraft>({ key: '', name: '', description: '', actorIds: [] });
  let removing = $state(false);
  let tab = $state<AccessTab>('roles');
  const catalog = $derived(tab === 'catalog');
  const fixedRole = $derived(!groupMode && builtInRoles.some(({ roleId }) => roleId === roleSelection));
  const hasScopedPages = $derived(Object.entries(selected).some(([id, scopes]) =>
    id.startsWith('cms.pages.') && scopes.length > 0 && !scopes.includes('all')));
  const roleOptions = $derived([...builtInRoles,
    { roleId: 'cms.system.manager', name: 'Manager' }, ...roles]);
  let feedback = $state.raw<{ anchor: HTMLInputElement; message: string } | null>(null);
  const actionsForRole = $derived(actions.filter((action) => fixedRole
    ? strings(administratorActionIds[roleSelection]).includes(action.id)
    : delegable.includes(action.id)));
  const domainGroups = $derived.by(() => {
    const result: Record<string, IActionRow[]> = Object.create(null);

    for (const action of actionsForRole) {
      for (const domain of action.domains) {
        (result[domain] ??= []).push(action);
      }
    }

    return Object.entries(result)
      .sort(([left], [right]) => domainLabel(left).localeCompare(domainLabel(right), $adminLanguage));
  });
  let busy = $state(true);
  let accountsBusy = $state(false);
  let failed = $state(false);
  let ready = $state(false);
  let disposed = false;
  const items = $derived(groupMode ? groups : roles);
  const currentRole = $derived(items.find((role) => role.roleId === roleSelection));
  const fixedGroup = $derived(groupMode ? currentRole?.builtInGroup : undefined);
  const changed = $derived(roleSelection === 'new'
    || Object.keys(saved).length !== Object.keys(selected).length
    || Object.entries(saved).some(([id, scopes]) => scopes.length !== selected[id]?.length
      || scopes.some((scope) => !selected[id]?.includes(scope)))
    || currentRole !== undefined && (
      currentRole.key !== draft.key || currentRole.name !== draft.name || currentRole.description !== draft.description
      || currentRole.actorIds.length !== draft.actorIds.length
      || currentRole.actorIds.some((id) => !draft.actorIds.includes(id))
    ));
  const tabSwitchDisabled = $derived(busy || accountsBusy || changed);
  const invalid = $derived(roleSelection !== 'manager' && roleSelection !== 'none' && !fixedRole
    && (!/^[a-z][a-z0-9-]{0,63}$/.test(draft.key) || !draft.name.trim() || !draft.description.trim()));

  function parseAction(input: unknown): IActionRow {
    const row = object(input);

    return {
      id: string(row.actionId),
      label: string(row.shortDescription),
      description: string(row.description),
      route: `${string(row.method)} ${string(row.route)}`,
      scope: string(row.scope),
      admission: string(row.admission),
      domains: Array.isArray(row.domains) ? row.domains.map(string) : [],
      effects: flags.map((flag) => row[flag] === true),
      allowedScopes: availableScopes(row.allowedObjectScopes),
    };
  }

  function strings(input: unknown): string[] {
    return Array.isArray(input) ? input.map(string) : [];
  }

  function availableScopes(input: unknown): Scope[] {
    return Array.isArray(input) ? scopeValues.filter((scope) => input.includes(scope)) : ['all'];
  }

  function parseGrants(ids: unknown, input: unknown): Grants {
    const map = input === undefined ? {} : object(input);

    return Object.fromEntries(strings(ids).map((id) => [id, availableScopes(map[id])]));
  }

  function scopeLabel(scope: Scope): string {
    if (scope === 'all') {
      return $messages.accessSettingsAll;
    }

    return scope === 'own' ? ($messages.accessSettingsOwn) : ($messages.accessSettingsGroups);
  }

  function domainLabel(domain: string): string {
    return domainNames[domain] ?? domain;
  }

  function selectTab(next: AccessTab): void {
    if (tabSwitchDisabled || next === tab) {
      return;
    }

    const refreshAccess = tab === 'users';

    feedback = null;

    if (groupMode !== (next === 'groups')) {
      groupMode = next === 'groups';
      selectRole(groupMode ? 'none' : 'manager');
    }
    tab = next;

    if (refreshAccess) {
      void load('read');
    }
  }

  function navigateTabs(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || tabSwitchDisabled) {
      return;
    }
    event.preventDefault();
    const offset = event.key === 'ArrowLeft' ? -1 : 1;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (tabs.findIndex((item) => item === tab) + offset + tabs.length) % tabs.length;
    const next = tabs[index]!;

    selectTab(next);
    document.getElementById(selectionId + '-tab-' + next)?.focus();
  }

  function toggleScope(action: IActionRow, domain: string, scope: Scope, checked: boolean,
    anchor: HTMLInputElement): void {
    const id = action.id;
    const labels = action.domains.filter((item) => item !== domain).map(domainLabel).join(', ');

    feedback = !labels ? null : {
      anchor,
      message: formatMessage(checked ? $messages.accessSettingsAlsoOnIn : $messages.accessSettingsAlsoOffIn,
        { domains: labels }),
    };
    const values = selected[id] ?? [];
    const next = checked ? (scope === 'all' ? ['all'] as const : [...values.filter((item) => item !== 'all'), scope])
      : values.filter((item) => item !== scope);

    if (next.length) {
      selected = { ...selected, [id]: next };
    } else {
      const remaining = { ...selected };

      delete remaining[id];
      selected = remaining;
    }
  }

  function parseRole(input: unknown, group = false): IRoleRow {
    const row = object(input);

    return {
      roleId: string(group ? row.groupId : row.roleId),
      key: string(row.key),
      name: string(row.name),
      description: string(row.description),
      actorIds: strings(row.actorIds),
      grants: parseGrants(row.actionIds, row.objectScopes),
      builtInGroup: row.builtIn === 'installation' || row.builtIn === 'site' ? row.builtIn : undefined,
      memberEmails: Array.isArray(row.members) ? row.members.map((member) => string(object(member).email)) : [],
    };
  }

  function selectRole(id: string): void {
    const role = (groupMode ? groups : roles).find((item) => item.roleId === id);

    feedback = null;
    roleSelection = role || id === 'new' || !groupMode && builtInRoles.some(({ roleId }) => roleId === id)
      ? id : groupMode ? 'none' : 'manager';
    draft = role
      ? { key: role.key, name: role.name, description: role.description, actorIds: [...role.actorIds] }
      : { key: '', name: '', description: '', actorIds: [] };
    saved = role?.grants ?? (roleSelection === 'manager' ? managerGrants : {});
    selected = { ...saved };
  }

  async function load(operation: 'read' | 'save' | 'remove'): Promise<void> {
    if (operation !== 'read' && fixedRole) {
      return;
    }
    if (operation !== 'read') {
      feedback = null;
    }
    busy = true;
    failed = false;
    onBusy(true);

    try {
      const id = roleSelection === 'new' ? null : roleSelection;
      const changes = operation === 'remove' ? { remove: true } : draft;
      const body = {
        revision,
        actionIds: groupMode || operation === 'remove' ? [] : Object.keys(selected),
        objectScopes: groupMode || operation === 'remove' ? {} : selected,
        ...(groupMode ? { group: { groupId: id, ...changes } } : roleSelection === 'manager' ? {}
          : { role: { roleId: id, ...changes } }),
      };
      const result = object(await request('/' + encodeURIComponent(siteId) + '/access',
        operation === 'read' ? undefined : body));

      if (!disposed) {
        revision = result.revision === null ? null : string(result.revision);
        actions = Array.isArray(result.actions) ? result.actions.map(parseAction) : [];
        delegable = strings(result.delegableActionIds);
        administratorActionIds = result.administratorActionIds ? object(result.administratorActionIds) : {};
        managerGrants = parseGrants(result.managerActionIds, result.managerObjectScopes);
        roles = Array.isArray(result.customRoles) ? result.customRoles.map((input) => parseRole(input)) : [];
        groups = Array.isArray(result.groups) ? result.groups.map((input) => parseRole(input, true))
          .filter((group) => systemAdmin || group.builtInGroup !== 'installation'
            && group.roleId !== 'cms.system.group.global') : [];
        actors = Array.isArray(result.siteActors) ? result.siteActors.map((input: unknown) => {
          const actor = object(input);

          return { id: string(actor.adminUserId), email: string(actor.email) };
        }) : [];
        const next = roleSelection === 'new'
          ? (groupMode ? groups : roles).find((role) => role.key === draft.key)?.roleId : roleSelection;

        selectRole(next ?? 'manager');
        removing = false;
        ready = true;
      }
    } catch (error) {
      if (!disposed && error instanceof ContentRequestError && error.status === 401) {
        onUnauthorized();
      } else if (!disposed) {
        failed = true;
      }
    } finally {
      if (!disposed) {
        busy = false;
        onBusy(false);
      }
    }
  }

  $effect(() => onDirtyChange(changed));
  onMount(() => {
    void load('read');

    return () => {
      disposed = true;
      onBusy(false);
      onDirtyChange(false);
    };
  });
</script>

<section class="_access">
  <div class="_tabs-bar">
    <div class="cms-tabs _tabs" role="tablist" aria-label={$messages.accessSettingsAccess}>
      {#each tabs as item (item)}
        <button class="cms-tab" type="button" role="tab" id={selectionId + '-tab-' + item}
          aria-selected={tab === item} aria-controls={selectionId + '-panel'}
          tabindex={tab === item ? 0 : -1} disabled={tab !== item && tabSwitchDisabled}
          onclick={() => selectTab(item)} onkeydown={navigateTabs}>{tabLabels[item]}</button>
      {/each}
    </div>
    {#if tab !== 'users'}
      <RefreshButton compact disabled={tabSwitchDisabled} onclick={() => void load('read')} />
    {/if}
  </div>
  <div id={selectionId + '-panel'} role="tabpanel" aria-labelledby={selectionId + '-tab-' + tab}>
  {#if tab !== 'users' && busy}<p role="status">{$messages.accessSettingsLoading}</p>{/if}
  {#if tab !== 'users' && failed}<p role="alert">{$messages.accessSettingsUnableToUpdateAccessRefresh}</p>{/if}
  {#if tab === 'users' && systemAdmin}
    <AdminUsersWorkspace {site} {timeZone} {onUnauthorized} onBusy={(value) => {
      accountsBusy = value;
      onBusy(value);
    }} />
  {:else if ready}
    {#if tab === 'create'}
      <AccessUserCreation {siteId} roles={roleOptions} {onUnauthorized} {onBusy}
        onCreated={() => load('read')} />
    {:else if !catalog}
      <div class="_actions _role-actions">
        <div class="_choice">
          <label for={selectionId}>{groupMode ? $messages.accessSettingsGroup : $messages.accessSettingsRole}</label>
          <select id={selectionId} value={roleSelection} disabled={busy || changed}
            onchange={(event) => selectRole(event.currentTarget.value)}>
            {#if groupMode}
              <option value="none">{$messages.accessSettingsSelectAGroup}</option>
            {:else}
              <option value="manager">Manager</option>
              {#each builtInRoles as role (role.roleId)}
                <option value={role.roleId}>{role.name}</option>
              {/each}
            {/if}
            {#each items as role (role.roleId)}<option value={role.roleId}>{role.name}</option>{/each}
            <option value="new">{groupMode ? ($messages.accessSettingsNewGroup)
              : ($messages.accessSettingsNewRole)}</option>
          </select>
        </div>
        {#if changed}
          <button type="button" class="cms-secondary" disabled={busy}
            onclick={() => selectRole(roleSelection === 'new' ? '' : roleSelection)}>
            {$messages.accessSettingsDiscardChanges}</button>
        {/if}
        {#if currentRole && !fixedGroup}
          <button type="button" class="cms-secondary" disabled={busy || changed} onclick={() => {
            removing = true;
          }}>
            {groupMode ? ($messages.accessSettingsArchiveGroup) : ($messages.accessSettingsDeleteRole)}
          </button>
        {/if}
        {#if !fixedRole && !fixedGroup}
          <button type="button" class="cms-primary" disabled={busy || !changed || invalid}
            onclick={() => void load('save')}>{$messages.accessSettingsSave}</button>
        {/if}
      </div>
      {#if fixedRole}
        <p>{$messages.accessSettingsBuiltInRolePermissionsAre}</p>
      {:else if fixedGroup && currentRole}
        <p>{fixedGroup === 'installation' ? $messages.accessSettingsGlobalGroup : $messages.accessSettingsSiteGroup}</p>
        {#if currentRole.memberEmails.length}
          <ul>
            {#each currentRole.memberEmails as email (email)}<li>{email}</li>{/each}
          </ul>
        {:else}
          <p>{$messages.accessSettingsNoGroupMembers}</p>
        {/if}
      {:else if roleSelection !== 'manager' && roleSelection !== 'none'}
        <div class="_role">
          <label>{$messages.accessSettingsKey}<input bind:value={draft.key} maxlength="64" disabled={busy} /></label>
          <label>{$messages.accessSettingsName}<input bind:value={draft.name} maxlength="160" disabled={busy} /></label>
          <label>{$messages.tvDescription}<textarea bind:value={draft.description} maxlength="8192"
            disabled={busy}></textarea></label>
          {#if actors.length}
            <fieldset class="cms-fieldset">
              <legend>{$messages.accessSettingsSiteMembers}</legend>
              {#each actors as actor (actor.id)}
                <Checkbox checked={draft.actorIds.includes(actor.id)} disabled={busy} onCheckedChange={(checked) => {
                  draft.actorIds = checked ? [...draft.actorIds, actor.id]
                    : draft.actorIds.filter((id) => id !== actor.id);
                }}>{actor.email}</Checkbox>
              {/each}
            </fieldset>
          {/if}
        </div>
      {/if}
      {#if groupMode && currentRole && !fixedGroup}
        {#key currentRole.roleId}
          <ContentGroupAssignment {siteId} groupId={currentRole.roleId} disabled={busy || changed}
            {onUnauthorized} />
        {/key}
      {/if}
    {/if}
    {#if catalog || tab === 'roles'}
      <div class="cms-table-wrap">
        <table class="cms-table">
          <thead>
            <tr>
              <th scope="col">{$messages.accessSettingsAction}</th>
              {#if catalog}
                <th scope="col">{$messages.accessSettingsDomains}</th>
                {#each headings as heading (heading)}<th scope="col">{heading}</th>{/each}
              {:else}
                {#each scopeValues as scope (scope)}<th scope="col">{scopeLabel(scope)}</th>{/each}
              {/if}
            </tr>
          </thead>
          {#if catalog}
            <tbody>
              {#each actions as action (action.id)}
                <tr>
                  <td><strong>{action.label}</strong><br /><code>{action.route}</code>
                    <br /><span>{action.description}</span></td>
                  <td>{action.domains.map(domainLabel).join(', ')}</td>
                  {#each action.effects as effect, index (headings[index])}
                    <td aria-label={`${headings[index]} ${effect ? '✓' : '—'}`}>{effect ? '✓' : '—'}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          {:else}
            {#each domainGroups as [domain, rows] (domain)}
              <tbody aria-label={domainLabel(domain)}>
                <tr><th class="_domain-title" scope="rowgroup" colspan="4">{domainLabel(domain)}</th></tr>
                {#each rows as action (action.id)}
                  <tr>
                    <td><strong>{action.label}</strong><br /><code>{action.route}</code>
                      {#if !fixedRole && !groupMode && selected[action.id]?.length}
                        {#if domain === 'cms.files' && action.id === 'cms.files.move'}
                          <div class="_permission-hint">{$messages.fileMoveRoleEffect}</div>
                        {/if}
                        {#if action.id === 'cms.pages.update' && !selected['cms.pages.read']?.length}
                          <div class="_permission-hint">{$messages.accessSettingsPageReadHint}</div>
                        {:else if action.id === 'cms.pages.update' && !selected['cms.publication.page-options']?.length}
                          <div class="_permission-hint">{$messages.accessSettingsPagePublicationOptionsHint}</div>
                        {:else if action.id === 'cms.pages.set-position' && !selected['cms.pages.list']?.length}
                          <div class="_permission-hint">{$messages.accessSettingsPagePositionListHint}</div>
                        {:else if hasScopedPages
                          && (action.id === 'cms.publication.site-options' && domain === 'cms.publication'
                            || action.id === 'cms.urls.list' && domain === 'cms.urls')}
                          <div class="_permission-hint">{$messages.accessSettingsSiteMetadataHint}</div>
                        {:else if domain === 'cms.pages' && pageOutputActions.has(action.id)
                          && !selected['cms.pages.read']?.length}
                          <div class="_permission-hint">{$messages.accessSettingsPageOutputReadHint}</div>
                        {:else if action.id === 'cms.files.upload' && !selected['cms.files.list']?.length}
                          <div class="_permission-hint">{$messages.filesUploadNeedsList}</div>
                        {:else if action.id === 'cms.files.create-folder' && !selected['cms.files.list']?.length}
                          <div class="_permission-hint">{$messages.filesFolderNeedsList}</div>
                        {:else if domain === 'cms.files' && !selected['cms.files.usages']?.length
                          && (action.id === 'cms.files.move' || action.id === 'cms.files.delete')}
                          <div class="_permission-hint">{action.id === 'cms.files.move'
                            ? $messages.fileMoveNeedsUsages : $messages.fileDeleteNeedsUsages}</div>
                        {:else if action.id === 'cms.hooks.create-handler'
                          && !selected['cms.hooks.save-subscription']?.length}
                          <div class="_permission-hint">{$messages.hooksCreateNeedsSubscription}</div>
                        {/if}
                      {/if}
                    </td>
                    {#each scopeValues as scope (scope)}
                      <td class="_scope-cell">
                        {#if fixedRole}{scope === 'all' ? '✓' : '—'}
                        {:else if action.allowedScopes.includes(scope)}
                          <Checkbox checked={selected[action.id]?.includes(scope) ?? false} disabled={busy}
                            onCheckedChange={(checked, anchor) => toggleScope(action, domain, scope, checked, anchor)}>
                            <span class="_visually-hidden">
                              {action.label} · {scopeLabel(scope)} · {domainLabel(domain)}
                            </span>
                          </Checkbox>
                        {:else}—{/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            {/each}
          {/if}
        </table>
      </div>
    {/if}
  {/if}
  </div>
  {#if feedback}
    {#key feedback}<FeedbackTooltip anchor={feedback.anchor} message={feedback.message} />{/key}
  {/if}
</section>

<CmsDialog open={removing} title={groupMode ? ($messages.accessSettingsArchiveGroup)
  : ($messages.accessSettingsDeleteRole)} {busy} onClose={() => {
    removing = false;
  }}>
  <p>{groupMode ? ($messages.accessSettingsThisWillRemoveAllMemberships)
    : ($messages.accessSettingsThisWillRemoveTheRole)}</p>
  {#if failed}<p role="alert">{$messages.accessSettingsUnableToSaveTheChanges}</p>{/if}
  <div class="_actions">
    <button type="button" class="cms-secondary" disabled={busy} onclick={() => {
      removing = false;
    }}>
      {$messages.cancel}</button>
    <button type="button" class="cms-primary" disabled={busy} onclick={() => void load('remove')}>
      {groupMode ? ($messages.accessSettingsArchive) : ($messages.accessSettingsDelete)}</button>
  </div>
</CmsDialog>

<style>
  ._access { padding-bottom: 16px; }
  ._actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
  ._tabs-bar { display: flex; align-items: flex-start; gap: 8px; border-bottom: 1px solid var(--cms-border);
    margin-bottom: 16px; }
  ._tabs-bar :global(.cms-icon-button) { flex-shrink: 0; margin: 2px 0 6px auto; }
  ._tabs { min-width: 0; border: 0; }
  ._tabs :global(.cms-tab) { white-space: nowrap; }
  ._role-actions { align-items: flex-end; }
  ._choice { display: grid; gap: 8px; min-width: 0; }
  ._choice select { min-width: 0; }

  @media (min-width: 576px) {
    ._role-actions { align-items: center; }
    ._choice { grid-template-columns: auto minmax(0, 1fr); align-items: center; }
  }
  ._domain-title { text-align: left; background: var(--cms-section-surface); }
  ._scope-cell { width: 75px; }
  ._permission-hint { margin-top: 4px; color: var(--cms-muted); }
  ._role { display: grid; gap: 12px; max-width: 560px; margin-bottom: 16px; }
  ._role label, ._role fieldset { display: grid; gap: 4px; }
  ._role input, ._role textarea, ._actions select { font: inherit; min-height: 44px; }
  code { overflow-wrap: anywhere; }
</style>
