<script lang="ts">
  import { Label } from 'bits-ui';

  import { messages } from '../../i18n/i18n';
  import type { IAdminSite } from '../../shared/api/content.types';
  import { contentError, ContentErrorMessage, ContentRequestError, createSite } from '../../shared/api/content-api';
  import { SiteOriginMode } from '../urls/urls.types';
  import { developmentOrigin } from './site-creation-address';
  import { clearSiteCreationDraft, readSiteCreationDraft, writeSiteCreationDraft } from './site-creation-draft';

  let { onCreated, onUnauthorized, onCancel, onBusy, first = false }: {
    onCreated: (site: IAdminSite) => void;
    onUnauthorized: () => void;
    onCancel: () => void;
    onBusy: (value: boolean) => void;
    first?: boolean;
  } = $props();
  const draft = readSiteCreationDraft();
  let name = $state(draft?.name ?? '');
  let mark = $state(draft?.mark ?? '');
  let domain = $state(draft?.domain ?? '');
  let localAddress = $state(draft?.localAddress ?? 'http://localhost:3000/');
  let originMode = $state<SiteOriginMode | null>(draft?.originMode ?? null);
  let localAddressError = $state(false);
  let localAddressInUse = $state(false);
  const localPreview = $derived.by(() => {
    try {
      return developmentOrigin(localAddress);
    } catch {
      return '';
    }
  });
  const publicPreview = $derived(domain.trim() ? 'https://' + domain.trim().toLowerCase() : '');
  let language = $state(draft?.language ?? '');
  let pending = $state(false);
  let error = $state<ContentErrorMessage | null>(null);

  function saveDraft(): void {
    writeSiteCreationDraft({ name, mark, domain, localAddress, originMode, language });
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }
    localAddressError = false;
    localAddressInUse = false;

    if (!originMode) {
      error = ContentErrorMessage.Invalid;

      return;
    }

    try {
      developmentOrigin(localAddress);
    } catch {
      localAddressError = true;

      return;
    }
    pending = true;
    onBusy(true);
    error = null;

    try {
      const site = await createSite({
        name,
        mark,
        primaryDomain: domain,
        languages: [language],
        defaultLanguage: language,
        onboarding: { localAddress, originMode },
      });

      clearSiteCreationDraft();
      onCreated(site);
    } catch (failure) {
      if (failure instanceof ContentRequestError && failure.status === 401) {
        onUnauthorized();
      } else if (
        failure instanceof ContentRequestError
        && failure.status === 409
        && failure.field === 'onboarding.localAddress'
      ) {
        localAddressInUse = true;
      } else {
        error = contentError(failure);
      }
    } finally {
      pending = false;
      onBusy(false);
    }
  }
</script>

<section class="site-creation" aria-labelledby="site-create-title">
  <span class="_setup-kicker">{first ? $messages.firstSiteKicker : $messages.newProject}</span>
  <h1 id="site-create-title">{first ? $messages.firstSiteTitle : $messages.newSite}</h1>
  <p class="_setup-description">{$messages.siteIntro}</p>
  <form class="cms-form" onsubmit={submit} oninput={saveDraft} onchange={saveDraft} aria-busy={pending}>
    <div class="_form-field">
      <Label.Root for="site-name">{$messages.siteName}</Label.Root>
      <input id="site-name" bind:value={name} required disabled={pending} placeholder={$messages.projectName} />
    </div>
    <div class="_form-field">
      <Label.Root for="site-domain">{$messages.primaryDomain}</Label.Root>
      <input id="site-domain" bind:value={domain} required disabled={pending} placeholder="example.com"
        autocapitalize="none" spellcheck="false" aria-describedby="domain-hint" />
      <small id="domain-hint">{$messages.domainHint}</small>
    </div>
    <div class="_form-field">
      <Label.Root for="site-local-address">{$messages.siteLocalAddress}</Label.Root>
      <input id="site-local-address" bind:value={localAddress} required disabled={pending}
        placeholder="http://localhost:3000/" inputmode="url" autocapitalize="none" spellcheck="false"
        oninput={() => {
          localAddressError = false;
          localAddressInUse = false;
        }}
        aria-invalid={localAddressError || localAddressInUse}
        aria-describedby={localAddressError || localAddressInUse
          ? 'site-local-hint site-local-error' : 'site-local-hint'} />
      <small id="site-local-hint">{$messages.siteLocalAddressHint}</small>
      {#if localAddressError || localAddressInUse}
        <p id="site-local-error" class="cms-error" role="alert">
          {localAddressInUse ? $messages.siteLocalAddressInUse : $messages.siteLocalAddressInvalid}
        </p>
      {/if}
    </div>
    <fieldset class="_url-fieldset _site-origin-choice" disabled={pending} aria-describedby="site-origin-hint">
      <legend>{$messages.siteOriginChoice}</legend>
      <div class="_site-origin-options">
        <label class="_url-check"><input id="site-origin-local" type="radio" bind:group={originMode}
          value={SiteOriginMode.Local} required /><span>{$messages.siteUseLocal}
            {localPreview ? '(' + localPreview + ')' : ''}</span></label>
        <label class="_url-check"><input id="site-origin-public" type="radio" bind:group={originMode}
          value={SiteOriginMode.Public} required /><span>{$messages.siteUsePublic}
            {publicPreview ? '(' + publicPreview + ')' : ''}</span></label>
      </div>
      <small id="site-origin-hint">{$messages.siteOriginChoiceHint}</small>
    </fieldset>
    <div class="_form-row">
      <div class="_form-field">
        <Label.Root for="site-mark">{$messages.siteKey}</Label.Root>
        <input id="site-mark" bind:value={mark} required disabled={pending} pattern="[A-Za-z][A-Za-z0-9]*"
          placeholder="MySite" autocapitalize="none" spellcheck="false" aria-describedby="mark-hint" />
        <small id="mark-hint">{$messages.markHint}</small>
      </div>
      <div class="_form-field">
        <Label.Root for="site-language">{$messages.siteLanguage}</Label.Root>
        <input id="site-language" bind:value={language} required disabled={pending} pattern={'[a-z]{2}'}
          minlength="2" maxlength="2" autocapitalize="none" spellcheck="false" aria-describedby="language-hint" />
        <small id="language-hint">{$messages.languageHint}</small>
      </div>
    </div>
    <div class="_form-notice" aria-live="polite">{#if error}<p role="alert">
      {error === ContentErrorMessage.Invalid ? $messages.siteCreationInvalid : $messages[error]}</p>{/if}</div>
    <div class="_form-actions">
      <button class="cms-primary" type="submit" disabled={pending}>
        {pending ? $messages.creating : $messages.createSite}
      </button>
      {#if !first}
        <button class="cms-secondary" type="button" onclick={onCancel} disabled={pending}>{$messages.cancel}</button>
      {/if}
    </div>
  </form>
</section>
