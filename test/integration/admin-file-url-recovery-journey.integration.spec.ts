import type { IFileLibrary } from '../../admin/src/features/files/files.types.js';
import type { IUrlCatalog } from '../../src/ports/inbound/routing/get-url-catalog.port.js';
import { withAdminJourney } from '../support/admin-actions.js';
import { createJourneySite, publishJourneyPage } from '../support/admin-journey.js';
import { verifyAdminRecovery } from '../support/admin-recovery.js';

it('recovers file renames after disconnect, timeout, lost acknowledgement and actual session expiry', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await page.goto(origin + site + '/files');
    await page.getByRole('button', { name: 'assets/files', exact: true }).click();
    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'recovery.csv', mimeType: 'text/csv', buffer: Buffer.from('recovery\n42\n'),
    });
    await page.getByRole('button', { name: 'Upload files', exact: true }).click();
    await page.getByRole('button', { name: 'recovery.csv', exact: true }).click();
    const editor = page.url();
    const fileId = editor.split('/').at(-1)!;
    const readState = async (): Promise<IFileLibrary> => {
      const response = await page.request.get(origin + '/api' + site + '/files');

      expect(response.status()).toBe(200);

      return response.json();
    };

    page.on('dialog', (dialog) => dialog.accept());
    await verifyAdminRecovery(f, {
      input: page.locator('#file-name'),
      submit: page.getByRole('button', { name: 'Save name', exact: true }),
      endpoint: () => origin + '/api' + site + '/files/' + fileId + '/move',
      value: (stage) => stage + '.csv',
      readState,
      readValue: async () => (await readState()).files.find((file) => file.fileId === fileId)!.name,
      reopen: async () => {
        await page.goto(editor);
        await page.locator('#file-name').waitFor();
      },
    });
    const file = (await readState()).files.find((item) => item.fileId === fileId)!;

    expect(await (await fetch(new URL(file.outputs[0]!.url, origin))).text()).toBe('recovery\n42\n');
  });
}, 120000);

it('recovers URL moves after disconnect, timeout, lost acknowledgement and actual session expiry', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);
    const editor = await publishJourneyPage(f, site, 'URL recovery', '/recovery/');
    const pageId = editor.split('/').at(-1)!;
    const readState = async (): Promise<IUrlCatalog> => {
      const response = await page.request.get(origin + '/api' + site + '/urls');

      expect(response.status()).toBe(200);

      return response.json();
    };
    const readValue = async (): Promise<string> =>
      (await readState()).urls.find((row) => row.url.pageId === pageId)!.url.path;
    const reopen = async (): Promise<void> => {
      const path = await readValue();

      await page.goto(origin + site + '/urls');
      await page.locator('[data-url-path="' + path + '"]').click();
      await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
      await page.getByLabel('New URL path', { exact: true }).waitFor();
    };

    await reopen();
    page.on('dialog', (dialog) => dialog.accept());
    await verifyAdminRecovery(f, {
      input: page.getByLabel('New URL path', { exact: true }),
      submit: page.getByRole('button', { name: 'Change URL', exact: true }),
      endpoint: () => origin + '/api' + site + '/urls/' + page.url().split('/').at(-1)! + '/move',
      value: (stage) => '/' + stage + '/',
      readValue,
      readState,
      reopen,
    });
    expect(await (await fetch(origin + '/recovered/')).text()).toContain('Published URL recovery');
    const redirect = await fetch(origin + '/recovery/', { redirect: 'manual' });

    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('location')).toBe('/recovered/');
  });
}, 120000);
