import type { Locator, Route } from 'playwright-core';

import type { IAdminJourney } from './admin-journey.js';

export interface IRecoveryEditor {
  input: Locator;
  submit: Locator;
  endpoint: () => string;
  value: (stage: string) => string;
  readValue: () => Promise<string>;
  readState: () => Promise<unknown>;
  reopen: () => Promise<void>;
}

/** Real mutations and session admission; only transport delivery/expiration is controlled. */
export async function verifyAdminRecovery(f: IAdminJourney, editor: IRecoveryEditor): Promise<void> {
  const { page } = f;

  for (const mode of ['disconnect', 'timeout']) {
    const url = editor.endpoint();
    const previous = await editor.readState();
    const value = editor.value(mode);
    let release = (): void => {};
    const held = new Promise<void>((resolve) => release = resolve);
    let captured: Route | undefined;
    let attempts = 0;
    const handler = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'POST') {
        await route.fallback();

        return;
      }
      attempts++;
      captured = route;

      if (mode === 'timeout') {
        await held;

        return; // The browser's AbortSignal has already cancelled this request.
      }
      await route.abort('connectionreset');
    };

    if (mode === 'timeout') {
      await page.evaluate((target) => {
        const nativeFetch = window.fetch;

        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? new URL(input, location.href).href
            : input instanceof URL ? input.href : input.url;

          if (url === target && init?.method === 'POST') {
            const controller = new AbortController();

            window.fetch = nativeFetch;
            Object.defineProperty(window, 'expireJourneyRequest', {
              configurable: true,
              value: () => controller.abort(new DOMException('Controlled timeout', 'TimeoutError')),
            });

            return nativeFetch.call(window, input, { ...init, signal: controller.signal });
          }

          return nativeFetch.call(window, input, init);
        };
      }, url);
    }
    await page.route(url, handler);

    try {
      await editor.input.fill(value);
      await editor.submit.click();
      await expect.poll(() => captured !== undefined, { timeout: 10000 }).toBe(true);

      if (mode === 'timeout') {
        expect(await editor.input.isDisabled()).toBe(true);
        await page.evaluate(() => {
          const expire: unknown = Reflect.get(window, 'expireJourneyRequest');

          if (typeof expire !== 'function') {
            throw new Error('The targeted request was not admitted');
          }
          expire();
          Reflect.deleteProperty(window, 'expireJourneyRequest');
        });
        release();
      }
      await page.getByRole('alert').waitFor();
      expect(await editor.input.inputValue()).toBe(value);
      expect(await editor.readState()).toEqual(previous);
      expect(attempts).toBe(1);
      expect(await editor.submit.isEnabled()).toBe(true);
    } finally {
      release();
      await page.unroute(url, handler);
    }
    await editor.submit.click();
    await expect.poll(editor.readValue, { timeout: 10000 }).toBe(value);
    await editor.reopen();
    expect(await editor.input.inputValue()).toBe(value);
  }

  // A response lost after commit must not cause an automatic replay or duplicate effect.
  const url = editor.endpoint();
  const committed = editor.value('committed');
  let attempts = 0;
  const lostAcknowledgement = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'POST') {
      await route.fallback();

      return;
    }
    attempts++;
    const response = await route.fetch();

    expect(response.ok(), await response.text()).toBe(true);
    await route.abort('connectionreset');
  };

  await page.route(url, lostAcknowledgement);

  try {
    await editor.input.fill(committed);
    await editor.submit.click();
    await page.getByRole('alert').waitFor();
    expect(await editor.input.inputValue()).toBe(committed);
    expect(await editor.readValue()).toBe(committed);
    const saved = await editor.readState();

    expect(attempts).toBe(1);
    await editor.reopen();
    expect(await editor.input.inputValue()).toBe(committed);
    expect(await editor.readState()).toEqual(saved);
    expect(attempts).toBe(1);
  } finally {
    await page.unroute(url, lostAcknowledgement);
  }

  const saved = await editor.readState();

  await editor.input.fill(editor.value('expired'));
  await f.expireSession();
  await editor.submit.click();
  await page.getByLabel('Email', { exact: true }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill('user-1@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic journey password');
  const [login] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);

  expect(login.status()).toBe(200);
  await editor.reopen();
  expect(await editor.readState()).toEqual(saved);
  const recovered = editor.value('recovered');

  await editor.input.fill(recovered);
  await editor.submit.click();
  await expect.poll(editor.readValue, { timeout: 10000 }).toBe(recovered);
  await editor.reopen();
  expect(await editor.input.inputValue()).toBe(recovered);
}
