# The Crowd

A Budge It game where the consequences of a budget are shown as a crowd of little
people on the National Mall. Each figure stands for a fixed number of real Americans.
You move the same spending and tax controls as in the other games; the crowd reacts.
Happy people picnic and fly balloons; unhappy ones pick up signs, and eventually
torches and pitchforks. Hover anyone to see what they are reacting to.

The point: a budget does not hit "blocs". It hits a nurse, a welder at a defense
plant, a retiree, a postdoc, a farmer, each for different reasons, and many of those
reasons are not about their own wallet.

## Principles

- **The crowd is numerically literal.** Archetype shares come from real population
  data. One figure = `represents` people (default: 260 figures, 1 million US adults
  each). Discrete outcomes (losing a job, losing health coverage) are dealt to
  individual figures in true proportion to the modelled national number, so the
  aggregate is countable.
- **No free cuts.** Every spending line and every lever in `shared/data.js` must
  matter to somebody in the crowd through at least one kind of stake:
  - `money`: a direct change in this person's yearly dollars, computed from their own
    benefit, wage or tax base ("My check is $190 a month smaller").
  - `service`: something they rely on is lost or gained (coverage, rent help, aid).
  - `job`: their job, or their industry, depends on a budget line.
  - `worry`: a non-monetary concern: national security, their kids' future,
    science and long-run growth, climate, disaster readiness, fairness, and the
    national debt itself. Worries have no cash value but move mood.
- **People start with opinions.** At the untouched baseline the crowd is not uniformly
  neutral: debt-worriers are already uneasy, and some people are content.
- **Honest numbers.** Money amounts come from `shared/data.js` and sourced personal
  bases; worry strengths are calibrated to polling where it exists and marked as
  estimates where it does not. Non-partisan: every move has people who like it.

## Files

| File | Purpose |
|------|---------|
| `people.js` | `CROWD_DATA`: archetypes, their stakes, worry definitions, text templates. Content only. |
| `crowd-model.js` | `CrowdModel`: pure, DOM-free simulation (loads in browser and Node). Tested by `tests/crowd-model.test.js`. |
| `crowd.js` | Rendering (canvas crowd), controls, interaction |
| `style.css`, `index.html` | Page |

`index.html` loads, in order: `../../shared/data.js`, `../../shared/model.js`,
`people.js`, `crowd-model.js`, `crowd.js`.

## Interface between simulation and rendering

This is the contract. The renderer uses only what is described here.

```js
CrowdModel.validate(BUDGET_DATA, CROWD_DATA)            // -> string[] of problems, [] if fine

CrowdModel.buildPopulation(BUDGET_DATA, CROWD_DATA, { seed: 1, size: 260 })
// -> Citizen[]; deterministic for a given seed and size
// Citizen = {
//   id: 0,                         // index, stable
//   name: "Rosa",                  // first name
//   age: 71,
//   archetype: "retiree",          // archetype id
//   label: "Retired school cook",  // short human description, varies within an archetype
//   group: "Retirees",             // display name of the archetype, for grouping
//   income: 38000,                 // yearly household income, $
//   incomeBand: "low" | "middle" | "upper" | "top",
//   ageBand: "18-29" | "30-49" | "50-64" | "65+",
//   represents: 1000000,           // people this figure stands for
//   look: {                        // appearance hints; renderer falls back gracefully on unknown values
//     outfit: "casual"|"suit"|"scrubs"|"labcoat"|"camo"|"overalls"|"uniform"|"hivis"|"apron"|"cardigan",
//     hat:    "none"|"cap"|"hardhat"|"straw"|"gradcap"|"helmet"|"beret"|"chefhat"|"cowboy",
//     prop:   "none"|"cane"|"briefcase"|"stethoscope"|"book"|"wrench"|"laptop"|"stroller"|"toolbox"|"clipboard"|"tray",
//     grayHair: false,
//     variant: 0.37                // 0..1 random, for skin/hair/shirt colour and height variety
//   },
//   about: "One or two sentences: who they are and what federal money touches their life."
// }

CrowdModel.react(BUDGET_DATA, CROWD_DATA, citizens, state, result)
// state  = BudgetModel state; result = BudgetModel.compute(BUDGET_DATA, state)
// Fast enough to call on every slider `input` event.
// -> {
//   citizens: [{                   // same order and length as the population
//     id,
//     mood: -100..100,             // 0 = indifferent; includes their baseline opinion
//     moodDelta: number,           // change versus the untouched baseline budget
//     level: 0..5,                 // 0 cheering, 1 happy, 2 content, 3 uneasy, 4 angry (sign), 5 furious (torch/pitchfork)
//     status: ["lost_job", "lost_coverage", ...],   // discrete things that happened to this figure; may be empty
//     reasons: [{                  // everything this person is reacting to, largest |impact| first; may be empty
//       kind: "money" | "service" | "job" | "worry",
//       impact: -18,               // signed mood points
//       text: "My Social Security check is $190 a month smaller.",   // first person, with real numbers
//       short: "$190 less a month",                                   // <= 28 chars, for a sign or small bubble
//       key: "social_security",    // spending/lever id (or a stat like "deficit") that caused it; for grouping
//       topic: "Social Security"   // display name for that key
//     }],
//     bubble: "..."                // what they'd say right now: top reason's text, or idle chatter if none
//   }],
//   summary: {
//     levels: [n0, n1, n2, n3, n4, n5],          // figure counts per mood level
//     meanMood: number,
//     lenses: {
//       electability: 0..100,      // share of figures who would still vote for you; saturating by nature
//       fairness: 0..100,          // how evenly the mood change is spread (100 = perfectly even)
//       hardship: number           // average pain with large losses counting disproportionately; lower is better
//     },
//     grievances: [{ key, topic, text, figures: 23, people: 23000000, impact }],   // top reasons people are unhappy, ranked
//     cheers:     [{ key, topic, text, figures, people, impact }],                 // top reasons people are pleased
//     byGroup: { "Retirees": { figures, meanMood, meanDelta } },
//     levelNames: ["Cheering", "Happy", "Content", "Uneasy", "Angry", "Furious"]
//   }
// }
```

