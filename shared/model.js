// Budge It engine: pure calculation over BUDGET_DATA. No DOM access.
// Loads as a classic browser script (window.BudgetModel) and as a Node module.
(function (root) {
  'use strict';

  const GROUPS = ['mandatory', 'defense', 'nondefense', 'interest'];
  const FORMATS = ['people', 'jobs', 'dollars', 'percent', 'number', 'year'];
  const OPS = ['<=', '>=', '<', '>', '=='];
  const STATS = ['deficit', 'approval', 'gdpPct', 'jobs', 'fairness', 'hardship', 'brink'];
  const RULE_KEYS = ['noTaxIncreases', 'noSpendingCuts', 'protect', 'minApproval', 'maxUnemploymentJobsLost', 'minFairness', 'maxHardship'];
  const META_NUMBERS = ['fiscalYear', 'gdp', 'population', 'households', 'debtHeldByPublic', 'avgInterestRate',
    'baselineDeficitGrowth', 'gdpGrowth', 'revenueFeedbackPerGdpPct', 'jobsPerGdpPct'];

  // Approval saturates: a bloc's total swing approaches +/-APPROVAL_SATURATION points
  // (tanh curve), so piles of unpopular moves don't stay linear forever.
  const APPROVAL_SATURATION = 40;
  // Deficit at or below this ($B) counts as balanced.
  const BALANCE_TOLERANCE = 0.5;
  const PROJECTION_YEARS = 10;

  // The three lenses (see lensesFor). Burdens are measured as a share of each
  // household's take-home pay (income minus federal taxes).
  // Shared sacrifice: score = 100 * exp(-sd / FAIRNESS_K), sd = spread of burdens in
  // percentage points across households, each counted once. K = 10 was tuned on the
  // real data: a spread of 5 points scores ~61, 10 ~37, 30 (one household soaked) ~5.
  // With K = 5 nearly every balanced plan scored under 15.
  const FAIRNESS_K = 10;
  // Hardship: log utility of take-home pay, floored so a loss of everything is finite.
  // ln(0.05) ~ -3: losing it all counts as about 20 times worse than losing 14%.
  const HARDSHIP_FLOOR = 0.05;
  // A household losing more than this % of take-home pay is "pushed to the brink".
  const BRINK_PCT = 25;

  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const isStr = (x) => typeof x === 'string' && x.length > 0;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round6 = (v) => Math.round(v * 1e6) / 1e6;

  // ---------------------------------------------------------------- validation

  function validateData(data) {
    const errors = [];
    const err = (m) => errors.push(m);
    if (!data || typeof data !== 'object') return ['BUDGET_DATA is missing or not an object.'];

    const meta = data.meta;
    if (!meta || typeof meta !== 'object') err('meta is missing.');
    else {
      for (const k of META_NUMBERS) if (!isNum(meta[k])) err(`meta.${k} must be a number (got ${JSON.stringify(meta[k])}).`);
      for (const k of ['gdp', 'population', 'households']) if (isNum(meta[k]) && meta[k] <= 0) err(`meta.${k} must be positive.`);
      if (!Array.isArray(meta.sources)) err('meta.sources must be an array.');
      else meta.sources.forEach((s, i) => { if (!s || !isStr(s.label)) err(`meta.sources[${i}] needs a label.`); });
      if (!Array.isArray(meta.caveats)) err('meta.caveats must be an array.');
    }
    for (const k of ['spending', 'revenue', 'levers', 'personas', 'metrics', 'blocs', 'headlines']) {
      if (!Array.isArray(data[k])) err(`${k} must be an array.`);
    }
    if (data.challenges !== undefined && !Array.isArray(data.challenges)) err('challenges must be an array if present.');

    const spending = arr(data.spending), revenue = arr(data.revenue), levers = arr(data.levers);
    const personaIds = new Set(), metricIds = new Set(), blocIds = new Set();
    const uniqueInto = (set, list, label) => list.forEach((x, i) => {
      if (!x || !isStr(x.id)) { err(`${label}[${i}] needs an id.`); return; }
      if (set.has(x.id)) err(`Duplicate ${label} id "${x.id}".`);
      set.add(x.id);
    });
    uniqueInto(personaIds, arr(data.personas), 'persona');
    uniqueInto(metricIds, arr(data.metrics), 'metric');
    uniqueInto(blocIds, arr(data.blocs), 'bloc');

    const lineIds = new Map(); // id -> 'spending' | 'revenue' | 'lever'
    const claim = (x, kind, where) => {
      if (!x || !isStr(x.id)) { err(`${where} needs an id.`); return false; }
      if (lineIds.has(x.id)) err(`Duplicate id "${x.id}" (ids must be unique across spending, revenue and levers).`);
      else lineIds.set(x.id, kind);
      return true;
    };

    const checkEffects = (effects, where) => {
      if (effects === undefined) return;
      if (!effects || typeof effects !== 'object') { err(`${where}.effects must be an object.`); return; }
      const maps = [['metrics', metricIds, 'metric'], ['personas', personaIds, 'persona'], ['approval', blocIds, 'bloc']];
      for (const [key, ids, label] of maps) {
        const m = effects[key];
        if (m === undefined) continue;
        if (!m || typeof m !== 'object') { err(`${where}.effects.${key} must be an object.`); continue; }
        for (const [id, v] of Object.entries(m)) {
          if (!ids.has(id)) err(`${where}.effects.${key} refers to unknown ${label} "${id}".`);
          if (!isNum(v)) err(`${where}.effects.${key}.${id} must be a number.`);
        }
      }
      if (effects.gdpPct !== undefined && !isNum(effects.gdpPct)) err(`${where}.effects.gdpPct must be a number.`);
    };
    const checkStories = (stories, where, lo, hi) => {
      if (stories === undefined) return;
      if (!Array.isArray(stories)) { err(`${where}.stories must be an array.`); return; }
      stories.forEach((s, i) => {
        if (!s || !isNum(s.at) || !isStr(s.text)) err(`${where}.stories[${i}] needs a numeric "at" and text.`);
        else if (s.at < lo || s.at > hi) err(`${where}.stories[${i}].at (${s.at}) is outside the slider range ${lo}..${hi}.`);
      });
    };

    let locked = 0;
    spending.forEach((s, i) => {
      const where = `spending "${(s && s.id) || i}"`;
      if (!claim(s, 'spending', `spending[${i}]`)) return;
      if (!isStr(s.name)) err(`${where} needs a name.`);
      if (!GROUPS.includes(s.group)) err(`${where} has unknown group "${s.group}" (use ${GROUPS.join(', ')}).`);
      if (!isNum(s.baseline) || s.baseline < 0) err(`${where}.baseline must be a non-negative number.`);
      if (s.locked) {
        locked++;
        if (s.group !== 'interest') err(`${where} is locked but its group is not "interest".`);
      } else {
        if (!isNum(s.min) || !isNum(s.max) || !isNum(s.step)) err(`${where} needs numeric min, max and step.`);
        else {
          if (s.min > 0 || s.max < 0 || s.min >= s.max) err(`${where}: need min <= 0 <= max and min < max (got min ${s.min}, max ${s.max}).`);
          if (s.step <= 0) err(`${where}.step must be positive.`);
        }
        checkStories(s.stories, where, isNum(s.min) ? s.min : -Infinity, isNum(s.max) ? s.max : Infinity);
      }
      checkEffects(s.effects, where);
    });
    if (locked !== 1) err(`Exactly one spending line must be locked (the interest line); found ${locked}.`);

    revenue.forEach((r, i) => {
      const where = `revenue "${(r && r.id) || i}"`;
      if (!claim(r, 'revenue', `revenue[${i}]`)) return;
      if (!isStr(r.name)) err(`${where} needs a name.`);
      if (!isNum(r.baseline) || r.baseline < 0) err(`${where}.baseline must be a non-negative number.`);
    });
    const revTotal = revenue.reduce((a, r) => a + (r && isNum(r.baseline) ? r.baseline : 0), 0);
    if (revenue.length && revTotal <= 0) err('Total baseline revenue must be positive.');

    const lineKind = new Map(lineIds); // spending/revenue only, before levers are added
    levers.forEach((l, i) => {
      const where = `lever "${(l && l.id) || i}"`;
      if (!claim(l, 'lever', `levers[${i}]`)) return;
      if (!isStr(l.name)) err(`${where} needs a name.`);
      const parentKind = lineKind.get(l.parent);
      if (!parentKind) err(`${where} has parent "${l.parent}" which is not a spending or revenue id.`);
      if (l.side !== 'revenue' && l.side !== 'spending') err(`${where}.side must be "revenue" or "spending".`);
      else if (parentKind && parentKind !== l.side) err(`${where}.side is "${l.side}" but its parent "${l.parent}" is a ${parentKind} line; yield lands on the parent, so they must match.`);
      if (!isNum(l.budgetPerUnit)) err(`${where}.budgetPerUnit must be a number.`);
      if (l.type === 'slider') {
        if (!isNum(l.min) || !isNum(l.max) || !isNum(l.step) || !isNum(l.current)) err(`${where} needs numeric min, max, step and current.`);
        else {
          if (!(l.min <= l.current && l.current <= l.max) || l.min >= l.max) err(`${where}: need min <= current <= max and min < max (got ${l.min}, ${l.current}, ${l.max}).`);
          if (l.step <= 0) err(`${where}.step must be positive.`);
        }
        if (l.falloff !== undefined && (!isNum(l.falloff) || l.falloff < 0 || l.falloff > 0.6)) err(`${where}.falloff must be between 0 and 0.6.`);
        checkStories(l.stories, where, isNum(l.min) ? l.min : -Infinity, isNum(l.max) ? l.max : Infinity);
      } else if (l.type === 'toggle') {
        if (l.onText !== undefined && typeof l.onText !== 'string') err(`${where}.onText must be text.`);
      } else err(`${where}.type must be "slider" or "toggle" (got "${l.type}").`);
      checkEffects(l.effects, where);
    });

    let personaShareSum = 0;
    arr(data.personas).forEach((p) => {
      if (!p) return;
      for (const k of ['income', 'federalTaxes', 'federalBenefits']) if (!isNum(p[k])) err(`persona "${p.id}".${k} must be a number.`);
      if (!isStr(p.name)) err(`persona "${p.id}" needs a name.`);
      if (!isNum(p.share) || p.share < 0 || p.share > 1) err(`persona "${p.id}".share must be a number from 0 to 1 (the fraction of US households it stands in for).`);
      else personaShareSum += p.share;
    });
    if (arr(data.personas).length && Math.abs(personaShareSum - 1) > 1e-6) err(`Persona shares must sum to 1 (they sum to ${round6(personaShareSum)}).`);
    arr(data.metrics).forEach((m) => {
      if (!m) return;
      if (!isNum(m.baseline)) err(`metric "${m.id}".baseline must be a number.`);
      if (m.goodDirection !== 'up' && m.goodDirection !== 'down') err(`metric "${m.id}".goodDirection must be "up" or "down".`);
      if (!FORMATS.includes(m.format)) err(`metric "${m.id}" has unknown format "${m.format}" (use ${FORMATS.join(', ')}).`);
      if (m.min !== undefined && !isNum(m.min)) err(`metric "${m.id}".min must be a number.`);
    });
    let shareSum = 0;
    arr(data.blocs).forEach((b) => {
      if (!b) return;
      if (!isNum(b.share) || b.share < 0) err(`bloc "${b.id}".share must be a non-negative number.`);
      else shareSum += b.share;
      if (!isNum(b.baselineApproval) || b.baselineApproval < 0 || b.baselineApproval > 100) err(`bloc "${b.id}".baselineApproval must be 0..100.`);
    });
    if (arr(data.blocs).length && Math.abs(shareSum - 1) > 0.01) err(`Bloc shares must sum to 1 (they sum to ${round6(shareSum)}).`);

    arr(data.headlines).forEach((h, i) => {
      const where = `headline ${i}${h && h.text ? ` ("${String(h.text).slice(0, 40)}")` : ''}`;
      if (!h || !isStr(h.text)) { err(`${where} needs text.`); return; }
      if (h.priority !== undefined && !isNum(h.priority)) err(`${where}.priority must be a number.`);
      const checkWhen = (w, depth) => {
        if (!w || typeof w !== 'object') { err(`${where} needs a "when" condition.`); return; }
        if (w.all !== undefined) {
          if (depth > 0 || !Array.isArray(w.all) || !w.all.length) err(`${where}.when.all must be a non-empty array of simple conditions.`);
          else w.all.forEach((c) => checkWhen(c, depth + 1));
          return;
        }
        const kinds = ['lever', 'stat', 'metric'].filter((k) => w[k] !== undefined);
        if (kinds.length !== 1) err(`${where}.when must have exactly one of lever, stat or metric.`);
        if (w.lever !== undefined && !(lineKind.get(w.lever) === 'spending' || levers.some((l) => l && l.id === w.lever))) {
          err(`${where} refers to unknown lever/spending id "${w.lever}".`);
        }
        if (w.stat !== undefined && !STATS.includes(w.stat)) err(`${where} has unknown stat "${w.stat}" (use ${STATS.join(', ')}).`);
        if (w.metric !== undefined && !metricIds.has(w.metric)) err(`${where} refers to unknown metric "${w.metric}".`);
        if (!OPS.includes(w.op)) err(`${where} has unsupported op "${w.op}" (use ${OPS.join(' ')}).`);
        if (!isNum(w.value) && typeof w.value !== 'boolean') err(`${where}.when.value must be a number.`);
      };
      checkWhen(h.when, 0);
    });

    const chIds = new Set();
    arr(data.challenges).forEach((c, i) => {
      if (!c || !isStr(c.id)) { err(`challenges[${i}] needs an id.`); return; }
      if (chIds.has(c.id)) err(`Duplicate challenge id "${c.id}".`);
      chIds.add(c.id);
      const rules = c.rules || {};
      for (const k of Object.keys(rules)) if (!RULE_KEYS.includes(k)) err(`challenge "${c.id}" has unsupported rule "${k}" (supported: ${RULE_KEYS.join(', ')}).`);
      if (rules.protect !== undefined) {
        if (!Array.isArray(rules.protect)) err(`challenge "${c.id}".rules.protect must be an array of ids.`);
        else rules.protect.forEach((id) => { if (!lineKind.has(id)) err(`challenge "${c.id}" rules.protect refers to unknown id "${id}".`); });
      }
      for (const k of ['minApproval', 'maxUnemploymentJobsLost', 'minFairness', 'maxHardship']) if (rules[k] !== undefined && !isNum(rules[k])) err(`challenge "${c.id}".rules.${k} must be a number.`);
    });
    return errors;
  }

  // ---------------------------------------------------------------- state

  function defaultState(data) {
    const state = { spending: {}, levers: {} };
    for (const s of arr(data.spending)) state.spending[s.id] = 0;
    for (const l of arr(data.levers)) state.levers[l.id] = l.type === 'toggle' ? false : l.current;
    return state;
  }

  function snap(v, min, max, step, keep) {
    if (keep !== undefined && v === keep) return v;
    let x = clamp(v, min, max);
    if (step > 0) x = min + Math.round((x - min) / step) * step;
    return round6(clamp(x, min, max));
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') return Number(v);
    return NaN;
  }

  // Returns a complete, valid state: defaults filled, values clamped and snapped,
  // unknown ids dropped, locked line pinned at 0.
  function sanitizeState(data, state) {
    const out = defaultState(data);
    const src = state && typeof state === 'object' ? state : {};
    const sp = src.spending && typeof src.spending === 'object' ? src.spending : {};
    const lv = src.levers && typeof src.levers === 'object' ? src.levers : {};
    for (const s of arr(data.spending)) {
      if (s.locked || !(s.id in sp)) continue;
      const v = toNumber(sp[s.id]);
      if (Number.isFinite(v)) out.spending[s.id] = snap(v, s.min, s.max, s.step, 0);
    }
    for (const l of arr(data.levers)) {
      if (!(l.id in lv)) continue;
      const raw = lv[l.id];
      if (l.type === 'toggle') {
        out.levers[l.id] = raw === true || raw === 1 || raw === '1' || raw === 'true';
      } else {
        const v = toNumber(raw);
        if (Number.isFinite(v)) out.levers[l.id] = snap(v, l.min, l.max, l.step, l.current);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- levers

  // Units of change for a lever: slider -> value - current; toggle -> 1 when on.
  function leverUnits(lever, value) {
    if (lever.type === 'toggle') return value ? 1 : 0;
    return round6(value - lever.current);
  }

  // $B landing on the parent line (added revenue or added spending).
  function leverYield(lever, value) {
    if (lever.type === 'toggle') return value ? lever.budgetPerUnit : 0;
    const d = value - lever.current;
    if (d === 0) return 0;
    let factor = 1;
    if (lever.falloff) {
      const maxDistance = d > 0 ? lever.max - lever.current : lever.current - lever.min;
      if (maxDistance > 0) factor = 1 - lever.falloff * Math.abs(d) / maxDistance;
    }
    return lever.budgetPerUnit * d * factor;
  }

  // Spending slider stories: same sign as value, largest |at| <= |value|.
  // Lever slider stories: `at` absolute; compared as offsets from `current`.
  function pickStory(stories, offset, origin) {
    if (!offset || !Array.isArray(stories)) return null;
    let best = null, bestMag = -1;
    for (const s of stories) {
      const rel = s.at - origin;
      if (rel === 0 || Math.sign(rel) !== Math.sign(offset)) continue;
      const mag = Math.abs(rel);
      if (mag <= Math.abs(offset) + 1e-9 && mag > bestMag) { best = s; bestMag = mag; }
    }
    return best ? best.text : null;
  }

  function compare(a, op, b) {
    switch (op) {
      case '<=': return a <= b;
      case '>=': return a >= b;
      case '<': return a < b;
      case '>': return a > b;
      case '==': return a === b;
      default: return false;
    }
  }

  // ---------------------------------------------------------------- compute

  function compute(data, rawState) {
    const meta = data.meta;
    const state = sanitizeState(data, rawState);
    const spending = arr(data.spending), revenue = arr(data.revenue), levers = arr(data.levers);
    const byId = {};
    for (const s of spending) byId[s.id] = s;
    for (const r of revenue) byId[r.id] = r;

    const baseSpend = spending.reduce((a, s) => a + s.baseline, 0);
    const baseRev = revenue.reduce((a, r) => a + r.baseline, 0);
    const baselineDeficit = baseSpend - baseRev;
    const lockedLine = spending.find((s) => s.locked);

    // 1. Collect the player's moves.
    const moves = [];
    for (const s of spending) {
      if (s.locked) continue;
      const pct = state.spending[s.id];
      if (!pct) continue;
      const dollars = s.baseline * pct / 100;
      moves.push({
        id: s.id, kind: 'spending', type: 'slider', side: 'spending', parent: s.id,
        name: s.name, icon: s.icon || '', value: pct, units: pct, dollars,
        deficitImpact: dollars, effects: s.effects || {},
        story: pickStory(s.stories, pct, 0)
      });
    }
    const leverYieldById = {};
    for (const l of levers) {
      const value = state.levers[l.id];
      const units = leverUnits(l, value);
      const y = leverYield(l, value);
      leverYieldById[l.id] = y;
      if (!units) continue;
      const parent = byId[l.parent];
      moves.push({
        id: l.id, kind: 'lever', type: l.type, side: l.side, parent: l.parent,
        name: l.name, icon: (parent && parent.icon) || '', value, units, dollars: y,
        deficitImpact: l.side === 'revenue' ? -y : y, effects: l.effects || {},
        story: l.type === 'toggle' ? (l.onText || null) : pickStory(l.stories, units, l.current)
      });
    }

    // 2. Budget lines.
    const spendingById = {}, revenueById = {};
    for (const s of spending) spendingById[s.id] = s.baseline;
    for (const r of revenue) revenueById[r.id] = r.baseline;
    for (const m of moves) {
      const target = m.side === 'revenue' ? revenueById : spendingById;
      if (m.parent in target) target[m.parent] += m.dollars;
    }

    // 3. Aggregate effects.
    let gdpPct = 0;
    const metricDrivers = {}, personaDrivers = {}, blocDrivers = {};
    const add = (bucket, key, move, amount) => {
      if (!amount) return;
      (bucket[key] || (bucket[key] = [])).push({ id: move.id, kind: move.kind, name: move.name, icon: move.icon, amount });
    };
    for (const m of moves) {
      const e = m.effects;
      if (isNum(e.gdpPct)) gdpPct += e.gdpPct * m.units;
      for (const [k, v] of Object.entries(e.metrics || {})) add(metricDrivers, k, m, v * m.units);
      for (const [k, v] of Object.entries(e.personas || {})) add(personaDrivers, k, m, v * m.units);
      for (const [k, v] of Object.entries(e.approval || {})) add(blocDrivers, k, m, v * m.units);
    }
    gdpPct = round6(gdpPct);
    const jobs = gdpPct * meta.jobsPerGdpPct;

    // 4. GDP feedback on revenue, spread by baseline share.
    const revenueFeedback = gdpPct * meta.revenueFeedbackPerGdpPct;
    if (revenueFeedback && baseRev > 0) {
      for (const r of revenue) revenueById[r.id] += revenueFeedback * r.baseline / baseRev;
    }

    // 5. Interest responds to the change in borrowing.
    const sumVals = (o) => Object.values(o).reduce((a, v) => a + v, 0);
    const totalRevenue = sumVals(revenueById);
    const deficitBeforeInterest = sumVals(spendingById) - totalRevenue;
    const policyDeficitChange = deficitBeforeInterest - baselineDeficit;
    const interestChange = policyDeficitChange * meta.avgInterestRate * 0.5;
    if (lockedLine) spendingById[lockedLine.id] += interestChange;
    const totalSpending = sumVals(spendingById);
    const deficit = totalSpending - totalRevenue;

    // 6. Metrics.
    const sortDrivers = (list) => (list || []).slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const metrics = {};
    for (const mt of arr(data.metrics)) {
      const drivers = sortDrivers(metricDrivers[mt.id]);
      let value = mt.baseline + drivers.reduce((a, d) => a + d.amount, 0);
      if (isNum(mt.min)) value = Math.max(mt.min, value);
      if (isNum(mt.max)) value = Math.min(mt.max, value);
      metrics[mt.id] = { value, delta: value - mt.baseline, baseline: mt.baseline, drivers };
    }

    // 7. Personas.
    const personas = {};
    for (const p of arr(data.personas)) {
      const breakdown = sortDrivers(personaDrivers[p.id]);
      personas[p.id] = { delta: breakdown.reduce((a, d) => a + d.amount, 0), breakdown };
    }

    // 8. Approval with saturation.
    const byBloc = {};
    let overall = 0, shareTotal = 0;
    for (const b of arr(data.blocs)) {
      const drivers = sortDrivers(blocDrivers[b.id]).map((d) => Object.assign({}, d, { points: d.amount }));
      const raw = drivers.reduce((a, d) => a + d.amount, 0);
      const soft = APPROVAL_SATURATION * Math.tanh(raw / APPROVAL_SATURATION);
      const value = clamp(b.baselineApproval + soft, 0, 100);
      byBloc[b.id] = { value, delta: value - b.baselineApproval, raw, baseline: b.baselineApproval, drivers };
      overall += b.share * value;
      shareTotal += b.share;
    }
    if (shareTotal > 0) overall /= shareTotal;
    let baselineApproval = 0;
    for (const b of arr(data.blocs)) baselineApproval += b.share * b.baselineApproval;
    if (shareTotal > 0) baselineApproval /= shareTotal;

    // 9. Stories and changes.
    const ranked = moves.slice().sort((a, b) => Math.abs(b.deficitImpact) - Math.abs(a.deficitImpact));
    const storyById = {};
    const activeStories = [];
    for (const m of ranked) {
      if (!m.story) continue;
      storyById[m.id] = m.story;
      activeStories.push({ id: m.id, kind: m.kind, name: m.name, icon: m.icon, text: m.story, dollars: m.dollars, deficitImpact: m.deficitImpact });
    }
    const changes = ranked.map((m) => ({
      id: m.id, kind: m.kind, type: m.type, side: m.side, parent: m.parent, name: m.name, icon: m.icon,
      value: m.value, units: m.units, dollars: m.dollars, deficitImpact: m.deficitImpact
    }));

    const result = {
      state, totalSpending, totalRevenue, deficit, baselineDeficit,
      baselineSpending: baseSpend, baselineRevenue: baseRev,
      deficitBeforeInterest, interestChange, revenueFeedback,
      spendingById, revenueById, leverYield: leverYieldById,
      gdpPct, jobs, interest: lockedLine ? spendingById[lockedLine.id] : 0,
      metrics, personas,
      approval: { overall, baseline: baselineApproval, byBloc },
      lenses: lensesFor(data, personas, overall, baselineApproval),
      activeStories, storyById, changes,
      balanced: deficit <= BALANCE_TOLERANCE
    };

    // 10. Headlines.
    const statValue = {
      approval: () => overall,
      fairness: () => result.lenses.fairness.score,
      hardship: () => result.lenses.hardship.pct,
      brink: () => result.lenses.hardship.brink.length
    };
    const valueOf = (w) => {
      if (w.stat !== undefined) {
        if (statValue[w.stat]) return statValue[w.stat]();
        return result[w.stat];
      }
      if (w.metric !== undefined) return metrics[w.metric] ? metrics[w.metric].value : NaN;
      if (w.lever !== undefined) {
        if (w.lever in state.spending) return state.spending[w.lever];
        if (w.lever in state.levers) return Number(state.levers[w.lever]);
      }
      return NaN;
    };
    const holds = (w) => {
      if (Array.isArray(w.all)) return w.all.length > 0 && w.all.every((c) => holds(c || {}));
      const target = typeof w.value === 'boolean' ? Number(w.value) : w.value;
      return compare(valueOf(w), w.op, target);
    };
    const matches = [];
    arr(data.headlines).forEach((h, i) => {
      if (holds(h.when || {})) matches.push({ text: h.text, priority: h.priority || 0, slot: h.slot, index: i });
    });
    matches.sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
    result.headlines = matches;
    result.headline = matches[0] || null;

    // 11. Ten-year projection.
    result.projection = project(meta, baselineDeficit, policyDeficitChange);
    return result;
  }

  // Three ways to keep score on how people take the plan.
  // - electability: the approval meter (political; saturates per bloc).
  // - fairness ("shared sacrifice"): how evenly the burden falls across the example
  //   households, each counted once regardless of how many households it stands for.
  // - hardship: population-weighted log utility of take-home pay, reported as the
  //   equivalent across-the-board % loss of take-home pay (negative = better off).
  function lensesFor(data, personas, overall, baselineApproval) {
    const rows = arr(data.personas).map((p) => {
      const th = p.income - p.federalTaxes;
      const takeHome = th > 0 ? th : Math.max(1, p.income);
      const delta = personas[p.id] ? personas[p.id].delta : 0;
      const burden = delta ? -delta / takeHome : 0;
      const utility = Math.log(Math.max(HARDSHIP_FLOOR, 1 + delta / takeHome));
      return { id: p.id, share: isNum(p.share) ? p.share : 0, burdenPct: 100 * burden, utility };
    });
    // Fairness: unweighted population standard deviation of burden, in points.
    let sd = 0, lightest = null, hardest = null;
    if (rows.length) {
      const mean = rows.reduce((a, r) => a + r.burdenPct, 0) / rows.length;
      sd = Math.sqrt(rows.reduce((a, r) => a + (r.burdenPct - mean) * (r.burdenPct - mean), 0) / rows.length);
      if (sd < 1e-9) sd = 0;
      let lo = rows[0], hi = rows[0];
      for (const r of rows) {
        if (r.burdenPct < lo.burdenPct) lo = r;
        if (r.burdenPct > hi.burdenPct) hi = r;
      }
      lightest = { id: lo.id, burdenPct: lo.burdenPct };
      hardest = { id: hi.id, burdenPct: hi.burdenPct };
    }
    // Hardship: share-weighted mean utility -> equivalent uniform loss.
    const shareTotal = rows.reduce((a, r) => a + r.share, 0);
    const W = shareTotal > 0 ? rows.reduce((a, r) => a + r.share * r.utility, 0) / shareTotal : 0;
    const byPersona = {};
    for (const r of rows) byPersona[r.id] = { burdenPct: r.burdenPct, utility: r.utility };
    return {
      electability: { score: overall, baseline: baselineApproval },
      fairness: { score: 100 * Math.exp(-sd / FAIRNESS_K), sd, lightest, hardest },
      hardship: {
        pct: W === 0 ? 0 : (1 - Math.exp(W)) * 100,
        brink: rows.filter((r) => r.burdenPct > BRINK_PCT).map((r) => r.id),
        byPersona
      }
    };
  }

  // Baseline deficit grows at baselineDeficitGrowth; the player's policy change scales
  // with nominal GDP; extra/less debt compounds through interest (half a year of
  // interest on each year's new borrowing, full interest on accumulated gap).
  function project(meta, baselineDeficit, policyDeficitChange) {
    const out = [];
    let baselineDebt = meta.debtHeldByPublic, gap = 0;
    for (let y = 1; y <= PROJECTION_YEARS; y++) {
      const gdp = meta.gdp * Math.pow(1 + meta.gdpGrowth, y);
      const baseDef = baselineDeficit * Math.pow(1 + meta.baselineDeficitGrowth, y);
      const policy = policyDeficitChange * Math.pow(1 + meta.gdpGrowth, y - 1);
      const extraInterest = (gap + policy * 0.5) * meta.avgInterestRate;
      gap += policy + extraInterest;
      baselineDebt += baseDef;
      const planDebt = baselineDebt + gap;
      out.push({
        year: meta.fiscalYear + y, gdp,
        baselineDeficit: baseDef, planDeficit: baseDef + policy + extraInterest,
        baselineDebt, planDebt,
        baselineDebtPctGdp: 100 * baselineDebt / gdp,
        planDebtPctGdp: 100 * planDebt / gdp
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- share codes

  // Compact, URL-hash-safe: "id:value,id:value" for non-default values only.
  // Toggles are 1/0.
  function encodeState(data, state) {
    const s = sanitizeState(data, state);
    const def = defaultState(data);
    const parts = [];
    for (const sp of arr(data.spending)) {
      if (s.spending[sp.id] !== def.spending[sp.id]) parts.push(`${encodeURIComponent(sp.id)}:${s.spending[sp.id]}`);
    }
    for (const l of arr(data.levers)) {
      const v = s.levers[l.id];
      if (v !== def.levers[l.id]) parts.push(`${encodeURIComponent(l.id)}:${typeof v === 'boolean' ? (v ? 1 : 0) : v}`);
    }
    return parts.join(',');
  }

  function decodeState(data, code) {
    const state = { spending: {}, levers: {} };
    if (typeof code !== 'string') return defaultState(data);
    let str = code.trim().replace(/^#/, '');
    const spendIds = new Set(arr(data.spending).map((s) => s.id));
    const leverIds = new Set(arr(data.levers).map((l) => l.id));
    for (const part of str.split(',')) {
      const i = part.lastIndexOf(':');
      if (i <= 0) continue;
      let id;
      try { id = decodeURIComponent(part.slice(0, i)); } catch (e) { continue; }
      const val = part.slice(i + 1);
      if (spendIds.has(id)) state.spending[id] = val;
      else if (leverIds.has(id)) state.levers[id] = val;
    }
    return sanitizeState(data, state);
  }

  // ---------------------------------------------------------------- challenges

  function checkChallenge(data, state, result, challenge) {
    const s = sanitizeState(data, state);
    const r = result || compute(data, s);
    const rules = (challenge && challenge.rules) || {};
    const violations = [];
    const broken = {};
    const fail = (rule, msg) => { violations.push(msg); broken[rule] = true; };
    const nameOf = {};
    for (const x of arr(data.spending).concat(arr(data.revenue), arr(data.levers))) nameOf[x.id] = x.name;
    const leverMoves = arr(data.levers).map((l) => ({ l, y: leverYield(l, s.levers[l.id]) })).filter((x) => x.y !== 0);

    if (rules.noTaxIncreases) {
      for (const { l, y } of leverMoves) if (l.side === 'revenue' && y > 0) fail('noTaxIncreases', `Raises taxes: "${l.name}".`);
    }
    if (rules.noSpendingCuts) {
      for (const sp of arr(data.spending)) if (!sp.locked && s.spending[sp.id] < 0) fail('noSpendingCuts', `Cut: ${sp.name}.`);
      for (const { l, y } of leverMoves) if (l.side === 'spending' && y < 0) fail('noSpendingCuts', `Cuts spending: "${l.name}".`);
    }
    if (Array.isArray(rules.protect)) {
      for (const id of rules.protect) {
        if (id in s.spending && s.spending[id] < 0) fail('protect', `Protected line cut: ${nameOf[id] || id}.`);
        for (const { l, y } of leverMoves) {
          if (l.parent !== id) continue;
          if (l.side === 'spending' && y < 0) fail('protect', `"${l.name}" cuts protected line ${nameOf[id] || id}.`);
          if (l.side === 'revenue' && y > 0) fail('protect', `"${l.name}" raises taxes in protected line ${nameOf[id] || id}.`);
        }
      }
    }
    if (isNum(rules.minApproval) && r.approval.overall < rules.minApproval) {
      fail('minApproval', `Approval is ${Math.round(r.approval.overall)}; it must stay at ${rules.minApproval} or above.`);
    }
    if (isNum(rules.maxUnemploymentJobsLost) && r.jobs < -rules.maxUnemploymentJobsLost) {
      fail('maxUnemploymentJobsLost', `Your plan costs ${format.people(-r.jobs)} jobs; the limit is ${format.people(rules.maxUnemploymentJobsLost)}.`);
    }
    if (isNum(rules.minFairness) && r.lenses.fairness.score < rules.minFairness) {
      fail('minFairness', `Shared sacrifice scores ${Math.floor(r.lenses.fairness.score)}; it must be at least ${rules.minFairness}.`);
    }
    if (isNum(rules.maxHardship) && r.lenses.hardship.pct > rules.maxHardship) {
      fail('maxHardship', `Hardship is ${(Math.ceil(r.lenses.hardship.pct * 10) / 10).toFixed(1)}% of take-home pay; it must be ${rules.maxHardship}% or less.`);
    }
    const ok = violations.length === 0;
    return { ok, violations, broken, balanced: r.balanced, won: ok && r.balanced };
  }

  // ---------------------------------------------------------------- formatting

  const MINUS = '−';
  // 3 significant figures, as a fixed string.
  function sig3(x) {
    const a = Math.abs(x);
    if (a >= 99.95) return Math.round(x).toString();
    if (a >= 9.995) return x.toFixed(1);
    return x.toFixed(2);
  }
  const withCommas = (n) => Math.round(n).toLocaleString('en-US');
  const sign = (x, s) => (x < 0 ? MINUS + s : s);

  const format = {
    // Billions in -> "$1.83 trillion" / "$412 billion" / "$850 million".
    money(b) {
      if (!isNum(b)) return '—';
      const a = Math.abs(b);
      if (a < 0.0005) return '$0';
      let s;
      if (a >= 999.5) s = `$${sig3(a / 1000)} trillion`;
      else if (a >= 0.9995) s = `$${sig3(a)} billion`;
      else s = `$${sig3(a * 1000)} million`;
      return sign(b, s);
    },
    moneyShort(b) {
      if (!isNum(b)) return '—';
      const a = Math.abs(b);
      if (a < 0.0005) return '$0';
      let s;
      if (a >= 999.5) s = `$${sig3(a / 1000)}T`;
      else if (a >= 0.9995) s = `$${sig3(a)}B`;
      else s = `$${sig3(a * 1000)}M`;
      return sign(b, s);
    },
    signedMoney(b) {
      if (!isNum(b)) return '—';
      const s = format.money(b);
      return b > 0 && s !== '$0' ? '+' + s : s;
    },
    // Plain dollars -> "$1,240".
    dollars(x) {
      if (!isNum(x)) return '—';
      const r = Math.round(x);
      return r === 0 ? '$0' : sign(r, '$' + withCommas(Math.abs(r)));
    },
    signedDollars(x) {
      const s = format.dollars(x);
      return Math.round(x) > 0 ? '+' + s : s;
    },
    bigDollars(x) {
      if (!isNum(x)) return '—';
      const a = Math.abs(x);
      if (a >= 999.5e6) return format.money(x / 1e9);
      if (a >= 999.5e3) return sign(x, `$${sig3(a / 1e6)} million`);
      return format.dollars(x);
    },
    // Counts -> "27.0 million" / "410,000" / "1,230".
    people(n) {
      if (!isNum(n)) return '—';
      const a = Math.abs(n);
      let s;
      if (a >= 999.5e6) s = `${sig3(a / 1e9)} billion`;
      else if (a >= 999.5e3) s = `${sig3(a / 1e6)} million`;
      else if (a >= 1000) {
        const mag = Math.pow(10, Math.floor(Math.log10(a)) - 2);
        s = withCommas(Math.round(a / mag) * mag);
      } else s = withCommas(a);
      return n < 0 && s !== '0' ? MINUS + s : s;
    },
    signedPeople(n) {
      const s = format.people(n);
      return n > 0 && s !== '0' ? '+' + s : s;
    },
    percent(x, digits = 1) {
      if (!isNum(x)) return '—';
      const s = Math.abs(x).toFixed(digits) + '%';
      return x < 0 && Number(Math.abs(x).toFixed(digits)) !== 0 ? MINUS + s : s;
    },
    number(x) {
      if (!isNum(x)) return '—';
      const a = Math.abs(x);
      const s = a >= 100 ? withCommas(a) : (Math.round(a * 10) / 10).toLocaleString('en-US');
      return x < 0 && s !== '0' ? MINUS + s : s;
    },
    metric(x, fmt) {
      switch (fmt) {
        case 'people': case 'jobs': return format.people(x);
        case 'dollars': return format.bigDollars(x);
        case 'percent': return format.percent(x);
        case 'year': return String(Math.round(x));   // a calendar year: no thousands comma
        default: return format.number(x);
      }
    },
    signedMetric(x, fmt) {
      if (fmt === 'year') {   // a change in a year is a number of years
        const n = Math.round(Math.abs(x) * 10) / 10;
        if (!n) return '0 years';
        return (x > 0 ? '+' : MINUS) + n + (n === 1 ? ' year' : ' years');
      }
      const s = format.metric(x, fmt);
      return x > 0 && /[1-9]/.test(s) ? '+' + s : s;
    }
  };

  const BudgetModel = {
    validateData, defaultState, sanitizeState, compute, encodeState, decodeState,
    checkChallenge, leverYield, leverUnits, format,
    constants: {
      APPROVAL_SATURATION, BALANCE_TOLERANCE, PROJECTION_YEARS, GROUPS, FORMATS, RULE_KEYS, STATS,
      FAIRNESS_K, HARDSHIP_FLOOR, BRINK_PCT
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BudgetModel;
  else root.BudgetModel = BudgetModel;
})(typeof window !== 'undefined' ? window : globalThis);
