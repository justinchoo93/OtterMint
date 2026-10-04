async (page) => {
  // Production-like fixtures: transactions start Jan 2025, six month-end
  // reconstructed net-worth points, then weekly observed points, and a
  // recurring-charge list for the Analytics tab.
  const BASE = 'http://localhost:3000';
  await page.context().addCookies([{ name: 'session_id', value: '00000000-0000-4000-8000-000000000001', url: BASE }]);
  const parse = (u) => {
    const m = u.match(/^https?:\/\/[^/]+(\/[^?#]*)(?:\?([^#]*))?/);
    const q = {};
    (m && m[2] ? m[2].split('&') : []).forEach((kv) => {
      const [k, v] = kv.split('=');
      const key = decodeURIComponent(k), val = decodeURIComponent((v ?? '').replace(/\+/g, ' '));
      q[key] = key in q ? [].concat(q[key], val) : val;
    });
    return { p: m ? m[1] : u, q };
  };
  // The data below ends on 2026-09-26, so pin the page's clock there: the period picker reads today's date.
  await page.clock.setFixedTime(new Date('2026-09-26T12:00:00Z'));
  const money = (n) => n.toFixed(2);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const TODAY = Date.UTC(2026, 8, 26);
  const history = (days) => {
    const snapshots = [];
    let v = 352000;
    const start = TODAY - days * 864e5;
    // reconstructed month ends Jan..Jun
    for (let m = 0; m < 6; m++) {
      const t = Date.UTC(2026, m + 1, 0);
      v += 5200 + Math.sin(m) * 3000;
      if (t < start) continue;
      snapshots.push({ t, v, rec: true });
    }
    for (let t = Date.UTC(2026, 6, 1); t <= TODAY; t += 7 * 864e5) {
      v += 900 + Math.sin(t / 5e8) * 2600;
      if (t < start) continue;
      snapshots.push({ t, v, rec: false });
    }
    let last = snapshots.at(-1);
    if (last.t !== TODAY) snapshots.push({ t: TODAY, v: 396510, rec: false });
    else last.v = 396510;
    const rows = snapshots.map(({ t, v, rec }, i) => ({ date: iso(t), totalAssets: money(v + 125740), totalLiabilities: '125740.00',
      netWorth: money(v), depositoryTotal: null, creditTotal: null, investmentTotal: null, loanTotal: null,
      manualAssetsTotal: null, manualLiabilitiesTotal: null, coverageFingerprint: 'fp-1',
      reconstructionNotes: rec ? 'Month-end total estimated from bank and brokerage statements.' : null,
      adjustedTotalAssets: money(v + 125740), adjustedTotalLiabilities: '125740.00', adjustedNetWorth: money(v),
      quality: rec ? 'reconstructed' : 'observed', coverageSegment: rec ? 0 : 1, comparisonSegment: rec ? 0 : 1 }));
    const events = [{ date: '2026-08-13', kind: 'captured_addition', assetAdjustment: '0.00', liabilityAdjustment: '0.00', netWorthAdjustment: '0.00', sourceCount: 1, label: 'Account connected' }]
      .filter((e) => Date.parse(e.date) >= start);
    return { snapshots: rows, coverageEvents: events, periodChange: null };
  };
  const CATS = [['RENT_AND_UTILITIES_RENT', 'RENT_AND_UTILITIES', .30], ['FOOD_AND_DRINK_RESTAURANTS', 'FOOD_AND_DRINK', .17],
    ['FOOD_AND_DRINK_GROCERIES', 'FOOD_AND_DRINK', .15], ['GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'GENERAL_MERCHANDISE', .09],
    ['TRANSPORTATION_GAS', 'TRANSPORTATION', .07], ['RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', 'RENT_AND_UTILITIES', .06],
    ['ENTERTAINMENT_TV_AND_MOVIES', 'ENTERTAINMENT', .05], ['GENERAL_SERVICES_INSURANCE', 'GENERAL_SERVICES', .05],
    ['PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS', 'PERSONAL_CARE', .03], ['TRANSFER_OUT_OTHER_TRANSFER_OUT', 'TRANSFER_OUT', .02],
    ['MEDICAL_PHARMACIES_AND_SUPPLEMENTS', 'MEDICAL', .01]];
  const cashflow = (n) => {
    const months = [];
    for (let i = n - 1; i >= 0; i--) {
      const month = iso(Date.UTC(2026, 8 - i, 1)).slice(0, 7);
      const hasData = month >= '2025-01';
      const k = 1 + Math.sin(i * 1.7) * 0.12, part = i === 0 ? 0.85 : 1;
      const income = hasData ? 9400 * (i % 6 === 3 ? 1.35 : 1) * part : 0;
      const spending = hasData ? 6300 * k * part : 0;
      const savings = hasData ? (month === '2026-05' ? -800 : 1600 * k * part) : 0;
      months.push({ month, partial: i === 0, income: money(income), spending: money(spending), savings: money(savings),
        netCashFlow: money(income - spending),
        spendingByCategory: hasData ? CATS.map(([key, primary, s]) => ({ key, primary, total: money(spending * s) })) : [],
        // Month to date: the same figures through today's day of the month (85% of the month here).
        toDate: { income: money(income * 0.85), spending: money(spending * 0.85), savings: money(savings * 0.85), netCashFlow: money((income - spending) * 0.85),
          spendingByCategory: hasData ? CATS.map(([key, primary, s]) => ({ key, primary, total: money(spending * s * 0.85) })) : [] },
        incomeItems: hasData ? [
          { date: month + '-01', amount: money(income / 2), name: 'ACME PAYROLL', merchantName: null, categoryKey: 'INCOME_WAGES', accountName: 'TOTAL CHECKING' },
          { date: month + '-15', amount: money(income / 2), name: 'ACME PAYROLL', merchantName: null, categoryKey: 'INCOME_WAGES', accountName: 'TOTAL CHECKING' }] : [],
        savingsItems: hasData ? (savings < 0
          ? [{ date: month + '-12', amount: money(savings), name: 'Manual CR-Bkrg', merchantName: null, categoryKey: 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS', accountName: 'TOTAL CHECKING' }]
          : [{ date: month + '-16', amount: money(savings), name: 'Transfer to brokerage', merchantName: null, categoryKey: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', accountName: 'TOTAL CHECKING' }]) : [] });
    }
    return { months };
  };
  const acct = (id, name, type, bal) => ({ id, accountId: 'acct-' + id, name, officialName: null, type, subtype: null,
    mask: String(1000 + id), currentBalance: money(bal), availableBalance: null, limitAmount: null, isoCurrencyCode: 'USD',
    lastRefreshedAt: new Date(Date.now() - 240000).toISOString(), institutionName: 'Sample Bank', errorCode: null });
  const calls = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/api/**', async (route) => {
    const { p, q } = parse(route.request().url());
    calls.push(route.request().url().replace(BASE, ''));
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/auth/me') return json({ user: { id: 'u1', email: 'sample@example.com', displayName: 'Sample User' } });
    if (p === '/api/groups') return json({ groups: [] });
    if (p === '/api/accounts') return json({ itemStatuses: [], accounts: [acct(1, 'TOTAL CHECKING', 'depository', 18450),
      acct(2, 'Brokerage', 'investment', 402300), acct(3, 'Roth IRA', 'investment', 101500),
      acct(4, 'Sapphire', 'credit', 2740), acct(5, 'Mortgage', 'loan', 123000)] });
    if (p === '/api/manual-accounts') return json({ manualAccounts: [] });
    if (p === '/api/net-worth' || /^\/api\/groups\/[^/]+\/net-worth$/.test(p)) return json(history(Number(q.days ?? 90)));
    if (p === '/api/analytics/cashflow') return json(cashflow(Number(q.months ?? 6)));
    if (p === '/api/analytics/cashflow/items') {
      const cats = [].concat(q.category ?? []);
      const items = [];
      for (let d = 26; d >= 1; d -= 3) items.push({ date: `${q.to}-${String(d).padStart(2, '0')}`, amount: money(20 + d * 3.1), name: 'MERCHANT ' + d,
        merchantName: 'Sample Merchant ' + d, categoryKey: cats[0] ?? 'FOOD_AND_DRINK_RESTAURANTS', accountName: 'Sapphire' });
      const limit = Number(q.limit ?? 200);
      return json({ count: items.length + 30, total: '1234.56', items: items.slice(0, limit) });
    }
    if (p === '/api/analytics/recurring') {
      const charge = (merchant, cadence, amount, last, next, extra) => ({ key: merchant.toLowerCase(), merchant, cadence, amount: money(amount),
        monthlyEquivalent: money(cadence === 'yearly' ? amount / 12 : cadence === 'weekly' ? amount * 52 / 12 : amount),
        firstDate: cadence === 'yearly' ? '2025-03-14' : '2025-10-' + last.slice(8), lastDate: last, nextExpected: next, count: cadence === 'yearly' ? 2 : 12,
        varies: null, priceChange: null, isNew: false, categoryKey: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES', accountName: 'Sapphire', ...extra });
      const charges = [
        charge('Rent payment', 'monthly', 2850, '2026-09-01', '2026-10-01', { categoryKey: 'RENT_AND_UTILITIES_RENT', accountName: 'TOTAL CHECKING' }),
        charge('State Farm', 'monthly', 142.6, '2026-09-12', '2026-10-12', { categoryKey: 'GENERAL_SERVICES_INSURANCE' }),
        charge('City Light & Power', 'monthly', 96.4, '2026-09-15', '2026-10-15', { varies: { min: '71.00', max: '138.00' }, categoryKey: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', accountName: 'TOTAL CHECKING' }),
        charge('Verizon Wireless', 'monthly', 85.12, '2026-09-18', '2026-10-18', { categoryKey: 'RENT_AND_UTILITIES_TELEPHONE' }),
        charge('Xfinity', 'monthly', 79.99, '2026-09-08', '2026-10-08', { categoryKey: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE' }),
        charge('Gym membership', 'monthly', 49, '2026-09-03', '2026-10-03', { categoryKey: 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS' }),
        charge('ChatGPT Plus', 'monthly', 20, '2026-09-20', '2026-10-20', { firstDate: '2026-08-20', count: 2, isNew: true }),
        charge('Netflix', 'monthly', 17.99, '2026-09-22', '2026-10-22', { priceChange: { from: '15.49', to: '17.99', since: '2026-07-22' }, categoryKey: 'ENTERTAINMENT_TV_AND_MOVIES' }),
        charge('The New York Times', 'monthly', 17, '2026-09-05', '2026-10-05', {}),
        charge('Spotify', 'monthly', 11.99, '2026-09-10', '2026-10-10', { categoryKey: 'ENTERTAINMENT_MUSIC_AND_AUDIO' }),
        charge('Amazon Prime', 'yearly', 139, '2026-03-14', '2027-03-14', { categoryKey: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' }),
        charge('iCloud+', 'monthly', 2.99, '2026-09-26', '2026-10-26', {}),
      ];
      const monthly = charges.reduce((sum, c) => sum + Number(c.monthlyEquivalent), 0);
      return json({ charges, monthlyTotal: money(monthly), yearlyTotal: money(monthly * 12), shareOfSpending: Math.round(monthly / 6300 * 100), asOf: iso(TODAY) });
    }
    if (p === '/api/transactions') return json({ transactions: [] });
    if (p === '/api/holdings') return json({ holdings: [] });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no fixture for ' + p }) });
  });
  await page.exposeFunction('__harnessCalls', () => calls.splice(0)).catch(() => {});
  return 'harness ready (prod mode)';
}
