async (page) => {
  // Acceptance walk-through for the Investments page. Run after
  // docs/design/investments-redesign/harness/mock-fixtures.js (clock pinned to 2026-09-29).
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
  const settle = () => page.waitForTimeout(1200);
  const hero = page.locator('section[aria-label="Investments over time"]');
  // Investments requests since the last call.
  const seen = [];
  const onRequest = (r) => { const u = r.url().replace('http://localhost:3000', ''); if (u.startsWith('/api/analytics/investments')) seen.push(u); };
  page.on('request', onRequest);
  const requests = async () => seen.splice(0);

  await page.goto('http://localhost:3000/');
  await page.getByRole('button', { name: 'Investments' }).first().click();
  await hero.waitFor();
  await page.waitForTimeout(2500);
  out.open3M = { label: await label(), pressed: await pressed(), requests: await requests(),
    barAboveHero: (await button.boundingBox()).y < (await hero.boundingBox()).y,
    rangeButtonsInHero: await hero.getByRole('button', { name: /^(1M|3M|6M|YTD|1Y|All)$/ }).count(),
    heroValue: (await hero.locator('span.font-semibold').first().innerText()).trim(), changeHeader: await has('3M change') };
  await shot('investments-3m');

  await page.getByRole('button', { name: 'MTD', exact: true }).click(); await settle();
  out.mtd = { label: await label(), requests: await requests(), changeHeader: await has('MTD change') };

  await button.click();
  out.bounds = { marchDisabled: await cell('March 2026').isDisabled(), aprilEnabled: await cell('April 2026').isEnabled(), earlierYearDisabled: await page.getByRole('button', { name: 'Earlier year' }).isDisabled() };
  await shot('investments-picker');
  await page.mouse.click(...(await centre(cell('July 2026'))));
  await page.mouse.move(5, 5); // off the chart, so the hero shows the closing value rather than a hovered day
  await settle();
  out.july = { label: await label(), requests: await requests(), heading: await has('Portfolio value at the end of Jul 2026'),
    heroValue: (await hero.locator('span.font-semibold').first().innerText()).trim(), caption: await hero.getByText(/^Jul \d+–\d+/).count(),
    changeColumn: await page.locator('section[aria-label="Holdings"]').getByText(/change$/).count(),
    asOfToday: await page.getByText(/as of today/).count(), tileToday: await page.locator('[aria-label="Account filter"]').getByText('today', { exact: true }).count(),
    activitySubtitle: await has('July 2026 · 4 events across all accounts'),
    activityDates: await page.locator('section[aria-label="Activity"]').evaluate((s) => [...new Set((s.innerText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+/g) || []).map((d) => d.slice(0, 3)))]) };
  await shot('investments-july');

  await page.getByRole('button', { name: 'Next month' }).click(); await settle();
  out.august = { label: await label(), requests: await requests() };
  await page.getByRole('button', { name: 'Next month' }).click(); await settle();
  out.backToMtd = { label: await label(), pressed: await pressed(), requests: await requests(), heading: await has('at the end of'), changeHeader: await has('MTD change') };

  // A custom range by drag, May to June.
  await button.click();
  const from = await centre(cell('May 2026')), to = await centre(cell('June 2026'));
  await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 5 }); await page.mouse.up(); await settle();
  out.range = { label: await label(), requests: await requests(), heading: await has('Portfolio value at the end of Jun 2026') };
  out.layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
  page.off('request', onRequest);
  return out;
}
