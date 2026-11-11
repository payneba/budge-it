# Budge It — US federal budget balancing game

A browser game: the player sees where federal money comes from and where it goes,
adjusts spending and taxes, and tries to bring the deficit to zero. Consequences are
shown in human terms (specific households, people covered, jobs, voter reaction),
not just dollar totals. Realistic, sourced numbers; entertaining presentation.

## Hard constraints

- Static site, no build step, no install, no server. Must work by double-clicking
  `index.html` (file:// URL) **and** when hosted on GitHub Pages.
  - Therefore: classic `<script src>` tags only. No ES modules, no fetch() of local
    files, no bundler, no npm dependencies at runtime, no CDN requirement (the game
    must work offline; charts are hand-rolled SVG/CSS).
- Vanilla JS, HTML, CSS. Unix line endings. No frameworks.
- Tests run with `node --test tests/` (Node 24, built-in test runner, zero deps).
- Git: do NOT commit or push; the orchestrator commits. Never prefix shell commands
  with `cd <dir> &&` — the shell is already at the repo root.

## Files

| File | Owner | Purpose |
|------|-------|---------|
| `index.html` | UI | Page shell, loads the scripts below in order |
| `css/style.css` | UI | All styling |
| `js/data.js` | Content | ALL numbers and words: `BUDGET_DATA` (schema below) |
| `js/model.js` | Engine | Pure calculation + `validateData`. No DOM access. |
| `js/app.js` | UI | Rendering, interaction, state, URL share codes |
| `tests/*.test.js` | Engine | node:test suites for model + real-data validation |
| `README.md` | — | What it is, how to play/run/test, data sources, model caveats |

`data.js` and `model.js` must load both in the browser and in Node:

```js
(function (root) {
  const BUDGET_DATA = { ... };
  if (typeof module !== 'undefined' && module.exports) module.exports = BUDGET_DATA;
  else root.BUDGET_DATA = BUDGET_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
```

`model.js` exposes `BudgetModel` the same way.

**The engine is generic.** `model.js`/`app.js` must never hard-code a category id,
lever id, persona id, dollar figure or piece of policy text. Everything
content-specific lives in `data.js`. Adding a lever to `data.js` must make it appear
in the game with no code change.

## Data schema (`BUDGET_DATA`) — the contract between content and engine

All money is in **billions of nominal US dollars per year** unless stated. Estimates
are annual, "fully phased in", at the scale of the baseline fiscal year.

```js
{
  meta: {
    fiscalYear: 2026,              // baseline year (most recent COMPLETED fiscal year with actuals)
    asOf: "2026-10",               // vintage of the data
    gdp: 30500,                    // $B
    population: 342e6,             // people
    households: 133e6,
    debtHeldByPublic: 30000,       // $B at end of baseline year
    avgInterestRate: 0.034,        // average rate on debt held by public
    baselineDeficitGrowth: 0.045,  // annual growth of the baseline deficit under current law (for the 10-yr projection)
    gdpGrowth: 0.04,               // nominal GDP growth for the projection
    revenueFeedbackPerGdpPct: 55,  // $B of revenue gained/lost per +1% change in GDP
    jobsPerGdpPct: 1.1e6,          // jobs gained/lost per +1% GDP
    sources: [{ label: "CBO Monthly Budget Review, Sept 2026", url: "https://..." }],
    caveats: ["plain-language model limitation", ...]
  },

  // Where the money goes. Sum of baselines == actual total outlays.
  spending: [{
    id: "social_security",         // snake_case, unique across spending+revenue
    name: "Social Security",
    icon: "👵",                    // one emoji
    group: "mandatory",            // "mandatory" | "defense" | "nondefense" | "interest"
    baseline: 1580,                // $B
    locked: false,                 // true only for net interest (cannot be set directly)
    min: -50, max: 30, step: 1,    // allowed % change of the main slider
    blurb: "One sentence: what this is and who gets it.",
    facts: ["73 million people get a monthly check", "Average retiree benefit: $2,010/month"],
    // What moving the main slider means. `at` is % change; engine shows the story
    // whose `at` has the same sign as the current value and the largest |at| <= |value|.
    stories: [
      { at: -5,  text: "Concrete, human-scale consequence of a 5% cut." },
      { at: -20, text: "..." },
      { at: 10,  text: "..." }
    ],
    // Effects PER +1% of spending change (so a cut applies them negatively).
    effects: {
      metrics:  { seniors_in_poverty: -41000 },      // metricId -> change per +1%
      personas: { retired_couple: 410 },             // personaId -> $/year change in that household's finances per +1%
      approval: { seniors: 1.2, workers: 0.2 },      // blocId -> approval points per +1%
      gdpPct: 0.004                                  // % change in GDP per +1% (short-run demand effect; may be 0)
    }
  }],

  // Where the money comes from. Sum of baselines == actual total revenues.
  revenue: [{
    id: "individual_income_tax", name: "Individual income taxes", icon: "🧾",
    baseline: 2650, blurb: "...", facts: ["..."]
  }],

  // Every adjustable policy other than the spending main sliders: all tax changes,
  // plus specific spending reforms. Shown under the line item named by `parent`.
  levers: [{
    id: "corp_rate",
    parent: "corporate_income_tax",      // a spending id or revenue id
    side: "revenue",                     // "revenue": budgetPerUnit is $B of ADDED REVENUE per unit
                                         // "spending": budgetPerUnit is $B of ADDED SPENDING per unit (negative = savings)
    type: "slider",                      // "slider" | "toggle"
    name: "Corporate income tax rate",
    blurb: "One or two sentences. Say what the change is in plain language.",
    // slider only:
    unit: "%",                           // display suffix for the value
    min: 15, max: 35, step: 1,
    current: 21,                         // current-law value (slider starts here)
    budgetPerUnit: 13,                   // $B per +1 unit above `current`. Toggle: $B when ON.
    falloff: 0.15,                       // optional, 0..0.6. Behavioral response: yield is multiplied by
                                         // (1 - falloff * |v-current| / maxDistance) where maxDistance is
                                         // the distance from `current` to the slider end on that side.
    stories: [{ at: 28, text: "..." }, { at: 15, text: "..." }],  // slider: `at` is an absolute slider value; toggle: use onText
    onText: "toggle only: consequence shown when switched on",
    source: "CBO Options for Reducing the Deficit 2024, Revenues option 22",   // short citation
    effects: { metrics: {}, personas: {}, approval: {}, gdpPct: 0 }   // per +1 unit (slider) or when ON (toggle)
  }],

  // "Kitchen table" households. The game shows how each one's yearly finances move.
  personas: [{
    id: "retired_couple", name: "Walt & Denise", icon: "👴",
    tagline: "Retired couple, Ohio",
    income: 52000,                       // annual household income, $
    detail: "2-3 sentences: who they are, what federal programs and taxes touch them.",
    federalTaxes: 2100,                  // $/yr federal taxes paid now (all types)
    federalBenefits: 41000               // $/yr federal benefits received now (cash + value of health coverage)
  }],

  // Country-wide human outcomes moved by levers.
  metrics: [{
    id: "uninsured", name: "People without health insurance", icon: "🏥",
    baseline: 27e6,
    goodDirection: "down",               // "down" | "up": which direction is good for people
    format: "people",                    // "people" | "jobs" | "dollars" | "percent" | "number"
    min: 0                               // optional clamp
  }],

  // Voter blocs for the approval meter. Shares sum to 1. Approval is 0-100.
  blocs: [{ id: "seniors", name: "Seniors", icon: "🧓", share: 0.22, baselineApproval: 45 }],

  // Newspaper headlines. First matching condition wins within each `slot`; the UI shows
  // the best match. Conditions are evaluated by the engine against the result object.
  headlines: [{
    when: { lever: "social_security", op: "<=", value: -20 },   // lever/spending id + threshold on its current value
    // or: { stat: "deficit" | "approval" | "gdpPct" | "jobs", op: "<=" | ">=", value: N }
    // or: { metric: "uninsured", op: ">=", value: 35e6 }
    text: "SENIORS STORM CAPITOL AS CHECKS SHRINK",
    priority: 5                                                  // higher wins
  }],

  // Optional pre-set challenges / starting plans.
  challenges: [{
    id: "no_new_taxes", name: "Read My Lips", icon: "👄",
    blurb: "Balance the budget without raising any tax.",
    rules: { noTaxIncreases: true }      // supported keys: noTaxIncreases, noSpendingCuts,
                                         // protect: ["social_security","medicare"], minApproval: 40,
                                         // maxUnemploymentJobsLost: 2e6
  }]
}
```

### Engine semantics (`BudgetModel`)

- `BudgetModel.validateData(data)` → array of human-readable error strings (empty =
  valid). Checks ids unique, references resolve (parent, persona/metric/bloc ids in
  effects, headline targets, challenge `protect`), numeric ranges sane
  (`min <= current <= max`), bloc shares sum to 1, exactly one locked interest line.
- `BudgetModel.defaultState(data)` → `{ spending: {id: 0,...}, levers: {id: current|false,...} }`.
- `BudgetModel.compute(data, state)` → result with at least:
  `totalSpending, totalRevenue, deficit, baselineDeficit, spendingById, revenueById,
  gdpPct, jobs, interest, metrics{id:{value,delta}}, personas{id:{delta, breakdown[]}},
  approval{overall, byBloc}, projection[{year, baselineDebt, planDebt, baselineDebtPctGdp,
  planDebtPctGdp}] (10 years), activeStories[], headline, changes[] (ranked list of the
  player's moves by $ size), balanced (deficit <= 0 within a small tolerance)`.
- Lever yield lands on its `parent` line: revenue levers add to that revenue source,
  spending levers add to that spending category (negative `budgetPerUnit` = savings).
- GDP feedback: total `gdpPct` (sum of all effects) changes revenue by
  `gdpPct * revenueFeedbackPerGdpPct`, spread proportionally across revenue sources.
- Interest: the locked interest line moves by
  `(deficit_before_interest_change - baselineDeficit) * avgInterestRate * 0.5`
  in year one, and compounds in the 10-year projection.
- Approval per bloc = baselineApproval + Σ effects, clamped 0..100, with diminishing
  sensitivity (large piles of unpopular moves should not go linear forever);
  overall = share-weighted mean.

## Tone and honesty

- Non-partisan. Every option has real costs and real beneficiaries; show both. No
  option is a free lunch, and no bloc is a villain.
- Numbers come from primary sources (CBO, OMB, Treasury, JCT, SSA, CMS, Census, BLS)
  or reputable scorers (CRFB, Tax Policy Center, Penn Wharton, Tax Foundation).
  Rounded estimates are fine; invented precision is not.
- The game states clearly that it is a simplified model.
