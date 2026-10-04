async (page) => {
  // Acceptance walk-through for the Analytics page, plus a real touch drag in the
  // picker (Chromium only, through the debugging protocol). Run after
  // docs/design/analytics-redesign/harness/prod-fixtures.js (clock pinned to 2026-09-26).
  const size = page.viewportSize();
  const tag = size.width < 640 ? 'phone' : 'desktop';
  const shot = (name) => page.screenshot({ path: `/Users/justin/code/personal/OtterMint/.claude/worktrees/period-picker/docs/design/period-picker/evidence/${tag}-${name}.png` });
  const out = {};
  const button = page.getByTestId('period-button');
  const label = async () => (await button.innerText()).trim();
  const pressed = () => page.locator('[aria-label="Quick ranges"] button[aria-pressed="true"]').allInnerTexts();
  const has = (text) => page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
  const cell = (name) => page.getByRole('dialog').getByRole('button', { name, exact: true });
  const centre = async (locator) => { const b = await locator.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const settle = () => page.waitForTimeout(700);
  const card = (name) => page.locator(`section[aria-label="${name}"]`).innerText();

  await page.goto('http://localhost:3000/');
  await page.getByRole('button', { name: 'Analytics' }).first().click();
  await page.getByText('Category trends').waitFor();
  await page.waitForTimeout(2000);
  const unscopedBefore = [await card('Year to date'), await card('Recurring charges')];
  out.open1Y = { label: await label(), pressed: await pressed(), kept: await has('of income kept · Oct 2025–Sep 2026'), caption: await has('Sets the window for savings rate and category trends') };
  await shot('analytics-1y');

  await button.click();
  await page.getByRole('button', { name: 'Last year' }).click(); await settle();
  out.year2025 = { label: await label(), pressed: await pressed(), kept: await has('of income kept · Jan–Dec 2025'), noComparison: await has('no earlier months to compare'),
    bars: await page.getByTestId('mini-columns').first().evaluate((e) => e.children.length) };
  await shot('analytics-2025');

  await button.click();
  await page.getByRole('button', { name: 'Later year' }).click();
  await page.mouse.click(...(await centre(cell('August 2026')))); await settle();
  out.august = { label: await label(), kept: await has('of income kept · August 2026'), compared: await has('Compared with July 2026'), bars: await page.getByTestId('mini-columns').first().evaluate((e) => e.children.length) };

  // A real touch drag from February to May.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.evaluate(() => { window.__types = []; window.addEventListener('pointerdown', (e) => window.__types.push(e.pointerType), true); });
  await button.click();
  const from = await centre(cell('February 2026')), to = await centre(cell('May 2026'));
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1] }] : [] });
  await touch('touchStart', from);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6]);
  out.touchHint = await has('Release to select Feb–May 2026.');
  await shot('picker-touch-drag');
  await touch('touchEnd');
  await settle();
  out.touchDrag = { label: await label(), dialogClosed: (await page.getByRole('dialog').count()) === 0, pointerTypes: await page.evaluate(() => window.__types), scrollY: await page.evaluate(() => scrollY) };
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await shot('analytics-range');

  out.unscopedUnchanged = JSON.stringify(unscopedBefore) === JSON.stringify([await card('Year to date'), await card('Recurring charges')]);
  out.layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  await page.getByRole('button', { name: '6M', exact: true }).click(); await settle();
  out.sixMonths = { label: await label(), kept: await has('of income kept · Apr–Sep 2026') };
  return out;
}
