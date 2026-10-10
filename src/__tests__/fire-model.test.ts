import { describe, expect, it } from "vitest";
import type { CashflowMonth } from "@/lib/cashflow";
import {
  DEFAULT_ASSUMPTIONS,
  buildTimeline,
  defaultPlan,
  describeStatus,
  earliestRetirement,
  leverDates,
  maxRetireMonth,
  monthLabel,
  pensionFor,
  resolveParams,
  savingsRate,
  simulate,
  ssFactor,
  suggestKind,
  summarizeCashflow,
  type FireAssumptions,
  type FireModelAccount,
  type FireParams,
  type FirePlan,
  type FireResponse,
} from "@/lib/fire-model";

// The approved mock's sample household (docs/design/fire-calculator/source/desktop.dc.html).
function mockResponse(): FireResponse {
  return {
    asOf: "2026-10-09",
    cashflow: { takeHomeMonthly: 15000, spendingMonthly: 7500, cashSavedYearly: 90000, monthsCounted: 12, firstMonth: "2025-10", lastMonth: "2026-09" },
    accounts: [
      { key: "plaid:brk", name: "Brokerage", detail: "Chase ····6850", source: "plaid", balance: 450000, suggestedKind: "brokerage" },
      { key: "plaid:roth", name: "Roth IRA", detail: "Schwab ····6093", source: "plaid", balance: 7000, suggestedKind: "roth" },
      { key: "manual:1", name: "401(k)", detail: "Manual account", source: "manual", balance: 150000, suggestedKind: "k401" },
      { key: "plaid:checking", name: "Checking", detail: "Chase ····9701", source: "plaid", balance: 9000, suggestedKind: "excluded" },
    ],
    plan: null,
    savedAt: null,
  };
}

function mockPlan(): FirePlan {
  const assumptions: FireAssumptions = {
    ...DEFAULT_ASSUMPTIONS,
    yourAge: 35,
    partnerAge: 34,
    partnerTakeHomeMonthly: 6000,
    pensionOwner: "partner",
    pensionSalaryYearly: 95000,
    pensionServiceYears: 6,
    pensionStartAge: 65,
    ssYouMonthly: 2400,
    ssPartnerMonthly: 1800,
    rothBasisYou: 5000,
    rothBasisPartner: 15000,
  };
  return {
    version: 1,
    assumptions,
    appAccounts: { "manual:1": { contributionYearly: 24500 } },
    typedAccounts: [
      { id: "river", name: "River", owner: "you", kind: "crypto", balance: 15000, contributionYearly: 0 },
      { id: "roth-p", name: "Roth IRA", owner: "partner", kind: "roth", balance: 20000, contributionYearly: 0 },
      { id: "k457", name: "457(b)", owner: "partner", kind: "k457", balance: 60000, contributionYearly: 24500 },
      { id: "pers3", name: "PERS 3 investment account", owner: "partner", kind: "pers3", balance: 60000, contributionYearly: 9500 },
    ],
  };
}

function mockParams(): FireParams {
  return resolveParams(mockResponse(), mockPlan());
}

// A bare household for hand-checked cases: no pay, no returns, no tax.
function bare(accounts: Partial<FireModelAccount>[], overrides: Partial<FireParams> = {}): FireParams {
  return {
    asOfMonth: "2026-10",
    yourAge: 40,
    partnerAge: 40,
    planAge: 95,
    partnerOffsetYears: 0,
    yourTakeHomeMonthly: 0,
    partnerTakeHomeMonthly: 0,
    spendingMonthly: 0,
    cashSavedYearly: 0,
    healthMonthly: 0,
    taxRate: 0,
    returnBefore: 0,
    returnAfter: 0,
    returnCrypto: 0,
    inflation: 0.025,
    changes: [],
    pension: { owner: "none", salaryYearly: 0, serviceYears: 0, startAge: 65 },
    ssYou: { monthly: 0, claimAge: 67 },
    ssPartner: { monthly: 0, claimAge: 67 },
    accounts: [
      { key: "new-savings", label: "New savings", owner: "you", kind: "brokerage", balance: 0, contributionYearly: 0, rothBasis: 0, isNewSavings: true },
      ...accounts.map((a, i) => ({ key: `a${i}`, label: `Account ${i}`, owner: "you" as const, kind: "brokerage" as const, balance: 0, contributionYearly: 0, rothBasis: 0, ...a })),
    ],
    ...overrides,
  };
}

