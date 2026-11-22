<script lang="ts">
  import { onMount } from 'svelte';

  import { adminLanguage, type AdminMessageKey, messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import CmsDialog from '../../shared/ui/CmsDialog.svelte';
  import PasswordInput from '../../shared/ui/PasswordInput.svelte';
  import RefreshButton from '../../shared/ui/RefreshButton.svelte';
  import { AdminUserAction as Action, type IAdminUser } from './admin-users.types';
  import { changeAdminUser, createAdminUser, listAdminUsers } from './admin-users-api';
  import AdminUserActionIcon from './AdminUserActionIcon.svelte';

  let { site, timeZone, onUnauthorized, onBusy }: {
    site: { siteId: string; name: string };
    timeZone: string;
    onUnauthorized: () => void;
    onBusy: (busy: boolean) => void;
  } = $props();
  const id = $props.id();
  let users = $state<IAdminUser[]>([]);
  let currentId = $state('');
  let cursor = $state<string | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<AdminMessageKey | ''>('');
  let notice = $state<AdminMessageKey | ''>('');
  let action = $state<Action | null>(null);
  let target = $state<IAdminUser | null>(null);
  let email = $state('');
  let roleId = $state('cms.system.admin');
  let password = $state('');
  let dialogError = $state<AdminMessageKey | ''>('');
  const needsPassword = $derived(action === Action.Create || action === Action.Password);
  const title = $derived(action === Action.Create ? $messages.adminUsersCreateAdministrator
    : action === Action.Password ? $messages.adminUsersChangePassword2
      : action === Action.Delete ? $messages.adminUsersDeleteAdministrator
        : action === Action.Block ? $messages.adminUsersBlockAdministrator
          : $messages.adminUsersUnblockAdministrator);

  function failure(value: unknown): AdminMessageKey | '' {
    if (value instanceof ContentRequestError) {
      if (value.status === 401) {
        onUnauthorized();

        return '';
      }
      if (value.code === 'LastAdministrator') {
        return 'adminUsersTheLastActiveAdministratorCannot';
      }
      if (value.code === 'StaleWrite' || value.code === 'NotFound') {
        return 'adminUsersTheAccountChangedOrWas';
      }
      if (value.code === 'Conflict') {
        return 'adminUsersAnAdministratorWithThisEmail';
      }
      if (value.status === 400) {
        return 'adminUsersCheckTheEmailAndPassword';
      }
      if (value.status === 403) {
        return 'adminUsersThisActionIsUnavailableFor';
      }
      if (value.status === 429) {
        return 'adminUsersOtherChangesAreInProgress';
      }
    }

    return 'adminUsersTheResultCouldNotBe';
  }

  async function load(more = false): Promise<void> {
    if (loading || busy) {
      return;
    }
    loading = true;
    error = '';

    try {
      const result = await listAdminUsers(more ? cursor : null);

      users = more ? [...users, ...result.items.filter((item) => !users.some(
        (existing) => existing.adminUserId === item.adminUserId,
      ))] : [...result.items];
      currentId = result.currentAdminUserId;
      cursor = result.nextCursor;
    } catch (value) {
      error = failure(value);
    } finally {
      loading = false;
    }
  }

  function close(): void {
    if (busy) {
      return;
    }
    action = null;
    target = null;
    password = '';
    email = '';
    dialogError = '';
  }

  function open(next: Action, user: IAdminUser | null = null): void {
    if (busy || next === Action.Block && user?.adminUserId === currentId) {
      return;
    }
    target = user;
    password = '';
    email = '';
    roleId = 'cms.system.admin';
    dialogError = '';
    notice = '';
    action = next;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!action || busy) {
      return;
    }
    if (needsPassword && (Array.from(password).length < 15 || Array.from(password).length > 1024)) {
      dialogError = 'accessUserCreationThePasswordMustContainTo';

      return;
    }
    busy = true;
    onBusy(true);
    dialogError = '';

    try {
      if (action === Action.Create) {
        const created = await createAdminUser(email, password, {
          roleId, siteId: roleId === 'cms.system.admin' ? null : site.siteId,
        });

        users = [...users, created];
      } else if (target) {
        const result = await changeAdminUser(action, target, password);

        if (result.currentSessionInvalidated) {
          password = '';
          action = null;
          onUnauthorized();

          return;
        }
        users = action === Action.Delete ? users.filter((user) => user.adminUserId !== target!.adminUserId)
          : users.map((user) => user.adminUserId === target!.adminUserId ? result.user! : user);
      }
      busy = false;
      close();
      notice = 'adminUsersChangesSaved';
    } catch (value) {
      dialogError = failure(value);
    } finally {
      busy = false;
      onBusy(false);
    }
  }

  function date(value: string): string {
    return new Intl.DateTimeFormat($adminLanguage, {
      dateStyle: 'medium', timeStyle: 'short', timeZone,
    }).format(new Date(value));
  }

  onMount(() => {
    void load();
  });
