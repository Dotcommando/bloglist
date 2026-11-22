import type { Locator } from 'playwright-core';

export async function verifyScrollShadow(scroll: Locator, header: Locator): Promise<void> {
  await scroll.evaluate((element) => element.scrollTo(0, 0));
  await expect.poll(() => header.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
  const before = await header.boundingBox();

  await scroll.evaluate((element) => element.scrollTo(0, 1));
  expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => header.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
  const after = await header.boundingBox();

  expect(after?.y).toBeCloseTo(before!.y, 1);
  await scroll.evaluate((element) => element.scrollTo(0, 0));
  await expect.poll(() => header.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
}
