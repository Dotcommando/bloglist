import sharp from 'sharp';

import { adminJourney, createJourneySite, publishJourneyPage } from '../support/admin-journey.js';

it('restores sitemap membership and clears SEO and Open Graph overrides through real UI', async () => {
  const f = await adminJourney();
  const { page, origin } = f;
  let failed = true;

  try {
    const site = await createJourneySite(f);
    const editor = await publishJourneyPage(f, site, 'Metadata', '/');
    const publish = async (): Promise<void> => {
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByText('Page published', { exact: true }).waitFor();
      await page.waitForURL(origin + site);
    };

    await page.goto(origin + site + '/settings');
    await page.locator('#site-public-origin').fill(origin);
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByText('Site address settings saved.', { exact: true }).waitFor();
    await page.goto(origin + site + '/files');
    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'social.png',
      mimeType: 'image/png',
      buffer: await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#49705f' } })
        .png().toBuffer(),
    });
    await page.getByRole('button', { name: 'Upload images', exact: true }).click();
    await page.getByRole('button', { name: 'social.png', exact: true }).waitFor();
    await page.goto(editor);
    await page.locator('#page-h1').fill('Editorial heading');
    await page.getByRole('tab', { name: 'SEO', exact: true }).click();
    await page.locator('#page-meta-title').fill('Search override');
    await page.locator('#page-meta-description').fill('Search description');
    await page.locator('#page-robots').selectOption('index');
    await page.getByText('Additional search settings', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Exclude from sitemap', exact: true }).check();
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    await page.locator('#page-og-title').fill('Social override');
    await page.locator('#page-og-description').fill('Social description');
    await page.getByRole('button', { name: 'Image for Open Graph', exact: true }).click();
    const library = page.getByRole('dialog', { name: 'Image library', exact: true });

    await library.getByRole('button', { name: 'social.png', exact: true }).click();
    await library.getByRole('button', { name: 'Use image', exact: true }).click();
    await publish();
    const publicPage = await f.context.newPage();

    await publicPage.goto(origin + '/');
    expect(await publicPage.title()).toBe('Search override');
    expect(await publicPage.locator('meta[name=robots]').getAttribute('content')).toBe('index,follow');
    expect(await publicPage.locator('meta[property="og:image"]').getAttribute('content')).toContain('/assets/');
    expect(await (await fetch(origin + '/sitemap.xml')).text()).not.toContain('<loc>' + origin + '/</loc>');
    await page.goto(editor);
    await page.getByRole('tab', { name: 'SEO', exact: true }).click();
    expect(await page.locator('#page-robots').inputValue()).toBe('index');
    await page.getByText('Additional search settings', { exact: true }).click();
    expect(await page.getByRole('checkbox', { name: 'Exclude from sitemap', exact: true }).isChecked()).toBe(true);
    await page.getByRole('checkbox', { name: 'Exclude from sitemap', exact: true }).uncheck();
    await page.locator('#page-meta-title').fill('');
    await page.locator('#page-meta-description').fill('');
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    await page.locator('#page-og-title').fill('');
    await page.locator('#page-og-description').fill('');
    await page.getByRole('button', { name: 'Remove image: Image for Open Graph', exact: true }).click();
    await publish();
    await publicPage.reload();
    expect(await publicPage.title()).toBe('Metadata');
    expect(await publicPage.getByRole('heading', { level: 1 }).textContent()).toBe('Editorial heading');
    expect(await publicPage.locator('meta[property="og:title"]').getAttribute('content')).toBe('Metadata');
    expect(await publicPage.locator('meta[property="og:image"]').count()).toBe(0);
    expect(await publicPage.locator('meta[property="og:description"]').count()).toBe(0);
    expect(await publicPage.locator('meta[name=description]').count()).toBe(0);
    expect(await (await fetch(origin + '/sitemap.xml')).text()).toContain('<loc>' + origin + '/</loc>');
    await page.goto(editor);
    await page.getByRole('tab', { name: 'SEO', exact: true }).click();
    expect(await page.locator('#page-meta-title').inputValue()).toBe('');
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    expect(await page.locator('#page-og-title').inputValue()).toBe('');
    expect(await page.getByRole('button', { name: 'Remove image: Image for Open Graph', exact: true }).count()).toBe(0);
    await publicPage.close();
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}, 90000);