function pensionParams(partnerAge: number, serviceYears: number, startAge: number): FireParams {
  return bare([], { partnerAge, pension: { owner: "partner", salaryYearly: 100000, serviceYears, startAge } });
}

describe("ssFactor", () => {
  it("follows SSA's early and delayed rules", () => {
    expect(ssFactor(67)).toBe(1);
    expect(ssFactor(62)).toBeCloseTo(0.7, 6);
    expect(ssFactor(70)).toBeCloseTo(1.24, 6);
    expect(ssFactor(64)).toBeCloseTo(0.8, 6); // 36 months early: 20% less
  });
});

describe("pensionFor (WA PERS Plan 3)", () => {
  it("pays 1% of salary per year of service at 65", () => {
    expect(pensionFor(pensionParams(65, 10, 65), 0).monthly).toBeCloseTo(833.33, 2);
  });

  it("needs 10 years, or 5 after age 44, to vest", () => {
    expect(pensionFor(pensionParams(40, 9, 65), 0).monthly).toBe(0);
    expect(pensionFor(pensionParams(46, 5, 65), 0).monthly).toBeGreaterThan(0);
    expect(pensionFor(pensionParams(40, 9, 65), 0).startM).toBe(Infinity);
  });

  it("applies DRS's early factor below 65 and 5% a year with 30 years", () => {
    expect(pensionFor(pensionParams(55, 10, 55), 0).monthly).toBeCloseTo(833.33 * 0.4092, 1);
    expect(pensionFor(pensionParams(60, 30, 60), 0).monthly).toBeCloseTo(2500 * 0.75, 2);
  });

  it("is worn down by inflation while waiting, unless service reaches 20 years", () => {
    // Leaves at 45 with 12 years, starts at 65: frozen for 20 years.
    expect(pensionFor(pensionParams(45, 12, 65), 0).monthly).toBeCloseTo(1000 / Math.pow(1.025, 20), 2);
    // Leaves at 50 with 20 years: grows 0.25% a month for 15 years.
    expect(pensionFor(pensionParams(50, 20, 65), 0).monthly).toBeCloseTo((1666.67 * Math.pow(1.0025, 180)) / Math.pow(1.025, 15), 0);
  });

  it("counts service until the owner retires and starts no earlier than leaving", () => {
    const p = pensionFor(pensionParams(50, 8, 55), 60); // leaves at 55 with 13 years
    expect(p.service).toBeCloseTo(13, 6);
    expect(p.startAge).toBe(55);
    expect(p.startM).toBe(60);
  });
});

