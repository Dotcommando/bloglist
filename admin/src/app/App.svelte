<script lang="ts">
  import { Label } from 'bits-ui';
  import { onMount } from 'svelte';

  import { startCpuTelemetry } from '../features/cpu/cpu-telemetry';
  import { adminLanguage, formatMessage, messages } from '../i18n/i18n';
  import LanguageSelect from '../i18n/LanguageSelect.svelte';
  import SnackBar from '../shared/ui/SnackBar.svelte';
  import { AdminRouteKind, navigateAdmin, parseAdminRoute, syncAdminRoute } from './admin-route';
  import type AdminWorkspace from './AdminWorkspace.svelte';
  import { AuthOperation, authRequest, AuthRequestError, type IAdminAuthorization } from './auth';
  import { AuthView as View } from './auth-view.state';

  let Workspace = $state<typeof AdminWorkspace | null>(null);
  let workspaceLoadFailed = false;
  let view = $state(View.Checking);
  let authority = $state<IAdminAuthorization>({ systemAdmin: false, siteAdminSiteIds: [] });
  let email = $state('');
  let password = $state('');
  let visible = $state(false);
  let pending = $state(false);
  let error = $state<401 | 429 | 0 | null>(null);
  let retryMinutes = $state(0);

  let returnPath: string | null = null;
  let checking = false;
  let generation = 0;
  let sessionCheck: AbortController | null = null;
  let sessionUnavailable = $state(false);
  let sessionRetry: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (view === View.Ready && authority.systemAdmin) {
      return startCpuTelemetry();
    }
  });

  $effect(() => {
    document.documentElement.lang = $adminLanguage;
  });

  function navigate(next: View): void {
    const path = window.location.pathname + window.location.search;

    if (next === View.Login) {
      sessionUnavailable = false;
      clearTimeout(sessionRetry);

      if (parseAdminRoute(path).kind !== AdminRouteKind.Login) {
        returnPath = path;
      }
      navigateAdmin('/admin/login', true);
    } else if (window.location.pathname === '/admin/login') {
      navigateAdmin(returnPath ?? '/admin/', true);
      returnPath = null;
    }
    view = next;
  }

  async function openWorkspace(captured: number): Promise<void> {
    if (!Workspace) {
      view = View.Checking;
    }

    try {
      const component = Workspace ?? (await import('./AdminWorkspace.svelte')).default;

      if (captured === generation) {
        Workspace = component;
        workspaceLoadFailed = false;
        navigate(View.Ready);
      }
    } catch {
      if (captured === generation) {
        workspaceLoadFailed = true;
        view = View.Unavailable;
      }
    }
  }

  async function checkSession(): Promise<void> {
    if (checking || pending) {
      return;
    }
    checking = true;
    clearTimeout(sessionRetry);
    sessionCheck = new AbortController();
    const captured = generation;

    try {
      const current = await authRequest(AuthOperation.Current, undefined, sessionCheck.signal);

      if (captured === generation) {
        if (current) {
          authority = current;
        }
        sessionUnavailable = false;
        await openWorkspace(captured);
      }
    } catch (failure) {
      if (captured !== generation) {
        return;
      }
      if (failure instanceof AuthRequestError && failure.status === 401) {
        navigate(View.Login);
      } else if (view === View.Ready) {
        sessionUnavailable = true;
        sessionRetry = setTimeout(() => void checkSession(), 5000);
      } else {
        view = View.Unavailable;
      }
    } finally {
      checking = false;
    }
  }

  async function login(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }
    pending = true;
    generation++;
    sessionCheck?.abort();
    error = null;

    try {
      const current = await authRequest(AuthOperation.Login, { email, password });

      if (current) {
        authority = current;
      }
      password = '';
      await openWorkspace(generation);
    } catch (failure) {
      if (failure instanceof AuthRequestError && failure.status === 401) {
        error = 401;
      } else if (failure instanceof AuthRequestError && failure.status === 429) {
        retryMinutes = Math.ceil((failure.retryAfter ?? 900) / 60);
        error = 429;
      } else {
        error = 0;
      }
    } finally {
      pending = false;
    }
  }

  onMount(() => {
    void checkSession();
    const refresh = (): void => {
      if (document.visibilityState === 'visible') {
        void checkSession();
      }
    };
    const navigateHistory = (): void => {
      syncAdminRoute();
      void checkSession();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('popstate', navigateHistory);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      generation++;
      clearTimeout(sessionRetry);
      sessionCheck?.abort();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('popstate', navigateHistory);
      document.removeEventListener('visibilitychange', refresh);
    };
  });
