import type { Page } from 'playwright-core';

export interface IAuthoredParameter {
  name: string;
  kind: string;
  required?: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
  values?: string[];
  properties?: IAuthoredParameter[];
  items?: IAuthoredParameter;
}

/** Drive the recursive editor; expected contracts and rendered values live in each scenario. */
export async function editJourneyParameter(
  page: Page, prefix: string, field: IAuthoredParameter, itemOnly = false,
): Promise<void> {
  if (!itemOnly) {
    await page.locator(prefix + '-name').fill(field.name);
  }
  await page.locator(prefix + '-kind').selectOption(field.kind);
  const row = page.locator('fieldset._parameter-row').filter({ has: page.locator(prefix + '-kind') }).last();

  if (field.required) {
    await row.getByRole('checkbox', { name: 'Required', exact: true }).first().check();
  }
  if (field.nullable) {
    await row.getByRole('checkbox', { name: 'Allow null', exact: true }).first().check();
  }
  if (field.values) {
    await page.locator(prefix + '-values').fill(field.values.join('\n'));
  }

  for (const [index, property] of (field.properties ?? []).entries()) {
    await row.getByRole('button', { name: 'Add parameter', exact: true }).last().click();
    await editJourneyParameter(page, prefix + '-properties-' + index, property);
  }

  if (field.items) {
    await editJourneyParameter(page, prefix + '-items-0', field.items, true);
  }
  if (Object.hasOwn(field, 'defaultValue')) {
    await row.getByRole('checkbox', { name: 'Use a default value', exact: true }).first().check();

    if (field.defaultValue === null) {
      await row.getByRole('checkbox', { name: 'Use null as default', exact: true }).first().check();
    } else if (field.kind === 'Boolean') {
      await page.locator(prefix + '-default').selectOption(String(field.defaultValue));
    } else {
      const text = field.kind === 'String' || field.kind === 'Enum' || field.kind === 'Number'
        ? String(field.defaultValue) : JSON.stringify(field.defaultValue);

      await page.locator(prefix + '-default').fill(text);
    }
  }
}

export async function addJourneyParameters(page: Page, kind: string, fields: IAuthoredParameter[]): Promise<void> {
  await page.getByRole('button', { name: 'Parameters', exact: true }).click();

  for (const [index, field] of fields.entries()) {
    await page.getByRole('button', { name: 'Add parameter', exact: true }).last().click();
    await editJourneyParameter(page, '#element-' + kind + '-' + index, field);
  }
}
