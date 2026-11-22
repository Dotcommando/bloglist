import { chromium } from 'playwright-core';

import { cssCouplings, splitCss } from '../../src/adapters/outbound/rendering/vite/css.js';

describe('CSS extraction in a real browser', () => {
  it('preserves geometry and computed decorations across layers, resets, variables and dynamic states', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Set ZARYA_TEST_BROWSER_EXECUTABLE to an installed Chromium browser');
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const css = `@layer base,overrides;
        @layer base{.box{--width:120px;--ink:green;width:var(--width);height:80px;
        padding:8px;border:4px solid red;border-color:blue;color:var(--ink);background:white;
        font-size:16px;line-height:1.5}.box:focus{outline:2px solid purple}}
        @layer overrides{@media(min-width:576px){.box{width:180px;border-width:6px;color:blue}}
        .box.active{background-color:yellow;border-top-color:orange}}
        .reset{all:initial;display:block;width:90px;height:20px;color:red}`;

      for (const authored of [css, css.replace('all:initial;', '')]) {
        const extracted = await splitCss(authored, cssCouplings([authored]));

        if (authored !== css) {
          expect(extracted.repaint.length).toBeGreaterThan(0);
        }

        const page = await browser.newPage();
        const markup = '<button class="box">Label</button><div class="reset">Reset</div>';

        for (const width of [320, 576, 1200]) {
          await page.setViewportSize({ width, height: 800 });
          const measurements = async (): Promise<unknown> => page.locator('.box,.reset').evaluateAll((elements) =>
            elements.map((element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();

              return {
                width: rect.width,
                height: rect.height,
                color: style.color,
                background: style.backgroundColor,
                border: style.borderTop,
                fontSize: style.fontSize,
                lineHeight: style.lineHeight,
                outline: style.outline,
              };
            }));

          for (const active of [false, true]) {
            await page.setContent(`<html><head><style>${authored}</style></head><body>${markup}</body></html>`);
            await page.locator('.box').evaluate((element, enabled) => element.classList.toggle(
              'active', enabled), active);
            await page.locator('.box').focus();
            const baseline = await measurements();

            await page.setContent(`<html><head><style>${extracted.reflow}</style></head><body>${markup}<style>${extracted.repaint}</style></body></html>`);
            await page.locator('.box').evaluate((element, enabled) => element.classList.toggle(
              'active', enabled), active);
            await page.locator('.box').focus();
            expect(await measurements()).toEqual(baseline);
          }
        }
      }
    } finally {
      await browser.close();
    }
  });
});
