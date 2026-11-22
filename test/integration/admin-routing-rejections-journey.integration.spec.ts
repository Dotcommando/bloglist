import { journeyRead, withAdminJourney } from '../support/admin-actions.js';
import { createJourneySite, publishJourneyPage } from '../support/admin-journey.js';

it('rejects malformed URLs and child-promotion collisions atomically and accepts correction', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await publishJourneyPage(f, site, 'Group', '/group/');
    await publishJourneyPage(f, site, 'Nested', '/group/leaf/');
    await publishJourneyPage(f, site, 'Occupied leaf', '/leaf/');
    await page.goto(origin + site + '/urls');
    await page.locator('[data-url-path="/group/"]').click();
    const workspace = page.locator('#urls-workspace');
    const path = workspace.getByLabel('New URL path', { exact: true });
    const before = await journeyRead(f, site, '/urls');

    await path.fill('https://outside.example.test/');
    const [invalid] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/move') && r.request().method() === 'POST'),
      workspace.getByRole('button', { name: 'Change URL', exact: true }).click(),
    ]);

    expect(invalid.status()).toBe(400);
    await workspace.getByRole('alert').waitFor();
    expect(await path.inputValue()).toBe('https://outside.example.test/');
    expect(await journeyRead(f, site, '/urls')).toEqual(before);
    await path.fill('/renamed/');
    await workspace.getByLabel('Move nested pages up one level without redirects (1)', { exact: true }).check();
    const [conflict] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/move') && r.request().method() === 'POST'),
      workspace.getByRole('button', { name: 'Change URL', exact: true }).click(),
    ]);

    expect(conflict.status()).toBe(409);
    await workspace.getByRole('alert').waitFor();
    expect(await path.inputValue()).toBe('/renamed/');
    expect(await journeyRead(f, site, '/urls')).toEqual(before);
    expect(await (await fetch(origin + '/group/leaf/')).text()).toContain('Published Nested');
    expect(await (await fetch(origin + '/leaf/')).text()).toContain('Published Occupied leaf');
    expect((await fetch(origin + '/renamed/')).status).toBe(404);
    await workspace.getByLabel('Keep the URLs of nested pages', { exact: true }).check();
    await workspace.getByRole('button', { name: 'Change URL', exact: true }).click();
    await workspace.getByRole('heading', { name: '/renamed/', exact: true }).waitFor();
    await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
    expect(await (await fetch(origin + '/renamed/')).text()).toContain('Published Group');
    expect(await (await fetch(origin + '/group/leaf/')).text()).toContain('Published Nested');
    expect(await (await fetch(origin + '/leaf/')).text()).toContain('Published Occupied leaf');
  });
}, 90000);

it('rejects a redirect cycle captured in a stale picker and accepts a safe target', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await publishJourneyPage(f, site, 'A', '/cycle-a/');
    await publishJourneyPage(f, site, 'B', '/cycle-b/');
    await publishJourneyPage(f, site, 'C', '/cycle-c/');
    await page.goto(origin + site + '/urls');
    await page.locator('[data-url-path="/cycle-b/"]').click();
    const stale = await f.context.newPage();

    stale.setDefaultTimeout(10000);
    await stale.goto(page.url());
    await stale.getByRole('button', { name: 'Destination address', exact: true }).click();
    expect(await stale.getByRole('option', { name: '/cycle-b/', exact: true }).count()).toBe(0);
    await stale.getByRole('option', { name: '/cycle-a/', exact: true }).click();
    await page.locator('[data-url-path="/cycle-a/"]').click();
    await page.getByRole('button', { name: 'Destination address', exact: true }).click();
    await page.getByRole('option', { name: '/cycle-b/', exact: true }).click();
    await page.getByRole('button', { name: 'Save redirect', exact: true }).click();
    await page.getByText('Redirect applied to the site.', { exact: true }).waitFor();
    const before = await journeyRead(f, site, '/urls');
    const [refused] = await Promise.all([
      stale.waitForResponse((r) => r.url().endsWith('/redirect') && r.request().method() === 'POST'),
      stale.getByRole('button', { name: 'Save redirect', exact: true }).click(),
    ]);

    expect(refused.status()).toBe(409);
    await stale.getByRole('alert').waitFor();
    expect(await stale.getByRole('button', { name: 'Destination address', exact: true }).textContent())
      .toContain('/cycle-a/');
    expect(await journeyRead(f, site, '/urls')).toEqual(before);
    expect(await (await fetch(origin + '/cycle-a/')).text()).toContain('Published B');
    await stale.getByRole('button', { name: 'Destination address', exact: true }).click();
    await Promise.all([
      stale.waitForResponse((r) => r.url().includes('/urls/suggestions')
        && new URL(r.url()).searchParams.get('q') === '/cycle-'),
      stale.getByRole('combobox', { name: 'Search URL paths', exact: true }).fill('/cycle-'),
    ]);
    await expect.poll(() => stale.getByRole('option', { name: '/cycle-a/', exact: true }).count(),
      { timeout: 10000 }).toBe(0);
    await stale.getByRole('option', { name: '/cycle-c/', exact: true }).waitFor();
    await stale.getByRole('option', { name: '/cycle-c/', exact: true }).click();
    await stale.getByRole('button', { name: 'Save redirect', exact: true }).click();
    await stale.getByText('Redirect applied to the site.', { exact: true }).waitFor();
    expect(await (await fetch(origin + '/cycle-b/')).text()).toContain('Published C');
    expect(await (await fetch(origin + '/cycle-a/')).text()).toContain('Published C');
    await stale.close();
  });
}, 90000);