</script>

<svelte:head>
  <title>{view === View.Ready ? $messages.adminTitle : $messages.loginTitle}</title>
</svelte:head>

<SnackBar />

{#if view === View.Ready && Workspace}
  {#if sessionUnavailable}
    <div class="_session-warning" data-session-unavailable role="status">
      <span>{$messages.sessionUnavailable}</span>
      <button type="button" class="cms-secondary" onclick={() => void checkSession()}>{$messages.retry}</button>
    </div>
  {/if}
  <Workspace {authority} onUnauthorized={() => {
    generation++;
    navigate(View.Login);
  }} />
{:else}
  <div class="auth-shell">
    <header class="auth-header">
      <div class="_brand" aria-label="Zarya CMS">
        <svg class="_symbol" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M4 29h32M9 24a11 11 0 0 1 22 0M20 3v6M5 9l5 5M35 9l-5 5M1 21h5M34 21h5" />
        </svg>
        <span>ZARYA<span class="_brand-caption">CMS</span></span>
      </div>
      <LanguageSelect />
    </header>
    <main class="auth-main">
      {#if view === View.Checking}
        <p class="_status" role="status">{$messages.checkingSession}</p>
      {:else if view === View.Unavailable}
        <section class="auth-card" aria-labelledby="unavailable-title">
          <h1 id="unavailable-title">{$messages.noConnection}</h1>
          <p class="_intro">{$messages.sessionUnavailable}</p>
          <button class="_submit" onclick={() => {
            if (workspaceLoadFailed) {
              window.location.reload();
            } else {
              view = View.Checking;
              void checkSession();
            }
          }}>{$messages.retry}</button>
        </section>
      {:else}
        <section class="auth-card" aria-labelledby="login-title">
          <span class="_eyebrow">{$messages.siteManagement}</span>
          <h1 id="login-title">{$messages.welcome}</h1>
          <p class="_intro">{$messages.loginIntro}</p>
          <form onsubmit={login} aria-busy={pending}>
            <div class="_field">
              <Label.Root class="_label" for="email">Email</Label.Root>
              <input id="email" name="email" type="email" autocomplete="username" placeholder="you@example.com"
                required bind:value={email} disabled={pending}
                aria-describedby={error !== null ? 'login-error' : undefined} />
            </div>
            <div class="_field">
              <Label.Root class="_label" for="password">{$messages.password}</Label.Root>
              <div class="_password-wrap">
                <input id="password" name="password" type={visible ? 'text' : 'password'}
                  autocomplete="current-password" required bind:value={password} disabled={pending}
                  aria-describedby={error !== null ? 'login-error' : undefined} />
                <button class="_reveal" type="button"
                  aria-label={visible ? $messages.hidePassword : $messages.showPassword}
                  aria-pressed={visible} disabled={pending} onclick={() => {
                    visible = !visible;
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                    {#if visible}<path d="m3 3 18 18" />{/if}
                  </svg>
                </button>
              </div>
            </div>
            <div class="_feedback" aria-live="polite" aria-atomic="true">
              {#if error !== null}<p id="login-error" role="alert">{error === 401 ? $messages.invalidCredentials
                : error === 429 ? formatMessage($messages.loginLimited, { minutes: retryMinutes })
                  : $messages.loginFailed}</p>{/if}
            </div>
            <button class="_submit" type="submit" disabled={pending}>
              <span>{pending ? $messages.signingIn : $messages.signIn}</span><span aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      {/if}
    </main>
    <footer class="_footer">Zarya CMS <span aria-hidden="true">/</span> {$messages.footer}</footer>
  </div>
{/if}

<style>
  ._session-warning {
    position: fixed;
    z-index: 1001;
    bottom: 24px;
    left: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    max-width: 640px;
    margin-inline: auto;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--cms-warning-surface);
    color: var(--cms-warning);
    box-shadow: 0 8px 24px #0002;
  }

  ._session-warning button { flex-shrink: 0; }
</style>
