async (page) => {
  // Mock-parity fixtures: the approved mock's own sample data.
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
  const fixed2 = (n) => n.toFixed(2);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const TODAY = Date.UTC(2026, 8, 26);
  // ---- The approved mock's own sample-data generator (docs/design/analytics-redesign/source/desktop.dc.html) ----

const C = {
  ground: '#0A0D0C', surface: '#111614', raised: '#171D1A', hover: '#1C2320', border: '#242C28',
  grid: '#1E2622', base: '#2E3833', text: '#EDF1EF', text2: '#A3ADA8', text3: '#85908A',
  up: '#34D399', down: '#F0836F', income: '#199e70', spending: '#d95926', saved: '#3987e5'
};
const TRI_UP = 'M5 1l4 6H1z';
const TRI_DOWN = 'M5 7L1 1h8z';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RANGES = [
  { id: '3M', label: '3M', months: 3, weeks: 13 },
  { id: '6M', label: '6M', months: 6, weeks: 26 },
  { id: '1Y', label: '1Y', months: 12, weeks: 52 },
  { id: 'All', label: 'All', months: 24, weeks: 104 }
];
// Category colors are fixed per category (never by rank), from the app's validated chart palette.
const CATS = [
  { key: 'restaurants', name: 'Restaurants', share: 0.17, color: '#3987e5' },
  { key: 'groceries', name: 'Groceries', share: 0.15, color: '#d95926' },
  { key: 'rent', name: 'Rent', share: 0.30, color: '#199e70' },
  { key: 'utilities', name: 'Utilities', share: 0.06, color: '#c98500' },
  { key: 'transport', name: 'Transportation', share: 0.07, color: '#d55181' },
  { key: 'shopping', name: 'Online marketplaces', share: 0.09, color: '#008300' },
  { key: 'entertainment', name: 'Entertainment', share: 0.05, color: '#9085e9' },
  { key: 'insurance', name: 'Insurance', share: 0.05, color: '#e66767' },
  { key: 'other', name: 'Other', share: 0.06, color: '#7A857F' }
];
const MERCHANTS = {
  restaurants: ['Oddfellows Cafe', 'Tacos El Sol', 'Din Tai Fung', 'Blue Bottle Coffee', 'Sushi Kappo', 'Ramen House', 'Molly Moon\'s'],
  groceries: ['Trader Joe\'s', 'Costco Wholesale', 'Safeway', 'H Mart', 'Whole Foods', 'Farmers market', 'Uwajimaya'],
  rent: ['Rent payment'],
  utilities: ['City Light & Power', 'Northwest Gas', 'Water utility', 'Xfinity', 'Verizon Wireless'],
  transport: ['Shell', 'Lyft', 'Transit pass reload', 'Chevron', 'Uber', 'Street parking', 'Toll pass'],
  shopping: ['Amazon', 'Amazon Marketplace', 'Etsy', 'eBay', 'Target.com', 'Amazon'],
  entertainment: ['Netflix', 'Spotify', 'AMC Theatres', 'Steam', 'Nintendo eShop', 'Symphony tickets'],
  insurance: ['State Farm', 'Health premium', 'Renters insurance'],
  other: ['Venmo', 'Cash withdrawal', 'USPS', 'Zelle payment', 'Apple.com', 'Rover']
};
const CARDS = ['Sapphire ···0193', 'Amex Gold ···3007', 'Checking ···4821'];
const CHECKING = 'Checking ···4821';
const LIABILITIES = 125740;
const COVERAGE_T = Date.UTC(2026, 5, 15);
const EST_BEFORE_T = Date.UTC(2026, 3, 1);

function lcg(seed) {
  let s = seed >>> 0;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function money(n) {
  const a = Math.abs(Math.round(n));
  return (n < 0 ? '−' : '') + '$' + a.toLocaleString('en-US');
}
function money2(n) {
  const a = Math.abs(n);
  return (n < 0 ? '−' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function signedMoney(n) { return (n >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function moneyK(n) {
  const a = Math.abs(n);
  const s = a >= 1000000 ? '$' + (a / 1000000).toFixed(2) + 'M' : a >= 1000 ? '$' + Math.round(a / 1000) + 'k' : '$' + Math.round(a);
  return (n < 0 ? '−' : '') + s;
}
function pct1(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%'; }
function pct0(n) { return (n >= 0 ? '+' : '−') + Math.abs(Math.round(n)) + '%'; }
function pctDelta(a, b) { return b ? (a - b) / Math.abs(b) * 100 : 0; }
function niceStep(span, target) {
  const raw = span / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const fs = [1, 2, 2.5, 5, 10];
  for (let i = 0; i < fs.length; i++) { if (fs[i] * pow >= raw) return fs[i] * pow; }
  return 10 * pow;
}
function spanLabel(months) {
  const a = months[0], b = months[months.length - 1];
  if (months.length === 1) return b.long;
  return a.y === b.y ? a.label + '–' + b.label + ' ' + b.y : a.label + ' ' + a.y + '–' + b.label + ' ' + b.y;
}
function dateLabel(t) {
  const d = new Date(t);
  return MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

// 48 months of sample cash flow ending Sep 2026 (the current, partial month).
function buildMonths() {
  const rnd = lcg(7);
  const out = [];
  for (let i = 0; i < 48; i++) {
    const y = 2022 + Math.floor((9 + i) / 12);
    const m = (9 + i) % 12;
    const growth = 1 + i * 0.006;
    let income = Math.round((8900 + (rnd() - 0.5) * 900) * growth);
    if (m === 5 || m === 11) income += 3200;
    const spending = Math.round((5400 + (rnd() - 0.5) * 1400) * growth + (m === 11 ? 900 : 0));
    const saved = Math.round((1500 + (rnd() - 0.5) * 700) * growth);
    const cats = {};
    let sum = 0;
    for (let c = 0; c < CATS.length; c++) {
      const cat = CATS[c];
      const noise = cat.key === 'rent' ? 1 : 1 + (rnd() - 0.5) * 0.5;
      cats[cat.key] = spending * cat.share * noise;
      sum += cats[cat.key];
    }
    for (let c = 0; c < CATS.length; c++) cats[CATS[c].key] = Math.round(cats[CATS[c].key] * spending / sum);
    const txCount = 90 + Math.round(rnd() * 60);
    out.push({ y: y, m: m, income: income, spending: spending, saved: saved, cats: cats, txCount: txCount, partial: i === 47, label: MONTH_NAMES[m], long: MONTH_NAMES[m] + ' ' + y });
  }
  const last = out[47];
  last.income = Math.round(last.income * 0.9);
  last.spending = Math.round(last.spending * 0.85);
  last.saved = Math.round(last.saved * 0.6);
  last.txCount = Math.round(last.txCount * 0.85);
  for (let c = 0; c < CATS.length; c++) last.cats[CATS[c].key] = Math.round(last.cats[CATS[c].key] * 0.85);
  return out;
}
// Weekly net worth for two years ending 2026-09-26; points before Apr 2026 are reconstructed.
function buildNetWorth() {
  const rnd = lcg(11);
  const pts = [];
  const end = Date.UTC(2026, 8, 26);
  const start = end - 104 * 7 * 86400000;
  let v = 318000;
  for (let i = 0; i <= 104; i++) {
    const t = start + i * 7 * 86400000;
    v += 900 + (rnd() - 0.48) * 7000;
    pts.push({ t: t, v: Math.round(v), est: t < EST_BEFORE_T });
  }
  return pts;
}
const MONTHS = buildMonths();
const NW = buildNetWorth();

function sparkOf(arr) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i]; }
  const rng = mx - mn || 1;
  let d = '', lx = 0, ly = 0;
  for (let i = 0; i < arr.length; i++) {
    lx = 2 + (i / (arr.length - 1)) * 92;
    ly = 3 + ((mx - arr[i]) / rng) * 28;
    d += (i ? ' L' : 'M') + lx.toFixed(1) + ' ' + ly.toFixed(1);
  }
  return { d: d, x: lx.toFixed(1), y: ly.toFixed(1) };
}
function txRows(seed, merchants, month, avg, n, catName, accounts, plus) {
  const rnd = lcg(seed);
  const maxDay = month.partial ? 26 : 28;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const day = Math.max(1, maxDay - i * 4 - Math.floor(rnd() * 3));
    const amt = avg * (0.55 + rnd() * 1.4);
    rows.push({
      c1: month.label + ' ' + day,
      c2: merchants[i % merchants.length],
      c3: catName,
      c4: accounts[Math.floor(rnd() * accounts.length)],
      c5: (plus ? '+' : '') + money2(amt),
      c5Color: plus ? C.up : C.text
    });
  }
  return rows;
}


  // ---- Map it onto API shapes ----
  const KEY = { restaurants: 'FOOD_AND_DRINK_RESTAURANTS', groceries: 'FOOD_AND_DRINK_GROCERIES', rent: 'RENT_AND_UTILITIES_RENT',
    utilities: 'RENT_AND_UTILITIES_UTILITIES', transport: 'TRANSPORTATION', shopping: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
    entertainment: 'ENTERTAINMENT', insurance: 'GENERAL_SERVICES_INSURANCE' };
  const OTHER_SPLIT = [['BANK_FEES', 0.3], ['PERSONAL_CARE', 0.3], ['MEDICAL', 0.25], ['GOVERNMENT_AND_NON_PROFIT', 0.15]];
  const cashflow = (n) => ({ months: MONTHS.slice(-n).map((m) => {
    const key = m.y + '-' + String(m.m + 1).padStart(2, '0');
    const cats = [];
    for (const c of CATS) {
      if (c.key === 'other') for (const [k, s] of OTHER_SPLIT) cats.push({ key: k, primary: k, total: fixed2(m.cats.other * s) });
      else cats.push({ key: KEY[c.key], primary: KEY[c.key].split('_')[0], total: fixed2(m.cats[c.key]) });
    }
    cats.sort((a, b) => Number(b.total) - Number(a.total));
    return { month: key, partial: m.partial, income: fixed2(m.income), spending: fixed2(m.spending), savings: fixed2(m.saved),
      netCashFlow: fixed2(m.income - m.spending), spendingByCategory: cats,
      // Month to date: the same figures through today's day of the month (85% of the month here).
      toDate: { income: fixed2(m.income * 0.85), spending: fixed2(m.spending * 0.85), savings: fixed2(m.saved * 0.85),
        netCashFlow: fixed2((m.income - m.spending) * 0.85), spendingByCategory: cats.map((c) => ({ ...c, total: fixed2(Number(c.total) * 0.85) })) },
      incomeItems: [
        { date: key + '-15', amount: fixed2(m.income * 0.47), name: 'Direct deposit · Payroll', merchantName: null, categoryKey: 'INCOME_WAGES', accountName: 'Checking ···4821' },
        { date: key + '-01', amount: fixed2(m.income * 0.04), name: 'Interest · High-yield savings', merchantName: null, categoryKey: 'INCOME_INTEREST_EARNED', accountName: 'Savings ···2290' }],
      savingsItems: [{ date: key + '-16', amount: fixed2(m.saved), name: 'Transfer to brokerage', merchantName: null, categoryKey: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', accountName: 'Checking ···4821' }] };
  }) });
  const history = (days) => {
    const start = TODAY - days * 864e5;
    const pts = NW.filter((p) => p.t >= start);
    const lastPre = pts.filter((p) => p.t < COVERAGE_T && !p.est).at(-1);
    const rows = pts.map((p) => {
      const rec = p.est, pre = p.t < COVERAGE_T;
      return { date: iso(p.t), totalAssets: fixed2(p.v + LIABILITIES), totalLiabilities: fixed2(LIABILITIES), netWorth: fixed2(p.v),
        depositoryTotal: null, creditTotal: null, investmentTotal: null, loanTotal: null, manualAssetsTotal: null, manualLiabilitiesTotal: null,
        coverageFingerprint: rec ? null : pre ? 'fp-a' : 'fp-b',
        reconstructionNotes: rec ? 'Month-end total estimated from statements.' : null,
        adjustedTotalAssets: fixed2(p.v + LIABILITIES), adjustedTotalLiabilities: fixed2(LIABILITIES), adjustedNetWorth: fixed2(p.v),
        quality: rec ? 'reconstructed' : p === lastPre ? 'flat_normalized' : 'observed',
        coverageSegment: rec ? 0 : pre ? 1 : 2, comparisonSegment: rec ? 0 : 1 };
    });
    const events = COVERAGE_T >= start ? [{ date: iso(COVERAGE_T), kind: 'captured_addition', assetAdjustment: '0.00', liabilityAdjustment: '0.00',
      netWorthAdjustment: '0.00', sourceCount: 1, label: 'Account connected' }] : [];
    return { snapshots: rows, coverageEvents: events, periodChange: null };
  };
  const acct = (id, name, type, bal) => ({ id, accountId: 'acct-' + id, name, officialName: null, type, subtype: null,
    mask: String(1000 + id), currentBalance: fixed2(bal), availableBalance: null, limitAmount: null, isoCurrencyCode: 'USD',
    lastRefreshedAt: new Date(Date.now() - 240000).toISOString(), institutionName: 'Sample Bank', errorCode: null });
  const calls = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/api/**', async (route) => {
    const { p, q } = parse(route.request().url());
    calls.push(route.request().url().replace(BASE, ''));
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/auth/me') return json({ user: { id: 'u1', email: 'sample@example.com', displayName: 'Sample User' } });
    if (p === '/api/groups') return json({ groups: [] });
    if (p === '/api/accounts') return json({ itemStatuses: [], accounts: [acct(1, 'Checking', 'depository', 18456),
      acct(2, 'Brokerage', 'investment', 402300), acct(3, 'Roth IRA', 'investment', 101500),
      acct(4, 'Sapphire', 'credit', 2740), acct(5, 'Mortgage', 'loan', 123000)] });
    if (p === '/api/manual-accounts') return json({ manualAccounts: [] });
    if (p === '/api/net-worth' || /^\/api\/groups\/[^/]+\/net-worth$/.test(p)) return json(history(Number(q.days ?? 90)));
    if (p === '/api/analytics/cashflow') return json(cashflow(Number(q.months ?? 6)));
    if (p === '/api/analytics/cashflow/items') {
      const cats = [].concat(q.category ?? []);
      const items = [];
      for (let d = 26; d >= 1; d -= 3) items.push({ date: `${q.to}-${String(d).padStart(2, '0')}`, amount: fixed2(20 + d * 3.1), name: 'MERCHANT ' + d,
        merchantName: ['Oddfellows Cafe','Tacos El Sol','Din Tai Fung','Blue Bottle Coffee','Sushi Kappo','Ramen House','Molly Moon\'s','Tacos El Sol','Din Tai Fung'][Math.floor((26 - d) / 3)], categoryKey: cats[0] ?? 'FOOD_AND_DRINK_RESTAURANTS', accountName: 'Sapphire' });
      const limit = Number(q.limit ?? 200);
      return json({ count: items.length + 30, total: '1234.56', items: items.slice(0, limit) });
    }
    if (p === '/api/analytics/recurring') {
      const charge = (merchant, cadence, amount, last, next, extra) => ({ key: merchant.toLowerCase(), merchant, cadence, amount: fixed2(amount),
        monthlyEquivalent: fixed2(cadence === 'yearly' ? amount / 12 : cadence === 'weekly' ? amount * 52 / 12 : amount),
        firstDate: cadence === 'yearly' ? '2025-03-14' : '2025-10-' + last.slice(8), lastDate: last, nextExpected: next, count: cadence === 'yearly' ? 2 : 12,
        varies: null, priceChange: null, isNew: false, categoryKey: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES', accountName: 'Sapphire ···0193', ...extra });
      const charges = [
        charge('Rent payment', 'monthly', 2850, '2026-09-01', '2026-10-01', { categoryKey: 'RENT_AND_UTILITIES_RENT', accountName: 'Checking ···4821' }),
        charge('State Farm', 'monthly', 142.6, '2026-09-12', '2026-10-12', { categoryKey: 'GENERAL_SERVICES_INSURANCE' }),
        charge('City Light & Power', 'monthly', 96.4, '2026-09-15', '2026-10-15', { varies: { min: '71.00', max: '138.00' }, categoryKey: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY', accountName: 'Checking ···4821' }),
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
      return json({ charges, monthlyTotal: fixed2(monthly), yearlyTotal: fixed2(monthly * 12), shareOfSpending: Math.round(monthly / 7300 * 100), asOf: iso(TODAY) });
    }
    if (p === '/api/transactions') return json({ transactions: [] });
    if (p === '/api/holdings') return json({ holdings: [] });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no fixture for ' + p }) });
  });
  await page.exposeFunction('__harnessCalls', () => calls.splice(0)).catch(() => {});
  return 'harness ready (mock mode)';
}
