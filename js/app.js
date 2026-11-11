// Budge It UI: builds the page from BUDGET_DATA once, then updates it in place
// whenever the player's state changes. All content comes from the data file.
(function () {
  'use strict';

  const D = window.BUDGET_DATA;
  const M = window.BudgetModel;
  const STORE_STATE = 'budgeit.state.v1';
  const STORE_INTRO = 'budgeit.introSeen';
  const STORE_CHALLENGE = 'budgeit.challenge';
  const GROUP_NAMES = { mandatory: 'Mandatory programs', defense: 'Defense', nondefense: 'Everything else', interest: 'Interest' };
  const GROUP_ORDER = ['mandatory', 'defense', 'nondefense', 'interest'];
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ boot / errors

  function showErrors(title, list) {
    const panel = document.getElementById('errorPanel');
    panel.hidden = false;
    panel.innerHTML = '';
    panel.appendChild(el('h1', {}, title));
    panel.appendChild(el('p', {}, 'The game can\'t start until these are fixed:'));
    const ul = el('ul');
    for (const e of list) ul.appendChild(el('li', {}, e));
    panel.appendChild(ul);
  }

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
  const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  if (!M) { showErrors('The budget model did not load', ['js/model.js failed to load.']); return; }
  if (!D) { showErrors('The budget data did not load', ['js/data.js is missing or did not define BUDGET_DATA.']); return; }
  const errors = M.validateData(D);
  if (errors.length) { showErrors('The budget data has problems', errors); return; }

  const F = M.format;
  const meta = D.meta;
  const HH = meta.households;
  const byId = {};
  for (const x of D.spending) byId[x.id] = Object.assign({ _kind: 'spending' }, x);
  for (const x of D.revenue) byId[x.id] = Object.assign({ _kind: 'revenue' }, x);
  const leverById = {};
  for (const l of D.levers) leverById[l.id] = l;
  const leversOf = (parentId) => D.levers.filter((l) => l.parent === parentId);
  const DEFAULTS = M.defaultState(D);
  const groupColor = (g) => `var(--g-${g})`;

  // Per-household framing for a $B amount.
  const perHousehold = (b) => F.signedDollars(b * 1e9 / HH) + ' per household';
  const decimalsOf = (step) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const fmtValue = (l, v) => {
    const n = Number(v).toLocaleString('en-US', { minimumFractionDigits: decimalsOf(l.step), maximumFractionDigits: decimalsOf(l.step) });
    return n + (l.unit || '');
  };
  const fmtPct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';

  // ------------------------------------------------------------ state

  let state = M.defaultState(D);
  let fromHash = false;
  if (location.hash.length > 1) { state = M.decodeState(D, location.hash); fromHash = true; }
  else {
    const saved = store.get(STORE_STATE);
    if (saved !== null) state = M.decodeState(D, saved);
  }
  let result = M.compute(D, state);
  let challengeId = store.get(STORE_CHALLENGE) || '';
  if (!(D.challenges || []).some((c) => c.id === challengeId)) challengeId = '';
  let wasBalanced = result.balanced;

  const updaters = [];
  const onUpdate = (fn) => updaters.push(fn);
  let pending = false;
  function changed() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      result = M.compute(D, state);
      for (const fn of updaters) fn(result);
      store.set(STORE_STATE, M.encodeState(D, state));
      // Once a share code is in the URL, keep it current so a reload never shows a stale plan.
      if (location.hash.length > 1) { try { history.replaceState(null, '', shareUrl()); } catch (e) { /* ignore */ } }
      if (result.balanced && !wasBalanced) celebrate();
      wasBalanced = result.balanced;
    });
  }

  // ------------------------------------------------------------ animated numbers

  const tweens = new WeakMap();
  function animateTo(node, target, formatter, duration = 450) {
    const prev = tweens.get(node);
    const from = prev ? prev.current : target;
    if (prev && prev.raf) cancelAnimationFrame(prev.raf);
    const t = { current: from, raf: 0 };
    tweens.set(node, t);
    if (reduceMotion || from === target || !Number.isFinite(from)) {
      t.current = target; setText(node, formatter(target)); return;
    }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      t.current = from + (target - from) * e;
      setText(node, formatter(t.current));
      if (p < 1) t.raf = requestAnimationFrame(step); else t.raf = 0;
    };
    t.raf = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ scoreboard

  function buildScoreboard() {
    const hero = $('deficitValue'), label = $('deficitLabel'), sub = $('deficitSub');
    const fill = $('gaugeFill'), gauge = $('gauge'), gtext = $('gaugeText');
    const sb = $('scoreboard');
    onUpdate((r) => {
      const surplus = r.deficit < -M.constants.BALANCE_TOLERANCE;
      setText(label, r.balanced ? (surplus ? 'Surplus this year' : 'Balanced budget') : 'Deficit this year');
      animateTo(hero, Math.abs(r.deficit), (v) => (v < 0.5 ? '$0' : F.money(v)));
      sb.classList.toggle('is-balanced', r.balanced);
      const borrowShare = r.deficit > 0 ? Math.round(100 * r.deficit / r.totalSpending) : 0;
      setText(sub, r.balanced
        ? (surplus ? `${F.dollars(-r.deficit * 1e9 / HH)} per household goes to paying down debt` : 'Every dollar spent is a dollar raised')
        : `${F.dollars(r.deficit * 1e9 / HH)} borrowed per household. ${borrowShare}¢ of every dollar spent is borrowed.`);
      const progress = r.baselineDeficit > 0 ? Math.max(0, Math.min(1, 1 - r.deficit / r.baselineDeficit)) : 1;
      const worse = r.deficit > r.baselineDeficit + 0.5;
      fill.style.transform = `scaleX(${progress})`;
      gauge.classList.toggle('is-worse', worse);
      gauge.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      setText(gtext, r.balanced ? 'You did it.'
        : worse ? `${F.money(r.deficit - r.baselineDeficit)} worse than when you started`
        : progress === 0 ? `Starting gap: ${F.money(r.baselineDeficit)}`
        : `${Math.round(progress * 100)}% of the way to balanced`);
      animateTo($('statIn'), r.totalRevenue, F.moneyShort);
      animateTo($('statOut'), r.totalSpending, F.moneyShort);
      const ap = $('statApproval');
      setText(ap, `${Math.round(r.approval.overall)}%`);
      ap.dataset.trend = trend(r.approval.overall - r.approval.baseline, 0.5);
      const jb = $('statJobs');
      setText(jb, Math.abs(r.jobs) < 500 ? 'No change' : F.signedPeople(r.jobs).replace(' million', 'M').replace(' billion', 'B'));
      jb.dataset.trend = trend(r.jobs, 500);
      $('mobileBadge').textContent = r.balanced ? '✓' : '';
    });
  }
  const trend = (x, eps) => (x > eps ? 'up' : x < -eps ? 'down' : 'flat');

  // ------------------------------------------------------------ money flow

  function buildFlow() {
    const inBar = $('flowIn'), outBar = $('flowOut');
    const segs = [];
    const mk = (bar, item, cls, color) => {
      const b = el('button', { type: 'button', class: 'seg ' + cls },
        el('span', { class: 'seg-icon', 'aria-hidden': 'true' }, item.icon || ''),
        el('span', { class: 'seg-name' }, item.name),
        el('span', { class: 'seg-amt' }));
      if (color) b.style.setProperty('--seg', color);
      b.addEventListener('click', () => jumpTo(item.id));
      bar.appendChild(b);
      const s = { node: b, item, amt: b.querySelector('.seg-amt') };
      segs.push(s);
      return s;
    };
    const revSegs = D.revenue.map((r) => mk(inBar, r, 'seg-rev'));
    const borrow = el('div', { class: 'seg seg-borrow', role: 'img' }, el('span', { class: 'seg-name' }, 'Borrowed'), el('span', { class: 'seg-amt' }));
    inBar.appendChild(borrow);
    const sortedSpend = D.spending.slice().sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.baseline - a.baseline);
    const spendSegs = sortedSpend.map((s) => mk(outBar, s, 'seg-spend', groupColor(s.group)));
    const surplus = el('div', { class: 'seg seg-surplus', role: 'img' }, el('span', { class: 'seg-name' }, 'Surplus'), el('span', { class: 'seg-amt' }));
    outBar.appendChild(surplus);

    const legend = $('flowLegend');
    legend.appendChild(el('li', {}, el('span', { class: 'sw sw-rev' }), 'Revenue'));
    for (const g of GROUP_ORDER) {
      if (!D.spending.some((s) => s.group === g)) continue;
      const sw = el('span', { class: 'sw' }); sw.style.background = groupColor(g);
      legend.appendChild(el('li', {}, sw, GROUP_NAMES[g]));
    }
    legend.appendChild(el('li', {}, el('span', { class: 'sw sw-borrow' }), 'Borrowed'));
    window.addEventListener('resize', changed);

    onUpdate((r) => {
      const scale = Math.max(r.totalSpending, r.totalRevenue);
      const barPx = inBar.clientWidth || 600;
      const place = (s, amount, title) => {
        const pct = Math.max(0, amount) / scale * 100;
        const px = pct * barPx / 100;
        s.node.style.flexGrow = String(pct);
        s.node.classList.toggle('is-narrow', px < 78);
        s.node.classList.toggle('is-tiny', px < 40);
        setText(s.amt, F.moneyShort(amount));
        const t = `${title}: ${F.money(amount)}`;
        s.node.title = t; s.node.setAttribute('aria-label', t + '. Show controls.');
      };
      for (const s of revSegs) place(s, r.revenueById[s.item.id], s.item.name);
      for (const s of spendSegs) place(s, r.spendingById[s.item.id], s.item.name);
      const gap = r.totalSpending - r.totalRevenue;
      const bw = Math.max(0, gap) / scale * 100;
      borrow.style.flexGrow = String(bw);
      borrow.hidden = bw < 0.05;
      borrow.classList.toggle('is-tiny', bw * barPx / 100 < 40);
      borrow.classList.toggle('is-narrow', bw * barPx / 100 < 90);
      setText(borrow.lastChild, F.moneyShort(Math.max(0, gap)));
      borrow.setAttribute('aria-label', `Borrowed: ${F.money(Math.max(0, gap))}`);
      borrow.title = `Borrowed to cover the gap: ${F.money(Math.max(0, gap))}`;
      const sw = Math.max(0, -gap) / scale * 100;
      surplus.style.flexGrow = String(sw);
      surplus.hidden = sw < 0.05;
      surplus.classList.toggle('is-narrow', sw * barPx / 100 < 90);
      surplus.classList.toggle('is-tiny', sw * barPx / 100 < 40);
      setText(surplus.lastChild, F.moneyShort(Math.max(0, -gap)));
      surplus.setAttribute('aria-label', `Surplus: ${F.money(Math.max(0, -gap))}`);
    });
  }

  function jumpTo(id) {
    const item = byId[id];
    if (!item) return;
    selectTab(item._kind === 'revenue' ? 'revenue' : 'spending');
    if (item._kind === 'spending') selectGroup('all');
    setView('controls');
    const card = $('card-' + id);
    if (!card) return;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    const focusable = card.querySelector('input, button');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), reduceMotion ? 0 : 400);
  }

  // ------------------------------------------------------------ tabs / filters / views

  function selectTab(which) {
    const sp = which === 'spending';
    $('tabSpending').setAttribute('aria-selected', String(sp));
    $('tabRevenue').setAttribute('aria-selected', String(!sp));
    $('tabSpending').tabIndex = sp ? 0 : -1;
    $('tabRevenue').tabIndex = sp ? -1 : 0;
    $('panelSpending').hidden = !sp;
    $('panelRevenue').hidden = sp;
  }
  function buildTabs() {
    const tabs = [$('tabSpending'), $('tabRevenue')];
    tabs[0].addEventListener('click', () => selectTab('spending'));
    tabs[1].addEventListener('click', () => selectTab('revenue'));
    for (const t of tabs) t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = t === tabs[0] ? tabs[1] : tabs[0];
      next.click(); next.focus();
    });
    const chips = $('groupChips');
    const groups = ['all'].concat(GROUP_ORDER.filter((g) => D.spending.some((s) => s.group === g)));
    for (const g of groups) {
      chips.appendChild(el('button', { type: 'button', class: 'chip', 'data-group': g, 'aria-pressed': String(g === 'all'), onclick: () => selectGroup(g) },
        g === 'all' ? 'All' : GROUP_NAMES[g]));
    }
  }
  function selectGroup(g) {
    for (const c of $('groupChips').children) c.setAttribute('aria-pressed', String(c.dataset.group === g));
    for (const card of $('spendingCards').children) card.hidden = g !== 'all' && card.dataset.group !== g;
  }
  function setView(v) {
    $('layout').dataset.view = v;
    $('viewControls').setAttribute('aria-pressed', String(v === 'controls'));
    $('viewEffects').setAttribute('aria-pressed', String(v === 'effects'));
    changed(); // re-measure things that were hidden
  }
  function buildViews() {
    $('viewControls').addEventListener('click', () => { setView('controls'); $('controls').scrollIntoView({ block: 'start' }); });
    $('viewEffects').addEventListener('click', () => { setView('effects'); $('effects').scrollIntoView({ block: 'start' }); });
  }

  // ------------------------------------------------------------ control cards

  function rangeInput(id, min, max, step, value, label) {
    return el('input', { type: 'range', id, min, max, step, value, 'aria-label': label });
  }

  function buildLever(l) {
    const wrap = el('div', { class: 'lever lever-' + l.type, id: 'lever-' + l.id });
    const inputId = 'in-' + l.id;
    const yieldOut = el('span', { class: 'lever-yield' });
    const story = el('p', { class: 'story', hidden: true });
    const source = l.source ? el('p', { class: 'source' }, 'Estimate: ', l.source) : null;
    let input, valueOut, resetBtn;
    if (l.type === 'slider') {
      valueOut = el('output', { class: 'lever-value', for: inputId });
      input = rangeInput(inputId, l.min, l.max, l.step, state.levers[l.id], l.name);
      const tick = el('span', { class: 'law-tick', 'aria-hidden': 'true', title: 'Current law' });
      tick.style.setProperty('--p', String((l.current - l.min) / (l.max - l.min)));
      const lawLabel = el('span', { class: 'law-label' }, `Current law: ${fmtValue(l, l.current)}`);
      resetBtn = el('button', { type: 'button', class: 'mini-reset', 'aria-label': `Reset ${l.name} to current law` }, 'Reset');
      wrap.append(
        el('div', { class: 'lever-head' }, el('label', { for: inputId, class: 'lever-name' }, l.name), valueOut),
        l.blurb ? el('p', { class: 'lever-blurb' }, l.blurb) : null,
        el('div', { class: 'range-wrap' }, input, tick),
        el('div', { class: 'lever-foot' }, lawLabel, yieldOut, resetBtn),
        story, source);
      input.addEventListener('input', () => { state.levers[l.id] = Number(input.value); changed(); });
      resetBtn.addEventListener('click', () => { state.levers[l.id] = l.current; input.value = l.current; changed(); });
    } else {
      input = el('input', { type: 'checkbox', role: 'switch', id: inputId, class: 'switch-input' });
      input.checked = !!state.levers[l.id];
      wrap.append(
        el('div', { class: 'lever-head' },
          el('label', { for: inputId, class: 'switch' }, input, el('span', { class: 'switch-track', 'aria-hidden': 'true' }), el('span', { class: 'lever-name' }, l.name))),
        l.blurb ? el('p', { class: 'lever-blurb' }, l.blurb) : null,
        el('div', { class: 'lever-foot' }, yieldOut),
        story, source);
      input.addEventListener('change', () => { state.levers[l.id] = input.checked; changed(); });
    }
    const yieldWord = (y) => {
      if (Math.abs(y) < 0.05) return 'No budget change';
      const deficitDown = l.side === 'revenue' ? y > 0 : y < 0;
      const what = l.side === 'revenue' ? (y > 0 ? 'Raises' : 'Loses') : (y < 0 ? 'Saves' : 'Costs');
      return { text: `${what} ${F.money(Math.abs(y))} a year (${F.dollars(Math.abs(y) * 1e9 / HH)} per household)`, good: deficitDown };
    };
    const toggleFull = l.type === 'toggle' ? M.leverYield(l, true) : 0;
    onUpdate((r) => {
      const v = state.levers[l.id];
      if (l.type === 'slider') {
        if (Number(input.value) !== v) input.value = v;
        setText(valueOut, fmtValue(l, v));
        resetBtn.disabled = v === l.current;
      } else if (input.checked !== v) input.checked = v;
      const y = r.leverYield[l.id];
      const yw = l.type === 'toggle' && !v ? yieldWord(toggleFull) : yieldWord(y);
      if (typeof yw === 'string') { setText(yieldOut, yw); yieldOut.dataset.tone = ''; }
      else {
        setText(yieldOut, (l.type === 'toggle' && !v ? 'If on: ' : '') + yw.text);
        yieldOut.dataset.tone = l.type === 'toggle' && !v ? '' : (yw.good ? 'good' : 'bad');
      }
      const st = r.storyById[l.id];
      story.hidden = !st;
      if (st) setText(story, st);
      wrap.classList.toggle('is-changed', l.type === 'toggle' ? !!v : v !== l.current);
    });
    return wrap;
  }

  function buildSpendingCard(s) {
    const card = el('article', { class: 'card card-spend' + (s.locked ? ' is-locked' : ''), id: 'card-' + s.id, 'data-group': s.group, tabindex: '-1' });
    card.style.setProperty('--seg', groupColor(s.group));
    const now = el('span', { class: 'card-now' });
    const delta = el('span', { class: 'card-delta' });
    const head = el('header', { class: 'card-head' },
      el('span', { class: 'card-icon', 'aria-hidden': 'true' }, s.icon || ''),
      el('div', { class: 'card-titles' },
        el('h3', { class: 'card-name' }, s.name),
        el('span', { class: 'card-group' }, GROUP_NAMES[s.group] || s.group)),
      el('div', { class: 'card-money' }, now, delta));
    card.append(head);
    if (s.blurb) card.append(el('p', { class: 'card-blurb' }, s.blurb));
    if (s.facts && s.facts.length) card.append(el('ul', { class: 'facts' }, s.facts.map((f) => el('li', {}, f))));

    const story = el('p', { class: 'story', hidden: true });
    let input, out, effect, resetBtn;
    if (s.locked) {
      card.append(el('p', { class: 'locked-note' },
        'You can\'t set this one directly. It is what the government owes lenders on past borrowing, so it falls when your plan borrows less and rises when it borrows more.'));
      effect = el('p', { class: 'main-effect' });
      card.append(effect);
    } else {
      const inputId = 'in-' + s.id;
      out = el('output', { class: 'main-value', for: inputId });
      input = rangeInput(inputId, s.min, s.max, s.step, state.spending[s.id], `Change ${s.name} funding, percent`);
      const tick = el('span', { class: 'law-tick', 'aria-hidden': 'true' });
      tick.style.setProperty('--p', String((0 - s.min) / (s.max - s.min)));
      effect = el('p', { class: 'main-effect' });
      resetBtn = el('button', { type: 'button', class: 'mini-reset', 'aria-label': `Reset ${s.name}` }, 'Reset');
      card.append(
        el('div', { class: 'main-control' },
          el('div', { class: 'main-head' }, el('label', { for: inputId }, 'Change funding'), out),
          el('div', { class: 'range-wrap' }, input, tick),
          el('div', { class: 'range-ends', 'aria-hidden': 'true' }, el('span', {}, fmtPct(s.min)), el('span', {}, 'Today'), el('span', {}, fmtPct(s.max))),
          el('div', { class: 'main-foot' }, effect, resetBtn)));
      input.addEventListener('input', () => { state.spending[s.id] = Number(input.value); changed(); });
      resetBtn.addEventListener('click', () => { state.spending[s.id] = 0; input.value = 0; changed(); });
    }
    card.append(story);
    const levers = leversOf(s.id);
    if (levers.length) card.append(el('div', { class: 'levers' }, el('h4', { class: 'levers-title' }, 'Specific reforms'), levers.map(buildLever)));

    onUpdate((r) => {
      const amount = r.spendingById[s.id];
      animateTo(now, amount, F.money);
      const d = amount - s.baseline;
      setText(delta, Math.abs(d) < 0.05 ? `Was ${F.money(s.baseline)}` : `${F.signedMoney(d)} from ${F.money(s.baseline)}`);
      delta.dataset.tone = Math.abs(d) < 0.05 ? '' : d < 0 ? 'good' : 'bad';
      if (s.locked) {
        setText(effect, Math.abs(r.interestChange) < 0.05 ? 'Unchanged so far.' :
          `${r.interestChange < 0 ? 'Down' : 'Up'} ${F.money(Math.abs(r.interestChange))} this year because of your plan, and the change compounds over time.`);
      } else {
        const v = state.spending[s.id];
        if (Number(input.value) !== v) input.value = v;
        setText(out, v === 0 ? 'No change' : fmtPct(v));
        const dollars = s.baseline * v / 100;
        setText(effect, v === 0 ? `${F.money(s.baseline)} a year now` : `${F.signedMoney(dollars)} a year, ${perHousehold(dollars)}`);
        effect.dataset.tone = v === 0 ? '' : v < 0 ? 'good' : 'bad';
        resetBtn.disabled = v === 0 && levers.every((l) => state.levers[l.id] === DEFAULTS.levers[l.id]);
      }
      const st = r.storyById[s.id];
      story.hidden = !st;
      if (st) setText(story, st);
      card.classList.toggle('is-changed', Math.abs(d) >= 0.05 && !s.locked);
    });
    if (!s.locked) {
      // Card reset also resets its reforms.
      resetBtn.addEventListener('click', () => { for (const l of levers) state.levers[l.id] = DEFAULTS.levers[l.id]; changed(); });
    }
    return card;
  }

  function buildRevenueCard(rv) {
    const card = el('article', { class: 'card card-rev', id: 'card-' + rv.id, tabindex: '-1' });
    const now = el('span', { class: 'card-now' });
    const delta = el('span', { class: 'card-delta' });
    card.append(el('header', { class: 'card-head' },
      el('span', { class: 'card-icon', 'aria-hidden': 'true' }, rv.icon || ''),
      el('div', { class: 'card-titles' }, el('h3', { class: 'card-name' }, rv.name), el('span', { class: 'card-group' }, 'Revenue')),
      el('div', { class: 'card-money' }, now, delta)));
    if (rv.blurb) card.append(el('p', { class: 'card-blurb' }, rv.blurb));
    if (rv.facts && rv.facts.length) card.append(el('ul', { class: 'facts' }, rv.facts.map((f) => el('li', {}, f))));
    const levers = leversOf(rv.id);
    if (levers.length) card.append(el('div', { class: 'levers' }, el('h4', { class: 'levers-title' }, 'Your options'), levers.map(buildLever)));
    else card.append(el('p', { class: 'locked-note' }, 'No options for this one yet. It still moves with the economy.'));
    onUpdate((r) => {
      const amount = r.revenueById[rv.id];
      animateTo(now, amount, F.money);
      const d = amount - rv.baseline;
      setText(delta, Math.abs(d) < 0.05 ? `Was ${F.money(rv.baseline)}` : `${F.signedMoney(d)} from ${F.money(rv.baseline)}`);
      delta.dataset.tone = Math.abs(d) < 0.05 ? '' : d > 0 ? 'good' : 'bad';
      card.classList.toggle('is-changed', levers.some((l) => r.leverYield[l.id] !== 0));
    });
    return card;
  }

  function buildControls() {
    const sc = $('spendingCards');
    const sorted = D.spending.slice().sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.baseline - a.baseline);
    for (const s of sorted) sc.appendChild(buildSpendingCard(s));
    const rc = $('revenueCards');
    for (const r of D.revenue.slice().sort((a, b) => b.baseline - a.baseline)) rc.appendChild(buildRevenueCard(r));
  }

  // ------------------------------------------------------------ front page

  function buildFrontPage() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const m = /^(\d{4})-(\d{2})/.exec(meta.asOf || '');
    $('mastDate').textContent = m ? `${months[Number(m[2]) - 1]} ${m[1]} edition` : `Fiscal year ${meta.fiscalYear}`;
    const h = $('headline'), list = $('storyList');
    const items = [];
    for (let i = 0; i < 3; i++) {
      const li = el('li', { hidden: true }, el('span', { class: 'story-icon', 'aria-hidden': 'true' }), el('span', { class: 'story-body' }, el('strong'), el('span')));
      list.appendChild(li); items.push(li);
    }
    const empty = el('li', { class: 'story-empty' }, 'Nothing yet. Make a move and the papers will cover it.');
    list.appendChild(empty);
    let lastHeadline = null;
    onUpdate((r) => {
      const text = r.headline ? r.headline.text : (r.balanced ? 'Budget balanced' : 'Congress weighs the budget');
      if (text !== lastHeadline) {
        h.textContent = text;
        if (lastHeadline !== null && !reduceMotion) { h.classList.remove('stamp'); void h.offsetWidth; h.classList.add('stamp'); }
        lastHeadline = text;
      }
      const top = r.activeStories.slice(0, 3);
      items.forEach((li, i) => {
        const s = top[i];
        li.hidden = !s;
        if (!s) return;
        setText(li.firstChild, s.icon || '');
        setText(li.lastChild.firstChild, `${s.name}. `);
        setText(li.lastChild.lastChild, s.text);
      });
      empty.hidden = top.length > 0;
    });
  }

  // ------------------------------------------------------------ kitchen table

  function buildPersonas() {
    const box = $('personas');
    for (const p of D.personas) {
      const delta = el('span', { class: 'persona-delta' });
      const pct = el('span', { class: 'persona-pct' });
      const list = el('ul', { class: 'breakdown' });
      const det = el('details', { class: 'persona-why' }, el('summary', {}, 'What’s driving this'), list);
      const card = el('article', { class: 'persona', id: 'persona-' + p.id },
        el('div', { class: 'persona-top' },
          el('span', { class: 'persona-icon', 'aria-hidden': 'true' }, p.icon || ''),
          el('div', {}, el('h3', { class: 'persona-name' }, p.name), el('p', { class: 'persona-tag' }, p.tagline || ''))),
        el('div', { class: 'persona-change' }, delta, el('span', { class: 'persona-unit' }, 'a year'), pct),
        p.detail ? el('details', { class: 'persona-about' }, el('summary', {}, 'Who they are'), el('p', { class: 'persona-detail' }, p.detail)) : null,
        el('dl', { class: 'persona-facts' },
          el('div', {}, el('dt', {}, 'Income'), el('dd', {}, F.dollars(p.income))),
          el('div', {}, el('dt', {}, 'Federal taxes now'), el('dd', {}, F.dollars(p.federalTaxes))),
          el('div', {}, el('dt', {}, 'Federal benefits now'), el('dd', {}, F.dollars(p.federalBenefits)))),
        det);
      box.appendChild(card);
      onUpdate((r) => {
        const pr = r.personas[p.id];
        animateTo(delta, pr.delta, (v) => (Math.abs(v) < 0.5 ? '$0' : F.signedDollars(v)));
        card.dataset.tone = pr.delta > 0.5 ? 'good' : pr.delta < -0.5 ? 'bad' : '';
        setText(pct, p.income > 0 && Math.abs(pr.delta) >= 0.5 ? `${F.percent(100 * Math.abs(pr.delta) / p.income)} of income` : 'No change yet');
        det.hidden = pr.breakdown.length === 0;
        list.replaceChildren(...pr.breakdown.slice(0, 8).map((b) =>
          el('li', { 'data-tone': b.amount > 0 ? 'good' : 'bad' }, el('span', {}, `${b.icon ? b.icon + ' ' : ''}${b.name}`), el('span', { class: 'num' }, F.signedDollars(b.amount)))));
      });
    }
  }

  // ------------------------------------------------------------ approval

  function buildApproval() {
    const ov = $('approvalOverall');
    const ovNum = el('span', { class: 'ap-num' });
    const ovBar = el('div', { class: 'ap-meter' }, el('div', { class: 'ap-fill' }), el('span', { class: 'ap-tick' }));
    const ovNote = el('span', { class: 'ap-note' });
    ov.append(el('div', { class: 'ap-head' }, el('span', { class: 'ap-label' }, 'Overall approval'), ovNum), ovBar, ovNote);
    const baseO = M.compute(D, M.defaultState(D)).approval.baseline;
    ovBar.lastChild.style.left = baseO + '%';
    const rows = $('blocs');
    const blocRows = D.blocs.map((b) => {
      const num = el('span', { class: 'bloc-num' });
      const fill = el('div', { class: 'bloc-fill' });
      const tick = el('span', { class: 'bloc-tick', title: 'Where they started' });
      tick.style.left = b.baselineApproval + '%';
      const why = el('p', { class: 'bloc-why' });
      const row = el('div', { class: 'bloc' },
        el('div', { class: 'bloc-head' }, el('span', { class: 'bloc-name' }, `${b.icon ? b.icon + ' ' : ''}${b.name}`), num),
        el('div', { class: 'bloc-bar', role: 'meter', 'aria-label': `${b.name} approval`, 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill, tick),
        why);
      rows.appendChild(row);
      return { b, num, fill, why, row };
    });
    onUpdate((r) => {
      const o = r.approval.overall;
      setText(ovNum, `${Math.round(o)}%`);
      ovBar.firstChild.style.transform = `scaleX(${o / 100})`;
      const dO = o - r.approval.baseline;
      setText(ovNote, Math.abs(dO) < 0.5 ? `Where it started: ${Math.round(r.approval.baseline)}%` : `${dO > 0 ? 'Up' : 'Down'} ${Math.abs(dO).toFixed(0)} points since you started`);
      for (const x of blocRows) {
        const br = r.approval.byBloc[x.b.id];
        setText(x.num, `${Math.round(br.value)}%`);
        x.fill.style.transform = `scaleX(${br.value / 100})`;
        x.row.dataset.tone = br.delta > 0.5 ? 'good' : br.delta < -0.5 ? 'bad' : '';
        x.row.querySelector('.bloc-bar').setAttribute('aria-valuenow', String(Math.round(br.value)));
        const top = br.drivers.filter((d) => Math.abs(d.points) >= 0.5).slice(0, 2);
        setText(x.why, top.length ? top.map((d) => `${d.name} ${d.points > 0 ? '+' : '−'}${Math.abs(d.points).toFixed(0)}`).join(', ') : '');
      }
    });
  }

  // ------------------------------------------------------------ nation metrics

  function buildMetrics() {
    const box = $('metrics');
    for (const m of D.metrics) {
      const val = el('span', { class: 'metric-val' });
      const dl = el('span', { class: 'metric-delta' });
      const tile = el('div', { class: 'metric' },
        el('span', { class: 'metric-icon', 'aria-hidden': 'true' }, m.icon || ''),
        el('span', { class: 'metric-name' }, m.name), val, dl);
      box.appendChild(tile);
      onUpdate((r) => {
        const mr = r.metrics[m.id];
        setText(val, F.metric(mr.value, m.format));
        const tiny = Math.abs(mr.delta) < (m.format === 'percent' ? 0.05 : 0.5);
        const good = (mr.delta < 0) === (m.goodDirection === 'down');
        tile.dataset.tone = tiny ? '' : good ? 'good' : 'bad';
        setText(dl, tiny ? 'No change' : `${mr.delta > 0 ? '▲' : '▼'} ${F.signedMetric(mr.delta, m.format)}`);
      });
    }
    // GDP tile: generic engine output, not content.
    const gv = el('span', { class: 'metric-val' }), gd = el('span', { class: 'metric-delta' });
    const gt = el('div', { class: 'metric' }, el('span', { class: 'metric-icon', 'aria-hidden': 'true' }, '\u{1F4C8}'), el('span', { class: 'metric-name' }, 'Economy (GDP), short run'), gv, gd);
    box.appendChild(gt);
    onUpdate((r) => {
      setText(gv, F.percent(r.gdpPct, 2));
      const tiny = Math.abs(r.gdpPct) < 0.005;
      gt.dataset.tone = tiny ? '' : r.gdpPct > 0 ? 'good' : 'bad';
      setText(gd, tiny ? 'No change' : `${r.jobs > 0 ? '▲' : '▼'} ${F.signedPeople(r.jobs)} jobs`);
    });
  }

  // ------------------------------------------------------------ outlook chart

  function buildChart() {
    let W = 600, H = 250;
    const P = { l: 44, r: 52, t: 16, b: 30 };
    const NS = 'http://www.w3.org/2000/svg';
    const s = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); return n; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-labelledby': 'chartDesc' });
    const desc = s('desc', { id: 'chartDesc' });
    const grid = s('g', { class: 'grid' }), axis = s('g', { class: 'axis' });
    const baseLine = s('path', { class: 'line line-base' }), planLine = s('path', { class: 'line line-plan' });
    const baseLab = s('text', { class: 'end-label' }), planLab = s('text', { class: 'end-label end-plan' });
    const cross = s('line', { class: 'crosshair', y1: P.t, y2: H - P.b, visibility: 'hidden' });
    const dotB = s('circle', { r: 4, class: 'dot dot-base', visibility: 'hidden' });
    const dotP = s('circle', { r: 4, class: 'dot dot-plan', visibility: 'hidden' });
    const hit = s('rect', { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: 'transparent' });
    svg.append(desc, grid, axis, baseLine, planLine, baseLab, planLab, cross, dotB, dotP, hit);
    const tip = el('div', { class: 'chart-tip', hidden: true });
    const legend = el('ul', { class: 'chart-legend' },
      el('li', {}, el('span', { class: 'lg lg-base' }), 'Current law'),
      el('li', {}, el('span', { class: 'lg lg-plan' }), 'Your plan'));
    const table = el('table', { class: 'chart-table' });
    const tdet = el('details', { class: 'chart-data' }, el('summary', {}, 'Show as a table'), table);
    const box = $('chart');
    box.append(legend, el('div', { class: 'chart-frame' }, svg, tip), tdet);

    let pts = null, xs = null, yScale = null;
    function render(r) {
      const start = { year: meta.fiscalYear, baselineDebtPctGdp: 100 * meta.debtHeldByPublic / meta.gdp, planDebtPctGdp: 100 * meta.debtHeldByPublic / meta.gdp, baselineDebt: meta.debtHeldByPublic, planDebt: meta.debtHeldByPublic };
      pts = [start].concat(r.projection);
      const vals = pts.flatMap((p) => [p.baselineDebtPctGdp, p.planDebtPctGdp]);
      let lo = Math.floor(Math.min(...vals) / 10) * 10, hi = Math.ceil(Math.max(...vals) / 10) * 10;
      if (hi - lo < 20) { hi += 10; lo = Math.max(0, lo - 10); }
      // Size the viewBox to the real width so text stays at its CSS size.
      W = Math.max(300, Math.min(720, box.clientWidth || 600));
      H = W < 480 ? 220 : 250;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      cross.setAttribute('y2', H - P.b);
      hit.setAttribute('width', W - P.l - P.r); hit.setAttribute('height', H - P.t - P.b);
      const x = (i) => P.l + i * (W - P.l - P.r) / (pts.length - 1);
      const y = (v) => P.t + (hi - v) / (hi - lo) * (H - P.t - P.b);
      xs = pts.map((_, i) => x(i)); yScale = y;
      grid.replaceChildren(); axis.replaceChildren();
      const stepV = (hi - lo) > 60 ? 20 : 10;
      for (let v = lo; v <= hi + 1e-9; v += stepV) {
        grid.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v) }));
        const t = s('text', { x: P.l - 8, y: y(v) + 4, 'text-anchor': 'end' }); t.textContent = F.percent(v, 0); axis.appendChild(t);
      }
      pts.forEach((p, i) => {
        if (i % 2 && i !== pts.length - 1) return;
        const t = s('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }); t.textContent = String(p.year); axis.appendChild(t);
      });
      const path = (key) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
      baseLine.setAttribute('d', path('baselineDebtPctGdp'));
      planLine.setAttribute('d', path('planDebtPctGdp'));
      const last = pts[pts.length - 1];
      let yb = y(last.baselineDebtPctGdp), yp = y(last.planDebtPctGdp);
      if (Math.abs(yb - yp) < 14) { const mid = (yb + yp) / 2; const up = yp <= yb; yp = mid + (up ? -7 : 7); yb = mid + (up ? 7 : -7); }
      baseLab.setAttribute('x', W - P.r + 6); baseLab.setAttribute('y', yb + 4); baseLab.textContent = `${F.percent(last.baselineDebtPctGdp, 0)}`;
      planLab.setAttribute('x', W - P.r + 6); planLab.setAttribute('y', yp + 4); planLab.textContent = `${F.percent(last.planDebtPctGdp, 0)}`;
      const better = last.planDebtPctGdp < last.baselineDebtPctGdp - 0.5, worse = last.planDebtPctGdp > last.baselineDebtPctGdp + 0.5;
      svg.dataset.tone = better ? 'good' : worse ? 'bad' : '';
      desc.textContent = `Debt reaches ${F.percent(last.baselineDebtPctGdp, 0)} of GDP by ${last.year} under current law and ${F.percent(last.planDebtPctGdp, 0)} under your plan.`;
      table.replaceChildren(
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Year'), el('th', { scope: 'col' }, 'Current law'), el('th', { scope: 'col' }, 'Your plan'))),
        el('tbody', {}, pts.map((p) => el('tr', {}, el('th', { scope: 'row' }, String(p.year)),
          el('td', {}, `${F.percent(p.baselineDebtPctGdp)} (${F.moneyShort(p.baselineDebt)})`),
          el('td', {}, `${F.percent(p.planDebtPctGdp)} (${F.moneyShort(p.planDebt)})`)))));
    }
    function hover(evt) {
      if (!pts) return;
      const rect = svg.getBoundingClientRect();
      const px = (evt.clientX - rect.left) * W / rect.width;
      let i = 0, best = Infinity;
      xs.forEach((xv, k) => { const d = Math.abs(xv - px); if (d < best) { best = d; i = k; } });
      const p = pts[i];
      cross.setAttribute('x1', xs[i]); cross.setAttribute('x2', xs[i]); cross.setAttribute('visibility', 'visible');
      dotB.setAttribute('cx', xs[i]); dotB.setAttribute('cy', yScale(p.baselineDebtPctGdp)); dotB.setAttribute('visibility', 'visible');
      dotP.setAttribute('cx', xs[i]); dotP.setAttribute('cy', yScale(p.planDebtPctGdp)); dotP.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.replaceChildren(el('strong', {}, String(p.year)),
        el('span', {}, `Current law: ${F.percent(p.baselineDebtPctGdp)}`),
        el('span', {}, `Your plan: ${F.percent(p.planDebtPctGdp)} (${F.moneyShort(p.planDebt)})`));
      const left = xs[i] / W * rect.width;
      tip.style.left = Math.min(rect.width - 170, Math.max(0, left - 85)) + 'px';
    }
    const hide = () => { tip.hidden = true; for (const n of [cross, dotB, dotP]) n.setAttribute('visibility', 'hidden'); };
    hit.addEventListener('pointermove', hover);
    hit.addEventListener('pointerdown', hover);
    hit.addEventListener('pointerleave', hide);
    onUpdate(render);
  }

  // ------------------------------------------------------------ plan summary

  function describeChange(c) {
    if (c.kind === 'spending') return `${c.name} ${fmtPct(c.value)}`;
    const l = leverById[c.id];
    if (l.type === 'toggle') return l.name;
    return `${l.name}: ${fmtValue(l, l.current)} to ${fmtValue(l, c.value)}`;
  }
  function planMix(r) {
    let taxUp = 0, taxDown = 0, cuts = 0, adds = 0;
    for (const c of r.changes) {
      if (c.side === 'revenue') { if (c.dollars > 0) taxUp += c.dollars; else taxDown -= c.dollars; }
      else if (c.dollars < 0) cuts -= c.dollars; else adds += c.dollars;
    }
    return { taxUp, taxDown, cuts, adds };
  }
  function buildPlan() {
    const totals = $('planTotals'), list = $('planList');
    const cells = {};
    for (const [k, label] of [['cuts', 'Spending cut'], ['adds', 'Spending added'], ['taxUp', 'Taxes raised'], ['taxDown', 'Taxes cut']]) {
      const v = el('span', { class: 'pt-val' });
      totals.appendChild(el('div', { class: 'pt', 'data-k': k }, el('span', { class: 'pt-label' }, label), v));
      cells[k] = v;
    }
    onUpdate((r) => {
      const mix = planMix(r);
      for (const k of Object.keys(cells)) setText(cells[k], F.moneyShort(mix[k]));
      if (!r.changes.length) { list.replaceChildren(el('li', { class: 'plan-empty' }, 'No changes yet. Your moves will be listed here, biggest first.')); return; }
      list.replaceChildren(...r.changes.slice(0, 15).map((c) => {
        const btn = el('button', { type: 'button', class: 'plan-item', onclick: () => jumpTo(c.parent) },
          el('span', { class: 'plan-icon', 'aria-hidden': 'true' }, c.icon || ''),
          el('span', { class: 'plan-what' }, describeChange(c)),
          el('span', { class: 'plan-amt', 'data-tone': c.deficitImpact < 0 ? 'good' : 'bad' },
            `${c.side === 'revenue' ? (c.dollars > 0 ? 'Raises' : 'Loses') : (c.dollars < 0 ? 'Saves' : 'Costs')} ${F.moneyShort(Math.abs(c.dollars))}`));
        return el('li', {}, btn);
      }));
      if (r.changes.length > 15) list.appendChild(el('li', { class: 'plan-more' }, `And ${r.changes.length - 15} smaller changes.`));
    });
    $('shareBtn').addEventListener('click', share);
    $('winShare').addEventListener('click', share);
    $('resetAllBtn').addEventListener('click', () => {
      if (!result.changes.length) return;
      if (!window.confirm('Undo every change and go back to current law?')) return;
      state = M.defaultState(D);
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      changed();
      toast('Back to current law.');
    });
  }

  function shareUrl() {
    const code = M.encodeState(D, state);
    return location.href.split('#')[0] + (code ? '#' + code : '');
  }
  function share() {
    const url = shareUrl();
    try { history.replaceState(null, '', url); } catch (e) { /* file:// in some browsers */ }
    const out = $('shareOut'), input = $('shareUrl');
    input.value = url;
    const fallback = () => { out.hidden = false; input.focus(); input.select(); toast('Copy the link from the box below the buttons.'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => { out.hidden = false; toast('Link copied. Anyone who opens it sees your plan.'); }, fallback);
    } else {
      try {
        out.hidden = false; input.select();
        if (document.execCommand && document.execCommand('copy')) toast('Link copied. Anyone who opens it sees your plan.');
        else fallback();
      } catch (e) { fallback(); }
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ------------------------------------------------------------ challenges

  function ruleLines(rules) {
    const out = [];
    const name = (id) => (byId[id] ? byId[id].name : id);
    if (rules.noTaxIncreases) out.push(['noTaxIncreases', 'No tax increases']);
    if (rules.noSpendingCuts) out.push(['noSpendingCuts', 'No spending cuts']);
    if (Array.isArray(rules.protect) && rules.protect.length) out.push(['protect', `Don't cut ${rules.protect.map(name).join(', ')}`]);
    if (typeof rules.minApproval === 'number') out.push(['minApproval', `Keep approval at ${rules.minApproval}% or higher`]);
    if (typeof rules.maxUnemploymentJobsLost === 'number') out.push(['maxUnemploymentJobsLost', `Lose no more than ${F.people(rules.maxUnemploymentJobsLost)} jobs`]);
    return out;
  }
  function buildChallenges() {
    const sel = $('challengeSelect'), body = $('challengeBody');
    const list = D.challenges || [];
    sel.appendChild(el('option', { value: '' }, 'Free play: just balance it'));
    for (const c of list) sel.appendChild(el('option', { value: c.id }, `${c.icon ? c.icon + ' ' : ''}${c.name}`));
    sel.value = challengeId;
    if (!list.length) sel.closest('.panel').hidden = true;
    sel.addEventListener('change', () => { challengeId = sel.value; store.set(STORE_CHALLENGE, challengeId); changed(); });
    onUpdate((r) => {
      const c = list.find((x) => x.id === challengeId);
      if (!c) {
        body.replaceChildren(el('p', { class: 'ch-status', 'data-tone': r.balanced ? 'good' : '' }, r.balanced ? 'Balanced. Try a challenge for a harder run.' : 'Goal: get the deficit to zero, any way you like.'));
        return;
      }
      const res = M.checkChallenge(D, state, r, c);
      const lines = ruleLines(c.rules || {}).map(([k, text]) => {
        const broken = !!res.broken[k];
        return el('li', { 'data-ok': String(!broken) }, el('span', { class: 'ch-mark', 'aria-hidden': 'true' }, broken ? '✗' : '✓'), text, el('span', { class: 'sr-only' }, broken ? ' (broken)' : ' (kept)'));
      });
      lines.push(el('li', { 'data-ok': String(r.balanced) }, el('span', { class: 'ch-mark', 'aria-hidden': 'true' }, r.balanced ? '✓' : '•'), 'Balance the budget', el('span', { class: 'sr-only' }, r.balanced ? ' (done)' : ' (not yet)')));
      fill(body,
        c.blurb ? el('p', { class: 'ch-blurb' }, c.blurb) : null,
        el('ul', { class: 'ch-rules' }, lines),
        res.violations.length ? el('ul', { class: 'ch-violations' }, res.violations.map((v) => el('li', {}, v))) : null,
        el('p', { class: 'ch-status', 'data-tone': res.won ? 'good' : res.ok ? '' : 'bad' },
          res.won ? 'Challenge complete.' : res.ok ? 'Rules kept so far. Keep closing the gap.' : 'A rule is broken. Undo the moves listed above.'));
    });
  }
  // ------------------------------------------------------------ win state

  function gradeApproval(r) {
    const d = r.approval.overall - r.approval.baseline;
    return d >= 2 ? 'A' : d >= -2 ? 'B' : d >= -6 ? 'C' : d >= -12 ? 'D' : 'F';
  }
  function gradeJobs(r) {
    const j = r.jobs;
    return j >= 0 ? 'A' : j > -250e3 ? 'B' : j > -750e3 ? 'C' : j > -1.5e6 ? 'D' : 'F';
  }
  function celebrate() {
    const r = result;
    const mix = planMix(r);
    const raised = mix.taxUp - mix.taxDown, cut = mix.cuts - mix.adds;
    const total = Math.max(1e-9, Math.max(0, raised) + Math.max(0, cut));
    const taxShare = Math.round(100 * Math.max(0, raised) / total);
    const hurt = D.personas.map((p) => ({ p, d: r.personas[p.id].delta })).sort((a, b) => a.d / Math.max(1, a.p.income) - b.d / Math.max(1, b.p.income));
    const worst = hurt[0], best = hurt[hurt.length - 1];
    const last = r.projection[r.projection.length - 1];
    $('winLead').textContent = r.deficit < -M.constants.BALANCE_TOLERANCE
      ? `Your plan runs a ${F.money(-r.deficit)} surplus this year.` : 'Revenue now covers every dollar of spending.';
    const ch = (D.challenges || []).find((c) => c.id === challengeId);
    const chRes = ch ? M.checkChallenge(D, state, r, ch) : null;
    const row = (grade, title, text) => el('div', { class: 'report-row' }, el('span', { class: 'grade', 'data-grade': grade }, grade), el('div', {}, el('h3', {}, title), el('p', {}, text)));
    const bigPayer = worst && worst.d < -0.5 ? `${worst.p.name} gives up the most: ${F.dollars(-worst.d)} a year, ${F.percent(100 * -worst.d / Math.max(1, worst.p.income))} of their income.` : 'No household in the game loses money.';
    const gainer = best && best.d > 0.5 ? ` ${best.p.name} comes out ahead by ${F.dollars(best.d)}.` : '';
    fill($('report'),
      row(gradeApproval(r), 'Voters', `Approval is ${Math.round(r.approval.overall)}%, compared with ${Math.round(r.approval.baseline)}% when you started.`),
      row(gradeJobs(r), 'Jobs', Math.abs(r.jobs) < 500 ? 'No change in jobs in the short run.' : `${F.signedPeople(r.jobs)} jobs in the short run, as the economy ${r.jobs < 0 ? 'cools' : 'heats up'} by ${F.percent(Math.abs(r.gdpPct), 2)}.`),
      el('div', { class: 'report-row' }, el('span', { class: 'grade grade-mix', 'aria-hidden': 'true' }, `${taxShare}%`), el('div', {},
        el('h3', {}, 'Who paid'),
        el('p', {}, `${taxShare}% of your savings came from taxes and ${100 - taxShare}% from spending. ${bigPayer}${gainer}`))),
      el('div', { class: 'report-row' }, el('span', { class: 'grade grade-mix', 'aria-hidden': 'true' }, `${F.percent(last.planDebtPctGdp, 0)}`), el('div', {},
        el('h3', {}, `Debt in ${last.year}`),
        el('p', {}, `${F.percent(last.planDebtPctGdp, 0)} of GDP, instead of ${F.percent(last.baselineDebtPctGdp, 0)} under current law.`))),
      chRes ? el('p', { class: 'report-ch', 'data-tone': chRes.won ? 'good' : 'bad' }, chRes.won ? `Challenge "${ch.name}" complete.` : `Challenge "${ch.name}" not met: ${chRes.violations[0]}`) : null);
    confetti();
    const dlg = $('winDialog');
    if (dlg.showModal && !dlg.open) dlg.showModal();
  }
  function confetti() {
    if (reduceMotion) return;
    const box = $('confetti');
    box.replaceChildren();
    const colors = ['var(--note)', 'var(--gold)', 'var(--g-mandatory)', 'var(--g-nondefense)', 'var(--g-defense)'];
    for (let i = 0; i < 90; i++) {
      const p = el('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.style.animationDuration = 2.2 + Math.random() * 1.6 + 's';
      p.style.setProperty('--drift', (Math.random() * 40 - 20) + 'vw');
      p.style.setProperty('--spin', (Math.random() * 1080 - 540) + 'deg');
      box.appendChild(p);
    }
    box.classList.remove('go'); void box.offsetWidth; box.classList.add('go');
    setTimeout(() => box.replaceChildren(), 4500);
  }

  // ------------------------------------------------------------ about / intro

  function buildAbout() {
    $('aboutModel').textContent =
      `Figures are for fiscal year ${meta.fiscalYear}, in nominal dollars, as of ${meta.asOf}. Each option's yearly effect is a published estimate, scaled to one year, fully phased in. ` +
      `Your choices also nudge the economy: every 1% change in GDP moves revenue by ${F.money(meta.revenueFeedbackPerGdpPct)} and jobs by ${F.people(meta.jobsPerGdpPct)}. ` +
      `Interest on the debt adjusts to how much your plan borrows, at an average rate of ${F.percent(meta.avgInterestRate * 100)}. ` +
      `The ten-year outlook grows the current-law deficit ${F.percent(meta.baselineDeficitGrowth * 100)} a year and the economy ${F.percent(meta.gdpGrowth * 100)} a year.`;
    $('caveats').replaceChildren(...(meta.caveats || []).map((c) => el('li', {}, c)));
    $('sources').replaceChildren(...(meta.sources || []).map((s) =>
      el('li', {}, s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label) : s.label)));
    $('introLead').textContent =
      `This year Washington spends ${F.money(result.baselineSpending)} and collects ${F.money(result.baselineRevenue)}. ` +
      `The ${F.money(result.baselineDeficit)} gap is borrowed. Your job: close it, and live with what that does to people.`;
  }
  function buildIntro() {
    const dlg = $('introDialog');
    const open = () => { if (dlg.showModal && !dlg.open) dlg.showModal(); };
    $('helpBtn').addEventListener('click', open);
    dlg.addEventListener('close', () => store.set(STORE_INTRO, '1'));
    if (!store.get(STORE_INTRO) && !fromHash) open();
    if (fromHash) toast('Loaded a shared plan.');
  }

  // ------------------------------------------------------------ go

  $('app').hidden = false;
  const sbEl = $('scoreboard');
  const measure = () => document.documentElement.style.setProperty('--sb-h', sbEl.offsetHeight + 'px');
  if (window.ResizeObserver) new ResizeObserver(measure).observe(sbEl); else window.addEventListener('resize', measure);
  buildScoreboard();
  buildFlow();
  buildTabs();
  buildViews();
  buildControls();
  buildFrontPage();
  buildPersonas();
  buildApproval();
  buildMetrics();
  buildChart();
  buildPlan();
  buildChallenges();
  buildAbout();
  for (const fn of updaters) fn(result);
  buildIntro();

  // Test hook for automated browser checks.
  window.__budgeIt = { get state() { return state; }, get result() { return result; }, set(next) { state = M.sanitizeState(D, next); changed(); } };
})();
