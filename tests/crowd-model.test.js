'use strict';
// Tests for The Crowd's simulation (games/crowd/crowd-model.js) on the REAL shared data.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const D = require(path.join(__dirname, '..', 'shared', 'data.js'));
const BM = require(path.join(__dirname, '..', 'shared', 'model.js'));
const C = require(path.join(__dirname, '..', 'games', 'crowd', 'people.js'));
const CM = require(path.join(__dirname, '..', 'games', 'crowd', 'crowd-model.js'));

const clone = (x) => JSON.parse(JSON.stringify(x));
const POP = CM.buildPopulation(D, C, { seed: 1, size: 260 });

function plan(mod) {
  const st = BM.defaultState(D);
  mod(st);
  return { st, res: BM.compute(D, st) };
}
function reactTo(mod, pop = POP) {
  const { st, res } = plan(mod);
  return CM.react(D, C, pop, st, res);
}
const baseline = () => reactTo(() => {});
const archOf = (id) => POP[id].archetype;

// A few contrasting plans used across tests.
const PLANS = {
  baseline: () => {},
  ssCut: (st) => { st.spending.social_security = -10; },
  defenseCut: (st) => { st.spending.defense_weapons = -50; st.spending.defense_operations = -30; },
  scienceCut: (st) => { st.spending.science_research = -50; },
  taxHeavy: (st) => Object.assign(st.levers, { vat: 6, rate_bottom: 14, rate_middle: 25, rate_top: 45, ss_payroll_rate: 13.4, carbon_tax: 40, wealth_tax: true, ss_cap_250k: true }),
  cutHeavy: (st) => Object.assign(st.spending, { social_security: -20, medicare: -20, medicaid_chip: -30, snap_food: -50, income_support: -30, housing_aid: -50, education: -50, defense_weapons: -20 }),
  soak: (st) => Object.assign(st.levers, { rate_top: 55, cap_gains_rate: 35, wealth_tax: true, gains_at_death: true, ss_cap_250k: true, corp_rate: 30 }),
  invisible: (st) => {
    Object.assign(st.spending, { defense_weapons: -50, defense_operations: -50, science_research: -75, housing_aid: -100, transportation: -50, foreign_aid: -100, justice: -50, energy_environment: -75, federal_retirement: -40, everything_else: -40 });
    Object.assign(st.levers, { troop_levels: 1000, cancel_golden_dome: true, delay_sentinel: true, close_overseas_bases: true, ss_retirement_age: 70 });
  }
};

// ------------------------------------------------------------------ data & interface

test('crowd: CROWD_DATA validates against the real budget data (every control matters to someone, both ways)', () => {
  const errs = CM.validate(D, C);
  assert.deepEqual(errs, []);
});

