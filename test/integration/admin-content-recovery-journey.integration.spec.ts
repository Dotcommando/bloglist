import {
  journeyRead, openJourneySource, saveJourneySource, saveJourneyTv, withAdminJourney,
} from '../support/admin-actions.js';
import { createJourneySite, publishJourneyPage } from '../support/admin-journey.js';
import { verifyAdminRecovery } from '../support/admin-recovery.js';

it.each(['templates', 'chunks', 'snippets', 'pages', 'template-variables'])(
  'recovers %s edits after disconnect, timeout, lost acknowledgement and actual session expiry', async (section) => {
    await withAdminJourney(async (f) => {
      const { page, origin } = f;
      const site = await createJourneySite(f);
      let suffix = '';
      let editor = '';
      let field = 'name';
      let input = page.getByLabel('Element name', { exact: true });
      let submit = page.getByRole('button', { name: 'Save draft', exact: true });

      if (section === 'pages') {
        editor = await publishJourneyPage(f, site, 'Recovery page', '/recovery/');
        suffix = '/pages/' + editor.split('/').at(-1)!;
        field = 'title';
        input = page.locator('#page-title');
      } else if (section === 'template-variables') {
        await page.goto(origin + site + '/template-variables');
        await page.getByRole('button', { name: 'Create TV', exact: true }).click();
        await page.locator('#tv-name').fill('recovery');
        await page.locator('#tv-caption').fill('Recovery field');
        await page.locator('._template-options').getByRole('checkbox').first().check();
        await saveJourneyTv(page);
        editor = page.url();
        suffix = '/template-variables';
        field = 'caption';
        input = page.locator('#tv-caption');
        submit = page.getByRole('button', { name: 'Save TV fields', exact: true });
      } else {
        await openJourneySource(f, site, section, 'Recovery source',
          section === 'snippets' ? 'return "Recovery";' : '<p>Recovery source</p>');

        if (section === 'snippets') {
          await page.getByRole('button', { name: 'Result contract', exact: true }).click();
          await page.locator('#element-Snippet-output-0-kind').selectOption('String');
        }

        const key = await saveJourneySource(page, section);

        editor = page.url();
        suffix = '/' + section + '/' + key;
      }

      const readState = async (): Promise<Record<string, unknown>> => journeyRead(f, site, suffix);
      const readValue = async (): Promise<string> => {
        const state = await readState();
        const row: unknown = section === 'template-variables' && Array.isArray(state.fields) ? state.fields[0] : state;

        if (!row || typeof row !== 'object' || !(field in row)) {
          throw new Error('Missing saved editor value');
        }

        const value: unknown = Reflect.get(row, field);

        if (typeof value !== 'string') {
          throw new Error('Invalid saved editor value');
        }

        return value;
      };
      const reopen = async (): Promise<void> => {
        await page.goto(editor);

        if (section === 'template-variables') {
          await page.locator('.tv-row').first().click();
        }
        await input.waitFor();
      };

      // Explicit reload is the reconciliation action; accepting it discards only the local failed buffer.
      page.on('dialog', (dialog) => dialog.accept());
      await verifyAdminRecovery(f, {
        input,
        submit,
        endpoint: () => origin + '/api' + site + suffix,
        value: (stage) => 'Recovery ' + stage,
        readValue,
        readState,
        reopen,
      });
    });
  }, 120000,
);
