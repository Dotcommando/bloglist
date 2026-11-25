import { adminJourney, createJourneySite, publishJourneyPage } from '../support/admin-journey.js';

it('retains rejected URL edits, confirms discarding input and promotes children without redirects', async () => {
  const f = await adminJourney();
  const { page, origin } = f;
  let failed = true;

  try {
    const site = await createJourneySite(f);

    await publishJourneyPage(f, site, 'Branch', '/branch/');
    await publishJourneyPage(f, site, 'Leaf', '/branch/leaf/');
    await publishJourneyPage(f, site, 'Occupied', '/occupied/');
    await page.goto(origin + site + '/urls');
    await page.locator('[data-url-path="/branch/"]').click();
    const workspace = page.locator('#urls-workspace');
    const path = workspace.getByLabel('New URL path', { exact: true });

    await path.fill('/occupied/');
    await workspace.getByRole('button', { name: 'Change URL', exact: true }).click();
    await workspace.getByRole('alert').waitFor();
    expect(await path.inputValue()).toBe('/occupied/');
    expect(await (await fetch(origin + '/branch/')).text()).toContain('Published Branch');
    expect(await (await fetch(origin + '/occupied/')).text()).toContain('Published Occupied');
    await path.fill('/unsaved/');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('[data-url-path="/occupied/"]').click();
    expect(await path.inputValue()).toBe('/unsaved/');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-url-path="/occupied/"]').click();
    await workspace.getByRole('heading', { name: '/occupied/', exact: true }).waitFor();
    expect(await path.inputValue()).toBe('/occupied/');
    await page.locator('[data-url-path="/branch/"]').click();
    await path.fill('/renamed/');
    await workspace.getByLabel('Move nested pages up one level without redirects (1)', { exact: true }).check();
    await workspace.getByLabel('Permanently delete the old address', { exact: true }).check();
    await workspace.getByRole('button', { name: 'Change URL', exact: true }).click();
    await workspace.getByRole('heading', { name: '/renamed/', exact: true }).waitFor();
    await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
    expect((await fetch(origin + '/branch/', { redirect: 'manual' })).status).toBe(404);
    expect((await fetch(origin + '/branch/leaf/', { redirect: 'manual' })).status).toBe(404);
    expect(await (await fetch(origin + '/leaf/')).text()).toContain('Published Leaf');
    expect(await (await fetch(origin + '/renamed/')).text()).toContain('Published Branch');
    await page.reload();
    await page.locator('[data-url-path="/leaf/"]').waitFor();
    expect(await page.locator('[data-url-path="/branch/leaf/"]').count()).toBe(0);
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}, 180000);
