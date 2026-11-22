import type { Locator, Page } from 'playwright-core';
import { expect } from 'vitest';

async function verifyRow(row: Locator): Promise<void> {
  const reference = row.locator('._target-reference');
  const geometry = await reference.evaluate(label => {
    const caption = label.querySelector('span') ?? [...label.childNodes]
      .find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    const input = label.querySelector('input');

    if (!caption || !input) {
      throw new Error('Missing page caption or address input');
    }

    const range = document.createRange();

    range.selectNodeContents(caption);
    const textBox = range.getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();

    return {
      captionMiddle: textBox.y + textBox.height / 2,
      inputMiddle: inputBox.y + inputBox.height / 2,
      captionRight: textBox.right,
      inputLeft: inputBox.left,
    };
  });

  expect(Math.abs(geometry.captionMiddle - geometry.inputMiddle)).toBeLessThan(3);
  expect(geometry.captionRight).toBeLessThanOrEqual(geometry.inputLeft);
  const share = await row.getByRole('spinbutton').boundingBox();
  const remove = row.getByRole('button', { name: /Remove page row|Убрать строку страницы/ });
  const deletion = await remove.boundingBox();

  expect(share).not.toBeNull();
  expect(deletion).not.toBeNull();
  expect(Math.abs(share!.y + share!.height / 2 - deletion!.y - deletion!.height / 2)).toBeLessThan(3);

  for (const button of await row.getByRole('button').all()) {
    const control = await button.evaluate(element => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();

      return {
        themed: element.classList.contains('cms-secondary') || element.classList.contains('cms-danger'),
        rounded: parseFloat(style.borderRadius) > 0,
        width: bounds.width,
        height: bounds.height,
      };
    });

    expect(control.themed).toBe(true);
    expect(control.rounded).toBe(true);
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
}

export async function verifyCalibrationControls(page: Page, workspace: Locator): Promise<void> {
  for (const [width, height] of [[1440, 1000], [320, 844], [390, 844], [767, 844], [768, 1000]]) {
    await page.setViewportSize({ width: width!, height: height! });
    const rows = workspace.locator('._calibration-target');

    await rows.first().scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const addPage = await workspace.getByRole('button', { name: 'Add page', exact: true }).first().boundingBox();

    expect(addPage?.width).toBeGreaterThanOrEqual(44);
    expect(addPage?.height).toBeGreaterThanOrEqual(44);

    for (const row of await rows.all()) {
      await verifyRow(row);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.tmp/calibration-controls-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
