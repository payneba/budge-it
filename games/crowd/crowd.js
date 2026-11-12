// The Crowd: renders CrowdModel's citizens as a crowd on the National Mall, builds
// the budget controls from BUDGET_DATA and wires the reaction loop. Everything
// content-specific comes from BUDGET_DATA / CROWD_DATA; this file only draws.
(function () {
  'use strict';

  const D = window.BUDGET_DATA;
  const M = window.BudgetModel;
  const C = window.CROWD_DATA;
  const CM = window.CrowdModel;

  const STORE = {
    state: 'crowd.state.v1', seed: 'crowd.seed', intro: 'crowd.introSeen', arrange: 'crowd.arrange'
  };
  const SEED_TAG = 'crowdseed';
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const reduceMQ = mq('(prefers-reduced-motion: reduce)');
  const darkMQ = mq('(prefers-color-scheme: dark)');
  const phoneMQ = mq('(max-width: 899px)');
  let reduceMotion = reduceMQ.matches;

  // ------------------------------------------------------------ DOM helpers

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return n;
  }
  const $ = (id) => document.getElementById(id);
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function showErrors(title, list) {
    const panel = $('errorPanel');
    panel.hidden = false;
    fill(panel,
      el('h1', {}, title),
      el('p', {}, 'The Crowd can\'t start until these are fixed:'),
      el('ul', {}, list.map((e) => el('li', {}, String(e)))),
      el('p', {}, el('a', { href: '../../index.html' }, 'Back to all games')));
  }

  // ------------------------------------------------------------ boot checks

  const missing = [];
  if (!D) missing.push('shared/data.js did not load or did not define BUDGET_DATA.');
  if (!M) missing.push('shared/model.js did not load or did not define BudgetModel.');
  if (!C) missing.push('people.js did not load or did not define CROWD_DATA.');
  if (!CM) missing.push('crowd-model.js did not load or did not define CrowdModel.');
  if (missing.length) { showErrors('Some of the game files are missing', missing); return; }
  let problems = [];
  try {
    problems = problems.concat(M.validateData(D) || []);
    if (typeof CM.validate === 'function') problems = problems.concat(CM.validate(D, C, { static: true }) || []);
  } catch (e) { problems.push('Validation crashed: ' + e.message); }
  if (problems.length) { showErrors('The crowd data has problems', problems); return; }

  const F = M.format;
  const HH = D.meta.households;
  const LEVEL_NAMES_FALLBACK = ['Cheering', 'Happy', 'Content', 'Uneasy', 'Angry', 'Furious'];
  const LEVEL_GLYPH = ['🎈', '🙂', '😐', '😟', '🪧', '🔥'];
  const LEVEL_POSE = [
    'Jumping, arms up, holding a balloon',
    'Smiling, waving, picnicking',
    'Neutral face, strolling',
    'Frowning, arms crossed, pacing',
    'Angry brows, waving a protest sign',
    'Shouting, shaking a torch or pitchfork'
  ];
  const GROUP_NAMES = { mandatory: 'Mandatory programs', defense: 'Defense', nondefense: 'Everything else', interest: 'Interest' };
  const GROUP_ORDER = ['mandatory', 'defense', 'nondefense', 'interest'];
  const KIND_ICON = { money: '💵', service: '🤝', job: '🔧', worry: '💭' };
  const KIND_NAME = { money: 'Money', service: 'A service they rely on', job: 'Their job', worry: 'A worry' };
  const STATUS_TEXT = { lost_job: 'Lost their job', lost_coverage: 'Lost health coverage', lost_rent_help: 'Lost rent help', lost_food_aid: 'Lost food aid' };
  const BAND_LABELS = {
    incomeBand: { low: 'Lower income', middle: 'Middle income', upper: 'Upper income', top: 'Top earners' },
    ageBand: { '18-29': 'Age 18-29', '30-49': 'Age 30-49', '50-64': 'Age 50-64', '65+': 'Age 65+' }
  };
  const BAND_ORDER = { incomeBand: ['low', 'middle', 'upper', 'top'], ageBand: ['18-29', '30-49', '50-64', '65+'] };
  const LENS_INFO = {
    electability: { name: 'Electability', help: 'Share of the crowd who would still vote for you. Each person’s chance levels off, so once someone is furious, more pain to them costs you little.' },
    fairness: { name: 'Shared sacrifice', help: 'How evenly the change in mood is spread across the crowd. 100 means everyone moved alike, up or down, however big the move.' },
    hardship: { name: 'Hardship', help: 'Average pain compared with today’s budget, with big losses counting far more than small ones. 0 means nobody is worse off; there is no upper limit. Lower is better.' }
  };
  const ARRANGE = [
    { id: 'mall', name: 'Mall' },
    { id: 'mood', name: 'By mood' },
    { id: 'group', name: 'By who they are' },
    { id: 'age', name: 'By age' },
    { id: 'income', name: 'By income' },
    { id: 'gripe', name: 'By top gripe' }
  ];

  const byId = {};
  for (const x of D.spending) byId[x.id] = Object.assign({ _kind: 'spending' }, x);
  for (const x of D.revenue) byId[x.id] = Object.assign({ _kind: 'revenue' }, x);
  const leverById = {};
  for (const l of D.levers) leverById[l.id] = l;
  const leversOf = (pid) => D.levers.filter((l) => l.parent === pid);
  const DEFAULTS = M.defaultState(D);
  const decimalsOf = (step) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const fmtLever = (l, v) => {
    const n = Number(v).toLocaleString('en-US', { minimumFractionDigits: decimalsOf(l.step), maximumFractionDigits: decimalsOf(l.step) });
    const u = l.unit || '';
    return u === '$' ? '$' + n : n + u;
  };
  const fmtPct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';

  // ------------------------------------------------------------ state

  const params = new URLSearchParams(location.search);
  const SIZE = clamp(Math.round(Number(params.get('size')) || 260), 20, 800);

  function splitHash(h) {
    const parts = String(h || '').replace(/^#/, '').split(',');
    let seed = null;
    const rest = [];
    for (const p of parts) {
      if (p.indexOf(SEED_TAG + ':') === 0) { const n = parseInt(p.slice(SEED_TAG.length + 1), 10); if (n > 0) seed = n; }
      else if (p) rest.push(p);
    }
    return { code: rest.join(','), seed };
  }

  let state = M.defaultState(D);
  let seed = parseInt(store.get(STORE.seed), 10) || 1;
  if (location.hash.length > 1) {
    const h = splitHash(location.hash);
    state = M.decodeState(D, h.code);
    if (h.seed) seed = h.seed;
  } else {
    const saved = store.get(STORE.state);
    if (saved !== null) state = M.decodeState(D, saved);
  }
  let arrange = store.get(STORE.arrange);
  if (!ARRANGE.some((a) => a.id === arrange)) arrange = 'mall';

  let population = [];
  let result = null;
  let reaction = null;
  let baseReaction = null;
  let wasBalanced = false;
  let figures = [];
  let levelNames = LEVEL_NAMES_FALLBACK;

  function lensValue(v) {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.score === 'number') return v.score;
    if (v && typeof v === 'object' && typeof v.pct === 'number') return v.pct;
    return NaN;
  }

  function runReact() {
    result = M.compute(D, state);
    reaction = CM.react(D, C, population, state, result);
    const ln = reaction.summary && reaction.summary.levelNames;
    levelNames = Array.isArray(ln) && ln.length === 6 ? ln : LEVEL_NAMES_FALLBACK;
  }

  function buildCrowd() {
    population = CM.buildPopulation(D, C, { seed, size: SIZE });
    baseReaction = CM.react(D, C, population, M.defaultState(D), M.compute(D, M.defaultState(D)));
    runReact();
    const old = figures;
    figures = population.map((c, i) => makeFigure(c, reaction.citizens[i], old[i]));
  }

  // ------------------------------------------------------------ appearance

  const SKIN = ['#f5d6bd', '#e8bd96', '#d09a6c', '#ad774d', '#86563a', '#5c3a26'];
  const HAIR = ['#2b201a', '#4a3020', '#6e4626', '#a35a2e', '#d6b06a', '#161616'];
  const GRAY_HAIR = '#cfcfcc';
  const KNOWN_OUTFITS = { casual: 1, suit: 1, scrubs: 1, labcoat: 1, camo: 1, overalls: 1, uniform: 1, hivis: 1, apron: 1, cardigan: 1 };
  const KNOWN_HATS = { none: 1, cap: 1, hardhat: 1, straw: 1, gradcap: 1, helmet: 1, beret: 1, chefhat: 1, cowboy: 1 };
  const KNOWN_PROPS = { none: 1, cane: 1, briefcase: 1, stethoscope: 1, book: 1, wrench: 1, laptop: 1, stroller: 1, toolbox: 1, clipboard: 1, tray: 1 };
  const frac = (x) => x - Math.floor(x);
  function hash01(n) { return frac(Math.sin(n * 127.1 + 311.7) * 43758.5453); }

  function appearance(c) {
    const look = c.look || {};
    const v = typeof look.variant === 'number' && isFinite(look.variant) ? clamp(look.variant, 0, 0.999) : hash01(c.id);
    const r = (k) => frac(v * k + c.id * 0.6180339);
    const hue = Math.floor(r(997) * 360);
    const outfit = KNOWN_OUTFITS[look.outfit] ? look.outfit : 'casual';
    return {
      outfit,
      hat: KNOWN_HATS[look.hat] ? look.hat : 'none',
      prop: KNOWN_PROPS[look.prop] ? look.prop : 'none',
      skin: SKIN[Math.floor(v * SKIN.length)],
      hair: look.grayHair ? GRAY_HAIR : HAIR[Math.floor(r(37) * HAIR.length)],
      hairStyle: Math.floor(r(71) * 4), // 0 short, 1 long, 2 bun, 3 cropped
      shirt: `hsl(${hue},55%,${look.grayHair ? 62 : 52}%)`,
      shirtDark: `hsl(${hue},45%,38%)`,
      soft: `hsl(${hue},28%,62%)`,
      height: 0.9 + r(53) * 0.2,
      balloon: ['#e8433a', '#3f86d6', '#f2b632', '#9b59b6', '#2bb07f'][Math.floor(r(13) * 5)],
      weapon: r(19) < 0.55 ? 'torch' : 'pitchfork',
      scrubColor: r(29) < 0.5 ? '#3a9e97' : '#5a86c8',
      vest: r(31) < 0.5 ? '#f3c300' : '#f28a24',
      phase: r(89) * Math.PI * 2,
      speed: 0.6 + r(43) * 0.8
    };
  }

  function makeFigure(c, rc, prev) {
    const f = prev && prev.c.id === c.id ? prev : { x: NaN, y: NaN, tx: 0, ty: 0, dir: 1, pop: 0, seat: false };
    f.c = c;
    f.r = rc;
    f.a = appearance(c);
    f.level = clamp(rc ? rc.level | 0 : 2, 0, 5);
    return f;
  }

  // ------------------------------------------------------------ palette

  let P = null;
  function palette() {
    const dark = darkMQ.matches;
    P = dark ? {
      dark, skyTop: '#0b1626', skyBot: '#27324c', haze: '#334063', tree: '#1c3324', treeDark: '#142719', trunk: '#2a2118',
      lawn: '#2a4630', lawn2: '#264029', path: '#4b4a44', pathEdge: '#3c3b36', marble: '#c7ccd6', marbleShade: '#8b91a0',
      dome: '#e3e6ee', window: '#f2d27a', ink: '#e7ecef', inkSoft: '#a9b4bb', shadow: 'rgba(0,0,0,0.45)',
      pool: '#22374f', blanket: ['#6f3b3b', '#36526e', '#5a5a2c', '#5e3d66'], label: 'rgba(14,22,36,0.82)',
      bubble: '#f7f5ee', bubbleInk: '#1b2630', dim: 'rgba(8,14,24,0.62)',
      mood: ['#f4bf3f', '#76bd52', '#8ea4b3', '#eba24a', '#ec6a43', '#d8363f']
    } : {
      dark, skyTop: '#9ec5df', skyBot: '#f1e3c8', haze: '#d7dde0', tree: '#6f9659', treeDark: '#557a45', trunk: '#6b5134',
      lawn: '#8cb563', lawn2: '#7ea956', path: '#e2d6b6', pathEdge: '#c9bb95', marble: '#f1eee8', marbleShade: '#c8c1b3',
      dome: '#fbfaf6', window: '#9fb3c2', ink: '#1d2a33', inkSoft: '#4f5d66', shadow: 'rgba(30,40,20,0.30)',
      pool: '#a9cddc', blanket: ['#c8493d', '#3e78b8', '#e2b23b', '#7d5aa6'], label: 'rgba(255,255,255,0.86)',
      bubble: '#ffffff', bubbleInk: '#1b2630', dim: 'rgba(240,244,240,0.66)',
      mood: ['#f2b632', '#5fa83d', '#8a9ea9', '#e2902f', '#d4542f', '#a51f2b']
    };
    buildGlows();
  }

  const glowSprites = [];
  function buildGlows() {
    for (let i = 0; i < 6; i++) {
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      const g = cv.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, P.mood[i]);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.globalAlpha = 1;
      g.fillRect(0, 0, 64, 64);
      glowSprites[i] = cv;
    }
  }

  // ------------------------------------------------------------ figure drawing
  // Unit space: feet at (0,0), about 30 units tall, facing the viewer.

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }

  function pantsColor(a) {
    switch (a.outfit) {
      case 'suit': return '#2e3646';
      case 'scrubs': return a.scrubColor;
      case 'camo': return '#5d6b3b';
      case 'overalls': return '#4669a0';
      case 'uniform': return '#24324b';
      case 'hivis': return '#6b5a43';
      case 'apron': return '#2b2b2f';
      case 'cardigan': return '#6d6258';
      case 'labcoat': return '#59616b';
      default: return '#3d5a80';
    }
  }

  function torsoColor(a) {
    switch (a.outfit) {
      case 'suit': return '#2e3646';
      case 'scrubs': return a.scrubColor;
      case 'labcoat': return '#f7f8fa';
      case 'camo': return '#6b7a45';
      case 'overalls': return '#b8443a';
      case 'uniform': return '#24324b';
      case 'hivis': return '#3c4248';
      case 'apron': return a.shirt;
      case 'cardigan': return a.soft;
      default: return a.shirt;
    }
  }

  function drawLegs(g, a, pose, t, ph) {
    g.fillStyle = pantsColor(a);
    if (pose === 'sit') {
      rr(g, -5, -4, 10, 4, 2); g.fill();
      g.fillStyle = '#2a2420';
      rr(g, 4, -3, 3, 3, 1); g.fill();
      return;
    }
    let sw = 0;
    if (pose === 'walk' || pose === 'pace') sw = Math.sin(t * 6 + ph) * 1.6;
    const coat = a.outfit === 'labcoat';
    rr(g, -4 + sw * 0.3, -12, 3.6, 12, 1.2); g.fill();
    rr(g, 0.4 - sw * 0.3, -12, 3.6, 12, 1.2); g.fill();
    g.fillStyle = a.outfit === 'camo' ? '#2c2a22' : '#2a2420';
    rr(g, -4.4 + sw * 0.3, -1.6, 4.2, 1.8, 0.8); g.fill();
    rr(g, 0.2 - sw * 0.3, -1.6, 4.2, 1.8, 0.8); g.fill();
    if (coat) { g.fillStyle = '#f7f8fa'; rr(g, -5.6, -13, 11.2, 7, 1.5); g.fill(); g.strokeStyle = '#c9ced6'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(0, -13); g.lineTo(0, -6); g.stroke(); }
  }

  function drawTorso(g, a, sitDy) {
    const y0 = -22 + sitDy;
    g.fillStyle = torsoColor(a);
    rr(g, -5.4, y0, 10.8, 11.5, 3); g.fill();
    switch (a.outfit) {
      case 'suit':
        g.fillStyle = '#f4f4f2';
        g.beginPath(); g.moveTo(-2, y0); g.lineTo(2, y0); g.lineTo(0, y0 + 5); g.closePath(); g.fill();
        g.fillStyle = '#c0392b'; g.fillRect(-0.6, y0 + 0.8, 1.2, 5.5);
        break;
      case 'labcoat':
        g.fillStyle = '#7fa6d6'; g.beginPath(); g.moveTo(-2, y0); g.lineTo(2, y0); g.lineTo(0, y0 + 4.5); g.closePath(); g.fill();
        g.strokeStyle = '#c9ced6'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0, y0 + 4.5); g.lineTo(0, y0 + 11.5); g.stroke();
        g.fillStyle = '#c9ced6'; g.fillRect(-4, y0 + 5, 2.6, 0.6);
        break;
      case 'scrubs':
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.beginPath(); g.moveTo(-2.4, y0); g.lineTo(2.4, y0); g.lineTo(0, y0 + 3.6); g.closePath(); g.fill();
        g.fillRect(1.2, y0 + 5, 2.6, 2.2);
        break;
      case 'camo':
        g.fillStyle = '#4a5530'; g.beginPath(); g.ellipse(-2.4, y0 + 3, 1.8, 1.2, 0.5, 0, 7); g.ellipse(2.6, y0 + 7, 2, 1.3, -0.4, 0, 7); g.fill();
        g.fillStyle = '#8c8a5c'; g.beginPath(); g.ellipse(2, y0 + 2.5, 1.4, 1, 0, 0, 7); g.ellipse(-2.6, y0 + 8, 1.5, 1, 0, 0, 7); g.fill();
        break;
      case 'overalls':
        g.fillStyle = '#4669a0'; rr(g, -4, y0 + 4, 8, 7.5, 1.5); g.fill();
        g.fillRect(-3.6, y0, 1.4, 5); g.fillRect(2.2, y0, 1.4, 5);
        g.fillStyle = '#e6c35a'; g.fillRect(-3.4, y0 + 4.4, 1, 1); g.fillRect(2.4, y0 + 4.4, 1, 1);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(-5.4, y0 + 2); g.lineTo(5.4, y0 + 2); g.stroke();
        break;
      case 'uniform':
        g.fillStyle = '#e6c35a'; g.fillRect(-0.5, y0 + 2, 1, 1); g.fillRect(-0.5, y0 + 5, 1, 1); g.fillRect(-0.5, y0 + 8, 1, 1);
        g.beginPath(); g.moveTo(-3.6, y0 + 2.4); g.lineTo(-2, y0 + 2); g.lineTo(-2.4, y0 + 4.2); g.closePath(); g.fill();
        g.fillStyle = '#16213a'; g.fillRect(-5.4, y0 + 9.2, 10.8, 1.6);
        break;
      case 'hivis':
        g.fillStyle = a.vest; rr(g, -5.4, y0 + 0.5, 10.8, 10.5, 2.5); g.fill();
        g.fillStyle = '#3c4248'; g.fillRect(-1, y0, 2, 11);
        g.fillStyle = '#e9edf0'; g.fillRect(-5.4, y0 + 5, 10.8, 1.3); g.fillRect(-5.4, y0 + 8, 10.8, 1.3);
        break;
      case 'apron':
        g.fillStyle = '#f4f2ec'; rr(g, -4, y0 + 2.5, 8, 14, 1.5); g.fill();
        g.strokeStyle = '#f4f2ec'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-3, y0 + 2.6); g.lineTo(-1.5, y0); g.moveTo(3, y0 + 2.6); g.lineTo(1.5, y0); g.stroke();
        break;
      case 'cardigan':
        g.fillStyle = '#f0e6d8'; g.fillRect(-1.6, y0, 3.2, 11.5);
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-2.4, y0 + 3, 0.7, 0.7); g.fillRect(-2.4, y0 + 6, 0.7, 0.7);
        break;
      default:
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-5.4, y0 + 1, 10.8, 1);
    }
  }

  function sleeveColor(a) {
    switch (a.outfit) {
      case 'hivis': return '#3c4248';
      case 'overalls': return '#b8443a';
      case 'labcoat': return '#f7f8fa';
      default: return torsoColor(a);
    }
  }

  function arm(g, a, x0, y0, x1, y1) {
    g.strokeStyle = sleeveColor(a);
    g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.fillStyle = a.skin;
    g.beginPath(); g.arc(x1, y1, 1.3, 0, 7); g.fill();
  }

  function drawHead(g, a, level, sitDy, mouthOpen) {
    const hy = -26.4 + sitDy;
    // hair behind
    g.fillStyle = a.hair;
    if (a.hairStyle === 1 && a.hat !== 'helmet') { rr(g, -4.4, hy - 3, 8.8, 8, 3); g.fill(); }
    g.fillStyle = a.skin;
    g.beginPath(); g.arc(0, hy, 4.1, 0, 7); g.fill();
    // hair on top
    if (a.hat === 'none' || a.hat === 'beret' || a.hat === 'gradcap') {
      g.fillStyle = a.hair;
      g.beginPath(); g.arc(0, hy - 0.6, 4.2, Math.PI * 1.03, Math.PI * 1.97); g.closePath(); g.fill();
      if (a.hairStyle === 2) { g.beginPath(); g.arc(0, hy - 4.6, 1.8, 0, 7); g.fill(); }
    }
    // face
    const ink = '#2a1d16';
    g.fillStyle = ink;
    g.beginPath(); g.arc(-1.5, hy - 0.2, 0.55, 0, 7); g.arc(1.5, hy - 0.2, 0.55, 0, 7); g.fill();
    g.strokeStyle = ink; g.lineWidth = 0.6; g.lineCap = 'round';
    if (level >= 4) {
      g.beginPath(); g.moveTo(-2.5, hy - 1.9); g.lineTo(-0.6, hy - 1.1); g.moveTo(2.5, hy - 1.9); g.lineTo(0.6, hy - 1.1); g.stroke();
    }
    g.beginPath();
    if (level === 0 || (level === 1 && mouthOpen)) {
      g.fillStyle = '#7a2a22';
      g.arc(0, hy + 1.3, 1.6, 0, Math.PI); g.closePath(); g.fill();
    } else if (level === 1) {
      g.arc(0, hy + 0.9, 1.5, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    } else if (level === 2) {
      g.moveTo(-1.1, hy + 2); g.lineTo(1.1, hy + 2); g.stroke();
    } else if (level === 3 || level === 4) {
      g.arc(0, hy + 3.2, 1.5, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
    } else {
      g.fillStyle = '#5a1712';
      g.ellipse(0, hy + 2.1, 1.1, mouthOpen ? 1.3 : 0.9, 0, 0, 7); g.fill();
    }
    if (level === 5) { g.fillStyle = 'rgba(220,40,30,0.18)'; g.beginPath(); g.arc(0, hy, 4.1, 0, 7); g.fill(); }
    drawHat(g, a, hy);
  }

  function drawHat(g, a, hy) {
    switch (a.hat) {
      case 'cap':
        g.fillStyle = a.outfit === 'uniform' ? '#24324b' : a.shirtDark;
        g.beginPath(); g.arc(0, hy - 1, 4.3, Math.PI, 0); g.fill();
        g.fillRect(-1, hy - 1.6, 6.4, 1.3);
        if (a.outfit === 'uniform') { g.fillStyle = '#e6c35a'; g.fillRect(-0.8, hy - 4, 1.6, 1.4); }
        break;
      case 'hardhat':
        g.fillStyle = '#f5c400';
        g.beginPath(); g.arc(0, hy - 1.2, 4.6, Math.PI, 0); g.fill();
        g.fillRect(-6, hy - 1.6, 12, 1.4);
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(-0.5, hy - 5.8, 1, 4.4);
        break;
      case 'straw':
        g.fillStyle = '#e3c46e';
        g.beginPath(); g.ellipse(0, hy - 2.2, 8.2, 1.7, 0, 0, 7); g.fill();
        rr(g, -3.4, hy - 6.4, 6.8, 4.4, 1.6); g.fill();
        g.fillStyle = '#9b4b2a'; g.fillRect(-3.4, hy - 3.2, 6.8, 0.9);
        break;
      case 'cowboy':
        g.fillStyle = '#7a4a26';
        g.beginPath(); g.moveTo(-8, hy - 3.6); g.quadraticCurveTo(0, hy - 0.6, 8, hy - 3.6); g.quadraticCurveTo(0, hy - 1.8, -8, hy - 3.6); g.fill();
        g.beginPath(); g.moveTo(-3.6, hy - 2.4); g.lineTo(-3, hy - 7.4); g.quadraticCurveTo(0, hy - 6, 3, hy - 7.4); g.lineTo(3.6, hy - 2.4); g.closePath(); g.fill();
        break;
      case 'gradcap':
        g.fillStyle = '#1d1d22';
        g.beginPath(); g.moveTo(-6.4, hy - 4.4); g.lineTo(0, hy - 6.6); g.lineTo(6.4, hy - 4.4); g.lineTo(0, hy - 2.4); g.closePath(); g.fill();
        g.fillRect(-2.8, hy - 4, 5.6, 2);
        g.strokeStyle = '#f2b632'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0, hy - 4.5); g.lineTo(5, hy - 3.6); g.lineTo(5.2, hy - 0.4); g.stroke();
        break;
      case 'helmet':
        g.fillStyle = '#56653a';
        g.beginPath(); g.arc(0, hy - 0.8, 5, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
        g.fillRect(-5.4, hy - 1.4, 10.8, 1.3);
        g.fillStyle = '#3f4a29'; g.beginPath(); g.ellipse(-1.6, hy - 3.6, 1.4, 0.8, 0, 0, 7); g.fill();
        break;
      case 'beret':
        g.fillStyle = a.outfit === 'camo' ? '#3b4a2a' : '#8a1f2f';
        g.beginPath(); g.ellipse(-1, hy - 3.8, 5, 2.1, -0.25, 0, 7); g.fill();
        g.fillStyle = '#e6c35a'; g.fillRect(-3.2, hy - 4, 1.2, 1.2);
        break;
      case 'chefhat':
        g.fillStyle = '#ffffff';
        g.fillRect(-3.4, hy - 5.6, 6.8, 2.6);
        g.beginPath(); g.arc(-2, hy - 7.2, 2.4, 0, 7); g.arc(2, hy - 7.2, 2.4, 0, 7); g.arc(0, hy - 8.6, 2.6, 0, 7); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.4; g.strokeRect(-3.4, hy - 5.6, 6.8, 2.6);
        break;
      default: break;
    }
  }

  // Props held in the right hand (x>0) when the hands are free.
  function drawHandProp(g, a, hx, hy, t) {
    switch (a.prop) {
      case 'cane':
        g.strokeStyle = '#6b4a2b'; g.lineWidth = 1; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx + 1.5, 0); g.lineTo(hx + 0.5, hy); g.arc(hx - 0.8, hy, 1.3, 0, Math.PI, true); g.stroke();
        break;
      case 'briefcase':
        g.fillStyle = '#5b3a22'; rr(g, hx - 1.5, hy + 0.6, 6, 4.2, 0.8); g.fill();
        g.strokeStyle = '#3e2615'; g.lineWidth = 0.6; g.strokeRect(hx + 0.4, hy - 0.3, 2, 1);
        break;
      case 'toolbox':
        g.fillStyle = '#c63b2f'; rr(g, hx - 2, hy + 0.6, 7, 4, 0.8); g.fill();
        g.fillStyle = '#8f2a22'; g.fillRect(hx - 2, hy + 1.8, 7, 0.7);
        break;
      case 'wrench':
        g.strokeStyle = '#9aa3ab'; g.lineWidth = 1.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + 3.5, hy - 5); g.stroke();
        g.beginPath(); g.arc(hx + 4, hy - 5.6, 1.4, 0, 7); g.stroke();
        break;
      case 'book':
        g.fillStyle = a.balloon; rr(g, hx - 1, hy - 3.5, 4, 5, 0.5); g.fill();
        g.fillStyle = '#f4f1e8'; g.fillRect(hx + 2.4, hy - 3.2, 0.6, 4.4);
        break;
      case 'laptop':
        g.fillStyle = '#9aa3ab'; rr(g, hx - 1.5, hy - 1, 6.5, 4.4, 0.6); g.fill();
        g.fillStyle = '#e5e9ec'; g.beginPath(); g.arc(hx + 1.8, hy + 1.2, 0.6, 0, 7); g.fill();
        break;
      case 'clipboard':
        g.fillStyle = '#9a6b3c'; rr(g, hx - 1.2, hy - 4.4, 4.6, 6, 0.5); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(hx - 0.5, hy - 3.6, 3.2, 4.6);
        g.fillStyle = '#7f8a92'; g.fillRect(hx, hy - 2.8, 2.2, 0.4); g.fillRect(hx, hy - 1.8, 2.2, 0.4); g.fillRect(hx, hy - 0.8, 1.6, 0.4);
        break;
      case 'tray':
        g.fillStyle = '#b9bec4'; g.beginPath(); g.ellipse(hx + 1, hy - 1, 4.6, 1.1, 0, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; rr(g, hx - 1, hy - 4, 2, 3, 0.4); g.fill();
        g.fillStyle = '#d9a441'; rr(g, hx + 1.6, hy - 3.4, 1.8, 2.4, 0.4); g.fill();
        break;
      default: break;
    }
  }

  function drawStroller(g) {
    g.fillStyle = '#3e4a5a';
    g.beginPath(); g.moveTo(8, -12); g.arc(13, -10, 5, Math.PI, Math.PI * 1.9); g.closePath(); g.fill();
    g.fillStyle = '#5d6f86'; rr(g, 8, -10.5, 10, 5, 2); g.fill();
    g.strokeStyle = '#2a2f37'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(8, -11); g.lineTo(5.5, -14); g.stroke();
    g.fillStyle = '#2a2f37'; g.beginPath(); g.arc(10, -2, 1.8, 0, 7); g.arc(16, -2, 1.8, 0, 7); g.fill();
    g.strokeStyle = '#2a2f37'; g.beginPath(); g.moveTo(10, -2); g.lineTo(12, -5.5); g.lineTo(16, -2); g.stroke();
  }

  function drawStethoscope(g, sitDy) {
    g.strokeStyle = '#3a3f46'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(-2.4, -22 + sitDy); g.quadraticCurveTo(-3, -16 + sitDy, 0.6, -15 + sitDy); g.moveTo(2.4, -22 + sitDy); g.quadraticCurveTo(2.6, -17 + sitDy, 0.6, -15 + sitDy); g.stroke();
    g.fillStyle = '#b9c0c8'; g.beginPath(); g.arc(0.6, -14.6 + sitDy, 1, 0, 7); g.fill();
  }

  function scribbleSign(g, x, y, w, h, color) {
    g.strokeStyle = color; g.lineWidth = 0.9;
    g.beginPath();
    for (let i = 0; i < 2; i++) {
      const yy = y + h * (0.35 + i * 0.32);
      g.moveTo(x + 1.5, yy);
      for (let k = 1; k <= 4; k++) g.lineTo(x + 1.5 + (w - 3) * k / 4, yy + (k % 2 ? -0.9 : 0.9));
    }
    g.stroke();
  }

  // pose: 'stand' | 'walk' | 'pace' | 'sit'
  // opts: { t, signText, scale }
  function drawFigure(g, f, pose, t, opts) {
    const a = f.a;
    const level = f.level;
    const ph = a.phase;
    const sit = pose === 'sit';
    const sitDy = sit ? 8 : 0;
    const anim = !reduceMotion;
    // Arms and body bob depend on level.
    const shoulderL = [-5, -20.5 + sitDy], shoulderR = [5, -20.5 + sitDy];
    let handL, handR;
    let shake = 0, mouthOpen = false;
    if (level === 0) {
      const w = anim ? Math.sin(t * 7 + ph) * 1.2 : 0;
      handL = [-7.5, -31 + w + sitDy]; handR = [7.5, -31 - w + sitDy];
    } else if (level === 1) {
      const wave = anim && Math.sin(t * 0.7 + ph) > 0.55;
      handL = [-6, -11.5 + sitDy];
      handR = wave ? [7.5 + Math.sin(t * 9 + ph) * 1.4, -30 + sitDy] : [6, -11.5 + sitDy];
      mouthOpen = wave;
    } else if (level === 2) {
      const sw = anim && pose === 'walk' ? Math.sin(t * 6 + ph) * 1.2 : 0;
      handL = [-6.2 + sw, -11.5]; handR = [6.2 - sw, -11.5];
    } else if (level === 3) {
      handL = null; handR = null; // crossed
    } else if (level === 4) {
      const b = anim ? Math.sin(t * 3.2 + ph) * 1.4 : 0;
      handL = [-6, -12]; handR = [5.5, -27 + b];
      mouthOpen = anim && Math.sin(t * 2.3 + ph) > 0.4;
    } else {
      const b = anim ? Math.sin(t * 11 + ph) * 1.8 : 0;
      shake = anim ? Math.sin(t * 23 + ph) * 0.7 : 0;
      handL = [-7, -27 + b]; handR = [6, -30 - b];
      mouthOpen = anim ? Math.sin(t * 6 + ph) > -0.2 : true;
    }
    if (shake) g.translate(shake, 0);

    // stroller sits beside its owner when their hands are free
    if (a.prop === 'stroller' && level <= 3 && !sit) drawStroller(g);

    drawLegs(g, a, pose, t, ph);
    // back arm (left)
    if (handL) arm(g, a, shoulderL[0], shoulderL[1], handL[0], handL[1]);
    drawTorso(g, a, sitDy);
    if (a.prop === 'stethoscope') drawStethoscope(g, sitDy);
    drawHead(g, a, level, sitDy, mouthOpen);

    if (level === 3) {
      // arms crossed over the chest
      g.fillStyle = sleeveColor(a);
      rr(g, -5.8, -17.6, 11.6, 3, 1.5); g.fill();
      g.fillStyle = a.skin;
      g.beginPath(); g.arc(-4.6, -16.1, 1.2, 0, 7); g.arc(4.6, -16.1, 1.2, 0, 7); g.fill();
    } else if (handR) {
      arm(g, a, shoulderR[0], shoulderR[1], handR[0], handR[1]);
    }

    // held items
    if (level <= 2 && handR && a.prop !== 'stroller' && a.prop !== 'stethoscope' && a.prop !== 'none') {
      if (level === 0 || (level === 1 && handR[1] < -20)) { /* hands busy cheering/waving */ }
      else drawHandProp(g, a, handR[0], handR[1], t);
    }
    if (a.prop === 'cane' && level >= 3) drawHandProp(g, a, -7, -11.5, t);

    if (level === 0) {
      // balloon on a string
      const bx = 9 + (anim ? Math.sin(t * 1.3 + ph) * 1.2 : 0), by = -46;
      g.strokeStyle = 'rgba(60,60,60,0.7)'; g.lineWidth = 0.4;
      g.beginPath(); g.moveTo(handR[0], handR[1]); g.quadraticCurveTo(bx - 2, (by + handR[1]) / 2, bx, by + 4.5); g.stroke();
      g.fillStyle = a.balloon;
      g.beginPath(); g.ellipse(bx, by, 3.6, 4.5, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(bx - 1.2, by - 1.6, 0.9, 1.3, 0, 0, 7); g.fill();
    } else if (level === 4) {
      const [sx, sy] = handR;
      g.strokeStyle = '#7a5532'; g.lineWidth = 1; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(sx, sy + 3); g.lineTo(sx, sy - 9); g.stroke();
      const text = opts && opts.signText;
      if (text) {
        g.font = '600 4.2px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
        const tw = Math.min(48, g.measureText(text).width);
        const w = tw + 4, h = 7;
        g.fillStyle = '#fbfaf3'; rr(g, sx - w / 2, sy - 9 - h, w, h, 0.8); g.fill();
        g.strokeStyle = '#b7a98a'; g.lineWidth = 0.4; g.stroke();
        g.fillStyle = '#b3241c'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, sx, sy - 9 - h / 2 + 0.2, 48);
      } else {
        g.fillStyle = '#fbfaf3'; rr(g, sx - 6.5, sy - 16.5, 13, 8, 0.8); g.fill();
        g.strokeStyle = '#b7a98a'; g.lineWidth = 0.4; g.stroke();
        scribbleSign(g, sx - 6.5, sy - 16.5, 13, 8, '#b3241c');
      }
    } else if (level === 5) {
      const [sx, sy] = handR;
      g.strokeStyle = '#6b4a2b'; g.lineWidth = 1.1; g.lineCap = 'round';
      if (a.weapon === 'torch') {
        g.beginPath(); g.moveTo(sx - 1, sy + 5); g.lineTo(sx + 0.6, sy - 6); g.stroke();
        const fl = anim ? Math.sin(t * 17 + ph) * 0.8 : 0;
        g.fillStyle = '#f08a24';
        g.beginPath(); g.moveTo(sx - 2.2, sy - 6); g.quadraticCurveTo(sx - 2 + fl, sy - 11, sx + 0.8 + fl, sy - 14); g.quadraticCurveTo(sx + 3, sy - 10, sx + 2.8, sy - 6); g.closePath(); g.fill();
        g.fillStyle = '#ffd34d';
        g.beginPath(); g.moveTo(sx - 0.8, sy - 6); g.quadraticCurveTo(sx - 0.4 + fl, sy - 9, sx + 0.8, sy - 10.5); g.quadraticCurveTo(sx + 1.8, sy - 8.5, sx + 1.6, sy - 6); g.closePath(); g.fill();
      } else {
        g.beginPath(); g.moveTo(sx, sy + 8); g.lineTo(sx, sy - 9); g.stroke();
        g.strokeStyle = '#8e969e'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(sx - 2.6, sy - 9); g.lineTo(sx + 2.6, sy - 9);
        g.moveTo(sx - 2.6, sy - 9); g.lineTo(sx - 2.6, sy - 14); g.moveTo(sx, sy - 9); g.lineTo(sx, sy - 14.5); g.moveTo(sx + 2.6, sy - 9); g.lineTo(sx + 2.6, sy - 14);
        g.stroke();
      }
    }
  }

  // ------------------------------------------------------------ world / layout

  const canvas = $('crowd');
  const ctx = canvas.getContext('2d');
  const wrap = $('canvasWrap');
  const world = { w: 800, h: 480, k: 1, dpr: 1 };
  const cam = { z: 1, ox: 0, oy: 0 };
  let decor = { blankets: [], labels: [], banner: null, baselines: [] };
  let horizon = 0, stepsTop = 0, stepsY = 0;

  function depth(y) {
    if (arrange !== 'mall') return 1;
    return clamp(0.8 + 0.36 * (y - stepsY) / Math.max(1, world.h - stepsY), 0.76, 1.16);
  }

  function resize() {
    const r = wrap.getBoundingClientRect();
    const w = Math.max(240, Math.round(r.width));
    const h = Math.max(220, Math.round(r.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (w === world.w && h === world.h && dpr === world.dpr && canvas.width) return;
    world.w = w; world.h = h; world.dpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    horizon = Math.round(h * 0.21);
    stepsTop = Math.round(h * 0.30);
    stepsY = Math.round(h * 0.36);
    const ground = (h - stepsY) * w;
    world.k = clamp(Math.sqrt(ground / Math.max(60, figures.length)) / 33, 0.5, 1.35);
    clampCam();
    layout(true);
  }

  function jit(id, k) { return hash01(id * 13.37 + k * 7.1) - 0.5; }

  // Pack figures into rows starting at y, centred on cx. Returns end y.
  function packRows(list, y, o) {
    let row = 0, i = 0, yy = y;
    while (i < list.length) {
      const s = depth(yy);
      const width = Math.min(o.wMax, o.w0 + row * o.grow);
      const sp = o.spacing * world.k * s;
      const n = Math.max(1, Math.floor(width / sp) + 1 || 1);
      const take = Math.min(n, list.length - i);
      const rowW = (take - 1) * sp;
      const off = row % 2 ? sp * 0.5 : 0;
      for (let j = 0; j < take; j++) {
        const f = list[i++];
        f.tx = o.cx - rowW / 2 + j * sp + (take < n ? 0 : off - sp * 0.25) + jit(f.c.id, 1) * sp * o.jitter;
        f.ty = yy + jit(f.c.id, 2) * o.rowGap * world.k * s * o.jitter;
        f.seat = false;
      }
      yy += o.rowGap * world.k * s;
      row++;
    }
    return yy;
  }

  function mallLayout() {
    const W = world.w, H = world.h, k = world.k;
    const byLevel = [[], [], [], [], [], []];
    for (const f of figures) byLevel[f.level].push(f);
    for (const l of byLevel) l.sort((a, b) => a.c.id - b.c.id);
    const protest = byLevel[5].concat(byLevel[4]);
    const picnic = byLevel[1].concat(byLevel[0]).sort((a, b) => hash01(a.c.id) - hash01(b.c.id));
    const bottom = H - 10;
    let f = 1, blankets = [], zoneEnd = [0, 0, 0, 0];
    const zoneOf = new Map();
    for (const fig of protest) zoneOf.set(fig, 0);
    for (const fig of byLevel[3]) zoneOf.set(fig, 1);
    for (const fig of byLevel[2]) zoneOf.set(fig, 2);
    for (const fig of picnic) zoneOf.set(fig, 3);
    for (let attempt = 0; attempt < 16; attempt++) {
      const g = Math.min(1, f);
      let y = stepsY + 8 * k;
      y = packRows(protest, y, { cx: W / 2, w0: W * 0.32, grow: 44 * k * g, wMax: W * 0.9, spacing: 14.5 * g, rowGap: 11 * g, jitter: 0.5 });
      zoneEnd[0] = y;
      y = Math.max(y + 14 * k * g, stepsY + (H - stepsY) * 0.2 * g);
      y = packRows(byLevel[3], y, { cx: W / 2, w0: W * 0.5, grow: 10 * k * g, wMax: W * 0.86, spacing: 17 * g, rowGap: 12 * g, jitter: 1 });
      zoneEnd[1] = y;
      y = Math.max(y + 10 * k * g, stepsY + (H - stepsY) * 0.4 * g);
      y = packRows(byLevel[2], y, { cx: W / 2, w0: W * 0.84, grow: 0, wMax: W * 0.9, spacing: 22 * g, rowGap: 13 * g, jitter: 1 });
      zoneEnd[2] = y;
      y = Math.max(y + 8 * k * g, stepsY + (H - stepsY) * 0.58 * g);
      // picnic blankets of up to 5
      blankets = [];
      const groups = [];
      for (let i = 0; i < picnic.length; i += 5) groups.push(picnic.slice(i, i + 5));
      let gi = 0, yy = y + 8 * k * g;
      while (gi < groups.length) {
        const s = depth(yy);
        const sp = 42 * k * s * g;
        const n = Math.max(1, Math.floor((W * 0.94) / sp) || 1);
        const take = Math.min(n, groups.length - gi);
        const x0 = W / 2 - (take - 1) * sp / 2;
        for (let j = 0; j < take; j++) {
          const grp = groups[gi++];
          const bx = x0 + j * sp + jit(gi, 3) * sp * 0.2;
          const by = yy + jit(gi, 4) * 4 * k;
          const bs = Math.max(0.75, g);
          blankets.push({ x: bx, y: by, s, c: gi % 4, w: 24 * k * s * bs, h: 10 * k * s * bs });
          const spots = [[-8, -3.5], [8, -3.5], [-7, 4], [7, 4], [0, -5]];
          grp.forEach((fig, m) => {
            fig.tx = bx + spots[m][0] * k * s * bs;
            fig.ty = by + spots[m][1] * k * s * bs;
            fig.seat = fig.level === 1;
          });
        }
        if (gi < groups.length) yy += 24 * k * s * g;
      }
      zoneEnd[3] = yy + 8 * k;
      if (zoneEnd[3] <= bottom || f < 0.3) break;
      f *= 0.9;
    }
    // Spread the zones into any spare ground so the Mall is used front to back.
    const spare = Math.max(0, bottom - zoneEnd[3]);
    if (spare > 0) {
      const share = [0.15, 0.45, 0.75, 1];
      for (const [fig, z] of zoneOf) fig.ty += spare * share[z];
      for (const b of blankets) b.y += spare;
    }
    decor.blankets = blankets;
    // Protest banner: the most common top grievance among the angry and furious.
    decor.banner = null;
    if (protest.length >= 3) {
      const cnt = {};
      for (const fig of protest) {
        const top = topGripe(fig.r);
        if (top) { const c = cnt[top.topic] || (cnt[top.topic] = { n: 0, topic: top.topic }); c.n++; }
      }
      const best = Object.values(cnt).sort((a, b) => b.n - a.n)[0];
      if (best) {
        let mx = 0, my = Infinity;
        for (const fig of protest) { mx += fig.tx; my = Math.min(my, fig.ty); }
        decor.banner = { x: mx / protest.length, y: my - 34 * k * depth(my), text: best.topic, n: protest.length, nTopic: best.n };
      }
    }
  }

  function topGripe(rc) {
    if (!rc || !Array.isArray(rc.reasons)) return null;
    let best = null;
    for (const r of rc.reasons) if (r && r.impact < 0 && (!best || r.impact < best.impact)) best = r;
    return best;
  }
  function topReason(rc) {
    if (!rc || !Array.isArray(rc.reasons) || !rc.reasons.length) return null;
    return rc.reasons[0];
  }

  // Categories for the pictogram arrangements.
  function categories(mode) {
    const cats = new Map();
    const add = (key, name, f, order) => {
      let c = cats.get(key);
      if (!c) { c = { key, name, list: [], order }; cats.set(key, c); }
      c.list.push(f);
    };
    for (const f of figures) {
      const c = f.c;
      if (mode === 'mood') add('L' + f.level, levelNames[f.level], f, -f.level);
      else if (mode === 'group') add('G' + c.group, String(c.group || 'Others'), f, 0);
      else if (mode === 'age' || mode === 'income') {
        const field = mode === 'age' ? 'ageBand' : 'incomeBand';
        const v = c[field];
        const idx = BAND_ORDER[field].indexOf(v);
        add('B' + v, BAND_LABELS[field][v] || String(v || 'Unknown'), f, idx < 0 ? 99 : idx);
      } else if (mode === 'gripe') {
        const g = topGripe(f.r);
        if (g) add('K' + g.key, g.topic || g.key, f, 0);
        else add('none', 'No complaints', f, 1e9);
      }
    }
    let list = Array.from(cats.values());
    if (mode === 'group' || mode === 'gripe') {
      list.sort((a, b) => (a.order - b.order) || (b.list.length - a.list.length) || a.name.localeCompare(b.name));
      if (mode === 'gripe') {
        const none = list.filter((c) => c.key === 'none');
        let rest = list.filter((c) => c.key !== 'none');
        if (rest.length > 9) {
          const other = { key: 'other', name: 'Other gripes', list: [], order: 0 };
          for (const c of rest.slice(8)) other.list.push(...c.list);
          rest = rest.slice(0, 8).concat([other]);
        }
        list = rest.concat(none);
      }
    } else list.sort((a, b) => a.order - b.order);
    if (mode === 'mood') {
      // show every level, even empty, so the scale reads
      const have = new Set(list.map((c) => c.key));
      for (let l = 5; l >= 0; l--) if (!have.has('L' + l)) list.push({ key: 'L' + l, name: levelNames[l], list: [], order: -l });
      list.sort((a, b) => a.order - b.order);
    }
    for (const c of list) c.list.sort((a, b) => (b.level - a.level) || (a.c.id - b.c.id));
    return list;
  }

  function pictogramLayout(mode) {
    const W = world.w, H = world.h;
    const cats = categories(mode);
    const top = horizon + 8, labelH = 34, padX = 10;
    let best = null;
    for (let rowsN = 1; rowsN <= 3; rowsN++) {
      const perRow = Math.ceil(cats.length / rowsN);
      const colW = (W - padX * 2) / perRow;
      const bandH = (H - top - 6) / rowsN - labelH;
      if (bandH < 30) continue;
      // largest cell that fits every category
      for (let cw = 22; cw >= 5; cw -= 0.5) {
        const ch = cw * 1.05;
        const cols = Math.max(1, Math.floor((colW - 8) / cw) || 1);
        const need = Math.max(...cats.map((c) => Math.ceil(c.list.length / cols))) * ch + ch * 1.6;
        if (need <= bandH) {
          if (!best || cw > best.cw) best = { rowsN, perRow, colW, bandH, cw, ch, cols };
          break;
        }
      }
    }
    if (!best) best = { rowsN: 1, perRow: cats.length, colW: (W - padX * 2) / cats.length, bandH: H - top - labelH, cw: 5, ch: 5.2, cols: 1 };
    const { perRow, colW, bandH, cw, ch, cols } = best;
    decor.labels = []; decor.baselines = [];
    decor.pictoScale = cw / 13;
    cats.forEach((cat, i) => {
      const r = Math.floor(i / perRow), j = i % perRow;
      const nRow = Math.min(perRow, cats.length - r * perRow);
      const rowOff = (W - padX * 2 - nRow * colW) / 2;
      const x0 = padX + rowOff + j * colW;
      const baseY = top + (r + 1) * (bandH + labelH) - labelH;
      const used = Math.min(cols, Math.max(1, cat.list.length));
      const left = x0 + colW / 2 - (used - 1) * cw / 2;
      cat.list.forEach((f, n) => {
        const cr = Math.floor(n / cols), cc = n % cols;
        f.tx = left + cc * cw + (cr % 2 ? cw * 0.18 : 0);
        f.ty = baseY - cr * ch;
        f.seat = false;
      });
      const people = cat.list.reduce((a, f) => a + (Number(f.c.represents) || 0), 0);
      decor.labels.push({ x: x0 + colW / 2, y: baseY + 6, w: colW - 6, name: cat.name, count: cat.list.length, people, top: baseY - Math.ceil(cat.list.length / cols) * ch - cw * 2.4 });
      decor.baselines.push({ x0: x0 + 4, x1: x0 + colW - 4, y: baseY + 2 });
    });
    decor.cats = cats;
  }

  function layout(snap) {
    decor = { blankets: [], labels: [], banner: null, baselines: [], cats: null, pictoScale: 1 };
    if (arrange === 'mall') mallLayout();
    else pictogramLayout(arrange);
    for (const f of figures) {
      if (snap || !isFinite(f.x) || reduceMotion) { f.x = f.tx; f.y = f.ty; }
    }
    requestDraw();
  }

  // ------------------------------------------------------------ camera

  function clampCam() {
    cam.z = clamp(cam.z, 1, 4);
    cam.ox = clamp(cam.ox, 0, world.w - world.w / cam.z);
    cam.oy = clamp(cam.oy, 0, world.h - world.h / cam.z);
    canvas.style.touchAction = cam.z > 1.01 ? 'none' : 'pan-y';
  }
  function zoomAt(sx, sy, factor) {
    const wx = cam.ox + sx / cam.z, wy = cam.oy + sy / cam.z;
    cam.z = clamp(cam.z * factor, 1, 4);
    cam.ox = wx - sx / cam.z; cam.oy = wy - sy / cam.z;
    clampCam(); requestDraw();
  }
  const toWorld = (sx, sy) => [cam.ox + sx / cam.z, cam.oy + sy / cam.z];
  const toScreen = (wx, wy) => [(wx - cam.ox) * cam.z, (wy - cam.oy) * cam.z];

  // ------------------------------------------------------------ background

  function drawBackground(g) {
    const W = world.w, H = world.h;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, P.skyTop); sky.addColorStop(1, P.skyBot);
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);
    if (P.dark) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 40; i++) g.fillRect(hash01(i) * W, hash01(i + 99) * horizon * 0.8, 1, 1);
    }
    // distant tree line
    g.fillStyle = P.treeDark;
    g.beginPath(); g.moveTo(0, horizon + 2);
    for (let x = 0; x <= W; x += 14) g.lineTo(x, horizon - 6 - hash01(x) * 7);
    g.lineTo(W, horizon + 2); g.closePath(); g.fill();
    // ground
    g.fillStyle = P.lawn; g.fillRect(0, horizon, W, H - horizon);
    // lawn stripes (mowing lines) converging
    g.fillStyle = P.lawn2;
    for (let i = -6; i <= 6; i += 2) {
      g.beginPath();
      g.moveTo(W / 2 + i * W * 0.03, horizon); g.lineTo(W / 2 + (i + 1) * W * 0.03, horizon);
      g.lineTo(W / 2 + (i + 1) * W * 0.24, H); g.lineTo(W / 2 + i * W * 0.24, H); g.closePath(); g.fill();
    }
    // gravel walks: a plaza before the steps and two long walks
    g.fillStyle = P.path;
    g.beginPath(); g.moveTo(W * 0.3, stepsY - 2); g.lineTo(W * 0.7, stepsY - 2); g.lineTo(W * 0.9, stepsY + (H - stepsY) * 0.22); g.lineTo(W * 0.1, stepsY + (H - stepsY) * 0.22); g.closePath(); g.fill();
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2 + side * W * 0.16, stepsY); g.lineTo(W / 2 + side * W * 0.2, stepsY);
      g.lineTo(W / 2 + side * W * 0.47, H); g.lineTo(W / 2 + side * W * 0.37, H); g.closePath(); g.fill();
    }
    // reflecting pool down the middle, far half only
    g.fillStyle = P.pool;
    g.beginPath(); g.moveTo(W * 0.47, stepsY + (H - stepsY) * 0.3); g.lineTo(W * 0.53, stepsY + (H - stepsY) * 0.3);
    g.lineTo(W * 0.56, stepsY + (H - stepsY) * 0.56); g.lineTo(W * 0.44, stepsY + (H - stepsY) * 0.56); g.closePath(); g.fill();
    // side trees in perspective
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const tt = i / 6;
        const y = stepsY + (H - stepsY) * tt * 0.95 - 4;
        const x = W / 2 + side * (W * 0.42 + tt * W * 0.12);
        const s = 0.6 + tt * 0.8;
        g.fillStyle = P.shadow; g.beginPath(); g.ellipse(x, y + 2, 14 * s, 4 * s, 0, 0, 7); g.fill();
        g.fillStyle = P.trunk; g.fillRect(x - 1.5 * s, y - 14 * s, 3 * s, 14 * s);
        g.fillStyle = P.tree; g.beginPath(); g.arc(x, y - 22 * s, 13 * s, 0, 7); g.fill();
        g.fillStyle = P.treeDark; g.beginPath(); g.arc(x + 4 * s, y - 18 * s, 8 * s, 0, 7); g.fill();
      }
    }
    drawCapitol(g);
  }

  function drawCapitol(g) {
    const W = world.w;
    const cx = W / 2;
    const base = stepsTop;
    const unit = Math.min(Math.min(W * 0.5, world.h * 1.1) / 100, (base - 6) / 56);
    const bw = Math.min(W * 0.62, unit * 130);
    g.fillStyle = P.marbleShade;
    g.fillRect(cx - bw / 2, base - 13 * unit, bw, 13 * unit);
    g.fillStyle = P.marble;
    g.fillRect(cx - bw / 2, base - 14 * unit, bw, 11.5 * unit);
    // wings windows / columns
    g.fillStyle = P.window;
    for (let i = 0; i < 26; i++) {
      const x = cx - bw / 2 + 3 * unit + i * (bw - 6 * unit) / 25;
      if (Math.abs(x - cx) < 13 * unit) continue;
      g.fillRect(x - 0.6 * unit, base - 11.5 * unit, 1.2 * unit, 6 * unit);
    }
    // central portico
    g.fillStyle = P.marble;
    g.fillRect(cx - 14 * unit, base - 19 * unit, 28 * unit, 17 * unit);
    g.beginPath(); g.moveTo(cx - 15 * unit, base - 19 * unit); g.lineTo(cx, base - 25 * unit); g.lineTo(cx + 15 * unit, base - 19 * unit); g.closePath(); g.fill();
    g.fillStyle = P.marbleShade;
    for (let i = 0; i < 8; i++) g.fillRect(cx - 12 * unit + i * 3.35 * unit, base - 18 * unit, 1 * unit, 14 * unit);
    // drum and dome
    g.fillStyle = P.marble;
    g.fillRect(cx - 12 * unit, base - 33 * unit, 24 * unit, 9 * unit);
    g.fillStyle = P.marbleShade;
    for (let i = 0; i < 11; i++) g.fillRect(cx - 11 * unit + i * 2.2 * unit, base - 32 * unit, 0.8 * unit, 7 * unit);
    g.fillStyle = P.dome;
    g.beginPath(); g.ellipse(cx, base - 33 * unit, 11 * unit, 13 * unit, 0, Math.PI, 0); g.fill();
    g.strokeStyle = P.marbleShade; g.lineWidth = Math.max(0.6, 0.4 * unit);
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(cx, base - 33 * unit, Math.abs(i) * 4 * unit + 0.01, 13 * unit, 0, Math.PI, Math.PI * 1.5 + (i < 0 ? 0 : 0.5 * Math.PI) - 0.0001, i >= 0); g.stroke(); }
    g.fillStyle = P.marble;
    g.fillRect(cx - 2 * unit, base - 50 * unit, 4 * unit, 5 * unit);
    g.beginPath(); g.arc(cx, base - 50 * unit, 2 * unit, Math.PI, 0); g.fill();
    g.fillStyle = P.marbleShade; g.fillRect(cx - 0.4 * unit, base - 55 * unit, 0.8 * unit, 4 * unit);
    if (P.dark) { g.fillStyle = 'rgba(255,220,140,0.12)'; g.beginPath(); g.ellipse(cx, base - 30 * unit, 26 * unit, 22 * unit, 0, 0, 7); g.fill(); }
    // steps
    const sw0 = 30 * unit, sw1 = 44 * unit;
    for (let i = 0; i < 5; i++) {
      const t0 = i / 5, t1 = (i + 1) / 5;
      const y0 = base - 2 * unit + (stepsY - base + 2 * unit) * t0;
      const y1 = base - 2 * unit + (stepsY - base + 2 * unit) * t1;
      const w0 = lerp(sw0, sw1, t0), w1 = lerp(sw0, sw1, t1);
      g.fillStyle = i % 2 ? P.marbleShade : P.marble;
      g.beginPath(); g.moveTo(cx - w0 / 2, y0); g.lineTo(cx + w0 / 2, y0); g.lineTo(cx + w1 / 2, y1); g.lineTo(cx - w1 / 2, y1); g.closePath(); g.fill();
    }
  }

  // ------------------------------------------------------------ bubbles

  const bubbles = []; // { fig, lines, until, born, kind }
  let hoverBubble = null;
  const measureCache = new Map();
  function measure(font, text) {
    const key = font + '|' + text;
    let w = measureCache.get(key);
    if (w === undefined) {
      ctx.font = font; w = ctx.measureText(text).width;
      if (measureCache.size > 4000) measureCache.clear();
      measureCache.set(key, w);
    }
    return w;
  }
  const BUBBLE_FONT = '13px "Segoe UI", system-ui, sans-serif';
  const BUBBLE_BOLD = '600 12px "Segoe UI", system-ui, sans-serif';
  function wrapText(text, maxW, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (measure(BUBBLE_FONT, t) <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
    }
    if (lines.length < maxLines && cur) lines.push(cur);
    else if (cur && lines.length === maxLines) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && measure(BUBBLE_FONT, last + '…') > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/\s+$/, '') + '…';
    }
    return lines;
  }
  function makeBubble(fig, text, title, kind, ms, tone) {
    const maxW = Math.min(230, world.w * 0.62);
    return { fig, title, lines: wrapText(text, maxW, kind === 'hover' ? 6 : 3), until: performance.now() + ms, born: performance.now(), kind, tone };
  }

  function drawBubble(g, b, placed) {
    const f = b.fig;
    const s = depth(f.y) * world.k * (arrange === 'mall' ? 1 : decor.pictoScale / world.k);
    const [hx, hy] = toScreen(f.x, f.y - 33 * s * f.a.height);
    if (hx < -40 || hx > world.w + 40 || hy < -20 || hy > world.h + 40) return;
    const lh = 16, pad = 7;
    let w = 0;
    for (const l of b.lines) w = Math.max(w, measure(BUBBLE_FONT, l));
    if (b.title) w = Math.max(w, measure(BUBBLE_BOLD, b.title));
    w += pad * 2;
    const h = b.lines.length * lh + (b.title ? lh : 0) + pad * 2 - 2;
    let x = clamp(hx - w / 2, 4, world.w - w - 4);
    let y = hy - h - 10;
    let below = false;
    if (y < 4) { y = hy + 36 * s * cam.z; below = true; }
    if (placed) {
      for (let tries = 0; tries < 4; tries++) {
        const hit = placed.find((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
        if (!hit) break;
        if (tries === 3) return;
        y = below ? hit.y + hit.h + 4 : hit.y - h - 4;
        if (y < 2) return;
      }
      placed.push({ x, y, w, h });
    }
    const age = (performance.now() - b.born) / 220;
    const a = reduceMotion ? 1 : clamp(age, 0, 1);
    const fade = b.kind === 'wave' ? clamp((b.until - performance.now()) / 400, 0, 1) : 1;
    g.globalAlpha = Math.min(a, fade);
    g.fillStyle = P.bubble;
    g.strokeStyle = b.tone === 'bad' ? P.mood[4] : b.tone === 'good' ? P.mood[1] : 'rgba(0,0,0,0.25)';
    g.lineWidth = b.tone ? 2 : 1;
    rr(g, x, y, w, h, 8); g.fill(); g.stroke();
    // tail
    const tx = clamp(hx, x + 10, x + w - 10);
    g.beginPath();
    if (!below) { g.moveTo(tx - 6, y + h - 1); g.lineTo(tx, y + h + 8); g.lineTo(tx + 5, y + h - 1); }
    else { g.moveTo(tx - 6, y + 1); g.lineTo(tx, y - 8); g.lineTo(tx + 5, y + 1); }
    g.fill();
    g.fillStyle = P.bubbleInk;
    g.textAlign = 'left'; g.textBaseline = 'top';
    let ty = y + pad;
    if (b.title) { g.font = BUBBLE_BOLD; g.fillText(b.title, x + pad, ty); ty += lh; }
    g.font = BUBBLE_FONT;
    for (const l of b.lines) { g.fillText(l, x + pad, ty); ty += lh; }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------ highlight

  let highlight = null; // { ids:Set, label }
  function setHighlight(ids, label) {
    highlight = ids ? { ids: new Set(ids), label } : null;
    const note = $('hiliteNote');
    note.hidden = !highlight;
    if (highlight) setText(note, label);
    $('clearHi').hidden = !highlight;
    document.querySelectorAll('[data-hi]').forEach((n) => n.setAttribute('aria-pressed', String(!!highlight && n.dataset.hi === highlight.label)));
    requestDraw();
  }

  // ------------------------------------------------------------ render loop

  let rafId = 0, lastT = 0, needDraw = true, visible = true;
  const frameTimes = [];
  function requestDraw() {
    needDraw = true;
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    rafId = 0;
    const t = now / 1000;
    const dt = Math.min(0.05, lastT ? t - lastT : 0.016);
    lastT = t;
    const t0 = performance.now();
    let moving = false;
    // move toward targets
    const ease = 1 - Math.pow(0.0025, dt);
    for (const f of figures) {
      const dx = f.tx - f.x, dy = f.ty - f.y;
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        moving = true;
        f.x += dx * ease; f.y += dy * ease;
        if (Math.abs(dx) > 2) f.dir = dx > 0 ? 1 : -1;
      } else { f.x = f.tx; f.y = f.ty; }
    }
    draw(t);
    const ft = performance.now() - t0;
    frameTimes.push(ft); if (frameTimes.length > 120) frameTimes.shift();
    const animate = !reduceMotion && visible && !document.hidden;
    if (bubbles.length || moving || animate) rafId = requestAnimationFrame(frame);
    needDraw = false;
  }

  const bgCache = { key: '', cv: null };
  function draw(t) {
    const g = ctx;
    const dpr = world.dpr;
    const mall = arrange === 'mall';
    // The backdrop only changes with the camera, size, theme or mode: cache it.
    const key = [canvas.width, canvas.height, cam.z, cam.ox, cam.oy, P.dark, mall].join('|');
    if (bgCache.key !== key) {
      if (!bgCache.cv) bgCache.cv = document.createElement('canvas');
      const cv = bgCache.cv;
      cv.width = canvas.width; cv.height = canvas.height;
      const bg = cv.getContext('2d');
      bg.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.ox * cam.z * dpr, -cam.oy * cam.z * dpr);
      drawBackground(bg);
      if (!mall) { bg.fillStyle = P.dim; bg.fillRect(0, horizon - 20, world.w, world.h); }
      bgCache.key = key;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bgCache.cv, 0, 0);
    g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.ox * cam.z * dpr, -cam.oy * cam.z * dpr);
    for (const b of decor.blankets) {
      g.fillStyle = P.blanket[b.c];
      g.beginPath(); g.ellipse(b.x, b.y, b.w / 2, b.h / 2, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(b.x, b.y, b.w / 2.6, b.h / 2.6, 0, 0, 7); g.stroke();
    }
    if (!mall) {
      g.strokeStyle = P.inkSoft; g.lineWidth = 1;
      for (const bl of decor.baselines) { g.beginPath(); g.moveTo(bl.x0, bl.y); g.lineTo(bl.x1, bl.y); g.stroke(); }
    }
    const order = figures.slice().sort((a, b) => a.y - b.y);
    const anim = !reduceMotion;
    const hi = highlight;
    const effZ = cam.z;
    const now = performance.now();
    // glows first, so clusters merge into a field of colour
    for (const f of order) {
      if (hi && !hi.ids.has(f.c.id)) continue;
      const s = mall ? depth(f.y) * world.k : decor.pictoScale;
      const gw = (f.level >= 4 ? 30 : f.level <= 1 ? 26 : 20) * s;
      g.globalAlpha = f.level === 2 ? 0.35 : 0.7;
      g.drawImage(glowSprites[f.level], f.x - gw, f.y - gw * 0.38, gw * 2, gw * 0.76);
    }
    g.globalAlpha = 1;
    for (const f of order) {
      const dimmed = hi && !hi.ids.has(f.c.id);
      const s = (mall ? depth(f.y) * world.k : decor.pictoScale) * f.a.height;
      let x = f.x, y = f.y;
      let pose = f.seat && mall ? 'sit' : 'stand';
      if (anim && mall) {
        const a = f.a;
        if (f.level === 2) { x += Math.sin(t * 0.35 * a.speed + a.phase) * 9 * s; y += Math.sin(t * 0.23 * a.speed + a.phase * 2) * 2.5 * s; pose = 'walk'; }
        else if (f.level === 3) { x += Math.sin(t * 1.1 * a.speed + a.phase) * 3.5 * s; pose = 'pace'; }
      }
      if (anim && f.level === 0) y -= Math.abs(Math.sin(t * 5 + f.a.phase)) * 4 * s;
      if (anim && f.pop > now) y -= Math.sin(((f.pop - now) / 600) * Math.PI) * 3 * s;
      f.sx = x; f.sy = y;
      // shadow
      g.globalAlpha = dimmed ? 0.16 : 1;
      g.fillStyle = P.shadow;
      g.beginPath(); g.ellipse(f.x, f.y, 6 * s, 2.2 * s, 0, 0, 7); g.fill();
      g.save();
      g.translate(x, y);
      let dir = 1;
      if (pose === 'walk' || pose === 'pace') dir = Math.cos(t * (pose === 'walk' ? 0.35 : 1.1) * f.a.speed + f.a.phase) >= 0 ? 1 : -1;
      g.scale(s * dir, s);
      const showSign = f.level === 4 && ((mall && effZ * s >= 1.7 && f.c.id % 3 === 0) || f === hoverFig || f === selectedFig);
      let signText = null;
      if (showSign) { const gr = topGripe(f.r); signText = gr ? gr.short || gr.topic : null; }
      drawFigure(g, f, pose, t, { signText });
      g.restore();
      if (f.pop > now && !dimmed) {
        const k = (f.pop - now) / 2400;
        g.strokeStyle = P.ink; g.globalAlpha = clamp(k, 0, 1) * 0.8; g.lineWidth = 1.4 / cam.z;
        g.beginPath(); g.ellipse(f.x, f.y, 9 * s, 3.4 * s, 0, 0, 7); g.stroke();
      }
    }
    g.globalAlpha = 1;
    if (selectedFig) {
      const f = selectedFig, s = (mall ? depth(f.y) * world.k : decor.pictoScale) * f.a.height;
      g.strokeStyle = P.ink; g.lineWidth = 2 / cam.z; g.setLineDash([3 / cam.z, 2 / cam.z]);
      g.beginPath(); g.ellipse(f.x, f.y, 10 * s, 3.8 * s, 0, 0, 7); g.stroke(); g.setLineDash([]);
    }
    // protest banner and pictogram labels
    if (mall && decor.banner && !hi) drawBanner(g, decor.banner);
    if (!mall) drawLabels(g);
    // bubbles in screen space
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const placed = [];
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].until < now) bubbles.splice(i, 1);
    for (const b of bubbles) drawBubble(g, b, placed);
    if (hoverBubble) drawBubble(g, hoverBubble, null);
  }

  function drawBanner(g, b) {
    const k = world.k;
    const font = `700 ${Math.round(12 * k + 2)}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
    g.font = font;
    const text = b.text.length > 32 ? b.text.slice(0, 31) + '…' : b.text;
    const tw = g.measureText(text).width;
    const w = tw + 24 * k, h = 20 * k + 4;
    const x = clamp(b.x - w / 2, 4, world.w - w - 4), y = Math.max(horizon - 10, b.y - h);
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 2 * k;
    g.beginPath(); g.moveTo(x + 6 * k, y + h); g.lineTo(x + 6 * k, y + h + 12 * k); g.moveTo(x + w - 6 * k, y + h); g.lineTo(x + w - 6 * k, y + h + 12 * k); g.stroke();
    g.fillStyle = '#fbf6e9';
    const wv = reduceMotion ? 0 : Math.sin(performance.now() / 500) * 1.5 * k;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y + wv, x + w, y); g.lineTo(x + w, y + h); g.quadraticCurveTo(x + w / 2, y + h + wv, x, y + h); g.closePath(); g.fill();
    g.strokeStyle = P.mood[5]; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = P.mood[5]; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 1);
  }

  function drawLabels(g) {
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const l of decor.labels) {
      const fs = clamp(l.w / 7, 9, 13);
      g.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`;
      let name = l.name;
      while (name.length > 2 && g.measureText(name).width > l.w) name = name.slice(0, -2);
      if (name !== l.name) name = name.replace(/\s+$/, '') + '…';
      g.fillStyle = P.ink;
      g.fillText(name, l.x, l.y);
      g.font = `${fs - 1}px "Segoe UI", system-ui, sans-serif`;
      g.fillStyle = P.inkSoft;
      const sub = l.w > 70 ? `${l.count} · ${shortPeople(l.people)}` : String(l.count);
      g.fillText(sub, l.x, l.y + fs + 2);
    }
  }
  function shortPeople(n) {
    if (n >= 1e6) return (n / 1e6 >= 10 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1).replace(/\.0$/, '')) + 'M people';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k people';
    return n + ' people';
  }

  // ------------------------------------------------------------ pointer

  let hoverFig = null, selectedFig = null;
  function pick(sx, sy, slop) {
    const [wx, wy] = toWorld(sx, sy);
    const mall = arrange === 'mall';
    let best = null;
    const pad = (slop || 2) / cam.z;
    for (const f of figures) {
      if (highlight && !highlight.ids.has(f.c.id)) continue;
      const s = (mall ? depth(f.y) * world.k : decor.pictoScale) * f.a.height;
      const x = isFinite(f.sx) ? f.sx : f.x, y = isFinite(f.sy) ? f.sy : f.y;
      if (wx >= x - 6.5 * s - pad && wx <= x + 6.5 * s + pad && wy >= y - 31 * s - pad && wy <= y + 1 + pad) {
        if (!best || y > best.sy) best = f;
      }
    }
    return best;
  }
  function personTitle(c) { return `${c.name}, ${c.age} · ${c.label}`; }
  function setHover(f) {
    if (f === hoverFig) return;
    hoverFig = f;
    hoverBubble = f ? makeBubble(f, f.r ? f.r.bubble : '', personTitle(f.c), 'hover', 1e9, null) : null;
    canvas.style.cursor = f ? 'pointer' : (cam.z > 1 ? 'grab' : 'default');
    requestDraw();
  }

  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z };
      drag = null;
    } else drag = { x: e.offsetX, y: e.offsetY, ox: cam.ox, oy: cam.oy, moved: false, type: e.pointerType };
    if (cam.z > 1.01 || pointers.size === 2) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.offsetX; p.y = e.offsetY; }
    if (pinch && pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.z * d / pinch.d) / cam.z);
      return;
    }
    if (drag && pointers.size === 1) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved && cam.z > 1.01) {
        cam.ox = drag.ox - dx / cam.z; cam.oy = drag.oy - dy / cam.z; clampCam(); requestDraw();
        return;
      }
    }
    if (e.pointerType === 'mouse') setHover(pick(e.offsetX, e.offsetY, 2));
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  }
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    endPointer(e);
    drag = null;
    if (!d || d.moved) return;
    const f = pick(e.offsetX, e.offsetY, e.pointerType === 'mouse' ? 2 : 8);
    if (!f) { setHover(null); return; }
    if (e.pointerType === 'mouse' || hoverFig === f) openCard(f);
    else setHover(f);
  });
  canvas.addEventListener('pointercancel', (e) => { endPointer(e); drag = null; });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHover(null); });
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey && cam.z <= 1.01 && e.deltaY > 0) return; // let the page scroll
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  }, { passive: false });
  $('zoomIn').addEventListener('click', () => zoomAt(world.w / 2, world.h / 2, 1.4));
  $('zoomOut').addEventListener('click', () => zoomAt(world.w / 2, world.h / 2, 1 / 1.4));
  $('clearHi').addEventListener('click', () => setHighlight(null));

  // ------------------------------------------------------------ person card

  let cardReturnFocus = null;
  function openCard(f) {
    selectedFig = f;
    cardReturnFocus = document.activeElement;
    renderCard();
    $('cardLayer').hidden = false;
    $('personCard').focus();
    requestDraw();
  }
  function closeCard() {
    $('cardLayer').hidden = true;
    selectedFig = null;
    requestDraw();
    if (cardReturnFocus && cardReturnFocus.focus && document.contains(cardReturnFocus)) cardReturnFocus.focus();
  }
  $('cardLayer').addEventListener('click', (e) => { if (e.target === $('cardLayer')) closeCard(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('cardLayer').hidden) closeCard(); });

  function statusText(s) {
    return STATUS_TEXT[s] || String(s).replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
  }
  function controlFor(key) {
    if (byId[key] && !(byId[key]._kind === 'spending' && byId[key].locked)) return key;
    if (leverById[key]) return key;
    return null;
  }

  function renderCard() {
    const f = selectedFig;
    if (!f) return;
    const c = f.c, r = f.r || { reasons: [], status: [] };
    const card = $('personCard');
    const lvl = f.level;
    const reasons = Array.isArray(r.reasons) ? r.reasons : [];
    const maxImp = Math.max(10, ...reasons.map((x) => Math.abs(Number(x.impact) || 0)));
    const mood = Number(r.mood) || 0, md = Number(r.moodDelta) || 0;
    const preview = document.createElement('canvas');
    preview.className = 'pc-figure'; preview.width = 72 * 2; preview.height = 96 * 2;
    preview.setAttribute('aria-hidden', 'true');
    drawMini(preview, f, 3.2, lvl);
    fill(card,
      el('button', { type: 'button', class: 'pc-close', 'aria-label': 'Close', onclick: closeCard }, '×'),
      el('div', { class: 'pc-head' },
        preview,
        el('div', {},
          el('h2', { id: 'pcName' }, `${c.name}, ${c.age}`),
          el('p', { class: 'pc-label' }, c.label),
          el('p', { class: 'pc-meta' }, `${c.group} · ${F.dollars(c.income)} a year household income`),
          el('p', { class: 'pc-meta' }, `Stands for ${F.people(c.represents)} people`))),
      el('div', { class: 'pc-mood', 'data-level': lvl },
        el('span', { class: 'pc-level' }, `${LEVEL_GLYPH[lvl]} ${levelNames[lvl]}`),
        el('span', { class: 'pc-meter', role: 'img', 'aria-label': `Mood ${Math.round(mood)} on a scale from −100 to 100` },
          el('span', { class: 'pc-meter-dot', style: `left:${(mood + 100) / 2}%` })),
        el('span', { class: 'pc-delta' }, Math.abs(md) < 0.5 ? 'No change from today' : `${md > 0 ? '+' : '−'}${Math.round(Math.abs(md))} compared with today's budget`)),
      (r.status && r.status.length) ? el('ul', { class: 'pc-status' }, r.status.map((s) => el('li', {}, statusText(s)))) : null,
      c.about ? el('p', { class: 'pc-about' }, c.about) : null,
      el('h3', {}, reasons.length ? 'What they are reacting to' : 'Nothing in your plan touches them yet'),
      reasons.length ? el('ul', { class: 'pc-reasons' }, reasons.map((x) => {
        const imp = Number(x.impact) || 0;
        const ctl = controlFor(x.key);
        return el('li', { class: 'pc-reason', 'data-tone': imp < 0 ? 'bad' : 'good' },
          el('span', { class: 'pc-kind', title: KIND_NAME[x.kind] || x.kind, 'aria-label': KIND_NAME[x.kind] || x.kind }, KIND_ICON[x.kind] || '•'),
          el('div', { class: 'pc-rtext' },
            el('p', {}, x.text),
            el('div', { class: 'pc-bar' },
              el('span', { class: 'pc-bar-track', 'aria-hidden': 'true' },
                el('span', { class: 'pc-bar-fill', style: `width:${(Math.abs(imp) / maxImp) * 50}%;${imp < 0 ? 'right:50%' : 'left:50%'}` })),
              el('span', { class: 'pc-imp' }, `${imp > 0 ? '+' : imp < 0 ? '−' : ''}${Math.abs(Math.round(imp))} mood`)),
            ctl ? el('button', { type: 'button', class: 'link-btn pc-go', onclick: () => { closeCard(); goToControl(ctl); } }, `Go to ${x.topic || nameOf(ctl)}`) :
              el('span', { class: 'pc-nogo' }, x.topic || '')));
      })) : el('p', { class: 'muted' }, r.bubble || ''));
  }

  function nameOf(id) { return (byId[id] && byId[id].name) || (leverById[id] && leverById[id].name) || id; }

  function drawMini(cv, f, scale, level) {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const prevLevel = f.level;
    f.level = level;
    g.save();
    g.translate(cv.width / 2 - 4 * scale, cv.height - 6 * scale);
    g.scale(scale, scale);
    g.fillStyle = P.shadow; g.beginPath(); g.ellipse(0, 0, 7, 2.4, 0, 0, 7); g.fill();
    const rm = reduceMotion; reduceMotion = true;
    drawFigure(g, f, 'stand', 0, {});
    reduceMotion = rm;
    g.restore();
    f.level = prevLevel;
  }

  // ------------------------------------------------------------ controls

  const updaters = [];
  const onUpdate = (fn) => updaters.push(fn);
  let lastMoved = null;

  function rangeInput(id, min, max, step, value, label) {
    return el('input', { type: 'range', id, min, max, step, value, 'aria-label': label });
  }
  const tone = (node, t) => { if (t) node.dataset.tone = t; else delete node.dataset.tone; };

  function moreToggle(btn, body) {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    });
  }

  function buildLever(l) {
    const wrapEl = el('div', { class: 'lever', id: 'ctl-' + l.id });
    const inputId = 'in-' + l.id;
    const yieldOut = el('span', { class: 'yield' });
    const info = el('div', { class: 'info', hidden: true, id: 'info-' + l.id });
    const story = el('p', { class: 'story', hidden: true });
    const infoBtn = el('button', { type: 'button', class: 'info-btn', 'aria-expanded': 'false', 'aria-controls': 'info-' + l.id, 'aria-label': `About ${l.name}` }, 'i');
    if (l.blurb) info.append(el('p', {}, l.blurb));
    info.append(story);
    if (l.type === 'toggle' && l.onText) info.append(el('p', { class: 'story-off' }, 'If switched on: ' + l.onText));
    if (l.source) info.append(el('p', { class: 'source' }, 'Estimate: ' + l.source));
    moreToggle(infoBtn, info);
    let input, valueOut, resetBtn;
    if (l.type === 'slider') {
      valueOut = el('output', { class: 'val', for: inputId });
      input = rangeInput(inputId, l.min, l.max, l.step, state.levers[l.id], l.name);
      const tick = el('span', { class: 'law-tick', 'aria-hidden': 'true' });
      tick.style.setProperty('--p', String((l.current - l.min) / (l.max - l.min)));
      resetBtn = el('button', { type: 'button', class: 'mini-reset', 'aria-label': `Reset ${l.name} to current law` }, 'Reset');
      wrapEl.append(
        el('div', { class: 'row' }, el('label', { for: inputId, class: 'name' }, l.name), valueOut, infoBtn),
        el('div', { class: 'range-wrap' }, input, tick),
        el('div', { class: 'row foot' }, el('span', { class: 'law' }, `Law: ${fmtLever(l, l.current)}`), yieldOut, resetBtn),
        info);
      input.addEventListener('input', () => { state.levers[l.id] = Number(input.value); changed(l.id); });
      resetBtn.addEventListener('click', () => { state.levers[l.id] = l.current; changed(l.id); });
    } else {
      input = el('input', { type: 'checkbox', role: 'switch', id: inputId, class: 'switch-input' });
      input.checked = !!state.levers[l.id];
      wrapEl.append(
        el('div', { class: 'row' },
          el('label', { for: inputId, class: 'switch' }, input, el('span', { class: 'switch-track', 'aria-hidden': 'true' }), el('span', { class: 'name' }, l.name)),
          infoBtn),
        el('div', { class: 'row foot' }, yieldOut),
        info);
      input.addEventListener('change', () => { state.levers[l.id] = input.checked; changed(l.id); });
    }
    const full = l.type === 'toggle' ? M.leverYield(l, true) : 0;
    onUpdate((r) => {
      const v = state.levers[l.id];
      if (l.type === 'slider') {
        if (Number(input.value) !== v) input.value = v;
        setText(valueOut, fmtLever(l, v));
        resetBtn.disabled = v === l.current;
      } else if (input.checked !== !!v) input.checked = !!v;
      const on = l.type === 'toggle' ? !!v : v !== l.current;
      const y = l.type === 'toggle' && !v ? full : r.leverYield[l.id];
      if (Math.abs(y) < 0.05) { setText(yieldOut, on ? 'No budget change' : 'Current law'); tone(yieldOut, ''); }
      else {
        const what = l.side === 'revenue' ? (y > 0 ? 'Raises' : 'Loses') : (y < 0 ? 'Saves' : 'Costs');
        setText(yieldOut, (l.type === 'toggle' && !v ? 'If on: ' : '') + `${what} ${F.moneyShort(Math.abs(y))}/yr`);
        const good = l.side === 'revenue' ? y > 0 : y < 0;
        tone(yieldOut, l.type === 'toggle' && !v ? '' : good ? 'good' : 'bad');
      }
      const st = r.storyById && r.storyById[l.id];
      story.hidden = !st;
      if (st) setText(story, st);
      wrapEl.classList.toggle('is-changed', on);
    });
    return wrapEl;
  }

  function buildLine(s, kind) {
    const levers = leversOf(s.id);
    const box = el('div', { class: 'ctl' + (s.locked ? ' is-locked' : ''), id: 'ctl-' + s.id, 'data-kind': kind });
    const money = el('span', { class: 'money' });
    const eff = el('span', { class: 'eff' });
    const badge = el('span', { class: 'badge', hidden: true });
    const more = el('div', { class: 'more', id: 'more-' + s.id, hidden: true });
    const story = el('p', { class: 'story', hidden: true });
    const moreBtn = el('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'more-' + s.id },
      levers.length ? `${levers.length} ${kind === 'revenue' ? 'option' : 'reform'}${levers.length > 1 ? 's' : ''}` : 'About', badge);
    moreToggle(moreBtn, more);
    if (s.blurb) more.append(el('p', { class: 'blurb' }, s.blurb));
    more.append(story);
    if (s.facts && s.facts.length) more.append(el('ul', { class: 'facts' }, s.facts.map((x) => el('li', {}, x))));
    if (levers.length) more.append(el('div', { class: 'levers' }, levers.map(buildLever)));
    let input, out, resetBtn;
    const head = el('div', { class: 'row head' }, el('span', { class: 'icon', 'aria-hidden': 'true' }, s.icon || ''));
    if (kind === 'spending' && !s.locked) {
      const inputId = 'in-' + s.id;
      out = el('output', { class: 'val', for: inputId });
      head.append(el('label', { for: inputId, class: 'name' }, s.name), out);
      input = rangeInput(inputId, s.min, s.max, s.step, state.spending[s.id], `Change ${s.name} funding, percent`);
      const tick = el('span', { class: 'law-tick', 'aria-hidden': 'true' });
      tick.style.setProperty('--p', String((0 - s.min) / (s.max - s.min)));
      resetBtn = el('button', { type: 'button', class: 'mini-reset', 'aria-label': `Reset ${s.name} and its reforms` }, 'Reset');
      box.append(head, el('div', { class: 'range-wrap' }, input, tick),
        el('div', { class: 'row foot' }, money, eff, moreBtn, resetBtn), more);
      input.addEventListener('input', () => { state.spending[s.id] = Number(input.value); changed(s.id); });
      resetBtn.addEventListener('click', () => {
        state.spending[s.id] = 0;
        for (const l of levers) state.levers[l.id] = DEFAULTS.levers[l.id];
        changed(s.id);
      });
    } else {
      head.append(el('span', { class: 'name' }, s.name));
      box.append(head, el('div', { class: 'row foot' }, money, eff, moreBtn), more);
      if (s.locked) more.prepend(el('p', { class: 'locked-note' }, 'You can\'t set this directly. It is interest on past borrowing: it falls when your plan borrows less and rises when it borrows more.'));
    }
    onUpdate((r) => {
      const amount = kind === 'spending' ? r.spendingById[s.id] : r.revenueById[s.id];
      const d = amount - s.baseline;
      const moved = Math.abs(d) >= 0.05;
      setText(money, moved ? `${F.moneyShort(amount)}, was ${F.moneyShort(s.baseline)}` : `${F.moneyShort(amount)} a year`);
      setText(eff, moved ? F.signedMoney(d).replace(' billion', 'B').replace(' trillion', 'T').replace(' million', 'M') : '');
      const good = kind === 'spending' ? d < 0 : d > 0;
      tone(eff, moved ? (good ? 'good' : 'bad') : '');
      if (input) {
        const v = state.spending[s.id];
        if (Number(input.value) !== v) input.value = v;
        setText(out, v === 0 ? 'No change' : fmtPct(v));
        resetBtn.disabled = v === 0 && levers.every((l) => state.levers[l.id] === DEFAULTS.levers[l.id]);
      }
      const nChanged = levers.filter((l) => state.levers[l.id] !== DEFAULTS.levers[l.id]).length;
      badge.hidden = !nChanged;
      setText(badge, nChanged ? String(nChanged) + ' on' : '');
      const st = r.storyById && r.storyById[s.id];
      story.hidden = !st;
      if (st) setText(story, st);
      box.classList.toggle('is-changed', (input && state.spending[s.id] !== 0) || nChanged > 0);
    });
    return box;
  }

  function buildControls() {
    const sp = $('spendPane');
    for (const g of GROUP_ORDER.concat(Array.from(new Set(D.spending.map((s) => s.group))).filter((x) => !GROUP_ORDER.includes(x)))) {
      const lines = D.spending.filter((s) => s.group === g).sort((a, b) => b.baseline - a.baseline);
      if (!lines.length) continue;
      sp.append(el('h3', { class: 'pane-group' }, GROUP_NAMES[g] || g), ...lines.map((s) => buildLine(s, 'spending')));
    }
    const rp = $('revPane');
    for (const rv of D.revenue.slice().sort((a, b) => b.baseline - a.baseline)) rp.append(buildLine(rv, 'revenue'));
    // tabs
    const tabs = [$('tabSpend'), $('tabRev')];
    const panes = [$('spendPane'), $('revPane')];
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectTab(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const j = 1 - i; selectTab(j); tabs[j].focus(); }
      });
    });
    function selectTab(i) {
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(i === j)); t.tabIndex = i === j ? 0 : -1; panes[j].hidden = i !== j; });
    }
    buildControls.selectTab = selectTab;
    selectTab(0);
    $('resetAll').addEventListener('click', () => { state = M.defaultState(D); changed(null); });
  }

  function goToControl(id) {
    const lever = leverById[id];
    const lineId = lever ? lever.parent : id;
    const line = byId[lineId];
    if (!line) return;
    buildControls.selectTab(line._kind === 'revenue' ? 1 : 0);
    setSheet(true);
    const box = $('ctl-' + lineId);
    const btn = box && box.querySelector('.more-btn');
    if (lever && btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
    const target = $('ctl-' + id) || box;
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 2200);
    const input = target.querySelector('input');
    if (input) input.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ bottom sheet

  function setSheet(open) {
    if (!phoneMQ.matches) return;
    const h = $('sheetHandle');
    h.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('sheet-open', open);
    if (open) { const st = $('stage'); const top = st.getBoundingClientRect().top; if (top < -10 || top > 80) st.scrollIntoView({ block: 'start' }); }
    setTimeout(resize, 30);
  }
  $('sheetHandle').addEventListener('click', () => setSheet($('sheetHandle').getAttribute('aria-expanded') !== 'true'));

  // ------------------------------------------------------------ scoreboard

  function buildScoreboard() {
    const bar = $('moodBar');
    const segs = [];
    for (let l = 5; l >= 0; l--) {
      const b = el('button', { type: 'button', class: 'mseg', 'data-level': l, 'data-hi': 'level' + l, 'aria-pressed': 'false' },
        el('span', { class: 'mglyph', 'aria-hidden': 'true' }, LEVEL_GLYPH[l]), el('span', { class: 'mcount' }));
      b.addEventListener('click', () => {
        if (highlight && highlight.label === 'level' + l) { setHighlight(null); return; }
        const ids = figures.filter((f) => f.level === l).map((f) => f.c.id);
        setHighlight(ids, 'level' + l);
        setText($('hiliteNote'), `Showing the ${ids.length} ${levelNames[l].toLowerCase()} figures`);
      });
      segs[l] = b;
      bar.append(b);
    }
    const lensBox = $('lenses');
    const lensNodes = {};
    for (const key of Object.keys(LENS_INFO)) {
      const tipId = 'tip-' + key;
      const val = el('span', { class: 'lens-val' });
      const was = el('span', { class: 'lens-was' });
      const b = el('button', { type: 'button', class: 'lens', 'aria-describedby': tipId, 'aria-expanded': 'false' },
        el('span', { class: 'lens-name' }, LENS_INFO[key].name), val, was,
        el('span', { class: 'lens-tip', role: 'tooltip', id: tipId }, LENS_INFO[key].help));
      b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') !== 'true';
        lensBox.querySelectorAll('.lens').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        b.setAttribute('aria-expanded', String(open));
      });
      b.addEventListener('blur', () => b.setAttribute('aria-expanded', 'false'));
      lensNodes[key] = { val, was };
      lensBox.append(b);
    }
    onUpdate((r, rx) => {
      const def = r.deficit;
      const surplus = def <= 0;
      setText($('deficitLabel'), surplus ? (r.balanced && Math.abs(def) < 1 ? 'Balanced' : 'Surplus') : 'Deficit');
      setText($('deficitNum'), F.money(Math.abs(def)));
      $('deficitNum').dataset.tone = surplus ? 'good' : 'bad';
      $('deficitNum').parentElement.dataset.state = surplus ? 'good' : 'bad';
      $('sheetDeficit').dataset.tone = surplus ? 'good' : 'bad';
      const pct = clamp(100 * (r.baselineDeficit - def) / r.baselineDeficit, 0, 100);
      $('progressFill').style.width = pct + '%';
      $('progress').setAttribute('aria-valuenow', String(Math.round(pct)));
      setText($('progressLabel'), surplus ? 'Balanced: money in covers money out' : `${Math.round(pct)}% of the way to balanced (from ${F.moneyShort(r.baselineDeficit)})`);
      setText($('inOut'), `In ${F.moneyShort(r.totalRevenue)} · Out ${F.moneyShort(r.totalSpending)}`);
      setText($('sheetDeficit'), (surplus ? 'Surplus ' : 'Deficit ') + F.moneyShort(Math.abs(def)));
      const levels = levelCounts(rx);
      const total = figures.length || 1;
      const sumLv = [0, 0, 0, 0, 0, 0];
      for (const f of figures) sumLv[f.level] += Number(f.c.represents) || 0;
      for (let l = 0; l < 6; l++) {
        const n = levels[l];
        segs[l].style.flexGrow = String(n);
        segs[l].hidden = n === 0;
        setText(segs[l].querySelector('.mcount'), String(n));
        segs[l].setAttribute('aria-label', `${levelNames[l]}: ${n} figures, about ${F.people(sumLv[l])} people. Highlight them.`);
        segs[l].title = `${levelNames[l]}: ${n} of ${total}`;
      }
      const L = (rx.summary && rx.summary.lenses) || {};
      const B = (baseReaction && baseReaction.summary && baseReaction.summary.lenses) || {};
      for (const key of Object.keys(LENS_INFO)) {
        const v = lensValue(L[key]), b = lensValue(B[key]);
        const fmt = (x) => !isFinite(x) ? '—' : key === 'hardship' ? x.toFixed(1) : String(Math.round(x));
        setText(lensNodes[key].val, fmt(v) + (key === 'electability' && isFinite(v) ? '%' : ''));
        setText(lensNodes[key].was, isFinite(b) && fmt(b) !== fmt(v) ? `was ${fmt(b)}` : '');
      }
      $('winBanner').hidden = !r.balanced;
    });
  }

  function levelCounts(rx) {
    const lv = rx && rx.summary && Array.isArray(rx.summary.levels) && rx.summary.levels.length === 6 ? rx.summary.levels : null;
    if (lv) return lv;
    const out = [0, 0, 0, 0, 0, 0];
    for (const f of figures) out[f.level]++;
    return out;
  }

  // ------------------------------------------------------------ leaderboards

  function holders(key, negative) {
    return figures.filter((f) => f.r && Array.isArray(f.r.reasons) && f.r.reasons.some((x) => x.key === key && (negative ? x.impact < 0 : x.impact > 0))).map((f) => f.c.id);
  }
  function renderBoard(node, items, negative) {
    const list = (items || []).slice(0, 6);
    if (!list.length) {
      fill(node, el('li', { class: 'empty' }, negative ? 'Nobody is upset about anything yet. Move a control and see.' : 'Nobody is cheering anything yet.'));
      return;
    }
    const maxF = Math.max(1, ...list.map((x) => x.figures || 0));
    fill(node, list.map((x) => {
      const label = (negative ? 'neg:' : 'pos:') + x.key;
      const b = el('button', { type: 'button', class: 'brow', 'data-hi': label, 'aria-pressed': String(!!highlight && highlight.label === label) },
        el('span', { class: 'btopic' }, x.topic || nameOf(x.key)),
        el('span', { class: 'bcount' }, `${x.figures} figure${x.figures === 1 ? '' : 's'} · ${F.people(x.people)} people`),
        el('span', { class: 'bbar', 'aria-hidden': 'true' }, el('span', { style: `width:${100 * (x.figures || 0) / maxF}%` })),
        x.text ? el('span', { class: 'bquote' }, '“' + x.text + '”') : null);
      b.addEventListener('click', () => {
        if (highlight && highlight.label === label) { setHighlight(null); return; }
        const ids = holders(x.key, negative);
        setHighlight(ids, label);
        setText($('hiliteNote'), `${ids.length} figure${ids.length === 1 ? '' : 's'} ${negative ? 'upset' : 'pleased'} about ${x.topic || nameOf(x.key)}`);
        if (phoneMQ.matches || $('stage').getBoundingClientRect().top < -40) $('stage').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      });
      return el('li', {}, b);
    }));
  }

  // ------------------------------------------------------------ list view

  let listTimer = 0;
  function scheduleList() {
    if (!$('crowdListWrap').open) return;
    clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 250);
  }
  function renderList() {
    const groups = arrange === 'mall' ? categories('mood') : (decor.cats || categories('mood'));
    const out = [];
    for (const cat of groups) {
      if (!cat.list.length) continue;
      const counts = [0, 0, 0, 0, 0, 0];
      for (const f of cat.list) counts[f.level]++;
      const mix = counts.map((n, l) => n ? `${n} ${levelNames[l].toLowerCase()}` : null).filter(Boolean).reverse().join(', ');
      out.push(el('section', { class: 'lgroup' },
        el('h3', {}, `${cat.name}: ${cat.list.length} figure${cat.list.length === 1 ? '' : 's'}, about ${F.people(cat.list.reduce((a, f) => a + (Number(f.c.represents) || 0), 0))} people`),
        arrange === 'mood' || arrange === 'mall' ? null : el('p', { class: 'muted' }, mix),
        el('ul', {}, cat.list.map((f) => {
          const tr = topReason(f.r);
          return el('li', {}, el('button', { type: 'button', class: 'lperson', onclick: () => openCard(f) },
            el('span', { class: 'lmood', 'data-level': f.level }, `${LEVEL_GLYPH[f.level]} ${levelNames[f.level]}`),
            el('span', { class: 'lname' }, `${f.c.name}, ${f.c.age}, ${f.c.label}`),
            el('span', { class: 'lwhy' }, tr ? tr.text : (f.r && f.r.bubble) || '')));
        }))));
    }
    fill($('crowdList'), out);
  }
  $('crowdListWrap').addEventListener('toggle', () => { if ($('crowdListWrap').open) renderList(); });

  // ------------------------------------------------------------ arrangement control

  function buildArrange() {
    const box = $('arrange');
    const btns = ARRANGE.map((a) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(a.id === arrange), 'data-id': a.id, tabindex: a.id === arrange ? '0' : '-1' }, a.name);
      b.addEventListener('click', () => setArrange(a.id));
      b.addEventListener('keydown', (e) => {
        const i = ARRANGE.findIndex((x) => x.id === arrange);
        let j = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % ARRANGE.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + ARRANGE.length - 1) % ARRANGE.length;
        if (j !== null) { e.preventDefault(); setArrange(ARRANGE[j].id); btns[j].focus(); }
      });
      return b;
    });
    box.append(...btns);
    function setArrange(id) {
      arrange = id;
      store.set(STORE.arrange, id);
      btns.forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      cam.z = 1; clampCam();
      layout(false);
      updateCaption();
      scheduleList();
    }
  }

  function updateCaption() {
    const lv = levelCounts(reaction);
    const parts = [];
    for (let l = 5; l >= 0; l--) if (lv[l]) parts.push(`${lv[l]} ${levelNames[l].toLowerCase()}`);
    const mode = ARRANGE.find((a) => a.id === arrange).name;
    const text = `${figures.length} figures (${mode === 'Mall' ? 'standing on the Mall' : 'arranged ' + mode.toLowerCase()}): ${parts.join(', ')}.`;
    canvas.setAttribute('aria-label', 'The crowd. ' + text + ' The same information is in the list below.');
    setText($('crowdCaption'), arrange === 'mall'
      ? 'Unhappy people gather at the Capitol steps; the content stroll in the middle; the happy picnic at the back. Hover anyone to hear why; scroll or pinch to zoom in on the signs.'
      : 'Each column counts figures. Within a column the angriest stand at the bottom.');
  }

  // ------------------------------------------------------------ reaction loop

  let waveRef = null, waveTimer = 0, pending = false;
  function changed(movedId) {
    if (movedId !== undefined) lastMoved = movedId;
    if (!waveRef) waveRef = figures.map((f) => ({ mood: f.r ? Number(f.r.mood) || 0 : 0, level: f.level }));
    clearTimeout(waveTimer);
    waveTimer = setTimeout(fireWave, 380);
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; update(); });
  }

  function update() {
    runReact();
    const before = figures.map((f) => f.level);
    figures.forEach((f, i) => makeFigure(population[i], reaction.citizens[i], f));
    const levelsChanged = figures.some((f, i) => f.level !== before[i]);
    for (const fn of updaters) fn(result, reaction);
    renderBoard($('grievances'), reaction.summary && reaction.summary.grievances, true);
    renderBoard($('cheers'), reaction.summary && reaction.summary.cheers, false);
    if (levelsChanged || arrange === 'gripe') layout(false);
    if (hoverFig) hoverBubble = makeBubble(hoverFig, hoverFig.r.bubble, personTitle(hoverFig.c), 'hover', 1e9, null);
    if (selectedFig && !$('cardLayer').hidden) renderCard();
    if (highlight && /^(neg|pos):/.test(highlight.label)) {
      const key = highlight.label.slice(4);
      highlight.ids = new Set(holders(key, highlight.label[0] === 'n'));
    }
    updateCaption();
    scheduleList();
    store.set(STORE.state, M.encodeState(D, state));
    if (location.hash.length > 1) { try { history.replaceState(null, '', shareUrl()); } catch (e) { /* ignore */ } }
    if (result.balanced && !wasBalanced) openReport();
    wasBalanced = result.balanced;
    requestDraw();
  }

  // The reason a figure would mention right now: one caused by the control just
  // moved when they have one (direct), else their top reason.
  function reasonFor(f, movedId) {
    const rs = (f.r && Array.isArray(f.r.reasons)) ? f.r.reasons : [];
    if (!rs.length) return null;
    if (movedId) {
      const lever = leverById[movedId];
      const keys = [movedId];
      if (lever) keys.push(lever.parent);
      const hit = rs.find((x) => keys.includes(x.key));
      if (hit) return { r: hit, direct: true };
    }
    return { r: rs[0], direct: false };
  }

  function fireWave() {
    const ref = waveRef;
    waveRef = null;
    if (!ref) return;
    const movers = [];
    figures.forEach((f, i) => {
      const m = f.r ? Number(f.r.mood) || 0 : 0;
      const d = m - ref[i].mood;
      const dl = f.level - ref[i].level;
      if (Math.abs(d) >= 2 || dl) movers.push({ f, d, score: Math.abs(d) + Math.abs(dl) * 15 });
    });
    if (!movers.length) { setText($('reactLive'), 'Nobody in the crowd noticed that change.'); return; }
    movers.sort((a, b) => b.score - a.score);
    const now = performance.now();
    for (const m of movers.slice(0, 40)) m.f.pop = now + 2400;
    const cap = world.w < 520 ? 2 : 5;
    // keep the bubbles visible in the current view
    const inView = movers.filter((m) => { const [x, y] = toScreen(m.f.x, m.f.y); return x > 0 && x < world.w && y > 0 && y < world.h + 20; });
    for (const m of inView) m.why = reasonFor(m.f, lastMoved);
    const usable = inView.filter((m) => m.why);
    const direct = usable.filter((m) => m.why.direct);
    // Speak about the control just moved first; make sure both sides get a voice.
    let picks = [];
    const add = (m) => {
      if (picks.length >= cap || picks.includes(m)) return;
      if (picks.some((p) => p.why.r.text === m.why.r.text) && usable.length > cap * 2) return;
      picks.push(m);
    };
    const neg = direct.filter((m) => m.why.r.impact < 0), pos = direct.filter((m) => m.why.r.impact > 0);
    const minority = neg.length >= pos.length ? pos : neg;
    if (minority.length) add(minority[0]);
    for (const m of direct) add(m);
    for (const m of usable) add(m);
    bubbles.length = 0;
    const chosen = picks.map((m) => ({ m, text: m.why.r.text }));
    chosen.forEach((c, i) => {
      const b = makeBubble(c.m.f, c.text, c.m.f.c.name, 'wave', 3800 + i * 250, c.m.why.r.impact < 0 ? 'bad' : 'good');
      b.born = now + i * 120;
      bubbles.push(b);
    });
    const worse = movers.filter((m) => m.d < 0).length, better = movers.filter((m) => m.d > 0).length;
    const lead = chosen[0] ? ` ${chosen[0].m.f.c.name}, ${chosen[0].m.f.c.label}: ${chosen[0].text}` : '';
    setText($('reactLive'), `${worse} figure${worse === 1 ? '' : 's'} took it badly, ${better} liked it.${lead}`);
    requestDraw();
  }

  // ------------------------------------------------------------ win report

  function openReport() {
    const r = result, rx = reaction;
    const lv = levelCounts(rx);
    const sumRep = (pred) => figures.reduce((a, f) => a + (pred(f) ? Number(f.c.represents) || 0 : 0), 0);
    const groupCount = (pred) => {
      const m = {};
      for (const f of figures) if (pred(f)) m[f.c.group] = (m[f.c.group] || 0) + 1;
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${g} (${n})`);
    };
    const happyN = lv[0] + lv[1], angryN = lv[4] + lv[5];
    const cheerGroups = groupCount((f) => f.level <= 1);
    const angryGroups = groupCount((f) => f.level >= 4);
    const L = (rx.summary && rx.summary.lenses) || {};
    const grs = (rx.summary && rx.summary.grievances || []).slice(0, 3);
    const chs = (rx.summary && rx.summary.cheers || []).slice(0, 3);
    const item = (x) => el('li', {}, el('strong', {}, x.topic || nameOf(x.key)), ` · ${x.figures} figures, ${F.people(x.people)} people`, x.text ? el('span', { class: 'quote' }, '“' + x.text + '”') : null);
    fill($('reportBody'),
      el('h2', { id: 'reportTitle' }, r.deficit < -1 ? `A surplus of ${F.money(-r.deficit)}` : 'The budget balances'),
      el('p', {}, `Money in ${F.money(r.totalRevenue)}, money out ${F.money(r.totalSpending)}, in one year of a simplified model. Here is how the Mall took it.`),
      el('div', { class: 'report-cols' },
        el('div', { class: 'report-side', 'data-tone': 'good' },
          el('h3', {}, `${LEVEL_GLYPH[0]} Cheering and happy: ${happyN}`),
          el('p', {}, happyN ? `About ${F.people(sumRep((f) => f.level <= 1))} people. Mostly ${cheerGroups.join(', ')}.` : 'Nobody is celebrating.'),
          el('h4', {}, 'What they like'),
          chs.length ? el('ol', {}, chs.map(item)) : el('p', { class: 'muted' }, 'Nothing in particular.')),
        el('div', { class: 'report-side', 'data-tone': 'bad' },
          el('h3', {}, `${LEVEL_GLYPH[5]} At the gates: ${angryN}`),
          el('p', {}, angryN ? `About ${F.people(sumRep((f) => f.level >= 4))} people, ${lv[5]} with torches or pitchforks. Mostly ${angryGroups.join(', ')}.` : 'Nobody is protesting. Check the uneasy middle.'),
          el('h4', {}, 'What they are angry about'),
          grs.length ? el('ol', {}, grs.map(item)) : el('p', { class: 'muted' }, 'No grievances.'))),
      el('h3', {}, 'Three ways to score it'),
      el('ul', { class: 'report-lenses' }, Object.keys(LENS_INFO).map((k) => {
        const v = lensValue(L[k]);
        return el('li', {}, el('strong', {}, `${LENS_INFO[k].name}: ${!isFinite(v) ? '—' : k === 'hardship' ? v.toFixed(1) : Math.round(v) + (k === 'electability' ? '%' : '')}`), ' ', LENS_INFO[k].help);
      })),
      el('p', { class: 'muted' }, `${lv[2]} content and ${lv[3]} uneasy figures are in between. Balancing one year does not settle the debt already owed, and every figure is a rough stand-in for real people.`));
    const dlg = $('reportDialog');
    if (dlg.showModal && !dlg.open) dlg.showModal();
  }
  $('openReport').addEventListener('click', openReport);

  // ------------------------------------------------------------ legend, about, intro

  function buildLegend() {
    const reps = population.map((c) => Number(c.represents) || 0);
    const total = reps.reduce((a, b) => a + b, 0);
    const sorted = reps.slice().sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length / 2)] || 0;
    const lo = sorted[0] || 0, hi = sorted[sorted.length - 1] || 0;
    const range = hi > lo * 1.2 ? ` Small groups get at least one figure, so a figure stands for anywhere from ${F.people(lo)} to ${F.people(hi)} people; every count in the game adds up the real numbers.` : '';
    setText($('legendScale'), `1 figure = about ${F.people(typical)} people. ${figures.length} figures stand for ${F.people(total)} American adults.${range}`);
    const poses = $('legendPoses');
    const sample = figures.find((f) => f.a.outfit === 'casual' && f.a.hat === 'none') || figures[0];
    const items = [];
    for (let l = 0; l < 6; l++) {
      const cv = document.createElement('canvas');
      cv.width = 88; cv.height = 136; cv.className = 'legend-fig'; cv.setAttribute('aria-hidden', 'true');
      drawMini(cv, sample, 2.3, l);
      items.push(el('li', { 'data-level': l }, cv, el('span', {}, el('strong', {}, levelNames[l]), el('br'), LEVEL_POSE[l])));
    }
    fill(poses, items);
    // who's who: one figure per group
    const seen = new Map();
    for (const f of figures) if (!seen.has(f.c.group)) seen.set(f.c.group, f);
    const who = Array.from(seen.values()).map((f) => {
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 136; cv.className = 'legend-fig'; cv.setAttribute('aria-hidden', 'true');
      drawMini(cv, f, 2.7, 2);
      return el('li', {}, cv, el('span', {}, f.c.group));
    });
    let whoBox = $('legendWho');
    if (!whoBox) { whoBox = el('ul', { class: 'legend-who', id: 'legendWho' }); poses.after(el('details', { class: 'who-wrap' }, el('summary', {}, el('h3', {}, 'Who is who')), whoBox)); }
    fill(whoBox, who);
  }

  function buildAbout() {
    const box = $('about');
    const srcList = (list) => el('ul', {}, list.map((s) => el('li', {}, s && s.url ? el('a', { href: s.url, rel: 'noopener' }, s.label || s.url) : String((s && s.label) || s))));
    const meta = D.meta || {};
    const cm = (C && C.meta) || {};
    fill(box,
      el('p', {}, `Budget numbers are for fiscal year ${meta.fiscalYear}, data as of ${meta.asOf}. This is a simplified model, not a forecast: each figure is an illustrative stand-in for many people, and their moods are estimates built from the budget data and published polling.`),
      Array.isArray(cm.caveats) && cm.caveats.length ? [el('h3', {}, 'About the crowd'), el('ul', {}, cm.caveats.map((c) => el('li', {}, String(c))))] : null,
      Array.isArray(cm.sources) && cm.sources.length ? [el('h3', {}, 'Crowd sources'), srcList(cm.sources)] : null,
      Array.isArray(meta.caveats) && meta.caveats.length ? [el('h3', {}, 'About the budget model'), el('ul', {}, meta.caveats.map((c) => el('li', {}, String(c))))] : null,
      Array.isArray(meta.sources) && meta.sources.length ? [el('h3', {}, 'Budget sources'), srcList(meta.sources)] : null);
  }

  function showIntro() {
    const dlg = $('introDialog');
    setText($('introScale'), 'about ' + F.people(population.map((c) => Number(c.represents) || 0).sort((a, b) => a - b)[Math.floor(population.length / 2)] || 0));
    if (dlg.showModal && !dlg.open) dlg.showModal();
  }
  $('showIntro').addEventListener('click', showIntro);
  $('introDialog').addEventListener('close', () => store.set(STORE.intro, '1'));

  // ------------------------------------------------------------ share / seed

  function shareUrl() {
    const code = M.encodeState(D, state);
    const parts = [];
    if (code) parts.push(code);
    if (seed !== 1) parts.push(`${SEED_TAG}:${seed}`);
    return location.href.split('#')[0] + (parts.length ? '#' + parts.join(',') : '');
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  $('share').addEventListener('click', () => {
    const url = shareUrl();
    try { history.replaceState(null, '', url); } catch (e) { /* ignore */ }
    const done = () => toast('Link copied. It opens this plan and this crowd.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast('Copy the address bar to share this plan.'));
    else toast('Copy the address bar to share this plan.');
  });
  $('newCrowd').addEventListener('click', () => {
    seed = seed + 1;
    store.set(STORE.seed, String(seed));
    bubbles.length = 0; setHover(null); setHighlight(null);
    figures = [];
    buildCrowd();
    for (const fn of updaters) fn(result, reaction);
    renderBoard($('grievances'), reaction.summary.grievances, true);
    renderBoard($('cheers'), reaction.summary.cheers, false);
    resizeK();
    layout(true);
    buildLegend();
    updateCaption();
    scheduleList();
    if (location.hash.length > 1) { try { history.replaceState(null, '', shareUrl()); } catch (e) { /* ignore */ } }
    toast(`Meet crowd number ${seed}.`);
  });
  function resizeK() {
    world.k = clamp(Math.sqrt(((world.h - stepsY) * world.w) / Math.max(60, figures.length)) / 33, 0.5, 1.35);
  }

  window.addEventListener('hashchange', () => {
    const h = splitHash(location.hash);
    const code = M.encodeState(D, state);
    if (h.code === code && (h.seed || 1) === seed) return;
    state = M.decodeState(D, h.code);
    if (h.seed && h.seed !== seed) { seed = h.seed; figures = []; buildCrowd(); resizeK(); layout(true); buildLegend(); }
    changed(null);
  });

  // ------------------------------------------------------------ start

  try {
    palette();
    buildCrowd();
  } catch (e) {
    showErrors('The crowd simulation failed to start', [e && e.message ? e.message : String(e)]);
    return;
  }
  $('app').hidden = false;
  buildControls();
  buildScoreboard();
  buildArrange();
  buildAbout();
  wasBalanced = result.balanced;
  resize();
  for (const fn of updaters) fn(result, reaction);
  renderBoard($('grievances'), reaction.summary && reaction.summary.grievances, true);
  renderBoard($('cheers'), reaction.summary && reaction.summary.cheers, false);
  buildLegend();
  updateCaption();
  layout(true);

  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(wrap);
  // The top bar stays on screen; the controls panel sits below it and fills the rest.
  const topbar = document.querySelector('.topbar');
  const syncTopbar = () => document.documentElement.style.setProperty('--topbar-h', (getComputedStyle(topbar).position === 'sticky' ? topbar.offsetHeight : 0) + 'px');
  if (topbar) { syncTopbar(); if (window.ResizeObserver) new ResizeObserver(syncTopbar).observe(topbar); window.addEventListener('resize', syncTopbar); }
  else window.addEventListener('resize', resize);
  if (window.IntersectionObserver) {
    new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; if (visible) requestDraw(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestDraw(); });
  const onScheme = () => { palette(); buildLegend(); requestDraw(); };
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', onScheme);
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', () => { reduceMotion = reduceMQ.matches; layout(true); });
  if (phoneMQ.addEventListener) phoneMQ.addEventListener('change', () => { document.body.classList.remove('sheet-open'); $('sheetHandle').setAttribute('aria-expanded', 'false'); setTimeout(resize, 30); });

  if (!store.get(STORE.intro)) showIntro();

  // debugging aid for performance checks
  window.__crowd = { frameTimes, figures: () => figures.length, fig: (i) => { const f = figures[i]; const [x, y] = toScreen(f.sx, f.sy); return { x, y, level: f.level }; } };
})();