</script>

<section class="admin-users-workspace" aria-label={$messages.adminUsersInstallationAccounts}>
  <div class="_table-toolbar">
    <p class="_table-intro">{$messages.adminUsersInstallationAccounts}</p>
    <div class="_table-toolbar-actions">
      <RefreshButton disabled={busy || loading} onclick={() => {
        void load();
      }} />
      <button class="cms-primary cms-icon-button" type="button" disabled={busy || loading}
        onclick={() => open(Action.Create)}>
        <AdminUserActionIcon action={Action.Create} />{$messages.adminUsersCreateAdministrator}
      </button>
    </div>
  </div>
  {#if error}<p class="cms-error" role="alert">{$messages[error]}</p>{/if}
  {#if notice}<p class="cms-success" role="status">{$messages[notice]}</p>{/if}
  {#if loading}<p class="cms-loading" role="status">{$messages.accessSettingsLoading}</p>{/if}
  <div class="cms-table-wrap" aria-busy={loading || busy}>
    <!-- svelte-ignore a11y_no_redundant_roles (Mobile grid display needs explicit table semantics.) -->
    <table class="cms-table cms-table__responsive" role="table">
      <caption class="_visually-hidden">{$messages.adminUsersInstallationAccounts}</caption>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Email</th>
        <th scope="col" role="columnheader">{$messages.adminUsersStatus}</th>
        <th scope="col" role="columnheader">{$messages.adminUsersCreated}</th>
        <th scope="col" role="columnheader">{$messages.password}</th>
        <th scope="col" role="columnheader">{$messages.accessSettingsAccess}</th>
        <th scope="col" role="columnheader">{$messages.accessSettingsDelete}</th>
      </tr></thead>
      <tbody role="rowgroup">
        {#each users as user (user.adminUserId)}
          <tr role="row" class:cms-table-current={user.adminUserId === currentId}
            aria-label={user.email + (user.adminUserId === currentId ? $messages.adminUsersYou : '')}>
            <td role="cell" data-label="Email" class="cms-table-primary">
              <span class="_table-email">{user.email}</span>
              {#if user.adminUserId === currentId}
                <span class="cms-badge cms-badge__current">{$messages.adminUsersYou2}</span>
              {/if}
            </td>
            <td role="cell" data-label={$messages.adminUsersStatus} class="cms-table-meta">
              <span class="cms-status" class:cms-status__blocked={user.blocked}>
                <span aria-hidden="true" class="_status-dot"></span>
                {user.blocked ? $messages.adminUsersBlocked : $messages.adminUsersActive}
              </span>
            </td>
            <td role="cell" data-label={$messages.adminUsersCreated} class="cms-table-meta cms-table-meta__wide">
              <time datetime={user.createdAt}>{date(user.createdAt)}</time>
            </td>
            <td role="cell" data-label={$messages.password} class="cms-table-action">
              <button class="cms-secondary cms-action-square" type="button" disabled={busy}
                aria-label={$messages.adminUsersChangePassword + user.email}
                title={$messages.adminUsersChangePassword2} onclick={() => open(Action.Password, user)}>
                <AdminUserActionIcon action={Action.Password} />
              </button>
            </td>
            <td role="cell" data-label={$messages.accessSettingsAccess} class="cms-table-action">
              <button class="cms-action-square" class:cms-warning={!user.blocked} class:cms-primary={user.blocked}
                type="button" disabled={busy || user.adminUserId === currentId}
                aria-label={(user.blocked ? $messages.adminUsersUnblock
                  : $messages.adminUsersBlock) + user.email}
                title={user.adminUserId === currentId ? $messages.adminUsersYouCannotBlockYourself
                  : user.blocked ? $messages.adminUsersUnblock2 : $messages.adminUsersBlock2}
                onclick={() => open(user.blocked ? Action.Unblock : Action.Block, user)}>
                <AdminUserActionIcon action={user.blocked ? Action.Unblock : Action.Block} />
              </button>
            </td>
            <td role="cell" data-label={$messages.accessSettingsDelete} class="cms-table-action">
              <button class="cms-danger cms-action-square" type="button" disabled={busy}
                aria-label={$messages.adminUsersDelete + user.email}
                title={$messages.adminUsersDeleteAdministrator} onclick={() => open(Action.Delete, user)}>
                <AdminUserActionIcon action={Action.Delete} />
              </button>
            </td>
          </tr>
        {:else}
          <tr role="row"><td role="cell" colspan="6" class="cms-table-empty">
            {loading ? $messages.adminUsersLoadingAdministrators
              : $messages.adminUsersNoAdministratorsFound}
          </td></tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if cursor}
    <button class="cms-secondary _table-more" type="button" disabled={loading || busy} onclick={() => {
      void load(true);
    }}>{$messages.adminUsersLoadMore}</button>
  {/if}
</section>

<CmsDialog open={action !== null} {title} {busy} onClose={close}>
  <form onsubmit={submit} oninput={() => {
    dialogError = '';
  }}>
    {#if action === Action.Create}
      <label class="_form-field" for={id + '-email'}>Email
        <input id={id + '-email'} name="email" type="email" autocomplete="off" required
          bind:value={email} disabled={busy} />
      </label>
      <label class="_form-field" for={id + '-role'}>{$messages.accessSettingsRole}
        <select id={id + '-role'} bind:value={roleId} disabled={busy}>
          <option value="cms.system.admin">SystemAdmin</option>
          <option value="cms.system.site-admin">SiteAdmin</option>
          <option value="cms.system.manager">Manager</option>
        </select>
        {#if roleId !== 'cms.system.admin'}<small>{$messages.adminUsersSite} — {site.name}</small>{/if}
      </label>
    {:else if target}
      {#if action === Action.Password}
        <p class="_dialog-description">{$messages.adminUsersNewPasswordFor}
          <strong>{target.email}</strong>.</p>
      {:else}
        <p class="_dialog-description">
          {action === Action.Delete ? $messages.adminUsersDoYouWantToDelete
            : action === Action.Block ? $messages.adminUsersDoYouWantToBlock
              : $messages.adminUsersDoYouWantToUnblock}
          <strong>{target.email}</strong>?
        </p>
      {/if}
      {#if action === Action.Delete}
        <p class="_dialog-hint">{$messages.adminUsersThisAccountWillLoseAccess}</p>
      {/if}
    {/if}
    {#if needsPassword}
      <div class="_form-field">
        <label for={id + '-password'}>{$messages.adminUsersNewPassword}</label>
        {#key action}
          <PasswordInput id={id + '-password'} descriptionId={id + '-password-hint'}
            bind:value={password} disabled={busy} />
        {/key}
        <small id={id + '-password-hint'}>{$messages.accessUserCreationToCharactersSpacesArePreserved}</small>
      </div>
    {/if}
    {#if target?.adminUserId === currentId && action === Action.Password}
      <p class="_dialog-hint">{$messages.adminUsersAfterChangingYourPasswordSign}</p>
    {/if}
    {#if dialogError}<p class="cms-error" role="alert">{$messages[dialogError]}</p>{/if}
    <div class="_dialog-actions">
      <button class="cms-secondary" type="button" disabled={busy} onclick={close}>{$messages.cancel}</button>
      <button type="submit" disabled={busy}
        class={action === Action.Delete ? 'cms-danger' : action === Action.Block ? 'cms-warning' : 'cms-primary'}>
        {busy ? $messages.adminUsersSaving
          : action === Action.Create ? $messages.adminUsersCreate
            : action === Action.Password ? $messages.adminUsersChangePassword2
              : $messages.adminUsersConfirm}
      </button>
    </div>
  </form>
</CmsDialog>

<style>
  .cms-action-square { width: 44px; height: 44px; min-height: 44px; }
</style>