Mood levels are thresholds on `mood`, defined in `CROWD_DATA` so they can be tuned.

## How the simulation works

Everything below is implemented in `crowd-model.js` (generic code) and tuned in
`people.js` (content and constants). The engine never names a budget id: all ids live
in `people.js` tables keyed by the ids in `shared/data.js`.

### Population

37 archetypes partition US adults (262 million, Census Vintage 2024); shares sum to 1
and each carries a source comment in `people.js`. Real people belong to several groups
at once; each adult is counted once under the stake that dominates their exposure. Folded
in: part-time students into worker groups, working 65+ people into retirees, Postal
workers into transport, DoD civilians into federal employees, homemakers into
middle-class parents, and most immigrants into the group for their job (the "Immigrant
families" group covers households where enforcement is a daily concern).

`buildPopulation` deals `size` figures by largest remainder, after first giving every
`mustShow` archetype at least one figure. At size 260 the only group bumped is the top
0.1% (0.13 figures by share, shown as 1). One figure was taken from a group with a 0.5
remainder to pay for it. Each figure's `represents` is its group's real headcount divided
by its figure count, so grievance `people` totals stay literal: the lone top-0.1% figure
represents about 131,000 adults, and most figures represent about 1.0 million. The crowd
therefore *draws* the top 0.1% about 7.7x too large while counting them correctly.

| Group | Share of adults | Figures at 260 | Exact quota |
|-------|----------------:|---------------:|------------:|
| Retirees on a small check | 7.5% | 19 | 19.50 |
| Middle-income retirees | 8.5% | 22 | 22.10 |
| Well-off retirees | 4% | 10 | 10.40 |
| Federal & military retirees | 1.5% | 4 | 3.90 (must-show) |
| People with disabilities | 3% | 8 | 7.80 |
| Veterans (working-age, VA disability) | 1.5% | 4 | 3.90 (must-show) |
| Active-duty troops | 0.5% | 1 | 1.30 (must-show) |
| Defense-industry workers | 0.4% | 1 | 1.04 (must-show) |
| Federal employees | 0.9% | 2 | 2.34 (must-show) |
| Scientists & researchers | 0.5% | 1 | 1.30 (must-show) |
| Nurses & hospital staff | 3% | 8 | 7.80 |
| Home & nursing-home aides | 2% | 5 | 5.20 |
| Doctors & dentists | 0.6% | 2 | 1.56 (must-show) |
| Teachers & school staff | 2% | 5 | 5.20 |
| College students | 4% | 10 | 10.40 |
| Young grads with loans | 3.5% | 9 | 9.10 |
| Farmers & ranchers | 0.8% | 2 | 2.08 (must-show) |
| Construction workers | 2.6% | 7 | 6.76 |
| Transport & logistics workers | 2.2% | 6 | 5.72 |
| Factory workers | 3.3% | 9 | 8.58 |
| Retail & restaurant workers | 5.5% | 14 | 14.30 |
| Low-income parents | 4% | 10 | 10.40 |
| Renters with rent help | 1.5% | 4 | 3.90 (must-show) |
| Middle-class parents | 7.5% | 19 | 19.50 |
| Office & admin workers | 3% | 8 | 7.80 |
| Tech & professional workers | 4% | 10 | 10.40 |
| Small-business owners | 3% | 8 | 7.80 |
| High earners | 3% | 8 | 7.80 |
| The top 1% | 0.95% | 2 | 2.47 |
| The top 0.1% | 0.05% | 1 | 0.13 (must-show) |
| Job seekers | 2.5% | 7 | 6.50 |
| Family caregivers | 1.5% | 4 | 3.90 (must-show) |
| Immigrant families | 2.5% | 7 | 6.50 |
| Self-employed & early retirees (ACA) | 3% | 8 | 7.80 |
| Police, firefighters & EMTs | 0.7% | 2 | 1.82 (must-show) |
| Energy workers | 1% | 3 | 2.60 (must-show) |
| Workers nearing retirement | 4% | 10 | 10.40 |

Within a group, each figure's name, age, income (log-uniform in the group's range),
marital status, label, look, personal dollar bases, held worries and baseline opinion
come from a seeded PRNG (mulberry32, seeded by hash of seed + archetype + index).
Labels can carry an age range so a 25-year-old is never a "Grandparent". There is no
`Date` and no `Math.random`. Per-citizen internals live on a non-enumerable `_sim`
property, so `react` needs the citizen objects returned by `buildPopulation` (cloned
copies won't work).

### Stakes

Every control (unlocked spending line, or lever) reaches people through one or more of
these tables. `validate` statically checks that each control is mentioned. It then moves
each control alone to each extreme on a 260-figure crowd and requires (a) a reason keyed
to that control and (b) someone whose mood rises and someone whose mood falls.

- **money** (`CROWD_DATA.money`): dollars/yr = `units x per x base`, where units is the
  control's change (spending %; lever value minus current; toggle 1) and base is the
  person's own stake. Some bases are drawn per person: Social Security, VA, military
  pay, pension, SNAP, credits, Pell, farm payments, ACA credit, tips/overtime, kids,
  and so on. Others are derived from income with 2026 tax parameters: bracket slices,
  wages up to the payroll cap, consumption for VAT and tariffs, gallons for the gas tax,
  capital income for corporate tax and FTT, and net worth for estate and wealth taxes.
  Per-1% factors follow `effects.personas` in `shared/data.js` where they exist.
  Changes to future benefits (retirement age, high-earner trim) are weighted by age:
  0.15 under 30, 0.25 under 50, 0.4 under 62, and 0 for current retirees.
  - Mood: `pct = 100 x |$| / resources`, with `resources = income + 4% of net worth`.
  - A loss scores `-(2.5 pct + 0.15 pct^2)`: convex, so small hits are absorbable and
    big ones catastrophic.
  - A gain scores `1.25 pct / (1 + pct/15)`, about half a loss of the same size (loss
    aversion of about 2x).
  - A person's losses are rescaled so that together they score like one loss of their
    sum (the convexity applies to the total).
- **service / job** (`CROWD_DATA.pools`): health coverage, rent help, SNAP and jobs.
  1. National counts come from the budget result: the drivers of
     `metrics.uninsured`, `rent_aid_households` and `food_aid`, `result.jobs`, and
     direct sector jobs per unit of each control (estimates documented inline). An
     example: defense procurement at ~3,000 jobs per $1B.
  2. Each count is split across groups by relative risk x real population. Overflow
     beyond a group's eligible population spills to the other exposed groups.
  3. That gives each group's expected figure count `k`. These are apportioned across
     the whole crowd by Webster's method, so the total matches the national number
     even for one-figure groups.
  4. Within a group, figures are hit in a fixed random rank order. That makes outcomes
     monotonic in any single slider (divisor methods are house-monotone) and stops
     flicker.
  - Hit figures get a `status` flag and a large hit: lost job -45, lost coverage -30,
    lost rent help -35, lost SNAP -22. The next figure in line feels the fractional
    remainder as fear. Everyone else exposed feels fear in proportion to the share of
    their group that is hit (up to -14 for jobs).
  - Gains go the other way: coverage +18, rent help +20, food aid +10. Job gains show
    as hiring or overtime (+6), and job seekers get hired (+28) with half of net job
    gains.
  - Sector job counts are direct jobs. The economy-wide count (`result.jobs`) is dealt
    separately across workers by cyclical sensitivity, so the two overlap somewhat.
- **age rules**: the Medicare age lever hits only figures whose age falls between the
  old and new eligibility age.
- **worry** (`CROWD_DATA.worries`): each worry has holders (per group: probability of
  holding it, mean intensity I, varied 0.6-1.4x per person) and drivers (mood points
  per unit of a control). Relief at an increase counts 0.6x the alarm at an equal cut.
  - Per person and worry, the drivers are summed in absolute value and softened as
    `cap x I x tanh(sum / (cap x I))`.
  - Only the four largest drivers speak, carrying the full softened total.
  - Special modes:
    - *dollars* (size of government): every $B of spending or tax counts.
    - *fairness*: who pays, from $B of cuts to low/middle-income programs, broad
      taxes and top-end taxes.
    - *deficit*: the national debt, `I x clamp(-12 + 30 x closure, -30, 18)` where
      closure is the share of the baseline deficit closed. It is standing at
      baseline, so debt-worriers start uneasy and gain up to +30 by balancing.
    - *metric*: the Social Security trust-fund year from
      `metrics.ss_depletion_year`, excluding the main benefit slider.

| Worry | Calibration |
|-------|-------------|
| National security | Pew, Feb 2024 priorities: terrorism 63%, military ~39% (verified) |
| Pentagon waste | Gallup defense trend 2025, about a third say "too much" (from memory) |
| Science & the future | Pew 2025 on research spending; AP-NORC 2025 medical research (from memory) |
| Schools & kids | Pew, Feb 2024, education ~55% (from memory) |
| Climate & environment | Pew, Feb 2024: environment 45%; climate ~37%, derived from party splits (verified) |
| Disaster readiness | Estimate; AP-NORC extreme-weather concern as context |
| Roads & infrastructure | AP-NORC 2021-24 support for more spending; holder share estimated |
| America's role abroad | Pew 2024 global engagement; estimated |
| Helping people in need | Pew 2024 Social Security; KFF 2025 Medicaid favorability (from memory) |
| Border security | Pew, Feb 2024, immigration 57% (verified) |
| Family and deportation | Pew 2025 Latino deportation worry (from memory); estimated elsewhere |
| Crime & public safety | Pew, Feb 2024, crime 58% (verified) |
| Work should come first | KFF Jan 2025, ~6 in 10 favor Medicaid work rules (from memory) |
| Local hospital | Estimate (Chartis 2025 rural-hospital context) |
| Health-care prices | Pew, Feb 2024 health costs; KFF drug negotiation ~80% (from memory) |
| Public health | Estimate |
| Fair share (the top should pay) | Pew, Apr 2023, 61% say the wealthy pay too little (from memory) |
| Fair share (don't punish success) | Pew, Apr 2023, ~3 in 10 the other way (from memory) |
| Size of government | Gallup Sept 2024, 51% "government does too much" (from memory) |
| The national debt | Pew, Feb 2024 topline, deficit 54% top priority (verified) |
| Will Social Security be there? | Gallup / AP-NORC 2024-25 (from memory) |

Holder probabilities follow the headline shares above. Per-group tilts, intensities and
every driver coefficient are estimates.

### Mood, levels and baseline

- Each person's baseline opinion is the group's mean plus Normal(0, 12).
- A person's reasons combine as follows. Reasons of 20 points or more add linearly, so
  catastrophes are never softened. Smaller ones combine as a 1.5-norm, so a pile of
  gripes has diminishing returns: ten -5 gripes make about -23, not -50.
- Positive reasons combine as a 1.5-norm too.
- Mood is clamped to -100..100.
- `moodDelta` is mood minus the mood computed once at the untouched budget.
- Levels use `CROWD_DATA.levelThresholds` = [30, 12, -14, -32, -55]: mood at or above
  30 is cheering, then happy, content, uneasy and angry, and below -55 is furious.

### Lenses

- **electability** = 100 x mean over figures of `1 / (1 + exp(-(mood + 12) / 10))`. This
  is a per-person chance of still voting for you; it saturates per person by
  construction.
- **fairness** = `100 x exp(-sd(moodDelta) / 15)` over figures (100 = everyone moved
  equally, whether up or down).
- **hardship** = mean over figures of `pain + pain^2 / 50`, with `pain = max(0, -moodDelta)`.
  It is uncapped and convex, so one person's catastrophe counts more than many small
  hits.

Grievances and cheers group every reason by `key` across the crowd and rank by total
impact. Each gives the strongest example sentence, the number of figures, and the sum
of their `represents`.

### Text

- Reasons are first person, with the person's own dollar amounts (monthly for checks).
- Every template has at least two phrasings, picked by a hash of the citizen and key,
  so a person keeps the same phrasing as a slider moves while neighbors differ. A test
  fails if 10+ figures share one sentence.
- `short` is checked against the 28-character limit and trimmed defensively.
- Idle chatter is used when nothing moves a person by 1 point or more.

### Results (seed 1, size 260)

Levels are figure counts for cheering / happy / content / uneasy / angry / furious.
E, F and H are the electability, fairness and hardship lenses. Each balanced plan
closes the ~$2.0T deficit to within ~$35B.

| Plan | Levels | E | F | H | Angriest groups |
|------|--------|---|---|---|-----------------|
| Baseline | 0 / 24 / 172 / 60 / 4 / 0 | 62.8 | 100 | 0 | (debt-worriers uneasy) |
| Tax-heavy (VAT 9%, all brackets, payroll, carbon) | 3 / 7 / 56 / 65 / 92 / 37 | 26.4 | 21.6 | 50.9 | top 0.1%, job seekers, students, energy workers |
| Cut-heavy (SS/Medicare -28%, Medicaid, SNAP...) | 1 / 8 / 70 / 46 / 44 / 91 | 27.9 | 8.0 | 95.3 | low-income retirees, low-income parents, disabled |
| Soak-the-rich (+ middle brackets, small VAT) | 8 / 41 / 142 / 48 / 10 / 11 | 63.5 | 23.6 | 14.6 | top 0.1%, top 1%, defense workers, farmers |
| Entitlement reform | 1 / 13 / 88 / 58 / 35 / 65 | 36.2 | 8.6 | 72.3 | low-income retirees, disabled, middle-income retirees |
| "Invisible" cuts (defense, science, housing, roads, aid...) + VAT | 1 / 2 / 46 / 59 / 88 / 64 | 20.2 | 18.8 | 70.5 | troops, defense workers, farmers, scientists, teachers |
| Balanced mix | 1 / 15 / 94 / 75 / 33 / 42 | 39.6 | 14.3 | 46.5 | top 0.1%, low-income retirees, disabled, job seekers |
| Brutal: gut the safety net, cut top taxes | 3 / 15 / 72 / 42 / 34 / 94 | 31.5 | 5.8 | 103.2 | low-income parents and retirees, disabled |
| Brutal: tax everyone | 1 / 8 / 27 / 12 / 22 / 190 | 12.3 | 8.5 | 176.6 | nearly everyone |

`react` for 260 figures averages about 2.8 ms on a heavy plan (Node 24, Windows laptop).
The test suite enforces < 5 ms.

## Playing

- Open `games/crowd/index.html` (double-click works; no server needed).
- **Controls** sit in the right-hand panel (a pull-up sheet on phones): every spending
  line as a % slider, and every tax or reform option under its budget line. A gold tick
  marks current law; "N reforms" / "N options" opens a line's details and options;
  each control has its own reset, and "Reset all" starts over.
- **Watch the crowd.** Each time you change something, the people most affected pop a
  speech bubble with their reason, and everyone changes pose. Mood shows on the figure
  itself and on the ground under it: balloons and jumping (cheering), smiles and picnics
  (happy), strolling (content), crossed arms and pacing (uneasy), protest signs (angry),
  torches and pitchforks (furious).
- **Mall** view: the angry gather at the Capitol steps under a banner naming their top
  complaint, the uneasy mill about in the middle, the happy picnic at the back. The
  other views line the crowd up as a pictogram chart by mood, group, age, income or
  top gripe, with counts and the number of real people under each column.
- **Hover** (or tap) anyone to hear them; **click** (or tap again) for their card: who
  they are, how many people they stand for, what happened to them, and every reason
  with a link to the control that caused it. Scroll or pinch on the crowd to zoom in.
- The mood bar at the top and both leaderboards highlight the matching figures.
  "The crowd as a list" gives the same information as text, for keyboards and screen
  readers.
- "Copy share link" puts your plan (and which crowd you met) in the URL. Your latest
  plan is also kept in this browser under `crowd.*` keys. "Meet a different crowd"
  deals a new set of people with the same real proportions.
- Add `?size=600` to the URL for a bigger crowd (each figure then stands for fewer
  people).
