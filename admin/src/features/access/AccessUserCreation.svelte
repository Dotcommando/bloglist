<script lang="ts">
  import { type AdminMessageKey, messages } from '../../i18n/i18n';
  import { ContentRequestError } from '../../shared/api/content-api';
  import PasswordInput from '../../shared/ui/PasswordInput.svelte';
  import { showSnackBar, SnackBarVariant } from '../../shared/ui/snack-bar';
  import { createAdminUser } from '../accounts/admin-users-api';

  let { siteId, roles, onUnauthorized, onBusy, onCreated }: {
    siteId: string;
    roles: readonly { roleId: string; name: string }[];
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    onCreated: () => Promise<void>;
  } = $props();
  const id = $props.id();
  let roleId = $state('cms.system.manager');
  let email = $state('');
  let password = $state('');
  let pending = $state(false);
  let failure = $state<AdminMessageKey | ''>('');

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }

    const passwordLength = Array.from(password).length;

    if (passwordLength < 15 || passwordLength > 1024) {
      failure = 'accessUserCreationThePasswordMustContainTo';

      return;
    }
    pending = true;
    failure = '';
    onBusy(true);

    try {
      await createAdminUser(email.trim(), password, {
        roleId,
        siteId: roleId === 'cms.system.admin' ? null : siteId,
      });
      email = '';
      showSnackBar($messages.accessUserCreationUserCreated, SnackBarVariant.Success, 2000);
      await onCreated();
    } catch (error) {
      if (error instanceof ContentRequestError && error.status === 401) {
        onUnauthorized();
      } else if (error instanceof ContentRequestError && error.status === 409) {
        failure = 'accessUserCreationCheckWhetherThisEmailIs';
      } else if (error instanceof ContentRequestError && error.status === 400) {
        failure = 'accessUserCreationCheckTheEmailPasswordAnd';
      } else {
        failure = 'accessUserCreationCreationCouldNotBeConfirmed';
      }
    } finally {
      password = '';
      pending = false;
      onBusy(false);
    }
  }
</script>

<form class="cms-form _create-user" onsubmit={submit} aria-busy={pending}>
  <div class="_create-user-fields">
    <div class="_form-field">
      <label for={id + '-role'}>{$messages.accessSettingsRole}</label>
      <select id={id + '-role'} bind:value={roleId} disabled={pending} required>
        {#each roles as role (role.roleId)}<option value={role.roleId}>{role.name}</option>{/each}
      </select>
    </div>
    <div class="_form-field">
      <label for={id + '-email'}>Email</label>
      <input id={id + '-email'} type="email" autocomplete="off" maxlength="254"
        bind:value={email} disabled={pending} required />
    </div>
    <div class="_form-field">
      <label for={id + '-password'}>{$messages.password}</label>
      <PasswordInput id={id + '-password'} descriptionId={id + '-password-hint'}
        bind:value={password} disabled={pending} />
      <small id={id + '-password-hint'}>{$messages.accessUserCreationToCharactersSpacesArePreserved}</small>
    </div>
  </div>
  {#if failure}<p class="cms-error" role="alert">{$messages[failure]}</p>{/if}
  <button type="submit" class="cms-primary" disabled={pending}>{pending ? $messages.saving
    : $messages.accessSettingsCreateUser}</button>
</form>

<style>
  ._create-user { max-width: 760px; }
  ._create-user-fields { display: grid; gap: 12px; }
  @media (min-width: 768px) { ._create-user-fields { grid-template-columns: 1fr 1fr; } }
</style>