describe("simulate", () => {
  it("opens each kind of account by its rule", () => {
    const sim = simulate(
      bare([
        { kind: "k401" },
        { kind: "ira" },
        { kind: "roth" },
        { kind: "k457", owner: "partner" },
        { kind: "crypto" },
      ], { yourAge: 50, partnerAge: 48, partnerOffsetYears: 2 }),
      12
    );
    const open = Object.fromEntries(sim.accounts.map((a) => [a.kind === "brokerage" ? "new" : a.kind, a.openM]));
    expect(open.k401).toBe(114); // leaves at 51: waits for 59½
    expect(open.ira).toBe(114);
    expect(open.roth).toBe(114);
    expect(open.k457).toBe(36); // partner leaves two years after you
    expect(open.crypto).toBe(0);
    expect(open.new).toBe(0);
  });

  it("opens a 401(k) at once for someone leaving at 55 or later (Rule of 55)", () => {
    const sim = simulate(bare([{ kind: "k401" }, { kind: "ira" }], { yourAge: 56 }), 0);
    expect(sim.accounts[1].openM).toBe(0);
    expect(sim.accounts[2].openM).toBe(42); // a traditional IRA still waits for 59½
  });

  it("runs out when the money is spent", () => {
    const sim = simulate(bare([{ balance: 100000 }], { spendingMonthly: 10000 }), 0);
    expect(sim.outM).toBe(10);
    expect(sim.gapM).toBeNull();
    expect(sim.ok).toBe(false);
    expect(sim.path[10]).toBeCloseTo(0, 6);
  });

  it("flags a gap when open money runs short while locked money remains", () => {
    const params = bare([{ balance: 50000 }, { kind: "k401", balance: 900000 }], { spendingMonthly: 5000 });
    const sim = simulate(params, 0);
    expect(sim.gapM).toBe(10);
    expect(sim.outM).toBe(190); // the 401(k) is drawn early to keep the total honest
    expect(describeStatus(params, sim)).toEqual({ ok: false, text: "Short at 40: open accounts run dry before the rest unlock" });
  });

  it("lets Roth contributions bridge the gap before 59½", () => {
    const params = bare([{ kind: "roth", balance: 100000, rothBasis: 60000 }], { spendingMonthly: 1000, planAge: 50 });
    const sim = simulate(params, 0);
    expect(sim.gapM).toBe(60); // five years of basis, then only growth is left
  });

  it("puts a working partner's surplus into New savings", () => {
    const params = bare([{ balance: 1 }], { partnerTakeHomeMonthly: 12000, spendingMonthly: 10000, partnerOffsetYears: 5 });
    const sim = simulate(params, 0);
    expect(sim.accounts[0].history[12]).toBeCloseTo(24000, 6);
  });

  it("adds the household's cash saving while both work and each account's contribution while its owner works", () => {
    const params = bare([{ kind: "k457", owner: "partner", contributionYearly: 12000 }], { cashSavedYearly: 24000, partnerOffsetYears: 1 });
    const sim = simulate(params, 12);
    expect(sim.accounts[0].history[12]).toBeCloseTo(24000, 6);
    expect(sim.accounts[1].history[24]).toBeCloseTo(24000, 6);
  });

  it("adds health insurance for each person under 65 once neither works", () => {
    const params = bare([{ balance: 1_000_000 }], { healthMonthly: 1000, yourAge: 64, partnerAge: 60, planAge: 66 });
    const sim = simulate(params, 0);
    expect(sim.path[0] - sim.path[1]).toBeCloseTo(1000, 6);
    expect(sim.path[12] - sim.path[13]).toBeCloseTo(500, 6); // you are 65, your partner is not
  });
});

describe("earliestRetirement", () => {
  it("reproduces the approved mock's headline", () => {
    const params = mockParams();
    const earliest = earliestRetirement(params);
    expect(earliest).not.toBeNull();
    expect(monthLabel(params.asOfMonth, earliest!)).toBe("Jul 2033");
  });

  it("agrees with a linear scan", () => {
    const params = mockParams();
    let linear: number | null = null;
    for (let m = 0; m <= maxRetireMonth(params); m++) {
      if (simulate(params, m).ok) {
        linear = m;
        break;
      }
    }
    expect(earliestRetirement(params)).toBe(linear);
  });

  it("returns null when even 70 does not work", () => {
    expect(earliestRetirement(bare([{ balance: 1000 }], { spendingMonthly: 5000 }))).toBeNull();
  });
});

describe("resolveParams", () => {
  it("skips uncounted accounts, applies choices and splits Roth contributions", () => {
    const params = mockParams();
    expect(params.accounts.map((a) => a.key)).toEqual([
      "new-savings",
      "plaid:brk",
      "plaid:roth",
      "manual:1",
      "typed:river",
      "typed:roth-p",
      "typed:k457",
      "typed:pers3",
    ]);
    expect(params.accounts.find((a) => a.key === "manual:1")?.contributionYearly).toBe(24500);
    expect(params.accounts.find((a) => a.key === "plaid:roth")?.rothBasis).toBe(5000);
    expect(params.yourTakeHomeMonthly).toBe(9000);
    expect(params.spendingMonthly).toBe(7500);
    expect(params.cashSavedYearly).toBe(90000);
  });

  it("defaults the partner's take-home to half and counts an account the owner opts in", () => {
    const plan = defaultPlan();
    plan.appAccounts["plaid:checking"] = { kind: "cash", owner: "partner" };
    const params = resolveParams(mockResponse(), plan);
    expect(params.partnerTakeHomeMonthly).toBe(7500);
    expect(params.accounts.find((a) => a.key === "plaid:checking")).toMatchObject({ kind: "cash", owner: "partner", balance: 9000 });
  });

  it("works out the savings rate with payroll contributions counted as pay", () => {
    // (90,000 + 24,500 + 24,500 + 9,500) / (180,000 + 58,500)
    expect(savingsRate(mockParams())).toBeCloseTo(148500 / 238500, 6);
  });
});