test('crowd: archetype shares sum to 1 and look values come from the documented vocabulary', () => {
  const sum = C.archetypes.reduce((a, x) => a + x.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum to ${sum}`);
  assert.ok(C.archetypes.length >= 25 && C.archetypes.length <= 40, `${C.archetypes.length} archetypes`);
  for (const c of POP) {
    assert.ok(CM.vocab.outfit.includes(c.look.outfit), c.look.outfit);
    assert.ok(CM.vocab.hat.includes(c.look.hat), c.look.hat);
    assert.ok(CM.vocab.prop.includes(c.look.prop), c.look.prop);
  }
});

test('crowd: citizens have exactly the documented shape', () => {
  const keys = ['id', 'name', 'age', 'archetype', 'label', 'group', 'income', 'incomeBand', 'ageBand', 'represents', 'look', 'about'];
  POP.forEach((c, i) => {
    assert.deepEqual(Object.keys(c).sort(), keys.slice().sort());
    assert.equal(c.id, i);
    assert.equal(typeof c.name, 'string'); assert.ok(c.name.length > 0);
    assert.ok(Number.isInteger(c.age) && c.age >= 18 && c.age <= 100);
    assert.ok(c.income > 0);
    assert.ok(['low', 'middle', 'upper', 'top'].includes(c.incomeBand));
    assert.ok(['18-29', '30-49', '50-64', '65+'].includes(c.ageBand));
    assert.ok(c.represents > 0);
    assert.equal(typeof c.look.grayHair, 'boolean');
    assert.ok(c.look.variant >= 0 && c.look.variant <= 1);
    assert.ok(c.about.length > 10 && !c.about.includes('{'), c.about);
    assert.ok(c.label.length > 0 && c.group.length > 0);
  });
});

test('crowd: react returns the documented shape', () => {
  const out = reactTo(PLANS.taxHeavy);
  assert.equal(out.citizens.length, POP.length);
  out.citizens.forEach((o, i) => {
    assert.deepEqual(Object.keys(o).sort(), ['bubble', 'id', 'level', 'mood', 'moodDelta', 'reasons', 'status'].sort());
    assert.equal(o.id, POP[i].id);
    assert.ok(o.mood >= -100 && o.mood <= 100);
    assert.ok(Number.isInteger(o.level) && o.level >= 0 && o.level <= 5);
    assert.ok(Array.isArray(o.status));
    assert.equal(typeof o.bubble, 'string'); assert.ok(o.bubble.length > 0);
    for (let j = 0; j < o.reasons.length; j++) {
      const r = o.reasons[j];
      assert.deepEqual(Object.keys(r).sort(), ['impact', 'key', 'kind', 'short', 'text', 'topic'].sort());
      assert.ok(['money', 'service', 'job', 'worry'].includes(r.kind));
      if (j) assert.ok(Math.abs(o.reasons[j - 1].impact) >= Math.abs(r.impact), 'reasons sorted by |impact|');
    }
  });
  const s = out.summary;
  assert.equal(s.levels.length, 6);
  assert.equal(s.levels.reduce((a, x) => a + x, 0), POP.length);
  assert.deepEqual(s.levelNames, ['Cheering', 'Happy', 'Content', 'Uneasy', 'Angry', 'Furious']);
  assert.equal(typeof s.meanMood, 'number');
  for (const k of ['electability', 'fairness', 'hardship']) assert.equal(typeof s.lenses[k], 'number');
  for (const list of [s.grievances, s.cheers]) for (const g of list) {
    assert.deepEqual(Object.keys(g).sort(), ['figures', 'impact', 'key', 'people', 'text', 'topic'].sort());
    assert.ok(g.figures > 0 && g.people > 0);
  }
  assert.ok(s.grievances.every((g) => g.impact < 0));
  assert.ok(s.cheers.every((g) => g.impact > 0));
  let figs = 0;
  for (const g of Object.values(s.byGroup)) { figs += g.figures; assert.equal(typeof g.meanMood, 'number'); assert.equal(typeof g.meanDelta, 'number'); }
  assert.equal(figs, POP.length);
});

test('crowd: deterministic for the same seed and inputs; different seeds differ', () => {
  const a = CM.buildPopulation(D, C, { seed: 7, size: 260 });
  const b = CM.buildPopulation(D, C, { seed: 7, size: 260 });
  const c = CM.buildPopulation(D, C, { seed: 8, size: 260 });
  assert.deepEqual(clone(a), clone(b));
  assert.notDeepEqual(clone(a), clone(c));
  const { st, res } = plan(PLANS.cutHeavy);
  assert.deepEqual(CM.react(D, C, a, st, res), CM.react(D, C, b, st, res));
  assert.deepEqual(CM.react(D, C, a, st, res), CM.react(D, C, a, st, res));
});

test('crowd: figure counts follow archetype shares, sum to size, and must-show groups appear', () => {
  for (const size of [100, 260, 500]) {
    const pop = size === 260 ? POP : CM.buildPopulation(D, C, { seed: 3, size });
    assert.equal(pop.length, size);
    const counts = {};
    for (const c of pop) counts[c.archetype] = (counts[c.archetype] || 0) + 1;
    for (const a of C.archetypes) {
      const n = counts[a.id] || 0;
      const want = a.share * size;
      assert.ok(Math.abs(n - want) <= 1.0 + 1e-9 || (a.mustShow && n === 1), `${a.id}: ${n} figures vs ${want.toFixed(2)} at size ${size}`);
      if (a.mustShow) assert.ok(n >= 1, `${a.id} must show`);
    }
    // each archetype's figures together represent its real headcount
    for (const a of C.archetypes) {
      const people = pop.filter((c) => c.archetype === a.id).reduce((s, c) => s + c.represents, 0);
      if (counts[a.id]) assert.ok(Math.abs(people - a.share * C.adults) / (a.share * C.adults) < 0.01, a.id);
    }
  }
});

// ------------------------------------------------------------------ baseline & mood

test('crowd: baseline is a believable spread, not uniform; moodDelta is 0', () => {
  const out = baseline();
  const lv = out.summary.levels;
  assert.ok(out.citizens.every((o) => o.moodDelta === 0));
  assert.ok(lv[5] <= 2, `furious at baseline: ${lv[5]}`);
  assert.ok(lv[2] + lv[3] >= 0.6 * POP.length, 'mostly content or uneasy');
  assert.ok(lv.filter((n) => n > 0).length >= 4, `levels used: ${lv}`);
  const moods = out.citizens.map((o) => o.mood);
  const mean = moods.reduce((a, x) => a + x, 0) / moods.length;
  const sd = Math.sqrt(moods.reduce((a, x) => a + (x - mean) ** 2, 0) / moods.length);
  assert.ok(sd > 6, `baseline mood sd ${sd}`);
  assert.equal(out.summary.lenses.fairness, 100);
  assert.equal(out.summary.lenses.hardship, 0);
  // debt-worriers are uneasy at baseline, and say why
  assert.ok(out.summary.grievances.some((g) => g.key === 'deficit' && g.figures > 50));
});

test('crowd: money mood has loss aversion and convexity', () => {
  const T = C.tuning;
  const m = (d, r) => CM._internal.moneyImpact(T, d, r);
  for (const pct of [0.5, 1, 2]) {
    const loss = -m(-pct * 1000, 100000), gain = m(pct * 1000, 100000);
    assert.ok(loss >= 1.8 * gain && loss <= 3 * gain, `loss aversion at ${pct}%: ${loss} vs ${gain}`);
  }
  // convex: a 10% hit is far more than ten 1% hits
  assert.ok(-m(-10000, 100000) > 1.5 * 10 * -m(-1000, 100000));
  // gains are concave
  assert.ok(m(10000, 100000) < 10 * m(1000, 100000));
  // a large hit to a poor household outweighs the same dollars to a rich one
  assert.ok(-m(-3000, 25000) > 5 * -m(-3000, 250000));
});

test('crowd: piles of small gripes have diminishing returns but catastrophes are not capped', () => {
  const T = C.tuning;
  const small = Array.from({ length: 10 }, () => ({ impact: -5 }));
  const pile = CM._internal.combine(T, small, 0);
  assert.ok(pile > -50 && pile < -15, `ten -5 gripes -> ${pile}`);
  assert.equal(CM._internal.combine(T, [{ impact: -45 }, { impact: -30 }], 0), -75);
  assert.equal(CM._internal.combine(T, [{ impact: -80 }, { impact: -60 }], 0), -100);
});

// ------------------------------------------------------------------ specific stakes

test('crowd: a Social Security cut angers retirees with a money reason of the right size', () => {
  const out = reactTo(PLANS.ssCut);
  const retirees = POP.filter((c) => c.archetype.startsWith('retiree_low') || c.archetype === 'retiree_middle');
  assert.ok(retirees.length > 20);
  let checked = 0;
  for (const c of retirees) {
    const o = out.citizens[c.id];
    assert.ok(o.moodDelta < 0, `${c.label} delta ${o.moodDelta}`);
    const r = o.reasons.find((x) => x.key === 'social_security' && x.kind === 'money');
    assert.ok(r, 'has a Social Security money reason');
    assert.ok(r.impact < 0);
    const m = r.text.match(/\$([\d,]+) a month/);
    assert.ok(m, r.text);
    const shown = Number(m[1].replace(/,/g, ''));
    const expect = c._sim.bases.ss * 0.10 / 12;      // 10% of their own yearly benefit, per month
    assert.ok(Math.abs(shown - expect) <= Math.max(10, expect * 0.06), `${shown} vs ${expect}`);
    assert.ok(r.short.length <= 28);
    checked++;
  }
  assert.ok(checked > 20);
  const lowMean = out.summary.byGroup['Retirees on a small check'].meanDelta;
  const techMean = out.summary.byGroup['Tech & professional workers'].meanDelta;
  assert.ok(lowMean < techMean - 10, `${lowMean} vs ${techMean}`);
  // the standing debt worry can still be the biggest grievance overall; the cut is right behind it
  assert.ok(out.summary.grievances.slice(0, 2).some((g) => g.key === 'social_security'));
});

test('crowd: a defense cut produces job and security reasons', () => {
  const out = reactTo(PLANS.defenseCut);
  const all = out.citizens.flatMap((o) => o.reasons);
  assert.ok(all.some((r) => r.kind === 'job' && (r.key === 'defense_weapons' || r.key === 'defense_operations')), 'job reason');
  assert.ok(all.some((r) => r.kind === 'worry' && r.key === 'defense_weapons' && r.impact < 0), 'security worry');
  assert.ok(all.some((r) => r.kind === 'worry' && r.key === 'defense_weapons' && r.impact > 0), 'some people like it');
  const dw = POP.find((c) => c.archetype === 'defense_worker');
  const o = out.citizens[dw.id];
  assert.ok(o.moodDelta < -10, `defense worker delta ${o.moodDelta}`);
  assert.ok(o.reasons.some((r) => r.kind === 'job'));
});

test('crowd: a science cut produces job and future worries', () => {
  const out = reactTo(PLANS.scienceCut);
  const sci = POP.filter((c) => c.archetype === 'scientist');
  assert.ok(sci.length >= 1);
  for (const c of sci) {
    const o = out.citizens[c.id];
    assert.ok(o.reasons.some((r) => r.kind === 'job' && r.key === 'science_research'), 'job stake');
    assert.ok(o.reasons.some((r) => r.kind === 'worry' && r.key === 'science_research' && r.impact < 0), 'future worry');
    assert.ok(o.moodDelta < -10);
  }
  const worried = out.citizens.filter((o) => o.reasons.some((r) => r.kind === 'worry' && r.key === 'science_research' && r.impact < 0));
  assert.ok(worried.length > 50, `${worried.length} worried about the science cut`);
  assert.ok(worried.some((o) => /\d+%/.test(o.reasons.find((r) => r.key === 'science_research').text)), 'specific about what changed');
});

test('crowd: closing the deficit pleases debt-worriers', () => {
  const base = baseline();
  const out = reactTo(PLANS.taxHeavy);
  const res = plan(PLANS.taxHeavy).res;
  assert.ok(res.deficit < res.baselineDeficit * 0.7);
  let n = 0;
  base.citizens.forEach((o, i) => {
    const b = o.reasons.find((r) => r.key === 'deficit');
    if (!b) return;
    const a = out.citizens[i].reasons.find((r) => r.key === 'deficit');
    assert.ok(a && a.impact > b.impact + 5, `debt reason ${b.impact} -> ${a && a.impact}`);
    n++;
  });
  assert.ok(n > 100, `${n} debt-worriers`);
  // and a bigger deficit makes them unhappier
  const worse = reactTo((st) => { st.spending.defense_weapons = 50; st.levers.rate_bottom = 7; });
  base.citizens.forEach((o, i) => {
    const b = o.reasons.find((r) => r.key === 'deficit');
    if (b) assert.ok(worse.citizens[i].reasons.find((r) => r.key === 'deficit').impact < b.impact);
  });
});

test('crowd: discrete outcomes are monotonic and stable as a slider moves (no flicker)', () => {
  const sweep = (id, values, status) => {
    let prev = new Set();
    for (const v of values) {
      const out = reactTo((st) => { st.spending[id] = v; });
      const again = reactTo((st) => { st.spending[id] = v; });
      assert.deepEqual(out.citizens.map((o) => o.status), again.citizens.map((o) => o.status));
      const hit = new Set(out.citizens.filter((o) => o.status.includes(status)).map((o) => o.id));
      for (const x of prev) assert.ok(hit.has(x), `${id}=${v}: citizen ${x} recovered ${status}`);
      prev = hit;
    }
    return prev.size;
  };
  const steps = (lo) => Array.from({ length: 11 }, (_, i) => Math.round(lo * i / 10));
  assert.ok(sweep('medicaid_chip', steps(-50), 'lost_coverage') >= 2);
  assert.ok(sweep('defense_weapons', steps(-50), 'lost_job') >= 1);
  assert.ok(sweep('housing_aid', steps(-100), 'lost_rent_help') >= 2);
  assert.ok(sweep('snap_food', steps(-100), 'lost_food_aid') >= 3);
});

test('crowd: discrete counts match the national numbers in proportion', () => {
  const { st, res } = plan((s) => { s.spending.housing_aid = -100; });
  const out = CM.react(D, C, POP, st, res);
  const lost = out.citizens.filter((o) => o.status.includes('lost_rent_help'));
  const people = lost.reduce((a, o) => a + POP[o.id].represents, 0);
  const national = -res.metrics.rent_aid_households.delta * C.pools.rent.adultShareDefault;
  assert.ok(Math.abs(people - national) / national < 0.45, `${people} vs ${national}`);
});

// ------------------------------------------------------------------ plans & lenses

test('crowd: lenses stay in range and behave as described', () => {
  const base = baseline().summary.lenses;
  assert.ok(base.electability > 40 && base.electability < 90);
  for (const [name, mod] of Object.entries(PLANS)) {
    const L = reactTo(mod).summary.lenses;
    assert.ok(L.electability >= 0 && L.electability <= 100, name);
    assert.ok(L.fairness >= 0 && L.fairness <= 100, name);
    assert.ok(L.hardship >= 0, name);
  }
  const cut = reactTo(PLANS.cutHeavy).summary.lenses;
  assert.ok(cut.electability < base.electability - 15);
  assert.ok(cut.hardship > 20);
  // concentrated pain is less fair than diffuse pain of similar total
  const sci = reactTo(PLANS.scienceCut).summary.lenses;
  assert.ok(sci.fairness < 100 && sci.hardship > 0);
});

test('crowd: invisible cuts (defense, science, housing, roads, aid...) no longer look free', () => {
  const out = reactTo(PLANS.invisible);
  const s = out.summary;
  assert.ok(s.levels[4] + s.levels[5] > 40, `angry+furious ${s.levels[4] + s.levels[5]}`);
  assert.ok(s.lenses.hardship > 10);
  const keys = new Set(s.grievances.map((g) => g.key));
  assert.ok(['science_research', 'housing_aid', 'defense_weapons', 'transportation', 'energy_environment', 'foreign_aid'].some((k) => keys.has(k)));
  assert.ok(out.citizens.some((o) => o.status.includes('lost_job')));
  assert.ok(out.citizens.some((o) => o.status.includes('lost_rent_help')));
});

test('crowd: different plans make different people angry', () => {
  const angriest = (mod) => {
    const g = Object.entries(reactTo(mod).summary.byGroup).sort((a, b) => a[1].meanDelta - b[1].meanDelta);
    return g.slice(0, 3).map((x) => x[0]);
  };
  const a = angriest(PLANS.cutHeavy), b = angriest(PLANS.soak), c = angriest(PLANS.invisible);
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notDeepEqual(b, c);
  assert.ok(b.includes('The top 0.1%') || b.includes('The top 1%'));
});

test('crowd: a brutal one-sided plan fills the protest; a soak-the-rich plan divides the crowd', () => {
  const brutal = reactTo((st) => Object.assign(st.levers, { vat: 10, rate_bottom: 20, rate_middle: 32, ss_payroll_rate: 16.4, medicare_payroll_rate: 5.9, gas_tax: 80, carbon_tax: 80, tariff_rate: 20 })).summary.levels;
  assert.ok(brutal[4] + brutal[5] > 0.6 * POP.length, `${brutal}`);
  const soak = reactTo(PLANS.soak).summary.levels;
  assert.ok(soak[0] + soak[1] > 10 && soak[4] + soak[5] > 0, `${soak}`);
});

// ------------------------------------------------------------------ text

test('crowd: text is filled in, varied, and shorts fit on a sign', () => {
  for (const mod of Object.values(PLANS)) {
    const out = reactTo(mod);
    const texts = new Set();
    const byKey = {};
    for (const o of out.citizens) {
      for (const r of o.reasons) (byKey[r.key + r.kind] || (byKey[r.key + r.kind] = [])).push(r.text);
      assert.ok(!o.bubble.includes('{'), o.bubble);
      for (const r of o.reasons) {
        assert.ok(r.short.length <= 28, `short too long: "${r.short}"`);
        assert.ok(r.text.length > 5 && !/[{}]/.test(r.text), r.text);
        assert.ok(!/\bthe the\b|undefined/i.test(r.text) && !/\bNaN\b/.test(r.text), r.text);
        texts.add(r.text);
      }
    }
    // the crowd does not chant in unison: any reason shared by 10+ figures has several phrasings
    for (const [k, list] of Object.entries(byKey)) if (list.length >= 10) assert.ok(new Set(list).size >= 2, `${k}: one phrasing for ${list.length} figures`);
    if (mod !== PLANS.baseline && mod !== PLANS.scienceCut && mod !== PLANS.ssCut) assert.ok(texts.size > 20, 'varied phrasing');
  }
  // idle chatter for people with nothing to react to
  const out = baseline();
  const idle = out.citizens.filter((o) => !o.reasons.some((r) => Math.abs(r.impact) >= 1));
  for (const o of idle) assert.ok(C.archetypes.find((a) => a.id === archOf(o.id)).idle.includes(o.bubble));
});

// ------------------------------------------------------------------ validation catches problems

test('crowd: validate catches unknown ids and missing coverage', () => {
  const bad = clone(C);
  bad.money.push({ control: 'no_such_lever', base: 'ss', per: 1, family: 'benefit', what: 'x', ws: 'x' });
  bad.worries[0].holders.no_such_archetype = [1, 1];
  const errs = CM.validate(D, bad, { static: true });
  assert.ok(errs.some((e) => e.includes('no_such_lever')));
  assert.ok(errs.some((e) => e.includes('no_such_archetype')));

  const shares = clone(C);
  shares.archetypes[0].share += 0.1;
  assert.ok(CM.validate(D, shares, { static: true }).some((e) => e.includes('sum')));

  const looks = clone(C);
  looks.archetypes[0].look.hat = ['tiara'];
  assert.ok(CM.validate(D, looks, { static: true }).some((e) => e.includes('tiara')));

  // A new lever in the budget data that no crowd rule mentions must be flagged.
  const data = clone(D);
  data.levers.push({ id: 'new_mystery_fee', parent: 'excise_taxes', side: 'revenue', type: 'toggle', name: 'Mystery fee',
    blurb: 'x', budgetPerUnit: 5, source: 'x', onText: 'x', effects: { metrics: {}, personas: {}, approval: {}, gdpPct: 0 } });
  const errs2 = CM.validate(data, C);
  assert.ok(errs2.some((e) => e.includes('new_mystery_fee')), errs2.join('\n'));
});

// ------------------------------------------------------------------ performance

test('crowd: react for 260 citizens takes well under 5 ms on average', () => {
  const { st, res } = plan(PLANS.cutHeavy);
  for (let i = 0; i < 10; i++) CM.react(D, C, POP, st, res);
  const N = 60;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) CM.react(D, C, POP, st, res);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  assert.ok(ms < 5, `react took ${ms.toFixed(2)} ms`);
});

// ------------------------------------------------------------ template honesty
const allReasons = (out) => out.citizens.flatMap((o) => o.reasons);
const debtWorry = C.worries.find((w) => w.mode === 'deficit');

test('crowd: grievance text comes from a negative reason and cheer text from a positive one', () => {
  for (const mod of [PLANS.ssCut, PLANS.taxHeavy, PLANS.cutHeavy, PLANS.soak, (st) => { st.spending.defense_weapons = -10; st.spending.foreign_aid = -30; }]) {
    const out = reactTo(mod);
    const rs = allReasons(out);
    for (const g of out.summary.grievances) assert.ok(rs.some((r) => r.key === g.key && r.text === g.text && r.impact < 0), `grievance "${g.text}"`);
    for (const g of out.summary.cheers) assert.ok(rs.some((r) => r.key === g.key && r.text === g.text && r.impact > 0), `cheer "${g.text}"`);
  }
});

test('crowd: a partly closed deficit that still worries people never sounds like a cheer', () => {
  const cheerful = new Set(debtWorry.texts.better.concat(debtWorry.texts.balanced));
  const out = reactTo((st) => { st.spending.defense_weapons = -10; st.spending.foreign_aid = -30; st.spending.everything_else = -10; });
  const debt = allReasons(out).filter((r) => r.key === (debtWorry.key || 'deficit'));
  assert.ok(debt.length > 0);
  for (const r of debt) {
    assert.ok(r.impact < 0, 'a small closure still worries debt hawks');
    assert.ok(![...cheerful].some((t) => r.text.startsWith(t.split('{')[0]) && t.split('{')[0].length > 3), `cheerful text under a worry: ${r.text}`);
  }
  const g = out.summary.grievances.find((x) => x.key === (debtWorry.key || 'deficit'));
  assert.ok(g && /still|but/i.test(g.text), `debt grievance reads as worried: ${g && g.text}`);
  // A big closure flips it to genuine relief.
  const big = reactTo(PLANS.taxHeavy);
  const pos = allReasons(big).filter((r) => r.key === (debtWorry.key || 'deficit') && r.impact > 0);
  assert.ok(pos.length > 0);
  for (const r of pos) assert.ok(!/still far too much|still too much|still borrow/i.test(r.text), r.text);
});

test('crowd: fairness texts describe what the plan actually did', () => {
  // Top-end tax cuts only: no claim that the rich pay more or that a program was cut.
  const out = reactTo((st) => Object.assign(st.levers, { rate_top: 30, cap_gains_rate: 15 }));
  const fair = allReasons(out).filter((r) => r.key === 'fairness');
  assert.ok(fair.some((r) => r.impact < 0), 'egalitarians object to top-end cuts');
  for (const r of fair) {
    assert.ok(!/finally pay more|paychecks and groceries|chopping block|: cut\./i.test(r.text), r.text);
    assert.ok(!/\{\w+\}/.test(r.text), `unfilled template: ${r.text}`);
  }
  // A spending lever's cut is named by its program, not by the lever.
  const lev = reactTo((st) => { st.levers.ss_retirement_age = 70; });
  const name = D.levers.find((l) => l.id === 'ss_retirement_age').name;
  for (const r of allReasons(lev).filter((x) => x.key === 'fairness')) assert.ok(!r.text.includes(name), r.text);
});

test('crowd: lever reasons never quote a meaningless percentage', () => {
  const out = reactTo((st) => Object.assign(st.levers, { ss_retirement_age: 69, medicare_age: 67, troop_levels: 1200 }));
  for (const r of allReasons(out)) if (r.key !== 'deficit' && D.levers.some((l) => l.id === r.key)) assert.ok(!/\btrimmed \d+%/.test(r.text), r.text);
});

test('crowd: retirement-age reasons use the real new age; Medicare-age losers are under today\'s age', () => {
  const out = reactTo((st) => { st.levers.ss_retirement_age = 68; st.levers.medicare_age = 67; });
  const ma = D.levers.find((l) => l.id === 'medicare_age');
  for (const o of out.citizens) {
    for (const r of o.reasons) {
      if (r.key === 'ss_retirement_age') assert.ok(!/\b(to|until|at) 70\b/.test(r.text), r.text);
      if (r.key === 'medicare_age' && r.impact < 0 && r.kind === 'service') assert.ok(POP[o.id].age < ma.current, `age ${POP[o.id].age}: ${r.text}`);
    }
  }
  assert.ok(allReasons(out).some((r) => r.key === 'medicare_age' && r.kind === 'service'), 'someone near Medicare age notices');
});
