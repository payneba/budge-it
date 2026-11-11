'use strict';
// Validates the REAL game data in js/data.js against the engine. Skips if absent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require(path.join(__dirname, '..', 'js', 'model.js'));
const DATA_PATH = path.join(__dirname, '..', 'js', 'data.js');
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