describe("buildTimeline and leverDates", () => {
  it("lists retirement, openings and income in date order", () => {
    const params = mockParams();
    const sim = simulate(params, earliestRetirement(params)!);
    const items = buildTimeline(params, sim);
    expect(items.map((i) => i.title)).toEqual([
      "You both retire",
      "Your Roth IRA and 401(k) open",
      "Partner’s Roth IRA and PERS 3 investment account open",
      "Partner’s PERS 3 pension starts",
      "Your Social Security starts",
      "Partner’s Social Security starts",
    ]);
    expect(items[0].when).toBe("Jul 2033 · you 41½, partner 40½");
    expect(items[0].detail).toMatch(/^Open now: New savings \$.+ · Your Brokerage \$.+ · Your Roth IRA contributions \$5k · Your River \$.+ · Partner’s Roth IRA contributions \$15k · Partner’s 457\(b\) \$/);
    expect(items[0].check?.ok).toBe(true);
    expect(items[0].check?.text).toMatch(/^Open money never runs dry before the rest unlock\. Lowest point: \$\d+k in \w{3} 205\d\.$/);
  });

  it("says what moves the date", () => {
    const params = mockParams();
    const base = earliestRetirement(params);
    const [spend, save, returns] = leverDates(params, base);
    expect(spend.deltaMonths).toBeLessThan(0);
    expect(save.deltaMonths).toBeLessThan(0);
    expect(returns.deltaMonths).toBeGreaterThan(0);
  });
});

describe("suggestKind", () => {
  it("maps the production account shapes", () => {
    expect(suggestKind("plaid", "investment", "brokerage", "Self-Directed")).toBe("brokerage");
    expect(suggestKind("plaid", "investment", "roth", "Roth Contributory IRA")).toBe("roth");
    expect(suggestKind("plaid", "investment", "401k", "Retirement")).toBe("k401");
    expect(suggestKind("plaid", "investment", "ira", "Rollover IRA")).toBe("ira");
    expect(suggestKind("plaid", "depository", "savings", "Kids fund")).toBe("excluded");
    expect(suggestKind("manual", "asset", "401K", "Vanguard 401K")).toBe("k401");
    expect(suggestKind("manual", "asset", null, "House")).toBe("excluded");
    expect(suggestKind("manual", "liability", "loan", "Car loan")).toBe("excluded");
  });
});

describe("summarizeCashflow", () => {
  function month(key: string, income: number, spending: number, partial = false): CashflowMonth {
    return {
      month: key,
      partial,
      income: income.toFixed(2),
      spending: spending.toFixed(2),
      savings: "0.00",
      netCashFlow: (income - spending).toFixed(2),
      spendingByCategory: [],
      incomeItems: [],
      savingsItems: [],
    };
  }

  it("averages the complete months since the first month with data", () => {
    const months = [
      month("2025-09", 0, 0),
      month("2025-10", 0, 0),
      month("2025-11", 10000, 6000),
      month("2025-12", 12000, 8000),
      month("2026-01", 11000, 7000),
      month("2026-02", 9999, 9999, true),
    ];
    expect(summarizeCashflow(months)).toEqual({
      takeHomeMonthly: 11000,
      spendingMonthly: 7000,
      cashSavedYearly: 48000,
      monthsCounted: 3,
      firstMonth: "2025-11",
      lastMonth: "2026-01",
    });
  });

  it("returns zeros with no data", () => {
    expect(summarizeCashflow([]).monthsCounted).toBe(0);
  });
});
