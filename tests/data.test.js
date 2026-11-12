'use strict';
// Validates the REAL game data in js/data.js against the engine. Skips if absent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require(path.join(__dirname, '..', 'shared', 'model.js'));
const DATA_PATH = path.join(__dirname, '..', 'shared', 'data.js');
const exists = fs.existsSync(DATA_PATH);
const skip = exists ? false : 'js/data.js not present yet';
const data = exists ? require(DATA_PATH) : null;

function finiteDeep(x, where, out) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(where); return out; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) finiteDeep(v, `${where}.${k}`, out);
  return out;
}

// Every control pushed to whichever extreme reduces the deficit most (by direct yield).
function austerityState(d) {
  const s = M.defaultState(d);
  for (const sp of d.spending) if (!sp.locked) s.spending[sp.id] = sp.baseline >= 0 ? sp.min : sp.max;
  for (const l of d.levers) {
    const candidates = l.type === 'toggle' ? [false, true] : [l.min, l.current, l.max];
    let best = s.levers[l.id], bestScore = Infinity;
    for (const v of candidates) {
      const y = M.leverYield(l, v);
      const score = l.side === 'revenue' ? -y : y;
      if (score < bestScore) { bestScore = score; best = v; }
    }
    s.levers[l.id] = best;
  }
  return s;
}

test('real data passes validateData', { skip }, () => {
  const errors = M.validateData(data);
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('real data: baseline compute is finite everywhere', { skip }, () => {
  const r = M.compute(data, M.defaultState(data));
  const bad = finiteDeep(r, 'result', []);
  assert.deepEqual(bad, []);
});

test('real data: baseline deficit is positive', { skip }, () => {
  const r = M.compute(data, M.defaultState(data));
  assert.ok(r.deficit > 0, `baseline deficit ${r.deficit}`);
  assert.equal(r.deficit, r.baselineDeficit);
});

test('real data: the game is winnable', { skip }, () => {
  const r = M.compute(data, austerityState(data));
  assert.ok(r.deficit < 0, `max-effort deficit is still ${M.format.money(r.deficit)}`);
  assert.ok(r.balanced);
});

test('real data: every extreme of every control computes finite numbers', { skip }, () => {
  for (const sp of data.spending) {
    if (sp.locked) continue;
    for (const v of [sp.min, sp.max]) {
      const s = M.defaultState(data); s.spending[sp.id] = v;
      assert.deepEqual(finiteDeep(M.compute(data, s), sp.id, []), []);
    }
  }
  for (const l of data.levers) {
    for (const v of l.type === 'toggle' ? [true] : [l.min, l.max]) {
      const s = M.defaultState(data); s.levers[l.id] = v;
      assert.deepEqual(finiteDeep(M.compute(data, s), l.id, []), []);
    }
  }
});

// Plans found by a search over this data (see CLAUDE.md, "three lenses"). They prove the
// lens challenges are winnable; if a data change breaks one, re-check the thresholds.
const LENS_PLANS = {
  even: 'social_security:-25,medicare:1,medicaid_chip:50,aca_subsidies:-4,veterans:16,defense_personnel:-5,defense_operations:-46,defense_weapons:-50,snap_food:9,income_support:-50,federal_retirement:-22,housing_aid:-37,education:1,transportation:-24,science_research:15,foreign_aid:-73,border_immigration:19,justice:-25,agriculture:-41,energy_environment:-34,everything_else:-18,rate_bottom:16,rate_middle:17,rate_top:58,cap_gains_rate:15,carried_interest:1,salt_cap_10k:1,itemized_cap_15:1,niit_passthrough:1,ctc_amount:2400,irs_enforcement:18,ss_payroll_rate:17.8,ss_cap_250k:1,medicare_payroll_rate:6.6,corp_rate:30,foreign_income_full_rate:1,tariff_rate:4,gas_tax:0,ftt:9,estate_rate:0,wealth_tax:1,ss_retirement_age:65,ss_expand_benefits:1,medicare_age:60,medicare_drug_negotiation:1,medicare_advantage_reform:1,site_neutral:1,medicaid_per_capita_caps:1,restore_aca_enhanced:1,troop_levels:1050,cancel_golden_dome:1,delay_sentinel:1,close_overseas_bases:1,farm_subsidy_limits:1,reverse_snap_cuts:1,ctc_fully_refundable:1',
  balancedLenses: 'social_security:-11,medicare:19,medicaid_chip:13,aca_subsidies:-38,veterans:-7,defense_personnel:-9,defense_operations:-50,defense_weapons:-50,snap_food:4,income_support:-50,federal_retirement:-23,housing_aid:84,education:87,transportation:-50,science_research:-44,foreign_aid:-100,border_immigration:-48,justice:-25,agriculture:-14,energy_environment:-71,everything_else:-40,rate_bottom:14,rate_middle:32,rate_top:60,cap_gains_rate:32,gains_at_death:1,carried_interest:1,itemized_cap_15:1,employer_health_cap:1,niit_passthrough:1,ctc_amount:3600,irs_enforcement:16,ss_payroll_rate:13.6,ss_cap_250k:1,medicare_payroll_rate:3.4,corp_rate:35,foreign_income_full_rate:1,tariff_rate:2.5,gas_tax:0,carbon_tax:65,vat:1,ftt:7,estate_rate:0,ss_retirement_age:65,ss_high_earner_trim:1,ss_expand_benefits:1,medicare_age:60,medicare_drug_negotiation:1,medicare_advantage_reform:1,site_neutral:1,medicaid_per_capita_caps:1,restore_aca_enhanced:1,troop_levels:1030,close_overseas_bases:1,farm_subsidy_limits:1,universal_prek:1,paid_leave:1'
};

test('real data: lens challenges are winnable', { skip }, () => {
  const wins = (code) => {
    const s = M.decodeState(data, code);
    const r = M.compute(data, s);
    return new Set(data.challenges.filter((c) => M.checkChallenge(data, s, r, c).won).map((c) => c.id));
  };
  const even = wins(LENS_PLANS.even), both = wins(LENS_PLANS.balancedLenses);
  for (const id of ['all_together']) assert.ok(even.has(id), id);
  for (const id of ['do_no_harm', 'triple_crown']) assert.ok(both.has(id), id);
});

test('real data: persona shares sum to 1 and the lenses start neutral', { skip }, () => {
  const sum = data.personas.reduce((a, p) => a + p.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, String(sum));
  const r = M.compute(data, M.defaultState(data));
  assert.equal(r.lenses.fairness.score, 100);
  assert.equal(r.lenses.hardship.pct, 0);
});
