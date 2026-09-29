async (page) => {
  // Mock-parity fixtures: the approved mock's own sample data (docs/design/investments-redesign/boards),
  // shaped as the app's API responses so the real Investments page renders with no database.
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
  const fixed4 = (n) => n.toFixed(4);
  const DAY = 86400000;
  const START = Date.UTC(2026, 3, 1);
  const TODAY = Date.UTC(2026, 8, 29);
  const N = Math.round((TODAY - START) / DAY) + 1;
  const iso = (i) => new Date(START + i * DAY).toISOString().slice(0, 10);
  const di = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - START) / DAY);

  // ---- The mock's sample-data generator (copied from boards/desktop.dc.html) ----
  const ACCOUNTS = [
    { id: 'acc_6850', inst: 'Chase', name: 'Self-Directed', mask: '6850', subtype: 'brokerage', start: 0, initial: 296000, endValue: 312480.42, vol: 0.005, seed: 12, anchor: di(2026, 8, 15) },
    { id: 'acc_6940', inst: 'Chase', name: 'Self-Directed', mask: '6940', subtype: 'brokerage', start: 0, initial: 13400, endValue: 18960.18, vol: 0.004, seed: 23, anchor: di(2026, 8, 15) },
    { id: 'acc_5111', inst: 'Charles Schwab', name: 'Individual', mask: '5111', subtype: 'brokerage', start: di(2026, 4, 22), initial: 0, endValue: 47514.67, vol: 0.010, seed: 43, moneyIn: 35000, opened: '2026-04-22' },
    { id: 'acc_6093', inst: 'Charles Schwab', name: 'Roth IRA', mask: '6093', subtype: 'roth', start: di(2026, 4, 10), initial: 0, endValue: 12449.31, vol: 0.012, seed: 41, moneyIn: 17500.14, opened: '2026-04-10' }
  ];
  // Reader-signed amounts (a buy is negative), newest first.
  const ACTIVITY = [
    { d: [2026, 9, 26], acct: 'acc_5111', kind: 'buy', text: 'Bought NVDA', qty: 20, price: 178.2, amount: -3564, sec: 'sec_nvda' },
    { d: [2026, 9, 24], acct: 'acc_5111', kind: 'sell', text: 'Sold to close AAPL 10/17/26 $240 call', qty: -3, price: 9.7, amount: 2910, sec: 'sec_aapl_c2' },
    { d: [2026, 9, 19], acct: 'acc_6940', kind: 'dividend', text: 'SCHD dividend', amount: 104.8 },
    { d: [2026, 9, 15], acct: 'acc_6940', kind: 'deposit', text: 'Deposit from Chase checking', amount: 5000 },
    { d: [2026, 9, 12], acct: 'acc_6850', kind: 'interest', text: 'Sweep interest', amount: 38.12 },
    { d: [2026, 9, 8], acct: 'acc_6093', kind: 'sell', text: 'Sold CRWD', qty: -15, price: 421, amount: 6315, sec: 'sec_crwd' },
    { d: [2026, 9, 2], acct: 'acc_6850', kind: 'buy', text: 'Bought VTI', qty: 20, price: 308.1, amount: -6162, sec: 'sec_vti' },
    { d: [2026, 8, 27], acct: 'acc_5111', kind: 'buy', text: 'Bought to open AAPL 12/18/26 $260 call', qty: 5, price: 14.1, amount: -7050, sec: 'sec_aapl_c' },
    { d: [2026, 8, 22], acct: 'acc_6850', kind: 'sell', text: 'Sold QQQ', qty: -10, price: 572.4, amount: 5724, sec: 'sec_qqq' },
    { d: [2026, 8, 14], acct: 'acc_6093', kind: 'buy', text: 'Bought NVDA', qty: 30, price: 168.4, amount: -5052, sec: 'sec_nvda' },
    { d: [2026, 8, 12], acct: 'acc_6850', kind: 'interest', text: 'Sweep interest', amount: 41.05 },
    { d: [2026, 8, 3], acct: 'acc_6850', kind: 'withdrawal', text: 'Transfer to Chase checking', amount: -2000 },
    { d: [2026, 7, 28], acct: 'acc_5111', kind: 'sell', text: 'Sold to close NVDA 08/21/26 $170 call', qty: -4, price: 4.2, amount: 1680, sec: 'sec_nvda_c' },
    { d: [2026, 7, 12], acct: 'acc_6850', kind: 'interest', text: 'Sweep interest', amount: 44.9 },
    { d: [2026, 7, 2], acct: 'acc_6850', kind: 'dividend', text: 'VTI dividend', amount: 362.5 },
    { d: [2026, 7, 1], acct: 'acc_6850', kind: 'buy', text: 'Bought AAPL', qty: 40, price: 213.5, amount: -8540, sec: 'sec_aapl_chase' },
    { d: [2026, 6, 27], acct: 'acc_6940', kind: 'dividend', text: 'SCHD dividend', amount: 98.2 },
    { d: [2026, 6, 18], acct: 'acc_5111', kind: 'buy', text: 'Bought AAPL', qty: 80, price: 198.2, amount: -15856, sec: 'sec_aapl' },
    { d: [2026, 6, 12], acct: 'acc_6850', kind: 'interest', text: 'Sweep interest', amount: 43.1 },
    { d: [2026, 6, 3], acct: 'acc_5111', kind: 'deposit', text: 'Deposit from Chase checking', amount: 12500 },
    { d: [2026, 5, 20], acct: 'acc_5111', kind: 'deposit', text: 'Deposit from Chase checking', amount: 7500 },
    { d: [2026, 5, 12], acct: 'acc_6850', kind: 'interest', text: 'Sweep interest', amount: 40.8 },
    { d: [2026, 5, 8], acct: 'acc_6093', kind: 'deposit', text: 'Roth conversion', amount: 5000 },
    { d: [2026, 5, 6], acct: 'acc_5111', kind: 'deposit', text: 'Deposit from Chase checking', amount: 5000 },
    { d: [2026, 5, 4], acct: 'acc_6093', kind: 'buy', text: 'Bought CRWD', qty: 25, price: 389, amount: -9725, sec: 'sec_crwd' },
    { d: [2026, 4, 24], acct: 'acc_6093', kind: 'deposit', text: 'Roth conversion', amount: 5000 },
    { d: [2026, 4, 22], acct: 'acc_5111', kind: 'deposit', text: 'Deposit from Chase checking', amount: 10000 },
    { d: [2026, 4, 10], acct: 'acc_6093', kind: 'deposit', text: 'Roth conversion', amount: 7500.14 }
  ];
  const TICKERS = {
    VTI: { name: 'Vanguard Total Stock Market ETF', type: 'etf', price: 312.4, vol: 0.006, drift: 0.0005, seed: 101 },
    QQQ: { name: 'Invesco QQQ Trust', type: 'etf', price: 586.3, vol: 0.008, drift: 0.0006, seed: 102 },
    SCHD: { name: 'Schwab U.S. Dividend Equity ETF', type: 'etf', price: 27.15, vol: 0.005, drift: 0.0002, seed: 103 },
    AAPL: { name: 'Apple Inc.', type: 'equity', price: 248.1, vol: 0.008, drift: 0.0007, seed: 108 },
    NVDA: { name: 'NVIDIA Corp.', type: 'equity', price: 181.5, vol: 0.016, drift: 0.0008, seed: 105 },
    CRWD: { name: 'CrowdStrike Holdings', type: 'equity', price: 434.2, vol: 0.016, drift: -0.0006, seed: 106 },
    AAPL261218C00260000: { name: 'AAPL Dec 18 2026 260 Call', type: 'derivative', price: 12.4, vol: 0.03, drift: -0.002, seed: 107, mult: 100 }
  };
  const POSITIONS = [
    { acct: 'acc_6850', t: 'VTI', sec: 'sec_vti', qty: 420, cost: 112788 },
    { acct: 'acc_6850', t: 'QQQ', sec: 'sec_qqq', qty: 60, cost: 31068 },
    { acct: 'acc_6850', t: 'AAPL', sec: 'sec_aapl_chase', qty: 100, cost: 19650 },
    { acct: 'acc_6850', t: 'CASH', sec: 'sec_cash_6850', value: 121284.42 },
    { acct: 'acc_6940', t: 'SCHD', sec: 'sec_schd', qty: 400, cost: 10220 },
    { acct: 'acc_6940', t: 'CASH', sec: 'sec_cash_6940', value: 8100.18 },
    { acct: 'acc_5111', t: 'AAPL', sec: 'sec_aapl', qty: 80, cost: 15856 },
    { acct: 'acc_5111', t: 'NVDA', sec: 'sec_nvda', qty: 110, cost: 16940 },
    { acct: 'acc_5111', t: 'AAPL261218C00260000', sec: 'sec_aapl_c', qty: 5, cost: 7050 },
    { acct: 'acc_5111', t: 'CASH', sec: 'sec_cash_5111', value: 1501.67 },
    { acct: 'acc_6093', t: 'NVDA', sec: 'sec_nvda', qty: 40, cost: 6736 },
    { acct: 'acc_6093', t: 'CRWD', sec: 'sec_crwd', qty: 10, cost: 4990 },
    { acct: 'acc_6093', t: 'CASH', sec: 'sec_cash_6093', value: 847.31 }
  ];
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) { const u = Math.max(rnd(), 1e-9); const v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const accounts = ACCOUNTS.map((acc) => {
    const rnd = mulberry32(acc.seed);
    const rets = [];
    for (let i = 0; i < N; i++) rets.push(gauss(rnd) * acc.vol);
    const flows = new Array(N).fill(0);
    ACTIVITY.forEach((e) => {
      if (e.acct !== acc.id) return;
      if (e.kind === 'deposit' || e.kind === 'withdrawal') flows[di(e.d[0], e.d[1], e.d[2])] += e.amount;
    });
    const run = (delta) => {
      const v = new Array(N).fill(null);
      let cur = null;
      for (let i = acc.start; i < N; i++) {
        cur = cur === null ? acc.initial : cur * (1 + rets[i] + delta);
        cur += flows[i];
        v[i] = cur;
      }
      return v;
    };
    let lo = -0.05, hi = 0.05, values = run(0);
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      values = run(mid);
      if (values[N - 1] < acc.endValue) lo = mid; else hi = mid;
    }
    values[N - 1] = acc.endValue;
    return Object.assign({}, acc, { values, flows });
  });
  const agg = [];
  for (let i = 0; i < N; i++) {
    let sum = 0;
    accounts.forEach((a) => { if (a.values[i] !== null) sum += a.values[i]; });
    agg.push(sum);
  }
  const prices = {};
  Object.keys(TICKERS).forEach((key) => {
    const tk = TICKERS[key];
    const rnd = mulberry32(tk.seed);
    const p = new Array(N);
    p[N - 1] = tk.price;
    for (let i = N - 1; i > 0; i--) p[i - 1] = p[i] / (1 + tk.drift + gauss(rnd) * tk.vol);
    prices[key] = p;
  });

  // ---- Map it onto the API shape for the requested window ----
  const investments = (days) => {
    const sinceIdx = Math.max(0, N - 1 - days);
    const since = new Date(TODAY - days * DAY).toISOString().slice(0, 10);
    const today = iso(N - 1);
    const points = [];
    for (let i = sinceIdx; i < N; i++) points.push({ date: iso(i), value: fixed2(agg[i]), segment: 0, quality: 'known' });
    const accountsOut = accounts.map((a) => {
      const pts = [];
      for (let i = Math.max(sinceIdx, a.start); i < N; i++) pts.push({ date: iso(i), value: fixed2(a.values[i]) });
      let netGain;
      if (a.moneyIn) {
        netGain = { mode: 'lifetime', startDate: a.opened, netContributions: fixed2(a.moneyIn), gain: fixed2(a.endValue - a.moneyIn), gainPct: ((a.endValue - a.moneyIn) / a.moneyIn * 100).toFixed(1) };
      } else {
        let flows = 0;
        for (let i = a.anchor + 1; i < N; i++) flows += a.flows[i];
        const base = a.values[a.anchor] + flows;
        const gain = a.endValue - a.values[a.anchor] - flows;
        netGain = { mode: 'anchored', startDate: iso(a.anchor), netContributions: fixed2(flows), gain: fixed2(gain), gainPct: (gain / base * 100).toFixed(1) };
      }
      return { accountId: a.id, name: a.name, mask: a.mask, institutionName: a.inst, subtype: a.subtype, balance: fixed2(a.endValue), points: pts, netGain };
    });
    const idx = (e) => di(e.d[0], e.d[1], e.d[2]);
    const inWindow = ACTIVITY.filter((e) => idx(e) >= sinceIdx);
    const flows = inWindow.filter((e) => e.kind === 'deposit' || e.kind === 'withdrawal')
      .map((e) => ({ date: iso(idx(e)), accountId: e.acct, kind: e.kind, amount: fixed2(Math.abs(e.amount)) })).reverse();
    const income = inWindow.filter((e) => e.kind === 'dividend' || e.kind === 'interest')
      .map((e) => ({ date: iso(idx(e)), accountId: e.acct, kind: e.kind, amount: fixed2(e.amount) })).reverse();
    const ttm = accounts.map((a) => ({ accountId: a.id, amount: fixed2(ACTIVITY.filter((e) => e.acct === a.id && (e.kind === 'dividend' || e.kind === 'interest')).reduce((t, e) => t + e.amount, 0)) }));
    const positions = POSITIONS.map((p) => {
      const account = ACCOUNTS.find((a) => a.id === p.acct);
      if (p.t === 'CASH') {
        return { accountId: p.acct, accountName: account.name, securityId: p.sec, tickerSymbol: null, name: 'Cash', securityType: 'cash', isCashEquivalent: true,
          quantity: p.value.toFixed(8), price: '1.0000', value: fixed2(p.value), costBasis: null, startPrice: null, startDate: null };
      }
      const tk = TICKERS[p.t];
      const mult = tk.mult || 1;
      return { accountId: p.acct, accountName: account.name, securityId: p.sec, tickerSymbol: p.t, name: tk.name, securityType: tk.type, isCashEquivalent: false,
        quantity: (p.qty * mult).toFixed(8), price: fixed4(tk.price), value: fixed2(p.qty * mult * tk.price), costBasis: fixed2(p.cost),
        startPrice: fixed4(prices[p.t][sinceIdx]), startDate: iso(sinceIdx) };
    });
    const activity = inWindow.map((e, i) => ({ id: 1000 - i, date: iso(idx(e)), accountId: e.acct, kind: e.kind, name: e.text, amount: fixed2(e.amount),
      quantity: e.qty === undefined ? null : e.qty.toFixed(8), price: e.price === undefined ? null : fixed4(e.price), securityId: e.sec ?? null }));
    return { today, since, portfolio: { points, boundaries: [], liveAppended: false }, accounts: accountsOut, flows, income,
      incomeTrailingTwelveMonths: ttm, positions, activity: activity.slice(0, 200), activityTotal: activity.length };
  };

  const acct = (id, a) => ({ id, accountId: a.id, name: a.name, officialName: null, type: 'investment', subtype: a.subtype, mask: a.mask,
    currentBalance: fixed2(a.endValue), availableBalance: null, limitAmount: null, isoCurrencyCode: 'USD',
    lastRefreshedAt: new Date(Date.now() - 7200000).toISOString(), institutionName: a.inst, errorCode: null });
  const calls = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/api/**', async (route) => {
    const { p, q } = parse(route.request().url());
    calls.push(route.request().url().replace(BASE, ''));
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/auth/me') return json({ user: { id: 'u1', email: 'sample@example.com', displayName: 'Justin' } });
    if (p === '/api/groups') return json({ groups: [] });
    if (p === '/api/accounts') return json({ itemStatuses: [], accounts: [
      ...ACCOUNTS.map((a, i) => acct(i + 1, a)),
      { id: 9, accountId: 'acc_chk', name: 'Total Checking', officialName: null, type: 'depository', subtype: 'checking', mask: '4821',
        currentBalance: '18456.00', availableBalance: null, limitAmount: null, isoCurrencyCode: 'USD',
        lastRefreshedAt: new Date(Date.now() - 7200000).toISOString(), institutionName: 'Chase', errorCode: null }] });
    if (p === '/api/manual-accounts') return json({ manualAccounts: [] });
    if (p === '/api/analytics/investments') return json(investments(Math.min(3650, Math.max(1, Number(q.days ?? 90)))));
    if (p === '/api/net-worth' || /^\/api\/groups\/[^/]+\/net-worth$/.test(p)) return json({ snapshots: [], coverageEvents: [], periodChange: null });
    if (p === '/api/analytics/cashflow') return json({ months: [] });
    if (p === '/api/transactions') return json({ transactions: [] });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no fixture for ' + p }) });
  });
  await page.exposeFunction('__harnessCalls', () => calls.splice(0)).catch(() => {});
  return 'harness ready (investments mock mode)';
}
