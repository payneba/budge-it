'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const M = require(path.join(__dirname, '..', 'shared', 'model.js'));
const FIXTURE = require(path.join(__dirname, 'fixture-data.js'));

const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} expected ${b}, got ${a}`);

// Fixture copy with all GDP effects removed, so budget arithmetic can be checked in isolation.
function noGdp() {
  const d = clone(FIXTURE);
  for (const s of d.spending) if (s.effects) s.effects.gdpPct = 0;
  for (const l of d.levers) if (l.effects) l.effects.gdpPct = 0;
  return d;
}
function stateWith(data, spending = {}, levers = {}) {
  const s = M.defaultState(data);
  Object.assign(s.spending, spending);
  Object.assign(s.levers, levers);
  return s;
}

test('fixture validates cleanly', () => {
  assert.deepEqual(M.validateData(FIXTURE), []);
});

test('defaultState', () => {
  const s = M.defaultState(FIXTURE);
  assert.equal(s.spending.pensions, 0);
  assert.equal(s.spending.interest, 0);
  assert.equal(s.levers.top_rate, 37);
  assert.equal(s.levers.wealth_tax, false);
  assert.equal(Object.keys(s.levers).length, FIXTURE.levers.length);
});

test('baseline totals', () => {
  const r = M.compute(FIXTURE, M.defaultState(FIXTURE));
  assert.equal(r.totalSpending, 7000);
  assert.equal(r.totalRevenue, 5000);
  assert.equal(r.deficit, 2000);
  assert.equal(r.baselineDeficit, 2000);
  assert.equal(r.gdpPct, 0);
  assert.equal(r.jobs, 0);
  assert.equal(r.interest, 1000);
  assert.equal(r.spendingById.pensions, 1500);
  assert.equal(r.revenueById.income_tax, 2600);
  assert.equal(r.balanced, false);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.activeStories, []);
});

test('compute tolerates a missing/partial state', () => {
  const r = M.compute(FIXTURE, { spending: { pensions: -10 } });
  assert.equal(r.spendingById.pensions, 1350);
  const r2 = M.compute(FIXTURE);
  assert.equal(r2.deficit, 2000);
});

test('main spending slider math (no GDP effects)', () => {
  const d = noGdp();
  const r = M.compute(d, stateWith(d, { pensions: -10 }));
  assert.equal(r.spendingById.pensions, 1350);
  // deficit before interest: 1850; interest moves by (1850-2000)*0.033*0.5
  near(r.interestChange, -150 * 0.033 * 0.5);
  near(r.spendingById.interest, 1000 - 2.475);
  near(r.deficit, 1850 - 2.475);
  near(r.totalSpending - r.totalRevenue, r.deficit);
});

test('locked line ignores direct state changes', () => {
  const d = noGdp();
  const r = M.compute(d, stateWith(d, { interest: 50 }));
  assert.equal(r.spendingById.interest, 1000);
});

test('toggle math: revenue lever lands on its parent', () => {
  const d = noGdp();
  const r = M.compute(d, stateWith(d, {}, { wealth_tax: true }));
  assert.equal(r.revenueById.income_tax, 2800);
  assert.equal(r.revenueById.payroll_tax, 1800);
  near(r.deficit, 1800 - 200 * 0.0165);
  assert.equal(r.leverYield.wealth_tax, 200);
});

test('toggle math: spending lever saving lands on its parent', () => {
  const d = noGdp();
  const r = M.compute(d, stateWith(d, {}, { troop_drawdown: true }));
  assert.equal(r.spendingById.defense, 840);
});

test('slider lever math and spending-side lever', () => {
  const d = noGdp();
  const r = M.compute(d, stateWith(d, {}, { retirement_age: 69 }));
  assert.equal(r.spendingById.pensions, 1450);
  assert.equal(r.leverYield.retirement_age, -50);
  const r2 = M.compute(d, stateWith(d, {}, { teacher_pay: 10 }));
  assert.equal(r2.spendingById.schools, 1840);
});

test('falloff shrinks slider yield with distance from current law', () => {
  const d = noGdp();
  const at = (v) => M.compute(d, stateWith(d, {}, { top_rate: v })).leverYield.top_rate;
  near(at(50), 20 * 13 * (1 - 0.3));             // full distance up: factor 0.7
  near(at(44), 20 * 7 * (1 - 0.3 * 7 / 13));
  near(at(32), 20 * -5 * (1 - 0.3 * 5 / 7));     // down side uses its own max distance
  near(at(37), 0);
  // corp_rate falloff 0.2 at max: 12*14*0.8
  near(M.compute(d, stateWith(d, {}, { corp_rate: 35 })).leverYield.corp_rate, 12 * 14 * 0.8);
  // no falloff -> linear
  near(M.compute(d, stateWith(d, {}, { teacher_pay: 20 })).leverYield.teacher_pay, 80);
  assert.equal(M.compute(d, stateWith(d, {}, { top_rate: 50 })).revenueById.income_tax, 2600 + 182);
});

test('GDP feedback changes revenue proportionally and drives jobs', () => {
  const d = clone(FIXTURE);
  const r = M.compute(d, stateWith(d, {}, { wealth_tax: true }));
  near(r.gdpPct, -0.1);
  near(r.jobs, -0.1 * 1e6);
  near(r.revenueFeedback, -0.1 * 50);
  // feedback spread by baseline share: income tax gets 2600/5000 of it
  near(r.revenueById.income_tax, 2600 + 200 - 5 * 2600 / 5000);
  near(r.revenueById.corporate_tax, 600 - 5 * 600 / 5000);
  near(r.totalRevenue, 5000 + 200 - 5);
  // spending main slider gdp effect
  const r2 = M.compute(d, stateWith(d, { schools: -10 }));
  near(r2.gdpPct, -0.04);
});

test('interest responds to the change in deficit', () => {
  const d = noGdp();
  const cut = M.compute(d, stateWith(d, { schools: -50 }));
  assert.ok(cut.spendingById.interest < 1000);
  const add = M.compute(d, stateWith(d, { schools: 50 }));
  assert.ok(add.spendingById.interest > 1000);
  near(add.interestChange, 900 * 0.033 * 0.5);
});

test('approval: baseline, overall share-weighted', () => {
  const r = M.compute(FIXTURE, M.defaultState(FIXTURE));
  assert.equal(r.approval.byBloc.seniors.value, 45);
  near(r.approval.overall, 0.3 * 45 + 0.5 * 40 + 0.2 * 50);
});

test('approval: small moves near-linear, large moves diminishing, always clamped', () => {
  const d = clone(FIXTURE);
  const small = M.compute(d, stateWith(d, { pensions: 1 })).approval.byBloc.seniors.delta;
  near(small, 1.0, 0.05);
  const ten = M.compute(d, stateWith(d, { pensions: 10 })).approval.byBloc.seniors.delta;
  const thirty = M.compute(d, stateWith(d, { pensions: 30 })).approval.byBloc.seniors.delta;
  assert.ok(thirty < 3 * ten, 'diminishing sensitivity');
  assert.ok(thirty > ten, 'still monotonic');
  // massive effect clamps to 0..100
  const big = clone(FIXTURE);
  big.spending[0].effects.approval.seniors = 50;
  const lo = M.compute(big, stateWith(big, { pensions: -40 })).approval.byBloc.seniors.value;
  const hi = M.compute(big, stateWith(big, { pensions: 30 })).approval.byBloc.seniors.value;
  assert.ok(lo >= 0 && lo < 45);
  assert.ok(hi <= 100 && hi > 45);
  // drivers list explains the move
  const r = M.compute(d, stateWith(d, { pensions: -10 }, { wealth_tax: true }));
  const drivers = r.approval.byBloc.seniors.drivers;
  assert.equal(drivers[0].id, 'pensions');
  near(drivers[0].points, -10);
});

test('metrics: value, delta and min clamp', () => {
  const d = clone(FIXTURE);
  const r = M.compute(d, stateWith(d, { pensions: -10 }, { retirement_age: 69 }));
  near(r.metrics.elder_poverty.delta, 400000 + 60000);
  near(r.metrics.elder_poverty.value, 6e6 + 460000);
  const big = clone(FIXTURE);
  big.spending[0].effects.metrics.elder_poverty = -1e6;
  const r2 = M.compute(big, stateWith(big, { pensions: 30 }));
  assert.equal(r2.metrics.elder_poverty.value, 0);
  assert.equal(r2.metrics.elder_poverty.delta, -6e6);
});

test('stories: spending slider uses sign + largest |at| <= |value|', () => {
  const d = clone(FIXTURE);
  const story = (v) => M.compute(d, stateWith(d, { pensions: v })).storyById.pensions || null;
  assert.equal(story(0), null);
  assert.equal(story(-4), null);
  assert.equal(story(-5), 'Checks shrink a little.');
  assert.equal(story(-19), 'Checks shrink a little.');
  assert.equal(story(-20), 'Checks shrink a lot.');
  assert.equal(story(-40), 'Checks shrink a lot.');
  assert.equal(story(5), null);
  assert.equal(story(10), 'Checks grow.');
});

test('stories: lever slider `at` is absolute, compared relative to current', () => {
  const d = clone(FIXTURE);
  const story = (v) => M.compute(d, stateWith(d, {}, { top_rate: v })).storyById.top_rate || null;
  assert.equal(story(37), null);
  assert.equal(story(40), null);
  assert.equal(story(42), 'Top earners grumble.');
  assert.equal(story(49), 'Top earners grumble.');
  assert.equal(story(50), 'Top earners flee.');
  assert.equal(story(34), null);
  assert.equal(story(32), 'Top earners cheer.');
  assert.equal(story(30), 'Top earners cheer.');
});

test('stories: toggles use onText; activeStories ranked by dollar size', () => {
  const d = clone(FIXTURE);
  const r = M.compute(d, stateWith(d, { pensions: -20 }, { drug_prices: true, top_rate: 42 }));
  assert.equal(r.storyById.drug_prices, 'Drug makers cut research budgets.');
  assert.deepEqual(r.activeStories.map((s) => s.id), ['pensions', 'top_rate', 'drug_prices']);
  assert.equal(r.activeStories[0].text, 'Checks shrink a lot.');
});

test('headline selection by priority', () => {
  const d = clone(FIXTURE);
  assert.equal(M.compute(d, M.defaultState(d)).headline.text, 'CONGRESS RETURNS TO WORK');
  assert.equal(M.compute(d, stateWith(d, {}, { wealth_tax: true })).headline.text, 'WEALTH TAX PASSES');
  assert.equal(M.compute(d, stateWith(d, { pensions: -20 }, { wealth_tax: true })).headline.text, 'SENIORS MARCH ON CAPITOL');
  assert.equal(M.compute(d, stateWith(d, {}, { top_rate: 45 })).headline.text, 'TOP RATE SOARS');
  const balanced = M.compute(d, stateWith(d, { schools: -60, health: -40, defense: -50 }));
  assert.ok(balanced.balanced);
  assert.equal(balanced.headline.text, 'BUDGET BALANCED');
  // metric condition
  const m = clone(FIXTURE);
  m.spending[1].effects.metrics.uninsured = -500000;
  assert.equal(M.compute(m, stateWith(m, { health: -20 })).headline.text, 'MILLIONS LOSE COVERAGE');
  // no headline at all when nothing matches
  const none = clone(FIXTURE);
  none.headlines = none.headlines.filter((h) => h.priority !== 0);
  assert.equal(M.compute(none, M.defaultState(none)).headline, null);
});

test('headline stat conditions: approval, jobs, gdpPct', () => {
  const d = clone(FIXTURE);
  d.levers.find((l) => l.id === 'wealth_tax').effects.gdpPct = -2;
  const r = M.compute(d, stateWith(d, {}, { wealth_tax: true }));
  assert.ok(r.jobs <= -1e6);
  // three conditions match; 'WEALTH TAX PASSES' (4) beats jobs (3) and gdp (3)
  const texts = r.headlines.map((h) => h.text);
  assert.ok(texts.includes('LAYOFFS MOUNT'));
  assert.ok(texts.includes('RECESSION FEARS'));
  assert.equal(r.headline.text, 'WEALTH TAX PASSES');
  const a = clone(FIXTURE);
  a.spending[0].effects.approval = { seniors: 5, workers: 5, business: 5 };
  assert.equal(M.compute(a, stateWith(a, { pensions: -40 })).headline.text, 'APPROVAL CRATERS');
});

test('persona deltas and breakdowns', () => {
  const d = clone(FIXTURE);
  const r = M.compute(d, stateWith(d, { pensions: -10 }, { retirement_age: 69 }));
  near(r.personas.retiree.delta, -5000);
  assert.deepEqual(r.personas.retiree.breakdown.map((b) => b.id), ['pensions', 'retirement_age']);
  near(r.personas.retiree.breakdown[0].amount, -4000);
  assert.equal(r.personas.business_owner.delta, 0);
  assert.deepEqual(r.personas.business_owner.breakdown, []);
});

test('changes ranked by dollar size with deficit impact', () => {
  const d = noGdp();
  const r = M.compute(d, stateWith(d, { schools: -10 }, { wealth_tax: true, drug_prices: true }));
  assert.deepEqual(r.changes.map((c) => c.id), ['wealth_tax', 'schools', 'drug_prices']);
  const w = r.changes[0];
  assert.equal(w.dollars, 200);
  assert.equal(w.deficitImpact, -200);
  assert.equal(r.changes[1].deficitImpact, -180);
  assert.equal(r.changes[2].deficitImpact, -50);
});

test('projection: 10 years, monotonic sanity', () => {
  const d = clone(FIXTURE);
  const base = M.compute(d, M.defaultState(d));
  assert.equal(base.projection.length, 10);
  assert.equal(base.projection[0].year, 2026);
  assert.equal(base.projection[9].year, 2035);
  near(base.projection[0].baselineDebt, 29000 + 2000 * 1.04);
  for (let i = 0; i < 10; i++) {
    const p = base.projection[i];
    near(p.planDebt, p.baselineDebt, 1e-6, 'plan == baseline at default');
    if (i) assert.ok(p.baselineDebt > base.projection[i - 1].baselineDebt);
    assert.ok(Number.isFinite(p.baselineDebtPctGdp) && Number.isFinite(p.planDebtPctGdp));
  }
  const surplus = M.compute(d, stateWith(d, { schools: -60, health: -40, defense: -50 }));
  assert.ok(surplus.balanced);
  for (let i = 1; i < 10; i++) {
    assert.ok(surplus.projection[i].planDebt < surplus.projection[i - 1].planDebt, 'surplus pays down debt');
    assert.ok(surplus.projection[i].planDebtPctGdp < surplus.projection[i].baselineDebtPctGdp);
  }
  const worse = M.compute(d, stateWith(d, { schools: 50 }));
  const gap = worse.projection.map((p) => p.planDebt - p.baselineDebt);
  for (let i = 1; i < 10; i++) assert.ok(gap[i] > gap[i - 1], 'extra borrowing compounds');
});

test('encode/decode round trip, compact, tolerant', () => {
  const d = clone(FIXTURE);
  assert.equal(M.encodeState(d, M.defaultState(d)), '');
  const s = stateWith(d, { pensions: -10, defense: 12 }, { top_rate: 44, wealth_tax: true, retirement_age: 69 });
  const code = M.encodeState(d, s);
  assert.match(code, /^[A-Za-z0-9_.~:,!-]*$/);
  assert.ok(!code.includes('health'), 'only non-default values');
  assert.deepEqual(M.decodeState(d, code), s);
  assert.deepEqual(M.decodeState(d, '#' + code), s);
  // tolerant decoding
  const t = M.decodeState(d, 'pensions:-99,bogus:3,top_rate:99,interest:20,wealth_tax:1,schools:abc,corp_rate:21.4');
  assert.equal(t.spending.pensions, -40);
  assert.equal(t.levers.top_rate, 50);
  assert.equal(t.spending.interest, 0);
  assert.equal(t.levers.wealth_tax, true);
  assert.equal(t.spending.schools, 0);
  assert.equal(t.levers.corp_rate, 21);
  assert.deepEqual(M.decodeState(d, '%%%garbage'), M.defaultState(d));
  assert.deepEqual(M.decodeState(d, null), M.defaultState(d));
});

test('sanitizeState clamps and snaps', () => {
  const d = clone(FIXTURE);
  const s = M.sanitizeState(d, { spending: { pensions: 1000, health: -3.4 }, levers: { top_rate: 'x', wealth_tax: 1 } });
  assert.equal(s.spending.pensions, 30);
  assert.equal(s.spending.health, -3);
  assert.equal(s.levers.top_rate, 37);
  assert.equal(s.levers.wealth_tax, true);
});

test('challenge: noTaxIncreases and minApproval', () => {
  const d = clone(FIXTURE);
  const ch = d.challenges[0];
  const check = (s) => M.checkChallenge(d, s, M.compute(d, s), ch);
  assert.equal(check(M.defaultState(d)).ok, true);
  const up = check(stateWith(d, {}, { top_rate: 44 }));
  assert.equal(up.ok, false);
  assert.equal(up.violations.length, 1);
  assert.equal(check(stateWith(d, {}, { top_rate: 32 })).ok, true, 'tax cut is fine');
  assert.equal(check(stateWith(d, {}, { payroll_cap: true })).ok, false);
  const unpopular = clone(d);
  unpopular.spending[0].effects.approval = { seniors: 3, workers: 3, business: 3 };
  const s2 = stateWith(unpopular, { pensions: -40 });
  const res = M.checkChallenge(unpopular, s2, M.compute(unpopular, s2), ch);
  assert.equal(res.ok, false);
  assert.ok(res.violations.some((v) => /approval/i.test(v)));
  // won requires a balanced budget as well
  const bal = stateWith(d, { schools: -60, health: -40, defense: -50 });
  const w = check(bal);
  assert.equal(w.won, w.ok && M.compute(d, bal).balanced);
});

test('challenge: protect, noSpendingCuts, maxUnemploymentJobsLost', () => {
  const d = clone(FIXTURE);
  const ch = d.challenges[1];
  const check = (s, c = ch, data = d) => M.checkChallenge(data, s, M.compute(data, s), c);
  assert.equal(check(stateWith(d, { pensions: 5 })).ok, true);
  const cut = check(stateWith(d, { pensions: -1 }));
  assert.equal(cut.ok, false);
  assert.deepEqual(cut.broken, { protect: true }, 'violations are keyed by rule');
  assert.equal(check(stateWith(d, {}, { retirement_age: 69 })).ok, false, 'cutting lever under protected line');
  assert.equal(check(stateWith(d, {}, { retirement_age: 66 })).ok, true);
  const jobsLost = clone(d);
  jobsLost.levers.find((l) => l.id === 'wealth_tax').effects.gdpPct = -2;
  const r = check(stateWith(jobsLost, {}, { wealth_tax: true }), ch, jobsLost);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /jobs/i.test(v)));
  const nc = { id: 'x', name: 'x', rules: { noSpendingCuts: true } };
  assert.equal(check(stateWith(d, { defense: -1 }), nc).ok, false);
  assert.equal(check(stateWith(d, {}, { drug_prices: true }), nc).ok, false);
  assert.equal(check(stateWith(d, {}, { wealth_tax: true }), nc).ok, true);
});

test('validateData catches each class of error', () => {
  const expectErr = (mutate, re) => {
    const d = clone(FIXTURE);
    mutate(d);
    const errs = M.validateData(d);
    assert.ok(errs.some((e) => re.test(e)), `expected ${re}, got ${JSON.stringify(errs)}`);
  };
  assert.ok(M.validateData(null).length > 0);
  assert.ok(M.validateData({}).length > 0);
  expectErr((d) => { d.meta.gdp = 'big'; }, /meta\.gdp/);
  expectErr((d) => { d.revenue[0].id = 'pensions'; }, /duplicate id "pensions"/i);
  expectErr((d) => { d.levers[1].id = 'top_rate'; }, /duplicate id "top_rate"/i);
  expectErr((d) => { d.levers[0].parent = 'nope'; }, /parent "nope"/);
  expectErr((d) => { d.levers[0].side = 'spending'; }, /side/);
  expectErr((d) => { d.levers[0].type = 'knob'; }, /type/);
  expectErr((d) => { d.levers[0].current = 99; }, /current/);
  expectErr((d) => { d.levers[0].falloff = 0.9; }, /falloff/);
  expectErr((d) => { d.spending[0].effects.personas.ghost = 1; }, /persona "ghost"/);
  expectErr((d) => { d.spending[0].effects.metrics.ghost = 1; }, /metric "ghost"/);
  expectErr((d) => { d.levers[0].effects.approval.ghost = 1; }, /bloc "ghost"/);
  expectErr((d) => { d.spending[0].effects.approval.seniors = 'lots'; }, /number/);
  expectErr((d) => { d.spending[0].min = 10; }, /min/);
  expectErr((d) => { d.spending[0].group = 'misc'; }, /group/);
  expectErr((d) => { d.blocs[0].share = 0.9; }, /shares/);
  expectErr((d) => { d.spending[4].locked = false; }, /locked/);
  expectErr((d) => { d.spending[3].locked = true; }, /locked/);
  expectErr((d) => { d.headlines[1].when.lever = 'ghost'; }, /headline/);
  expectErr((d) => { d.headlines[0].when.stat = 'vibes'; }, /stat/);
  expectErr((d) => { d.headlines[0].when.op = '!='; }, /op/);
  expectErr((d) => { d.headlines[7].when.metric = 'ghost'; }, /metric "ghost"/);
  expectErr((d) => { d.challenges[1].rules.protect = ['ghost']; }, /protect/);
  expectErr((d) => { d.challenges[0].rules.vibes = true; }, /rule/);
  expectErr((d) => { d.metrics[0].format = 'furlongs'; }, /format/);
  expectErr((d) => { d.metrics[0].goodDirection = 'sideways'; }, /goodDirection/);
  expectErr((d) => { d.levers[0].stories[0].at = 99; }, /stor/);
  expectErr((d) => { d.personas.push(clone(d.personas[0])); }, /duplicate persona/i);
});

test('format helpers produce human numbers', () => {
  const F = M.format;
  assert.equal(F.money(1830), '$1.83 trillion');
  assert.equal(F.money(1830.4567), '$1.83 trillion');
  assert.equal(F.money(412), '$412 billion');
  assert.equal(F.money(41.25), '$41.3 billion');
  assert.equal(F.money(4.123), '$4.12 billion');
  assert.equal(F.money(0.85), '$850 million');
  assert.equal(F.money(9.996), '$10.0 billion');
  assert.equal(F.money(99.97), '$100 billion');
  assert.equal(F.money(999.7), '$1.00 trillion');
  assert.equal(F.money(-412), '−$412 billion');
  assert.equal(F.money(0), '$0');
  assert.equal(F.moneyShort(1830), '$1.83T');
  assert.equal(F.moneyShort(412.3), '$412B');
  assert.equal(F.dollars(1240.4), '$1,240');
  assert.equal(F.signedDollars(1240), '+$1,240');
  assert.equal(F.signedDollars(-35), '−$35');
  assert.equal(F.people(27e6), '27.0 million');
  assert.equal(F.people(410123), '410,000');
  assert.equal(F.people(1234), '1,230');
  assert.equal(F.people(1.25e9), '1.25 billion');
  assert.equal(F.metric(11.54, 'percent'), '11.5%');
  assert.equal(F.metric(1830, 'dollars'), '$1,830');
  assert.equal(F.metric(2.5e9, 'dollars'), '$2.50 billion');
  assert.equal(F.metric(1234.567, 'number'), '1,235');
});

// ---------------------------------------------------------------- three lenses

// Fixture copy plus one toggle lever whose persona effects are given directly in
// $/year. Switch it on with stateWith(d, {}, { test_hit: true }).
function withHit(personas, id = 'test_hit') {
  const d = clone(FIXTURE);
  d.levers.push({
    id, parent: 'income_tax', side: 'revenue', type: 'toggle', name: 'Test hit',
    budgetPerUnit: 0, effects: { metrics: {}, personas, approval: {}, gdpPct: 0 }
  });
  return d;
}
const TAKE_HOME = { retiree: 38500, worker_family: 66000, business_owner: 620000 };
const pctHit = (pct) => {
  const out = {};
  for (const [id, th] of Object.entries(TAKE_HOME)) out[id] = -th * pct / 100;
  return out;
};
const lensesOf = (d, levers = { test_hit: true }) => M.compute(d, stateWith(d, {}, levers)).lenses;

test('lenses: baseline is perfectly fair and painless', () => {
  const r = M.compute(FIXTURE, M.defaultState(FIXTURE));
  assert.equal(r.lenses.fairness.score, 100);
  assert.equal(r.lenses.fairness.sd, 0);
  assert.equal(r.lenses.hardship.pct, 0);
  assert.deepEqual(r.lenses.hardship.brink, []);
  near(r.lenses.electability.score, r.approval.overall);
  near(r.lenses.electability.baseline, r.approval.baseline);
  for (const id of Object.keys(TAKE_HOME)) {
    assert.equal(r.lenses.hardship.byPersona[id].burdenPct, 0);
    assert.equal(r.lenses.hardship.byPersona[id].utility, 0);
  }
  // approval field still works alongside lenses
  near(r.approval.overall, 0.3 * 45 + 0.5 * 40 + 0.2 * 50);
});

test('lenses: an equal-percentage hit keeps fairness at 100 but raises hardship', () => {
  const L = lensesOf(withHit(pctHit(10)));
  near(L.fairness.sd, 0, 1e-9);
  near(L.fairness.score, 100, 1e-9);
  // everyone loses 10% of take-home -> equivalent across-the-board loss is exactly 10%
  near(L.hardship.pct, 10, 1e-9);
  for (const id of Object.keys(TAKE_HOME)) near(L.hardship.byPersona[id].burdenPct, 10, 1e-9);
});

test('lenses: concentrating the same dollars on one household lowers fairness', () => {
  const even = pctHit(2);
  const total = Object.values(even).reduce((a, v) => a + v, 0);
  const L1 = lensesOf(withHit(even));
  const L2 = lensesOf(withHit({ worker_family: total }));
  assert.ok(L2.fairness.score < L1.fairness.score - 10, `${L2.fairness.score} vs ${L1.fairness.score}`);
  assert.ok(L2.fairness.sd > 5);
  assert.equal(L2.fairness.hardest.id, 'worker_family');
  near(L2.fairness.hardest.burdenPct, -100 * total / 66000);
  assert.ok(L2.fairness.lightest.id === 'retiree' || L2.fairness.lightest.id === 'business_owner');
  near(L2.fairness.lightest.burdenPct, 0);
  // sd is the population standard deviation of burden in percentage points, score = 100*exp(-sd/K)
  const b = [0, -100 * total / 66000, 0];
  const mean = b.reduce((a, v) => a + v, 0) / 3;
  const sd = Math.sqrt(b.reduce((a, v) => a + (v - mean) ** 2, 0) / 3);
  near(L2.fairness.sd, sd, 1e-9);
  near(L2.fairness.score, 100 * Math.exp(-sd / M.constants.FAIRNESS_K), 1e-9);
});

test('lenses: hardship is convex in the size of the loss', () => {
  const one = lensesOf(withHit({ worker_family: -0.1 * 66000 }));
  const two = lensesOf(withHit({ worker_family: -0.2 * 66000 }));
  assert.ok(-two.hardship.byPersona.worker_family.utility > 2 * -one.hardship.byPersona.worker_family.utility);
  assert.ok(two.hardship.pct > 2 * one.hardship.pct);
});

test('lenses: hardship weights households by population share', () => {
  const retireeHit = lensesOf(withHit({ retiree: -0.2 * 38500 }));       // share 0.30
  const ownerHit = lensesOf(withHit({ business_owner: -0.2 * 620000 })); // share 0.05
  near(retireeHit.hardship.byPersona.retiree.burdenPct, ownerHit.hardship.byPersona.business_owner.burdenPct);
  assert.ok(retireeHit.hardship.pct > 5 * ownerHit.hardship.pct);
  // ... while shared sacrifice counts each household equally
  near(retireeHit.fairness.score, ownerHit.fairness.score, 1e-9);
  // W = sum(share * u); pct = (1 - exp(W)) * 100
  near(ownerHit.hardship.pct, (1 - Math.exp(0.05 * Math.log(0.8))) * 100, 1e-9);
});

test('lenses: the same dollar loss hurts a low-income household more', () => {
  const low = lensesOf(withHit({ retiree: -5000 }));
  const high = lensesOf(withHit({ business_owner: -5000 }));
  assert.ok(low.hardship.byPersona.retiree.utility < high.hardship.byPersona.business_owner.utility);
  assert.ok(low.hardship.byPersona.retiree.burdenPct > 10 * high.hardship.byPersona.business_owner.burdenPct);
});

test('lenses: gains count as negative burden and negative hardship', () => {
  const L = lensesOf(withHit(pctHit(-5)));
  near(L.hardship.pct, -5, 1e-9);
  near(L.fairness.score, 100, 1e-9);
  near(L.hardship.byPersona.retiree.burdenPct, -5, 1e-9);
});

test('lenses: FLOOR keeps output finite when a loss exceeds take-home pay', () => {
  const L = lensesOf(withHit({ retiree: -100000, worker_family: -66000 }));
  for (const v of [L.hardship.pct, L.fairness.score, L.fairness.sd]) assert.ok(Number.isFinite(v));
  near(L.hardship.byPersona.retiree.utility, Math.log(M.constants.HARDSHIP_FLOOR));
  near(L.hardship.byPersona.worker_family.utility, Math.log(M.constants.HARDSHIP_FLOOR));
  assert.ok(L.hardship.pct < 100);
});

test('lenses: households losing more than the brink threshold are flagged', () => {
  const T = M.constants.BRINK_PCT;
  const over = lensesOf(withHit({ worker_family: -(T + 1) / 100 * 66000, retiree: -(T - 1) / 100 * 38500 }));
  assert.deepEqual(over.hardship.brink, ['worker_family']);
  const under = lensesOf(withHit(pctHit(T - 1)));
  assert.deepEqual(under.hardship.brink, []);
  const all = lensesOf(withHit(pctHit(T + 5)));
  assert.deepEqual(all.hardship.brink.slice().sort(), Object.keys(TAKE_HOME).sort());
});

test('lenses: take-home guard handles taxes at or above income', () => {
  const d = withHit({ business_owner: -1000 });
  d.personas.find((p) => p.id === 'business_owner').federalTaxes = 900000;
  const L = lensesOf(d);
  assert.ok(Number.isFinite(L.hardship.pct) && Number.isFinite(L.fairness.score));
  assert.ok(Number.isFinite(L.hardship.byPersona.business_owner.burdenPct));
});

test('challenge: minFairness and maxHardship', () => {
  const d = withHit({ worker_family: -0.3 * 66000 });
  const s = stateWith(d, {}, { test_hit: true });
  const r = M.compute(d, s);
  const fair = { id: 'f', name: 'f', rules: { minFairness: 60 } };
  const hard = { id: 'h', name: 'h', rules: { maxHardship: 5 } };
  const rf = M.checkChallenge(d, s, r, fair);
  assert.equal(rf.ok, false);
  assert.deepEqual(rf.broken, { minFairness: true });
  assert.ok(rf.violations.some((v) => /shared sacrifice/i.test(v)));
  const rh = M.checkChallenge(d, s, r, hard);
  assert.equal(rh.ok, false);
  assert.deepEqual(rh.broken, { maxHardship: true });
  assert.ok(rh.violations.some((v) => /hardship/i.test(v)));
  const base = M.defaultState(d);
  assert.equal(M.checkChallenge(d, base, M.compute(d, base), fair).ok, true);
  assert.equal(M.checkChallenge(d, base, M.compute(d, base), hard).ok, true);
  // computes the result itself when none is passed
  assert.equal(M.checkChallenge(d, s, null, hard).ok, false);
});

test('headline stats: fairness, hardship and brink', () => {
  const d = withHit({ worker_family: -0.3 * 66000 });
  d.headlines.push(
    { when: { stat: 'fairness', op: '<=', value: 50 }, text: 'LOPSIDED', priority: 20 },
    { when: { stat: 'hardship', op: '>=', value: 5 }, text: 'PAINFUL', priority: 19 },
    { when: { stat: 'brink', op: '>=', value: 1 }, text: 'BRINK', priority: 18 }
  );
  assert.deepEqual(M.validateData(d).filter((e) => /headline/.test(e)), []);
  const texts = M.compute(d, stateWith(d, {}, { test_hit: true })).headlines.map((h) => h.text);
  assert.ok(texts.includes('LOPSIDED') && texts.includes('PAINFUL') && texts.includes('BRINK'));
  const base = M.compute(d, M.defaultState(d)).headlines.map((h) => h.text);
  assert.ok(!base.includes('LOPSIDED') && !base.includes('PAINFUL') && !base.includes('BRINK'));
});

test('validateData: persona shares and new rule keys', () => {
  const expectErr = (mutate, re) => {
    const d = clone(FIXTURE);
    mutate(d);
    const errs = M.validateData(d);
    assert.ok(errs.some((e) => re.test(e)), `expected ${re}, got ${JSON.stringify(errs)}`);
  };
  expectErr((d) => { delete d.personas[0].share; }, /persona "retiree"\.share/);
  expectErr((d) => { d.personas[0].share = -0.1; }, /share/);
  expectErr((d) => { d.personas[0].share = 0.31; }, /Persona shares must sum to 1/);
  expectErr((d) => { d.challenges[0].rules.minFairness = 'high'; }, /minFairness/);
  expectErr((d) => { d.challenges[0].rules.maxHardship = null; }, /maxHardship/);
  const ok = clone(FIXTURE);
  ok.challenges[0].rules.minFairness = 50;
  ok.challenges[0].rules.maxHardship = 3;
  assert.deepEqual(M.validateData(ok), []);
});

test('headline "all" combines simple conditions', () => {
  const d = withHit(pctHit(5));
  d.headlines.push({ when: { all: [{ stat: 'fairness', op: '>=', value: 90 }, { stat: 'hardship', op: '>=', value: 2 }] }, text: 'EVEN PAIN', priority: 30 });
  assert.deepEqual(M.validateData(d).filter((e) => /headline/.test(e)), []);
  assert.equal(M.compute(d, stateWith(d, {}, { test_hit: true })).headline.text, 'EVEN PAIN');
  assert.notEqual(M.compute(d, M.defaultState(d)).headline.text, 'EVEN PAIN', 'baseline is fair but painless');
  const bad = clone(d);
  bad.headlines[bad.headlines.length - 1].when = { all: [] };
  assert.ok(M.validateData(bad).some((e) => /all/.test(e)));
  bad.headlines[bad.headlines.length - 1].when = { all: [{ stat: 'vibes', op: '>=', value: 1 }] };
  assert.ok(M.validateData(bad).some((e) => /vibes/.test(e)));
});
