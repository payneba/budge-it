# Budge It

A browser game about balancing the US federal budget. You see where federal money
comes from and where it goes, then cut, grow, tax and reform until the deficit hits
zero. Every move shows up in human terms: what it does to a handful of specific
households, to voter blocs, to jobs and to the country's debt over ten years.

The numbers come from published sources (CBO, OMB, Treasury, JCT and others); the
model that combines them is deliberately simple. See "Model simplifications" below.

## Play

Open `index.html` in a browser. That's it: no install, no build, no server, works
offline. It also works unchanged when hosted on GitHub Pages.

- **Spending** tab: one card per budget line. The main slider grows or cuts the whole
  line by a percentage; "Specific reforms" underneath are targeted policy changes.
- **Taxes & revenue** tab: each revenue source with its tax options (rates as
  sliders, reforms as switches). A gold tick on a slider marks current law.
- The right-hand column (the "Consequences" tab on phones) shows the front page,
  household gains and losses, voter approval, national outcomes, the ten-year debt
  outlook, your ranked plan and the optional challenges.
- Click any block in the "money in / money out" bars to jump to its controls.
- **Copy share link** puts your plan in the URL (`index.html#id:value,...`). Your
  latest plan is also kept in the browser's local storage.

## Three ways to keep score

How people take your plan is scored three ways, side by side, because each is a
legitimate thing to optimize and they pull against each other:

- **Electability**: the approval meter. Will voters re-elect you? Each bloc's reaction
  saturates, so once a bloc is furious more pain costs little. It rewards loading the
  pain onto a few groups.
- **Shared sacrifice** (0-100): how evenly the burden falls across the eight example
  households, as a share of each one's take-home pay, counting every household
  equally. It ignores how big the burden is: everyone losing a fifth of their pay
  scores 100.
- **Hardship**: the total pain, as "like every household losing X% of take-home pay".
  Big losses count more than small ones, a dollar counts more to a poorer household,
  and each household is weighted by roughly how many US households it stands for. It
  barely notices a tiny group (the top 0.1%) losing a lot, so any household losing more
  than 25% of take-home pay is flagged as "pushed to the brink".

A plan tuned for one usually scores badly on another, and the win screen grades all
three. Limitations: both household lenses count only the direct dollar effects on the
eight example households. Losing coverage, a job or a service doesn't count unless it
shows up as dollars for one of them, so cuts to research, roads, housing aid or
weapons barely register. The household shares are rough estimates. Formulas are in
`CLAUDE.md`.

## Run the tests

```sh
node --test tests/
```

Node 24 or later, no dependencies. `tests/model.test.js` checks the engine against a
small invented dataset (`tests/fixture-data.js`). `tests/data.test.js` checks the real
`js/data.js`: it must validate, compute finite numbers everywhere, start with a
deficit, and be winnable (including the lens challenges, using plans found by search).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell; loads the three scripts below with classic `<script>` tags |
| `css/style.css` | All styling (light and dark, phone to desktop) |
| `js/data.js` | `BUDGET_DATA`: every number and every word of content |
| `js/model.js` | `BudgetModel`: pure calculation, validation, share codes, formatting |
| `js/app.js` | Builds the page from the data and updates it as you play |
| `tests/` | `node:test` suites, the fixture dataset, and `index.js` (lets `node --test tests/` find the suites) |
| `CLAUDE.md` | The data schema and engine contract |

The engine and UI are generic: no category, lever, persona or figure is hard-coded.
Everything comes from `js/data.js`.

## Adding or editing a lever

Add an object to `levers` in `js/data.js`. It appears under the card named by its
`parent` with no code change.

```js
{
  id: "corp_rate",                 // unique across spending, revenue and levers
  parent: "corporate_income_tax",  // the spending or revenue line it belongs to
  side: "revenue",                 // must match the parent: "revenue" or "spending"
  type: "slider",                  // or "toggle"
  name: "Corporate income tax rate",
  blurb: "Plain-language description of the change.",
  unit: "%", min: 15, max: 35, step: 1, current: 21,   // sliders only
  budgetPerUnit: 13,               // $B per unit above `current` (toggle: $B when on).
                                   // Revenue: added revenue. Spending: added spending (negative saves).
  falloff: 0.15,                   // optional 0..0.6: behavioral response at the slider ends
  stories: [{ at: 28, text: "..." }],   // sliders; `at` is an absolute slider value
  onText: "...",                   // toggles: what happens when switched on
  source: "CBO Options for Reducing the Deficit, 2024",
  effects: { metrics: {}, personas: {}, approval: {}, gdpPct: 0 }  // per unit, or when on
}
```

Then run `node --test tests/`. `validateData` reports anything that doesn't line up
(unknown parent, a persona or bloc id that doesn't exist, `current` outside
`min..max`, and so on). If the data has errors, the game shows them instead of
starting.

The full schema is in `CLAUDE.md`.

## Model simplifications

- Every estimate is a single, fully phased-in annual number at the scale of the
  baseline year. Real policies phase in, interact and change over time.
- Effects are linear per unit of change, apart from `falloff` (taxpayers respond
  more to bigger rate changes) and voter approval, which saturates so that piling
  on unpopular moves stops costing support at a constant rate (each bloc's swing
  levels off near 40 points).
- Options are independent and simply add up. In reality some overlap (two ways of
  taxing the same income) or interact.
- The economy responds through one number: each option's short-run GDP effect.
  GDP changes feed back into revenue (spread across sources by their size) and into
  jobs, using fixed ratios from `meta`.
- Interest on the debt moves by half a year of interest on the change in this year's
  borrowing. In the ten-year outlook the current-law deficit grows at a fixed rate,
  your policy change grows with the economy, and the extra (or reduced) debt
  compounds at the average interest rate. GDP is the same in both lines.
- Household effects are rough, per-household illustrations for a few typical
  families, not distributional tables.

## Data sources

All sources are listed in `meta.sources` in `js/data.js`, with the caveats in
`meta.caveats`. Both are shown in the game in the "About the numbers" section at the
bottom of the page.
