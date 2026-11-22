import type { APIResponse, Page } from 'playwright-core';

import { adminJourney, type IAdminJourney } from './admin-journey.js';

export async function withAdminJourney(action: (f: IAdminJourney) => Promise<void>): Promise<void> {
  const f = await adminJourney();
  let failed = true;

  try {
    await action(f);
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}

/** Authenticated setup/read oracle; actions being tested still use browser controls. */
export async function journeyCommand(
  f: IAdminJourney, site: string, suffix: string, data: unknown,
): Promise<APIResponse> {
  return f.page.request.post(f.origin + '/api' + site + suffix, {
    headers: { Origin: f.origin, 'X-Zarya-Admin': '1' }, data,
  });
}

export async function journeyRead(f: IAdminJourney, site: string, suffix: string): Promise<Record<string, unknown>> {
  const response = await f.page.request.get(f.origin + '/api' + site + suffix);

  expect(response.status()).toBe(200);
  const value: unknown = await response.json();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an object from the real administration');
  }

  return Object.fromEntries(Object.entries(value));
}

export async function openJourneySource(
  f: IAdminJourney, site: string, section: string, name: string, code: string,
): Promise<void> {
  await f.page.goto(f.origin + site + '/' + section);
  await f.page.getByRole('button', { name: 'Create element', exact: true }).click();
  await f.page.getByLabel('Element name', { exact: true }).fill(name);
  await f.page.getByRole('textbox', { name: section === 'snippets' ? 'Server TypeScript' : 'HTML', exact: true })
    .fill(code);
}

export async function saveJourneySource(page: Page, section: string): Promise<string> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST'
      && new RegExp('/' + section + '(?:/[0-9]+)?$').test(r.url())),
    page.getByRole('button', { name: 'Save draft', exact: true }).click(),
  ]);

  expect(response.ok(), await response.text()).toBe(true);
  await page.waitForURL(new RegExp('/' + section + '/[0-9]+$'));
  await page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();

  return page.url().split('/').at(-1)!;
}

export async function saveJourneyTv(page: Page, status = 200): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/template-variables')),
    page.getByRole('button', { name: 'Save TV fields', exact: true }).click(),
  ]);

  expect(response.status(), await response.text()).toBe(status);
  await (status === 200 ? page.getByRole('status').filter({ hasText: 'TV fields saved' }) : page.getByRole('alert'))
    .waitFor();
}

export async function publishJourneyEditor(f: IAdminJourney, site: string): Promise<void> {
  await f.page.getByRole('button', { name: 'Save & publish', exact: true }).click();
  await f.page.getByText('Page published', { exact: true }).waitFor();
  await f.page.waitForURL(f.origin + site);
}

export async function reloadJourneyEditor(page: Page): Promise<void> {
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
}
