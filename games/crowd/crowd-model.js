// The Crowd: pure, DOM-free simulation. Turns a BudgetModel state + result into the
// moods and reasons of a population of individual citizens. All content (who the
// people are, what they care about, text) lives in people.js (CROWD_DATA); all
// budget ids and numbers come from shared/data.js. Deterministic: seeded PRNG only.
(function (root) {
  'use strict';

  const VOCAB = {
    outfit: ["casual", "suit", "scrubs", "labcoat", "camo", "overalls", "uniform", "hivis", "apron", "cardigan"],
    hat: ["none", "cap", "hardhat", "straw", "gradcap", "helmet", "beret", "chefhat", "cowboy"],
    prop: ["none", "cane", "briefcase", "stethoscope", "book", "wrench", "laptop", "stroller", "toolbox", "clipboard", "tray"]
  };
  const SHORT_MAX = 28;
  const DERIVED_BASES = ["capgains", "wage", "wageCapped", "taxBottom", "taxMiddle", "taxTop", "tariff", "vatBase", "gasCent", "energy",
    "corp", "foreignInc", "fttBase", "estateRate", "estateEx", "gainsDeath", "wealth", "ssCap", "niitAmt", "irs", "ssFuture",
    "ssFutureHigh", "ssExpand", "farmLimit", "kids"];

  // ------------------------------------------------------------ utilities
  const arr = (x) => (Array.isArray(x) ? x : []);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mix(a, b) {
    let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return h >>> 0;
  }
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const pickBy = (list, h) => (list && list.length ? list[h % list.length] : undefined);
  // Templates are compiled once into [literal, var, literal, var, ...] for speed.
  const TPL = new Map();
  function fill(tpl, vars) {
    let parts = TPL.get(tpl);
    if (!parts) {
      parts = String(tpl).split(/\{(\w+)\}/g);
      TPL.set(tpl, parts);
    }
    if (parts.length === 1) return parts[0];
    let s = parts[0];
    for (let i = 1; i < parts.length; i += 2) {
      const v = vars[parts[i]];
      s += (v !== undefined ? v : '{' + parts[i] + '}') + parts[i + 1];
    }
    return s;
  }
  const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  function commas(n) {
    const s = String(Math.round(Math.abs(n)));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function roundNice(x) {
    const a = Math.abs(x);
    if (a >= 100000) return Math.round(a / 1000) * 1000;
    if (a >= 10000) return Math.round(a / 500) * 500;
    if (a >= 1000) return Math.round(a / 50) * 50;
    if (a >= 100) return Math.round(a / 10) * 10;
    return Math.max(5, Math.round(a / 5) * 5);
  }
  function fmtDollars(x) {
    const a = Math.abs(x);
    if (a >= 1e9) return '$' + (a / 1e9).toFixed(1).replace(/\.0$/, '') + ' billion';
    if (a >= 1e6) return '$' + (a / 1e6).toFixed(1).replace(/\.0$/, '') + ' million';
    return '$' + commas(roundNice(a));
  }
  function fmtShortDollars(x) {
    const a = Math.abs(x);
    if (a >= 1e6) return '$' + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 100000) return '$' + Math.round(a / 1000) + 'k';
    return '$' + commas(roundNice(a));
  }
  function fmtB(b) {   // $ billions
    const a = Math.abs(b);
    if (a >= 1000) return '$' + (a / 1000).toFixed(1) + ' trillion';
    if (a >= 10) return '$' + Math.round(a) + ' billion';
    return '$' + a.toFixed(1).replace(/\.0$/, '') + ' billion';
  }
  function fmtPct(p) {
    return Math.round(Math.abs(p)) + '%';
  }
  function trimShort(s) {
    if (s.length <= SHORT_MAX) return s;
    const cut = s.slice(0, SHORT_MAX - 1);
    const sp = cut.lastIndexOf(' ');
    return (sp > 12 ? cut.slice(0, sp) : cut).replace(/[\s,:;.-]+$/, '') + '…';
  }
  function getBudgetModel() {
    if (root && root.BudgetModel) return root.BudgetModel;
    if (typeof require === 'function') {
      try { return require('../../shared/model.js'); } catch (e) { /* ignore */ }
      try { return require(require('path').join(__dirname, '..', '..', 'shared', 'model.js')); } catch (e) { /* ignore */ }
    }
    return null;
  }

  // ------------------------------------------------------------ controls
  // Every adjustable thing in the budget data: unlocked spending lines and levers.
  function controlsOf(data) {
    const out = [];
    for (const s of arr(data.spending)) if (!s.locked) out.push({ id: s.id, name: s.name, kind: 'spending', side: 'spending', type: 'slider', def: s });
    for (const l of arr(data.levers)) out.push({ id: l.id, name: l.name, kind: 'lever', side: l.side, type: l.type, def: l });
    return out;
  }
  function controlIndex(data) {
    if (data.__crowdIdx && data.__crowdIdx.src === data) return data.__crowdIdx;
    const list = controlsOf(data);
    const byId = {};
    for (const c of list) byId[c.id] = c;
    const idx = { list, byId, src: data };
    try { Object.defineProperty(data, '__crowdIdx', { value: idx, enumerable: false, configurable: true, writable: true }); } catch (e) { /* frozen */ }
    return idx;
  }
  // units of change per control; and $B change (added spending, or added revenue for revenue levers)
  function movesOf(data, state, result) {
    const idx = controlIndex(data);
    const sp = (state && state.spending) || {}, lv = (state && state.levers) || {};
    const units = {}, dollars = {}, values = {};
    const yields = (result && result.leverYield) || {};
    for (const c of idx.list) {
      let u = 0, d = 0, v;
      if (c.kind === 'spending') {
        v = Number(sp[c.id]) || 0; u = v; d = c.def.baseline * u / 100;
      } else if (c.type === 'toggle') {
        v = !!lv[c.id]; u = v ? 1 : 0; d = u ? (c.id in yields ? yields[c.id] : c.def.budgetPerUnit) : 0;
      } else {
        v = c.id in lv ? Number(lv[c.id]) : c.def.current;
        if (!Number.isFinite(v)) v = c.def.current;
        u = Math.round((v - c.def.current) * 1e6) / 1e6;
        d = c.id in yields ? yields[c.id] : c.def.budgetPerUnit * u;
      }
      values[c.id] = v;
      if (u) { units[c.id] = u; dollars[c.id] = d; }
    }
    return { units, dollars, values, idx };
  }
  function baselineDeficitOf(data) {
    let s = 0, r = 0;
    for (const x of arr(data.spending)) s += x.baseline;
    for (const x of arr(data.revenue)) r += x.baseline;
    return s - r;
  }

  // ------------------------------------------------------------ population
  function figureCounts(crowd, size) {
    const archs = arr(crowd.archetypes);
    const total = archs.reduce((a, x) => a + x.share, 0) || 1;
    const q = archs.map((a) => a.share / total * size);
    const n = q.map(Math.floor);
    for (let i = 0; i < archs.length; i++) if (archs[i].mustShow && n[i] < 1 && size >= archs.filter((a) => a.mustShow).length) n[i] = 1;
    let left = size - n.reduce((a, x) => a + x, 0);
    const order = q.map((x, i) => ({ i, rem: x - Math.floor(x) })).sort((a, b) => (b.rem - a.rem) || (a.i - b.i));
    for (let k = 0; left > 0 && k < order.length * 4; k++) {
      const o = order[k % order.length];
      if (n[o.i] >= Math.ceil(q[o.i]) && k < order.length) continue;
      n[o.i]++; left--;
    }
    // Too many (must-show bumps): take back from the groups that were rounded up most generously.
    const excess = order.slice().reverse();
    for (let k = 0; left < 0 && k < excess.length * 4; k++) {
      const o = excess[k % excess.length];
      const a = archs[o.i];
      if (n[o.i] > (a.mustShow ? 1 : 0) && n[o.i] > Math.floor(q[o.i])) { n[o.i]--; left++; }
      else if (k >= excess.length && n[o.i] > 1) { n[o.i]--; left++; }
    }
    return n;
  }

  function consumption(crowd, income) {
    const tiers = (crowd.tax && crowd.tax.consumption) || [[Infinity, 0.8]];
    let c = 0, prev = 0;
    for (const [top, rate] of tiers) {
      if (income <= prev) break;
      c += (Math.min(income, top) - prev) * rate;
      prev = top;
    }
    return c;
  }
  function logUniform(r, lo, hi) {
    if (!(hi > lo)) return lo;
    if (lo <= 0) return lo + r() * (hi - lo);
    return Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));
  }

  function makeBases(crowd, a, income, age, married, r) {
    const tax = crowd.tax || {};
    const b = {};
    const specs = a.bases || {};
    for (const key of Object.keys(specs)) {
      const s = specs[key];
      if (Array.isArray(s)) {
        const hit = r() < s[0];
        const v = s[1] + r() * (s[2] - s[1]);
        b[key] = hit ? (key === 'kids' ? Math.round(v) : v) : 0;
      } else if (s && typeof s === 'object') {
        const hit = r() < (s.p === undefined ? 1 : s.p);
        b[key] = hit ? (s.f || 0) * income : 0;
      }
    }
    const capShare = a.capShare || 0;
    const wageShare = a.wageShare !== undefined ? a.wageShare : (1 - capShare) * 0.95;
    const netWorth = a.netWorth ? logUniform(r, a.netWorth[0], a.netWorth[1]) : 0;
    const gallons = a.gallons ? a.gallons[0] + r() * (a.gallons[1] - a.gallons[0]) : 700 + Math.min(income, 200000) * 0.004;
    b.capgains = income * capShare;
    b.wage = income * wageShare;
    b.wageCapped = Math.min(b.wage, tax.ssWageCap || 184500);
    const ordinary = income * (1 - capShare) * (a.taxableFrac !== undefined ? a.taxableFrac : 1);
    const taxable = Math.max(0, ordinary - (married ? tax.stdCouple : tax.stdSingle));
    const bw = married ? tax.bottomCouple : tax.bottomSingle, mw = married ? tax.middleCouple : tax.middleSingle;
    const itf = a.itFactor !== undefined ? a.itFactor : 1;
    b.taxBottom = Math.min(taxable, bw) * itf;
    b.taxMiddle = clamp(taxable - bw, 0, mw);
    b.taxTop = Math.max(0, taxable - bw - mw);
    const C = consumption(crowd, income);
    b.tariff = 0.0025 * C;
    b.vatBase = 0.007 * C;
    b.gasCent = gallons * 0.01;
    b.energy = 22 * (a.energyMult || 1) * (0.5 + 0.5 * Math.min(C, 150000) / 70000);
    b.corp = 0.0004 * income + 0.0028 * b.capgains;
    b.foreignInc = 0.0001 * income + 0.0012 * b.capgains;
    b.fttBase = 0.0001 * income + 0.0009 * b.capgains;
    const ex15 = married ? 30e6 : 15e6, ex35 = married ? 7e6 : 3.5e6;
    b.estateRate = Math.max(0, netWorth - ex15) * 0.01 / 30 * 0.8;
    b.estateEx = Math.max(0, (Math.max(0, netWorth - ex35) * 0.45 - Math.max(0, netWorth - ex15) * 0.40)) / 30 * 0.3;
    b.gainsDeath = Math.max(0, netWorth * 0.6 - 5e6) * 0.238 / 25 * 0.3;
    b.wealth = 0.02 * Math.max(0, netWorth - 50e6) + 0.01 * Math.max(0, netWorth - 1e9);
    b.ssCap = 0.124 * Math.max(0, b.wage - (tax.ssCapThreshold || 250000));
    b.niitAmt = b.niit ? 0.038 * Math.max(0, income * (1 - capShare) - 400000) : 0;
    b.irs = a.irsExposure !== undefined ? a.irsExposure : (income >= 5e6 ? 500 : income >= 9e5 ? 80 : income >= 3e5 ? 15 : 0);
    b.ssFuture = (age < 62 && b.wage > 0) ? clamp(0.4 * Math.min(b.wage, tax.ssWageCap || 184500) * (married ? 1.4 : 1), 9000, 55000) : 0;
    b.ssFutureHigh = (b.ssFuture && b.wage > 70000) ? Math.min(6000, 0.15 * b.ssFuture) : 0;
    b.ssExpand = (b.ss || 0) * (income < 35000 ? 0.06 : 0.02);
    b.farmLimit = b.farm ? (b.farm > 20000 ? 3000 + 0.15 * (b.farm - 20000) : 0.12 * b.farm) : 0;
    if (b.kids === undefined) b.kids = 0;
    return { bases: b, netWorth };
  }

  function bandIncome(i) { return i < 45000 ? 'low' : i < 130000 ? 'middle' : i < 600000 ? 'upper' : 'top'; }
  function bandAge(a) { return a < 30 ? '18-29' : a < 50 ? '30-49' : a < 65 ? '50-64' : '65+'; }

  function aboutText(a, c, sim) {
    const b = sim.bases;
    const mo = (x) => fmtDollars((x || 0) / 12);
    const vars = {
      income: fmtDollars(c.income), ss_mo: mo(b.ss), va_mo: mo(b.va), fedpension_mo: mo(b.fedpension), milpay_mo: mo(b.milpay),
      snap_mo: mo(b.snap), aca_mo: mo(b.aca), farm: fmtDollars(b.farm || 0), networth: fmtDollars(sim.netWorth),
      loan_total: fmtDollars(Math.max(8000, (b.loanRelief || 1000) * 25)), pell: fmtDollars(b.pell || 0)
    };
    return fill(a.about || '', vars);
  }

  function buildPopulation(data, crowd, opts) {
    opts = opts || {};
    const size = Math.max(1, Math.floor(opts.size || crowd.defaultSize || 260));
    const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    const archs = arr(crowd.archetypes);
    const counts = figureCounts(crowd, size);
    const adults = crowd.adults || 262e6;
    const names = arr(crowd.names).length ? crowd.names : ['Alex'];
    const T = crowd.tuning || {};
    const people = [];
    archs.forEach((a, ai) => {
      const n = counts[ai];
      const represents = n ? Math.round(a.share * adults / n) : 0;
      for (let k = 0; k < n; k++) {
        const r = makeRng(mix(mix(seed, hashStr(a.id)), k + 1));
        const age = Math.round(a.age[0] + r() * (a.age[1] - a.age[0]));
        const income = Math.round(logUniform(r, a.income[0], a.income[1]) / 100) * 100;
        const married = r() < (a.married || 0);
        const name = names[Math.floor(r() * names.length)];
        // labels: "text" or ["text", minAge, maxAge]
        const fits = arr(a.labels).filter((l) => !Array.isArray(l) || (age >= l[1] && age <= l[2]));
        const lab = pickBy(fits.length ? fits : arr(a.labels).filter((l) => !Array.isArray(l)), Math.floor(r() * 1e6));
        const label = (Array.isArray(lab) ? lab[0] : lab) || a.group;
        const lk = a.look || {};
        const look = {
          outfit: pickBy(lk.outfit, Math.floor(r() * 1e6)) || 'casual',
          hat: pickBy(lk.hat, Math.floor(r() * 1e6)) || 'none',
          prop: pickBy(lk.prop, Math.floor(r() * 1e6)) || 'none',
          grayHair: age >= 62 ? r() < 0.85 : age >= 50 ? r() < 0.35 : false,
          variant: Math.round(r() * 1000) / 1000
        };
        const { bases, netWorth } = makeBases(crowd, a, income, age, married, r);
        const worries = [];
        for (const w of arr(crowd.worries)) {
          const h = (w.holders && (w.holders[a.id] || w.holders.default)) || [0, 0];
          const hit = r() < h[0];
          const I = h[1] * (0.6 + 0.8 * r());
          if (hit && I > 0) worries.push({ w, I });
        }
        const opinion = (a.mood || 0) + (T.opinionSpread || 10) * gauss(r);
        const sim = {
          arch: a, bases, netWorth, worries, opinion, married,
          resources: Math.max(T.minResources || 8000, income + (T.wealthYield || 0.04) * netWorth),
          u: { job: r(), coverage: r(), rent: r(), food: r(), hire: r() },
          seed: mix(seed, hashStr(a.id + ':' + k)), rank: {}, n: {},
          job: pickBy(a.job, Math.floor(r() * 1e6)) || 'my job',
          workplace: pickBy(a.workplace, Math.floor(r() * 1e6)) || 'work',
          baseMood: 0
        };
        const c = {
          id: 0, name, age, archetype: a.id, label, group: a.group, income,
          incomeBand: bandIncome(income), ageBand: bandAge(age), represents, look, about: ''
        };
        c.about = aboutText(a, c, sim);
        Object.defineProperty(c, '_sim', { value: sim, enumerable: false, writable: true, configurable: true });
        people.push(c);
      }
    });
    // Shuffle so groups mingle (deterministic), then assign stable ids.
    const sr = makeRng(mix(seed, 0xC0FFEE));
    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(sr() * (i + 1));
      const t = people[i]; people[i] = people[j]; people[j] = t;
    }
    people.forEach((c, i) => { c.id = i; });
    assignRanks(crowd, people);
    // Baseline opinion: react to the untouched budget once.
    const base = reactCore(data, crowd, people, defaultStateOf(data), baselineResultOf(data), true);
    people.forEach((c, i) => { c._sim.baseMood = base.moods[i]; });
    return people;
  }

  // Fixed per-citizen ranks within their archetype for each discrete pool.
  function assignRanks(crowd, people) {
    const byArch = {};
    for (const c of people) (byArch[c.archetype] || (byArch[c.archetype] = [])).push(c);
    const foodElig = (crowd.pools && crowd.pools.food && crowd.pools.food.eligible) || null;
    for (const id of Object.keys(byArch)) {
      const list = byArch[id];
      const a = list[0]._sim.arch;
      const rankBy = (members, pool, key) => {
        members.slice().sort((x, y) => x._sim.u[pool] - y._sim.u[pool]).forEach((c, i) => { c._sim.rank[key] = i; });
        for (const c of members) c._sim.n[key] = members.length;
      };
      // coverage: the lowest-ranked round(n * uninsured) figures are uninsured at baseline
      const sorted = list.slice().sort((x, y) => x._sim.u.coverage - y._sim.u.coverage);
      const nUn = Math.round(list.length * (a.uninsured || 0));
      const uninsured = sorted.slice(0, nUn), insured = sorted.slice(nUn);
      for (const c of uninsured) c._sim.uninsured = true;
      rankBy(insured, 'coverage', 'coverageLoss');
      rankBy(uninsured, 'coverage', 'coverageGain');
      const elig = list.filter((c) => !foodElig || (c._sim.bases[foodElig] || 0) > 0);
      const nonElig = list.filter((c) => foodElig && !((c._sim.bases[foodElig] || 0) > 0));
      rankBy(elig, 'food', 'foodLoss');
      rankBy(nonElig, 'food', 'foodGain');
      rankBy(list, 'rent', 'rentLoss');
      rankBy(list, 'rent', 'rentGain');
      for (const c of list) c._sim.rank.rentGain = list.length - 1 - c._sim.rank.rentGain;
      rankBy(list, 'job', 'jobLoss');
      rankBy(list, 'job', 'jobGain');
      for (const c of list) c._sim.rank.jobGain = list.length - 1 - c._sim.rank.jobGain;
      rankBy(list, 'hire', 'hire');
    }
  }

  function defaultStateOf(data) {
    const BM = getBudgetModel();
    if (BM && BM.defaultState) return BM.defaultState(data);
    const st = { spending: {}, levers: {} };
    for (const s of arr(data.spending)) st.spending[s.id] = 0;
    for (const l of arr(data.levers)) st.levers[l.id] = l.type === 'toggle' ? false : l.current;
    return st;
  }
  function baselineResultOf(data) {
    const bd = baselineDeficitOf(data);
    const metrics = {};
    for (const m of arr(data.metrics)) metrics[m.id] = { value: m.baseline, delta: 0, baseline: m.baseline, drivers: [] };
    return { deficit: bd, baselineDeficit: bd, jobs: 0, gdpPct: 0, metrics, leverYield: {} };
  }

  // ------------------------------------------------------------ per-call precompute
  function archPop(crowd) {
    const adults = crowd.adults || 262e6;
    const P = {};
    for (const a of arr(crowd.archetypes)) P[a.id] = a.share * adults;
    return P;
  }

  // Deal a national count across archetypes by relative risk x population.
  // A group can't lose more people than it has: hits beyond a group's eligible
  // population overflow to the other exposed groups in proportion to their risk.
  function deal(acc, count, risk, P, eligFrac, key) {
    if (!count || !risk) return;
    const ids = [], wp = {}, cap = {};
    for (const id of Object.keys(P)) {
      const w = id in risk ? risk[id] : (risk.default || 0);
      if (!w) continue;
      const e = (eligFrac ? eligFrac(id) : 1) * P[id];
      if (!(e > 0)) continue;
      ids.push(id); wp[id] = w * e; cap[id] = e;
    }
    const hits = {};
    let left = Math.abs(count), open = ids.slice();
    for (let pass = 0; pass < 6 && left > 1e-6 && open.length; pass++) {
      const Z = open.reduce((a, id) => a + wp[id], 0);
      const next = [];
      let spill = 0;
      for (const id of open) {
        const want = left * wp[id] / Z;
        const room = cap[id] - (hits[id] || 0);
        if (want >= room) { hits[id] = cap[id]; spill += want - room; }
        else { hits[id] = (hits[id] || 0) + want; next.push(id); }
      }
      left = spill; open = next;
    }
    const sign = count < 0 ? -1 : 1;
    for (const id of Object.keys(hits)) {
      const e = acc[id] || (acc[id] = { net: 0, by: {} });
      e.net += sign * hits[id];
      e.by[key] = (e.by[key] || 0) + sign * hits[id];
    }
  }
  // Webster (Sainte-Lague) apportionment of round(sum k) figures across groups with
  // expected counts k. House-monotone: as one slider grows a count, nobody already hit recovers.
  function apportion(items) {
    const seats = {};
    let total = 0;
    for (const it of items) { seats[it.id] = 0; total += it.k; }
    let H = Math.round(total);
    while (H-- > 0) {
      let best = null, bv = -1;
      for (const it of items) {
        if (seats[it.id] >= it.cap) continue;
        const v = it.k / (seats[it.id] + 0.5);
        if (v > bv) { bv = v; best = it; }
      }
      if (!best) break;
      seats[best.id]++;
    }
    return seats;
  }
  function dealShares(acc, count, share, key) {
    if (!count || !share) return;
    const tot = Object.values(share).reduce((a, x) => a + x, 0) || 1;
    for (const id of Object.keys(share)) {
      const hits = count * share[id] / tot;
      const e = acc[id] || (acc[id] = { net: 0, by: {} });
      e.net += hits;
      e.by[key] = (e.by[key] || 0) + hits;
    }
  }
  function dominantKey(e, sign) {
    let best = null, bv = 0;
    for (const k of Object.keys(e.by)) {
      const v = e.by[k] * sign;
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  }

  function eligibleShare(crowd, poolName, id, gain) {
    const a = arr(crowd.archetypes).find((x) => x.id === id);
    if (!a) return 1;
    const pool = crowd.pools[poolName];
    if (poolName === 'coverage') { const u = a.uninsured || 0; return gain ? u : 1 - u; }
    if (pool.eligible) {
      const s = a.bases && a.bases[pool.eligible];
      const p = Array.isArray(s) ? s[0] : (s && s.p !== undefined ? s.p : 0);
      return gain ? 1 - p : p;
    }
    return 1;
  }

  function computePools(data, crowd, result, mv, cache) {
    const P = cache.P;
    const pools = crowd.pools || {};
    const out = {};
    for (const name of ['coverage', 'rent', 'food']) {
      const pool = pools[name];
      if (!pool) continue;
      const acc = {};
      const m = result.metrics && result.metrics[pool.metric];
      for (const d of arr(m && m.drivers)) {
        const dr = pool.drivers && pool.drivers[d.id];
        if (!dr) continue;
        const losses = d.amount * pool.lossSign * (dr.adultShare !== undefined ? dr.adultShare : pool.adultShareDefault);
        const risk = dr.risk || (losses > 0 ? pool.lossRisk : pool.gainRisk);
        deal(acc, losses, risk, P, (id) => eligibleShare(crowd, name, id, losses < 0), d.id);
      }
      out[name] = acc;
    }
    // Jobs: direct sector counts + economy-wide.
    const jp = pools.jobs;
    if (jp) {
      const acc = {};
      let sectorNet = 0;
      for (const id of Object.keys(jp.drivers || {})) {
        const u = mv.units[id];
        if (!u) continue;
        const gained = u * jp.drivers[id].perUnit;
        sectorNet += gained;
        dealShares(acc, -gained, jp.drivers[id].share, id);
      }
      const macro = Number(result.jobs) || 0;
      if (macro) deal(acc, -macro, jp.macroRisk, P, null, 'jobs');
      const hires = Math.max(0, (macro + sectorNet) * (jp.hireShare || 0.5));
      out.jobs = acc;
      out.hires = hires;
      out.hireKey = (() => {
        let best = macro > 0 ? 'jobs' : null, bv = Math.max(0, macro);
        for (const id of Object.keys(jp.drivers || {})) {
          const g = (mv.units[id] || 0) * jp.drivers[id].perUnit;
          if (g > bv) { bv = g; best = id; }
        }
        return best;
      })();
    }
    return out;
  }

  // Worry driver signals (person-independent), per worry.
  function computeWorrySignals(data, crowd, result, mv) {
    const out = {};
    const F = crowd.fairness || {};
    const T = crowd.tuning || {};
    for (const w of arr(crowd.worries)) {
      const list = [];
      // Per-control drivers (any worry may have them, alongside its mode).
      if (w.mode !== 'deficit' && w.mode !== 'metric') {
        for (const id of Object.keys(w.drivers || {})) {
          const u = mv.units[id];
          if (!u) continue;
          const d = w.drivers[id];
          const c = mv.idx.byId[id];
          if (!c) continue;
          const dir = c.type === 'toggle' ? 'on' : (u > 0 ? 'up' : 'down');
          const texts = d[dir];
          if (!texts || !texts.length) continue;
          let s = d.coef * (d.dollars ? (mv.dollars[id] || 0) : u);
          if (s > 0) s *= (T.positiveDamp || 0.6);
          const shorts = d[dir === 'on' ? 'shortOn' : dir === 'up' ? 'shortUp' : 'shortDown'];
          list.push({ key: id, signal: s, texts, shorts, vars: varsFor(c, u, mv) });
        }
      }
      if (w.mode === 'dollars') {
        for (const c of mv.idx.list) {
          const amt = mv.dollars[c.id];
          if (!amt || Math.abs(amt) < 0.5) continue;
          const isRev = c.side === 'revenue';
          const coef = (w.overrides && c.id in w.overrides) ? w.overrides[c.id]
            : isRev ? w.allRevenue : (c.kind === 'spending' ? w.allSpending : w.allSpendingLevers);
          if (!coef) continue;
          let s = coef * amt;
          if (s > 0) s *= (T.positiveDamp || 0.6);
          let tk = isRev ? (amt > 0 ? 'taxUp' : 'taxDown') : (amt > 0 ? 'spendUp' : 'spendDown');
          const alt = w.textFor && w.textFor[c.id];
          if (alt && !isRev && amt < 0 && w.texts[alt]) tk = alt;
          const shortKey = tk in (w.shorts || {}) ? tk : (isRev ? (amt > 0 ? 'taxUp' : 'taxDown') : (amt > 0 ? 'spendUp' : 'spendDown'));
          list.push({ key: c.id, signal: s, texts: w.texts[tk], shorts: w.shorts && w.shorts[shortKey], vars: Object.assign(varsFor(c, mv.units[c.id], mv), { dollars: fmtB(amt) }) });
        }
      } else if (w.mode === 'fairness') {
        const sumOf = (ids, sign) => {
          let t = 0, best = null, bv = 0;
          for (const id of arr(ids)) {
            const c = mv.idx.byId[id];
            if (!c || !mv.dollars[id]) continue;
            // revenue levers: $ raised; spending: $ saved (cut) = -dollars
            const v = c.side === 'revenue' ? mv.dollars[id] : -mv.dollars[id];
            t += v;
            if (v * sign > bv) { bv = v * sign; best = c.name; }
          }
          return { t, best };
        };
        const low = sumOf(F.lowCuts, 1), broad = sumOf(F.broadTaxes, 1), top = sumOf(F.topTaxes, 1), topCut = sumOf(F.topTaxes, -1);
        const scale = F.scale || 100;
        if (w.direction === 'merit') {
          const M = (top.t - (F.meritBroadWeight || 0) * Math.max(0, broad.t)) / scale;
          if (Math.abs(M) > 1e-6) {
            let s = -(F.meritCoef || 6) * M;
            if (s > 0) s *= (T.positiveDamp || 0.6);
            const name = M > 0 ? top.best : (topCut.best || broad.best);
            const good = s >= 0 ? (top.t < 0 ? w.texts.good : (w.texts.goodBroad || w.texts.good)) : null;
            list.push({ key: 'fairness', signal: s, texts: s < 0 ? w.texts.bad : good, shorts: s < 0 ? w.shorts.bad : w.shorts.good, vars: { tax: name || 'Higher taxes at the top' } });
          }
        } else {
          const S = (low.t + (F.broadWeight || 0.5) * broad.t - top.t) / scale;
          if (Math.abs(S) > 1e-6) {
            let s = S > 0 ? -(F.coef || 6) * S : -(F.goodCoef || 4) * S;
            if (s > 0) s *= (T.positiveDamp || 0.6);
            let texts, vars;
            if (S > 0) {
              const lowDominates = low.t >= (F.broadWeight || 0.5) * broad.t;
              const topPays = top.t >= (F.topPaysMin || 25);
              texts = lowDominates ? (topPays && w.texts.badMixed ? w.texts.badMixed : w.texts.bad)
                : (topPays && w.texts.badTaxMixed ? w.texts.badTaxMixed : w.texts.badTax);
              vars = { cut: low.best || 'the safety net', tax: broad.best || 'Broad tax hikes' };
            } else {
              texts = w.texts.good;
              vars = { tax: top.best || 'Higher taxes at the top', cut: low.best || '' };
            }
            list.push({ key: 'fairness', signal: s, texts, shorts: S > 0 ? w.shorts.bad : w.shorts.good, vars });
          }
        }
      } else if (w.mode === 'deficit') {
        const bd = result.baselineDeficit || baselineDeficitOf(data);
        const def = result.deficit;
        const c = bd ? (bd - def) / bd : 0;
        const raw = clamp(w.base + w.slope * c, w.min, w.max);
        const kind = c < -0.02 ? 'worse' : c <= 0.02 ? 'standing' : c < 0.97 ? 'better' : 'balanced';
        list.push({ key: w.key || 'deficit', signal: raw, stat: true, texts: w.texts[kind], shorts: w.shorts[kind],
          vars: { deficit: def <= 0 ? 'zero' : fmtB(def), saved: fmtB(bd - def), added: fmtB(def - bd) } });
      } else if (w.mode === 'metric') {
        const m = result.metrics && result.metrics[w.metric];
        let delta = 0, best = null, bv = 0;
        for (const d of arr(m && m.drivers)) {
          if (arr(w.excludeDrivers).indexOf(d.id) >= 0) continue;
          delta += d.amount;
          if (Math.abs(d.amount) > bv) { bv = Math.abs(d.amount); best = d.name; }
        }
        const raw = clamp(w.base + w.slope * delta, w.min, w.max);
        const kind = Math.abs(delta) < 0.5 ? 'standing' : delta > 0 ? 'better' : 'worse';
        const metricDef = arr(data.metrics).find((x) => x.id === w.metric);
        list.push({ key: w.key || w.metric, signal: raw, stat: true, texts: w.texts[kind], shorts: w.shorts[kind],
          vars: { n: Math.round(Math.abs(delta)), topic: best || 'This plan', year: metricDef ? Math.round(metricDef.baseline) : '' } });
      }
      list.sort((x, y) => Math.abs(y.signal) - Math.abs(x.signal));
      list.nKept = Math.min(list.length, T.maxWorryDrivers || 4);
      list.absAll = 0; list.absKept = 0;
      list.forEach((s, j) => { list.absAll += Math.abs(s.signal); if (j < list.nKept) list.absKept += Math.abs(s.signal); });
      out[w.id] = list;
    }
    return out;
  }

  function varsFor(c, u, mv) {
    const v = mv.values[c.id];
    let val = v;
    if (typeof v === 'number') val = Math.abs(v) >= 1000 ? commas(v) : String(Math.round(v * 10) / 10);
    return { pct: fmtPct(u || 0), val, topic: c.name, dollars: fmtB(mv.dollars[c.id] || 0) };
  }

  // ------------------------------------------------------------ mood arithmetic
  function moneyImpact(T, dollars, resources) {
    const pct = 100 * Math.abs(dollars) / resources;
    if (dollars < 0) return -((T.lossLinear || 3.5) * pct + (T.lossQuad || 0.3) * pct * pct);
    return (T.gainLinear || 2) * pct / (1 + pct / (T.gainSoft || 15));
  }
  function futureWeight(T, age) {
    for (const [below, w] of arr(T.futureWeight)) if (age < below) return w;
    return 0;
  }
  function combine(T, reasons, opinion) {
    const big = T.bigReason || 20, p = T.pileExponent || 1.5;
    let N = 0, smallN = 0, P = 0;
    for (const r of reasons) {
      const x = r.impact;
      if (x < 0) { if (-x >= big) N += -x; else smallN += Math.pow(-x, p); }
      else if (x > 0) P += Math.pow(x, p);
    }
    N += Math.pow(smallN, 1 / p);
    P = Math.pow(P, 1 / p);
    return clamp(opinion + P - N, -100, 100);
  }
  function levelOf(crowd, mood) {
    const th = crowd.levelThresholds || [35, 12, -10, -28, -50];
    for (let i = 0; i < th.length; i++) if (mood >= th[i]) return i;
    return th.length;
  }

  const FAMILY = {
    benefit: {
      loss: ["My {what} is {amt} smaller.", "{Amt} less from my {what}. That's real money for us.", "They're cutting my {what} by {amt}.", "Losing {amt} from my {what}. Something has to give."],
      lossBig: ["Losing {amt} from my {what} is {share} of what we live on. We can't absorb that.", "{Amt} less from my {what}: {share} of our income. Something big has to go."],
      gain: ["My {what} goes up {amt}.", "{Amt} more from my {what}. That helps.", "An extra {amt} in my {what}: that covers a few bills."]
    },
    tax: {
      loss: ["My {what} goes up {amt}.", "That's {amt} more in {what} for us.", "{Amt} more to Washington in {what}.", "We'd pay {amt} more in {what}. That's a car payment."],
      lossBig: ["{Amt} more in {what}. That's {share} of our income.", "{Amt} more in {what} is {share} of everything we make. Brutal."],
      gain: ["My {what} drops {amt}.", "We'd keep {amt} more: lower {what}.", "{Amt} less in {what}. Nice."]
    },
    price: {
      loss: ["{What} would cost us about {amt} more.", "We'd pay {amt} more for {what}.", "That's about {amt} more for {what}. It adds up."],
      lossBig: ["{What} would cost us {amt} more: {share} of our income.", "Paying {amt} more for {what}. On our budget that's {share}."],
      gain: ["{What} gets cheaper: we'd save {amt}.", "Saving about {amt} on {what}."]
    },
    future: {
      loss: ["When I retire, my {what} will be {amt} smaller.", "That's {amt} less when I retire. I'll have to work longer.", "I'm {age}. My {what} just shrank by {amt}.", "{Amt} less in retirement. My knees won't last to 70."],
      lossBig: ["When I retire, my {what} will be {amt} smaller.", "That's {amt} less when I retire. I'll have to work longer."],
      gain: ["My {what} grows by {amt}.", "{Amt} more when I retire. That changes my plans."]
    },
    cost: {
      loss: ["{What}: about {amt} more for us.", "We'd pay {amt} more in {what}.", "{Amt} more for {what}. That stings."],
      lossBig: ["{Amt} more in {what}: {share} of what we have. I don't know how we'd do it."],
      gain: ["We'd save {amt} on {what}.", "{Amt} less in {what}. That's breathing room.", "Saving {amt} on {what}: real help."]
    }
  };
  const FAMILY_SHORT = {
    benefit: { loss: "{ws} -{a}", gain: "{ws} +{a}" },
    tax: { loss: "{ws} +{a}", gain: "{ws} -{a}" },
    price: { loss: "{ws} +{a}", gain: "{ws} -{a}" },
    cost: { loss: "{ws} +{a}", gain: "{ws} -{a}" }
  };

  // ------------------------------------------------------------ core reaction
  function reactCore(data, crowd, citizens, state, result, baselineOnly) {
    const T = crowd.tuning || {};
    const mv = movesOf(data, state, result || {});
    const cache = { P: archPop(crowd) };
    const pools = computePools(data, crowd, result || {}, mv, cache);
    const signals = computeWorrySignals(data, crowd, result || {}, mv);
    const activeMoney = arr(crowd.money).filter((m) => mv.units[m.control]);
    const ageRules = arr(crowd.ageRules).filter((m) => mv.units[m.control]);
    const minImpact = T.minImpact || 0.3;
    const statTopics = crowd.statTopics || {};
    const topicOf = (key) => (mv.idx.byId[key] ? mv.idx.byId[key].name : (statTopics[key] || key));
    const causes = crowd.causes || {};
    // How the cause of a discrete outcome reads mid-sentence.
    const causeOf = (key, loss) => {
      const c = mv.idx.byId[key];
      if (c) {
        const u = mv.units[key] || 0;
        const tpl = c.kind === 'spending' ? (u < 0 ? causes.spendingCut : causes.spendingRaise) : (c.type === 'toggle' ? causes.leverOn : causes.leverMove);
        return fill(tpl || 'the change to {name}', { name: c.name });
      }
      const st = causes[key];
      if (st && typeof st === 'object') return loss ? st.loss : st.gain;
      return typeof st === 'string' ? st : 'the budget changes';
    };
    const keyHash = new Map();
    const kh = (k) => { let h = keyHash.get(k); if (h === undefined) { h = hashStr(k); keyHash.set(k, h); } return h; };
    const eligCache = new Map();
    const elig = (name, id, gain) => {
      const k = name + id + (gain ? 1 : 0);
      let v = eligCache.get(k);
      if (v === undefined) { v = eligibleShare(crowd, name, id, gain); eligCache.set(k, v); }
      return v;
    };
    const moods = new Array(citizens.length);
    const outs = baselineOnly ? null : new Array(citizens.length);
    const pp = crowd.pools || {};

    let curSim = null, curReasons = null, curStatus = null;
    // memo: optional per-call cache for texts that do not depend on the citizen
    const push = (kind, impact, key, textList, shortList, vars, memo) => {
      if (!(Math.abs(impact) >= minImpact)) return;
      const h = mix(curSim.seed, kh(key) + kind.length);
      const ti = textList && textList.length ? h % textList.length : -1;
      const si = shortList && shortList.length ? (h >>> 3) % shortList.length : -1;
      let text, short;
      if (memo) {
        const mk = ti * 64 + si;
        const hit = memo.get(mk);
        if (hit) { text = hit[0]; short = hit[1]; }
        else {
          text = ti >= 0 ? fill(textList[ti], vars) : '';
          short = trimShort(si >= 0 ? fill(shortList[si], vars) : topicOf(key));
          memo.set(mk, [text, short]);
        }
      } else {
        text = ti >= 0 ? fill(textList[ti], vars) : '';
        short = trimShort(si >= 0 ? fill(shortList[si], vars) : topicOf(key));
      }
      curReasons.push({ kind, impact: Math.round(impact * 10) / 10, text, short, key, topic: topicOf(key) });
    };

    // ---- discrete pools
    // Expected figures per group (k = share hit x figures in the crowd) are apportioned
    // across the whole crowd so small groups still get their share and the total matches
    // the national number; within a group the lowest-ranked figures are hit first.
    const RANKS = { coverage: ['coverageLoss', 'coverageGain'], rent: ['rentLoss', 'rentGain'], food: ['foodLoss', 'foodGain'], jobs: ['jobLoss', 'jobGain'] };
    const nBy = {};
    for (const cz of citizens) {
      const s = cz._sim;
      if (!s) continue;
      for (const rk of Object.keys(s.n)) (nBy[rk] || (nBy[rk] = {}))[s.arch.id] = s.n[rk];
    }
    const poolInfo = {};
    const buildPool = (name) => {
      const acc = pools[name] || {};
      const m = {}, lossItems = [], gainItems = [];
      for (const aid of Object.keys(acc)) {
        const e = acc[aid];
        if (Math.abs(e.net) < 1e-9) continue;
        const loss = e.net > 0;
        const P = cache.P[aid] * elig(name, aid, !loss);
        if (!(P > 0)) continue;
        const f = Math.min(1, Math.abs(e.net) / P);
        const n = (nBy[RANKS[name][loss ? 0 : 1]] || {})[aid] || 0;
        const spread = (!loss && name === 'jobs') ? 3 : 1;   // hiring and overtime spread wider than layoffs
        const k = Math.min(n, f * n * spread);
        const key = dominantKey(e, loss ? 1 : -1) || name;
        m[aid] = { loss, f, k, key, topic: topicOf(key), cause: causeOf(key, loss), seats: 0 };
        (loss ? lossItems : gainItems).push({ id: aid, k, cap: n });
      }
      const s1 = apportion(lossItems), s2 = apportion(gainItems);
      for (const id of Object.keys(s1)) m[id].seats = s1[id];
      for (const id of Object.keys(s2)) m[id].seats = s2[id];
      return m;
    };
    const infoFor = (name, aid) => {
      const m = poolInfo[name] || (poolInfo[name] = buildPool(name));
      return m[aid] || null;
    };
    const dealPool = (sim, name, poolDef, lossRankKey, gainRankKey) => {
      const info = infoFor(name, sim.arch.id);
      if (!info) return;
      const loss = info.loss, f = info.f, key = info.key;
      const r = sim.rank[loss ? lossRankKey : gainRankKey];
      if (r === undefined) return;
      const vars = { topic: info.topic, cause: info.cause, Cause: cap1(info.cause), job: sim.job, workplace: sim.workplace, Workplace: sim.workplaceCap || (sim.workplaceCap = cap1(sim.workplace)) };
      const own = name === 'jobs' && sim.arch.jobTexts;
      const kind = name === 'jobs' ? 'job' : 'service';
      if (loss) {
        if (r < info.seats) {
          push(kind, T[poolDef.lossKey], key, (own && own.loss) || poolDef.texts.loss, (own && own.shortLoss) || poolDef.shorts.loss, vars);
          if (poolDef.status) curStatus.push(poolDef.status);
          return;
        }
        // Fear: the next in line feels the fraction of a figure; everyone exposed feels the share hit.
        let fear = r === info.seats ? clamp(info.k - info.seats, 0, 1) * 0.8 : 0;
        fear = Math.max(fear, Math.min(1, f / 0.3));
        if (fear * Math.abs(T[poolDef.fearKey] || 0) >= 1)
          push(kind, T[poolDef.fearKey] * fear, key, (own && own.fear) || poolDef.texts.fear, (own && own.shortFear) || poolDef.shorts.fear, vars);
      } else if (r < info.seats) {
        push(kind, T[poolDef.gainKey], key, (own && own.gain) || poolDef.texts.gain, (own && own.shortGain) || poolDef.shorts.gain, vars);
      }
    };
    for (let ci = 0; ci < citizens.length; ci++) {
      const c = citizens[ci];
      const sim = c._sim;
      if (!sim) throw new Error('CrowdModel.react: citizens must come from CrowdModel.buildPopulation');
      const a = sim.arch;
      const reasons = [];
      const status = [];
      curSim = sim; curReasons = reasons; curStatus = status;
      // ---- money
      if (activeMoney.length) {
        const items = [];
        let lossSum = 0, lossImpactSum = 0;
        for (const m of activeMoney) {
          const base = sim.bases[m.base];
          if (!base) continue;
          let d = mv.units[m.control] * m.per * base;
          if (!d) continue;
          let w = 1;
          if (m.future) { w = futureWeight(T, c.age); if (!w) continue; }
          const imp = moneyImpact(T, d * w, sim.resources);
          items.push({ m, d, w, imp });
          if (d < 0) { lossSum += -d * w; lossImpactSum += imp; }
        }
        // Convexity on the total: many losses together hurt more than each alone.
        const totalLossImpact = lossSum ? moneyImpact(T, -lossSum, sim.resources) : 0;
        const scale = lossImpactSum ? totalLossImpact / lossImpactSum : 1;
        for (const it of items) {
          const impact = it.d < 0 ? it.imp * scale : it.imp;
          const fam = it.m.future ? FAMILY.future : (FAMILY[it.m.family] || FAMILY.tax);
          const monthly = it.m.monthly && Math.abs(it.d) / 12 >= 10;
          const amt = monthly ? fmtDollars(it.d / 12) + ' a month' : fmtDollars(it.d) + ' a year';
          const sharePct = 100 * Math.abs(it.d) / Math.max(1, c.income);
          const what = (it.m.whatBy && it.m.whatBy[a.id]) || it.m.what;
          const vars = { what, What: cap1(what), amt, Amt: cap1(amt), share: Math.round(sharePct) + '%', age: c.age,
            ws: it.m.ws || 'Money', a: fmtShortDollars(monthly ? it.d / 12 : it.d) + (monthly ? '/mo' : '/yr') };
          let list;
          if (it.m.texts && it.m.texts[it.d < 0 ? 'loss' : 'gain']) list = it.m.texts[it.d < 0 ? 'loss' : 'gain'];
          else list = it.d < 0 ? (sharePct >= (T.bigLossPct || 8) ? fam.lossBig : fam.loss) : fam.gain;
          const fs = FAMILY_SHORT[it.m.family] || FAMILY_SHORT.tax;
          push('money', impact, it.m.control, list, [it.d < 0 ? fs.loss : fs.gain], vars);
        }
      }

      if (pp.coverage) dealPool(sim, 'coverage', pp.coverage, 'coverageLoss', 'coverageGain');
      if (pp.rent) dealPool(sim, 'rent', pp.rent, 'rentLoss', 'rentGain');
      if (pp.food) dealPool(sim, 'food', pp.food, 'foodLoss', 'foodGain');
      if (pp.jobs) {
        dealPool(sim, 'jobs', pp.jobs, 'jobLoss', 'jobGain');
        if (a.id === pp.jobs.hireArchetype && pools.hires > 0) {
          const f = Math.min(0.9, pools.hires / cache.P[a.id]);
          const k = f * (sim.n.hire || 0);
          if (sim.rank.hire + 1 <= k + 1e-9) {
            const key = pools.hireKey || 'jobs';
            push('job', T[pp.jobs.hireKey], key, pp.jobs.texts.hire, pp.jobs.shorts.hire, { topic: topicOf(key) });
          }
        }
      }

      // ---- age-window rules (e.g. Medicare eligibility age)
      for (const ar of ageRules) {
        const cdef = mv.idx.byId[ar.control];
        if (!cdef || cdef.type !== 'slider') continue;
        const cur = cdef.def.current, val = mv.values[ar.control];
        const vars = { age: c.age, val: Math.round(val) };
        if (val > cur && c.age >= Math.max(ar.minAge || 0, cur - 2) && c.age < val) push('service', ar.loseImpact, ar.control, ar.texts.loss, ar.shorts.loss, vars);
        else if (val < cur && c.age >= Math.max(ar.minAge || 0, val) && c.age < cur) push('service', ar.gainImpact, ar.control, ar.texts.gain, ar.shorts.gain, vars);
      }

      // ---- worries
      for (const { w, I } of sim.worries) {
        const list = signals[w.id];
        if (!list || !list.length) continue;
        if (list.length === 1 && list[0].stat) {
          const s = list[0];
          push('worry', s.signal * I, s.key, s.texts, s.shorts, s.vars, s.memo || (s.memo = new Map()));
          continue;
        }
        // A worry voices at most its few biggest drivers; the rest still count toward its strength.
        const absSum = list.absAll * I;
        if (!absSum) continue;
        const capI = (w.cap || 25) * I;
        const k = capI * Math.tanh(absSum / capI) / absSum * (list.absAll / list.absKept);
        const nk = list.nKept;
        for (let j = 0; j < nk; j++) {
          const s = list[j];
          push('worry', s.signal * I * k, s.key, s.texts, s.shorts, s.vars, s.memo || (s.memo = new Map()));
        }
      }

      const mood = combine(T, reasons, sim.opinion);
      moods[ci] = mood;
      if (!baselineOnly) {
        reasons.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact));
        const top = reasons.find((r) => Math.abs(r.impact) >= 1);
        outs[ci] = {
          id: c.id,
          mood: Math.round(mood * 10) / 10,
          moodDelta: Math.round((mood - sim.baseMood) * 10) / 10,
          level: levelOf(crowd, mood),
          status,
          reasons,
          bubble: top ? top.text : (pickBy(a.idle, mix(sim.seed, 77)) || '')
        };
      }
    }
    return { moods, outs };
  }

  // ------------------------------------------------------------ public: react
  function react(data, crowd, citizens, state, result) {
    const T = crowd.tuning || {};
    const st = (result && result.state) || state || defaultStateOf(data);
    const core = reactCore(data, crowd, citizens, st, result || baselineResultOf(data), false);
    const outs = core.outs;
    const nLevels = (crowd.levelThresholds || [0, 0, 0, 0, 0]).length + 1;
    const levels = new Array(nLevels).fill(0);
    let sumMood = 0, sumDelta = 0, sumDelta2 = 0, vote = 0, hardship = 0;
    const griev = {}, cheer = {}, byGroup = {};
    for (let i = 0; i < outs.length; i++) {
      const o = outs[i], c = citizens[i];
      levels[o.level]++;
      sumMood += o.mood;
      sumDelta += o.moodDelta;
      sumDelta2 += o.moodDelta * o.moodDelta;
      vote += 1 / (1 + Math.exp(-(o.mood - (T.voteMid !== undefined ? T.voteMid : -12)) / (T.voteScale || 10)));
      const pain = Math.max(0, -o.moodDelta);
      hardship += pain + pain * pain / (T.hardshipK || 50);
      for (const r of o.reasons) {
        const bucket = r.impact < 0 ? griev : cheer;
        let g = bucket[r.key];
        if (!g) g = bucket[r.key] = { key: r.key, topic: r.topic, text: r.text, best: 0, figures: 0, people: 0, impact: 0, last: -1 };
        g.impact += r.impact;
        if (Math.abs(r.impact) > g.best) { g.best = Math.abs(r.impact); g.text = r.text; }
        if (g.last !== i) { g.last = i; g.figures++; g.people += c.represents; }
      }
      const bg = byGroup[c.group] || (byGroup[c.group] = { figures: 0, meanMood: 0, meanDelta: 0 });
      bg.figures++; bg.meanMood += o.mood; bg.meanDelta += o.moodDelta;
    }
    const n = outs.length || 1;
    for (const g of Object.values(byGroup)) {
      g.meanMood = Math.round(g.meanMood / g.figures * 10) / 10;
      g.meanDelta = Math.round(g.meanDelta / g.figures * 10) / 10;
    }
    const meanDelta = sumDelta / n;
    const sd = Math.sqrt(Math.max(0, sumDelta2 / n - meanDelta * meanDelta));
    const rank = (bucket) => Object.values(bucket)
      .sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact))
      .slice(0, 10)
      .map((g) => ({ key: g.key, topic: g.topic, text: g.text, figures: g.figures, people: g.people, impact: Math.round(g.impact * 10) / 10 }));
    return {
      citizens: outs,
      summary: {
        levels,
        meanMood: Math.round(sumMood / n * 10) / 10,
        meanDelta: Math.round(meanDelta * 10) / 10,
        lenses: {
          electability: Math.round(1000 * vote / n) / 10,
          fairness: Math.round(1000 * Math.exp(-sd / (T.fairnessK || 15))) / 10,
          hardship: Math.round(10 * hardship / n) / 10
        },
        grievances: rank(griev),
        cheers: rank(cheer),
        byGroup,
        levelNames: (crowd.levelNames || ["Cheering", "Happy", "Content", "Uneasy", "Angry", "Furious"]).slice()
      }
    };
  }

  // ------------------------------------------------------------ validate
  function validate(data, crowd, opts) {
    opts = opts || {};
    const errs = [];
    if (!data || !crowd) return ['missing BUDGET_DATA or CROWD_DATA'];
    const idx = controlIndex(data);
    const archs = arr(crowd.archetypes);
    const archIds = new Set();
    let share = 0;
    for (const a of archs) {
      if (!a.id) { errs.push('archetype without id'); continue; }
      if (archIds.has(a.id)) errs.push(`duplicate archetype id ${a.id}`);
      archIds.add(a.id);
      if (!(a.share > 0)) errs.push(`archetype ${a.id}: share must be > 0`);
      share += a.share || 0;
      if (!a.group) errs.push(`archetype ${a.id}: missing group`);
      if (!Array.isArray(a.age) || a.age[0] > a.age[1]) errs.push(`archetype ${a.id}: bad age range`);
      if (!Array.isArray(a.income) || !(a.income[0] > 0) || a.income[0] > a.income[1]) errs.push(`archetype ${a.id}: bad income range`);
      if (!arr(a.labels).length) errs.push(`archetype ${a.id}: no labels`);
      if (!arr(a.idle).length) errs.push(`archetype ${a.id}: no idle chatter`);
      for (const k of ['outfit', 'hat', 'prop']) for (const v of arr(a.look && a.look[k])) if (VOCAB[k].indexOf(v) < 0) errs.push(`archetype ${a.id}: unknown look.${k} "${v}"`);
    }
    if (Math.abs(share - 1) > 1e-6) errs.push(`archetype shares sum to ${share.toFixed(4)}, not 1`);
    const baseKeys = new Set(DERIVED_BASES);
    for (const a of archs) for (const k of Object.keys(a.bases || {})) baseKeys.add(k);
    const known = (id) => !!idx.byId[id];
    const covered = new Set();
    for (const m of arr(crowd.money)) {
      if (!known(m.control)) errs.push(`money rule: unknown control "${m.control}"`); else covered.add(m.control);
      if (!baseKeys.has(m.base)) errs.push(`money rule ${m.control}: unknown base "${m.base}"`);
      if (!FAMILY[m.family]) errs.push(`money rule ${m.control}: unknown family "${m.family}"`);
      for (const id of Object.keys(m.whatBy || {})) if (!archIds.has(id)) errs.push(`money rule ${m.control}: unknown archetype "${id}"`);
    }
    const pools = crowd.pools || {};
    for (const name of Object.keys(pools)) {
      const p = pools[name];
      if (p.metric && !arr(data.metrics).some((m) => m.id === p.metric)) errs.push(`pool ${name}: unknown metric "${p.metric}"`);
      for (const id of Object.keys(p.drivers || {})) {
        if (!known(id)) { errs.push(`pool ${name}: unknown control "${id}"`); continue; }
        covered.add(id);
        const d = p.drivers[id];
        for (const m of [d.risk, d.share]) for (const aid of Object.keys(m || {})) if (aid !== 'default' && !archIds.has(aid)) errs.push(`pool ${name}.${id}: unknown archetype "${aid}"`);
      }
      for (const m of [p.lossRisk, p.gainRisk, p.macroRisk]) for (const aid of Object.keys(m || {})) if (aid !== 'default' && !archIds.has(aid)) errs.push(`pool ${name}: unknown archetype "${aid}"`);
      if (p.hireArchetype && !archIds.has(p.hireArchetype)) errs.push(`pool ${name}: unknown hire archetype "${p.hireArchetype}"`);
    }
    for (const r of arr(crowd.ageRules)) { if (!known(r.control)) errs.push(`age rule: unknown control "${r.control}"`); else covered.add(r.control); }
    for (const w of arr(crowd.worries)) {
      for (const aid of Object.keys(w.holders || {})) if (aid !== 'default' && !archIds.has(aid)) errs.push(`worry ${w.id}: unknown archetype "${aid}"`);
      for (const id of Object.keys(w.drivers || {})) { if (!known(id)) errs.push(`worry ${w.id}: unknown control "${id}"`); else covered.add(id); }
      for (const id of Object.keys(w.overrides || {})) if (!known(id)) errs.push(`worry ${w.id}: unknown control "${id}"`);
      if (w.mode === 'metric' && !arr(data.metrics).some((m) => m.id === w.metric)) errs.push(`worry ${w.id}: unknown metric "${w.metric}"`);
    }
    const F = crowd.fairness || {};
    for (const list of ['lowCuts', 'broadTaxes', 'topTaxes']) for (const id of arr(F[list])) if (!known(id)) errs.push(`fairness.${list}: unknown control "${id}"`);
    for (const c of idx.list) if (!covered.has(c.id)) errs.push(`no crowd rule mentions ${c.kind} "${c.id}": nobody in the crowd would notice it`);
    if (errs.length || opts.static) return errs;

    // Dynamic: every control, moved alone to each extreme, must give someone a reason
    // keyed to it, and across its extremes must make some people happier and some unhappier.
    const BM = getBudgetModel();
    if (!BM) return errs.concat(['BudgetModel not available: cannot run the coverage check']);
    let people;
    try { people = buildPopulation(data, crowd, { seed: opts.seed || 1, size: opts.size || crowd.defaultSize || 260 }); }
    catch (e) { return errs.concat([`buildPopulation failed: ${e.message}`]); }
    for (const c of idx.list) {
      const extremes = c.type === 'toggle' ? [true] : [c.def.min, c.def.max].filter((v) => v !== (c.kind === 'spending' ? 0 : c.def.current));
      let keyed = false, anyNeg = false, anyPos = false;
      for (const v of extremes) {
        const st = BM.defaultState(data);
        if (c.kind === 'spending') st.spending[c.id] = v; else st.levers[c.id] = v;
        const res = BM.compute(data, st);
        const out = react(data, crowd, people, st, res);
        for (const o of out.citizens) {
          if (o.moodDelta < -0.5) anyNeg = true;
          if (o.moodDelta > 0.5) anyPos = true;
          if (!keyed && o.reasons.some((r) => r.key === c.id && Math.abs(r.impact) >= 0.5)) keyed = true;
        }
      }
      if (!keyed) errs.push(`${c.kind} "${c.id}": no citizen has a reason caused by it at its extremes`);
      if (!anyNeg) errs.push(`${c.kind} "${c.id}": nobody dislikes any move of it`);
      if (!anyPos) errs.push(`${c.kind} "${c.id}": nobody likes any move of it`);
    }
    return errs;
  }

  const CrowdModel = { validate, buildPopulation, react, vocab: VOCAB, SHORT_MAX, _internal: { figureCounts, moneyImpact, combine, movesOf, hashStr, makeRng } };
  if (typeof module !== 'undefined' && module.exports) module.exports = CrowdModel;
  else root.CrowdModel = CrowdModel;
})(typeof window !== 'undefined' ? window : globalThis);
