async (page) => {
  // Acceptance walk-through for the Dashboard at the current viewport. Run after
  // docs/design/analytics-redesign/harness/prod-fixtures.js (clock pinned to 2026-09-26).
  // Returns what it observed; screenshots go to docs/design/period-picker/evidence/.
  const size = page.viewportSize();
  const tag = size.width < 640 ? 'phone' : 'desktop';
  const shot = (name) => page.screenshot({ path: `/Users/justin/code/personal/OtterMint/.claude/worktrees/period-picker/docs/design/period-picker/evidence/${tag}-${name}.png` });
  const out = {};
  const button = page.getByTestId('period-button');
  const label = async () => (await button.innerText()).trim();
  const pressed = () => page.locator('[aria-label="Quick ranges"] button[aria-pressed="true"]').allInnerTexts();
  const has = (text) => page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
  const count = (text) => page.getByText(text, { exact: true }).count();
  const columns = () => page.locator('section[aria-label="Cash flow"] button[data-month]').evaluateAll((els) => els.map((e) => e.dataset.month + (e.getAttribute('aria-pressed') === 'true' ? '*' : '')));
  const cell = (name) => page.getByRole('dialog').getByRole('button', { name, exact: true });
  const centre = async (locator) => { const b = await locator.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const settle = () => page.waitForTimeout(700);

  await page.goto('http://localhost:3000/');
  await page.getByText('Where it went').waitFor();
  await page.waitForTimeout(2500);
  out.open6M = { label: await label(), pressed: await pressed(), columns: await columns(), caption: await has('Compared with the previous 6 months') };
  await shot('dashboard-6m');

  await page.getByRole('button', { name: 'MTD', exact: true }).click(); await settle();
  out.mtd = { label: await label(), pressed: await pressed(), vs: await count('vs Aug 1–26'), columns: await columns() };
  await shot('dashboard-mtd');

  await page.getByRole('button', { name: 'YTD', exact: true }).click(); await settle();
  out.ytd = { label: await label(), vs: await count('vs 2025 to date') };

  await page.getByRole('button', { name: 'Previous year' }).click(); await settle();
  out.year2025 = { label: await label(), pressed: await pressed(), accentBorder: (await button.getAttribute('class')).includes('border-accent'),
    noHistory: await has('No net worth history for this period.'), heading: await has('Net worth at the end of Dec 2025'), columns: (await columns()).length,
    nextYearEnabled: await page.getByRole('button', { name: 'Next year' }).isEnabled(), prevYearDisabled: await page.getByRole('button', { name: 'Previous year' }).isDisabled() };
  await shot('dashboard-2025');

  // Click one month in the picker.
  await button.click();
  await page.getByRole('button', { name: 'Later year' }).click();
  out.pickerForm = await page.getByRole('dialog').evaluate((d) => { const r = d.getBoundingClientRect(); return { position: getComputedStyle(d).position, width: Math.round(r.width), bottomGap: Math.round(innerHeight - r.bottom) }; });
  await shot('picker-open');
  await page.mouse.click(...(await centre(cell('August 2026')))); await settle();
  out.august = { label: await label(), dialogClosed: (await page.getByRole('dialog').count()) === 0, heading: await has('Net worth at the end of Aug 2026'), vs: await count('vs Jul'), columns: await columns() };
  await shot('dashboard-august');

  await page.getByRole('button', { name: 'Next month' }).click(); await settle();
  out.nextToMtd = { label: await label(), pressed: await pressed(), nextDisabled: await page.getByRole('button', { name: 'Next month' }).isDisabled() };

  // Drag from March to June.
  await button.click();
  const from = await centre(cell('March 2026')), to = await centre(cell('June 2026'));
  await page.mouse.move(...from); await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(...to, { steps: 4 });
  out.dragHint = await has('Release to select Mar–Jun 2026.');
  await shot('picker-dragging');
  await page.mouse.up(); await settle();
  out.range = { label: await label(), dialogClosed: (await page.getByRole('dialog').count()) === 0, vs: await count('vs prior 4 mo'), columns: await columns(), pressed: await pressed() };
  await shot('dashboard-range');

  // A drag that leaves the picker changes nothing.
  await button.click();
  const start = await centre(cell('January 2026'));
  await page.mouse.move(...start); await page.mouse.down();
  await page.mouse.move(start[0] + 40, start[1], { steps: 2 });
  await page.mouse.move(size.width - 20, 20, { steps: 4 });
  await page.mouse.up(); await settle();
  out.dragOut = { label: await label(), dialogOpen: (await page.getByRole('dialog').count()) === 1 };
  await page.keyboard.press('Escape');
  out.escape = { dialogClosed: (await page.getByRole('dialog').count()) === 0, focusOnButton: await button.evaluate((b) => document.activeElement === b) };

  // Keyboard: Enter selects, Shift+Enter extends, focus ring is visible.
  await button.focus(); await page.keyboard.press('Enter');
  await cell('May 2026').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  out.focusRing = await cell('May 2026').evaluate((e) => { const s = getComputedStyle(e); return `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`; });
  await page.keyboard.press('Enter'); await settle();
  out.keyboardMonth = await label();
  await button.focus(); await page.keyboard.press('Enter');
  await cell('July 2026').focus(); await page.keyboard.press('Shift+Enter'); await settle();
  out.keyboardRange = await label();

  // Tab order from the first segment.
  await page.locator('[aria-label="Quick ranges"] button').first().focus();
  const order = [];
  for (let i = 0; i < 9; i++) { order.push(await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim())); await page.keyboard.press('Tab'); }
  out.tabOrder = order;

  // A column click makes that month the period.
  await page.getByRole('button', { name: '6M', exact: true }).click(); await settle();
  await page.locator('section[aria-label="Cash flow"] button[data-month="2026-07"]').click(); await settle();
  out.columnClick = { label: await label(), columns: await columns() };

  // March 2026: one month-end point, change measured from the February close.
  await button.click();
  await page.mouse.click(...(await centre(cell('March 2026')))); await page.waitForTimeout(1500);
  out.march = { label: await label(), heading: await has('Net worth at the end of Mar 2026'), change: await page.locator('section[aria-label^="Net worth"]').getByText(/Feb 28–Mar 31/).count(), estimates: await has('includes estimates') };
  await shot('dashboard-march');

  out.layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth,
    controlHeights: [...document.querySelectorAll('[aria-label="Quick ranges"] button, [data-testid="period-button"], button[aria-label^="Previous"], button[aria-label^="Next"]')].map((e) => Math.round(e.getBoundingClientRect().height)) }));
  out.rollingRanges = {};
  for (const id of ['3M', '6M', '1Y', 'All']) {
    await page.getByRole('button', { name: id, exact: true }).click(); await settle();
    out.rollingRanges[id] = { label: await label(), columns: (await columns()).length };
  }
  return out;
}
