import type { Page } from 'playwright-core';

export async function chooseLocalSiteOrigin(page: Page, localAddress = 'http://localhost:3000'): Promise<void> {
  await page.locator('#site-local-address').fill(localAddress);
  await page.locator('#site-origin-local').check();
}
