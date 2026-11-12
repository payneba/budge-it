// Small, schema-conforming dataset used by the engine tests and for UI development.
// Numbers are round and invented; they are NOT real budget figures.
(function (root) {
  const FIXTURE_DATA = {
    meta: {
      fiscalYear: 2025,
      asOf: "2025-10",
      gdp: 30000,
      population: 340e6,
      households: 130e6,
      debtHeldByPublic: 29000,
      avgInterestRate: 0.033,
      baselineDeficitGrowth: 0.04,
      gdpGrowth: 0.04,
      revenueFeedbackPerGdpPct: 50,
      jobsPerGdpPct: 1e6,
      sources: [
        { label: "Fixture source A", url: "https://example.com/a" },
        { label: "Fixture source B", url: "https://example.com/b" }
      ],
      caveats: [
        "Fixture data: invented round numbers for testing.",
        "Effects are linear approximations."
      ]
    },

    spending: [
      {
        id: "pensions", name: "Pensions", icon: "👵", group: "mandatory",
        baseline: 1500, locked: false, min: -40, max: 30, step: 1,
        blurb: "Monthly checks for retirees.",
        facts: ["70 million recipients", "Average check $1,900/month"],
        stories: [
          { at: -5, text: "Checks shrink a little." },
          { at: -20, text: "Checks shrink a lot." },
          { at: 10, text: "Checks grow." }
        ],
        effects: {
          metrics: { elder_poverty: -40000 },
          personas: { retiree: 400 },
          approval: { seniors: 1.0, workers: 0.1 },
          gdpPct: 0.003
        }
      },
      {
        id: "health", name: "Health care", icon: "🏥", group: "mandatory",
        baseline: 1800, locked: false, min: -40, max: 30, step: 1,
        blurb: "Insurance for older and low-income people.",
        facts: ["130 million covered"],
        stories: [
          { at: -10, text: "Clinics close." },
          { at: 10, text: "Coverage expands." }
        ],
        effects: {
          metrics: { uninsured: -300000 },
          personas: { retiree: 150, worker_family: 60 },
          approval: { seniors: 0.6, workers: 0.3 },
          gdpPct: 0.002
        }
      },
      {
        id: "defense", name: "Defense", icon: "🛡️", group: "defense",
        baseline: 900, locked: false, min: -50, max: 50, step: 1,
        blurb: "The military.",
        facts: ["1.3 million active-duty troops"],
        stories: [{ at: -25, text: "Bases close." }],
        effects: {
          metrics: { teachers: 0 },
          personas: {},
          approval: { seniors: 0.2, business: 0.3 },
          gdpPct: 0.002
        }
      },
      {
        id: "schools", name: "Schools", icon: "🏫", group: "nondefense",
        baseline: 1800, locked: false, min: -60, max: 50, step: 1,
        blurb: "Grants to schools.",
        facts: ["50 million students"],
        stories: [],
        effects: {
          metrics: { teachers: 20000 },
          personas: { worker_family: 30 },
          approval: { workers: 0.4 },
          gdpPct: 0.004
        }
      },
      {
        id: "interest", name: "Interest on the debt", icon: "💳", group: "interest",
        baseline: 1000, locked: true, min: 0, max: 0, step: 1,
        blurb: "What we pay lenders.",
        facts: ["Driven by debt and rates"],
        stories: [],
        effects: {}
      }
    ],

    revenue: [
      { id: "income_tax", name: "Income tax", icon: "🧾", baseline: 2600, blurb: "Tax on wages and investment income.", facts: ["Biggest source"] },
      { id: "payroll_tax", name: "Payroll tax", icon: "💼", baseline: 1800, blurb: "Funds pensions and health care.", facts: [] },
      { id: "corporate_tax", name: "Corporate tax", icon: "🏢", baseline: 600, blurb: "Tax on company profits.", facts: [] }
    ],

    levers: [
      {
        id: "top_rate", parent: "income_tax", side: "revenue", type: "slider",
        name: "Top income tax rate", blurb: "Rate on the highest incomes.",
        unit: "%", min: 30, max: 50, step: 1, current: 37, budgetPerUnit: 20, falloff: 0.3,
        stories: [{ at: 42, text: "Top earners grumble." }, { at: 50, text: "Top earners flee." }, { at: 32, text: "Top earners cheer." }],
        source: "Fixture option 1",
        effects: { metrics: {}, personas: { business_owner: -800 }, approval: { business: -1.5, workers: 0.2 }, gdpPct: -0.01 }
      },
      {
        id: "corp_rate", parent: "corporate_tax", side: "revenue", type: "slider",
        name: "Corporate tax rate", blurb: "Rate on company profits.",
        unit: "%", min: 15, max: 35, step: 1, current: 21, budgetPerUnit: 12, falloff: 0.2,
        stories: [{ at: 28, text: "Companies complain." }],
        source: "Fixture option 2",
        effects: { metrics: {}, personas: { business_owner: -300 }, approval: { business: -1 }, gdpPct: -0.02 }
      },
      {
        id: "payroll_cap", parent: "payroll_tax", side: "revenue", type: "toggle",
        name: "Remove the payroll tax cap", blurb: "Apply payroll tax to all wages.",
        budgetPerUnit: 150, onText: "High earners pay payroll tax on every dollar.",
        source: "Fixture option 3",
        effects: { metrics: {}, personas: { business_owner: -4000 }, approval: { business: -6, seniors: 2 }, gdpPct: -0.05 }
      },
      {
        id: "wealth_tax", parent: "income_tax", side: "revenue", type: "toggle",
        name: "Wealth tax", blurb: "Annual tax on fortunes over $50 million.",
        budgetPerUnit: 200, onText: "Billionaires hire more accountants.",
        source: "Fixture option 4",
        effects: { metrics: {}, personas: {}, approval: { business: -8, workers: 3 }, gdpPct: -0.1 }
      },
      {
        id: "retirement_age", parent: "pensions", side: "spending", type: "slider",
        name: "Full retirement age", blurb: "Age for full pension benefits.",
        unit: " years", min: 65, max: 70, step: 1, current: 67, budgetPerUnit: -25,
        stories: [{ at: 69, text: "People work longer." }, { at: 65, text: "People retire earlier." }],
        source: "Fixture option 5",
        effects: { metrics: { elder_poverty: 30000 }, personas: { retiree: -500 }, approval: { seniors: -4, workers: -2 }, gdpPct: 0.01 }
      },
      {
        id: "drug_prices", parent: "health", side: "spending", type: "toggle",
        name: "Negotiate drug prices", blurb: "Government negotiates prices for more drugs.",
        budgetPerUnit: -50, onText: "Drug makers cut research budgets.",
        source: "Fixture option 6",
        effects: { metrics: {}, personas: { retiree: 200 }, approval: { seniors: 3, business: -2 }, gdpPct: 0 }
      },
      {
        id: "troop_drawdown", parent: "defense", side: "spending", type: "toggle",
        name: "Bring troops home", blurb: "Close overseas bases.",
        budgetPerUnit: -60, onText: "Overseas bases close.",
        source: "Fixture option 7",
        effects: { metrics: {}, personas: {}, approval: { seniors: -2, workers: 1 }, gdpPct: -0.02 }
      },
      {
        id: "teacher_pay", parent: "schools", side: "spending", type: "slider",
        name: "Teacher pay grants", blurb: "Federal raises for teachers.",
        unit: "% raise", min: 0, max: 20, step: 1, current: 0, budgetPerUnit: 4,
        stories: [{ at: 10, text: "Teachers stay in the classroom." }],
        source: "Fixture option 8",
        effects: { metrics: { teachers: 5000 }, personas: { worker_family: 10 }, approval: { workers: 0.5 }, gdpPct: 0.001 }
      }
    ],

    personas: [
      // take-home pay: retiree 38,500; worker_family 66,000; business_owner 620,000
      { id: "retiree", name: "Walt", icon: "👴", tagline: "Retiree, Ohio", income: 40000, detail: "Lives on a pension.", federalTaxes: 1500, federalBenefits: 35000, share: 0.3 },
      { id: "worker_family", name: "The Garcias", icon: "👨‍👩‍👧", tagline: "Family of four, Texas", income: 75000, detail: "Two jobs, two kids.", federalTaxes: 9000, federalBenefits: 2000, share: 0.65 },
      { id: "business_owner", name: "Priya", icon: "👩‍💼", tagline: "Business owner, California", income: 900000, detail: "Runs a software firm.", federalTaxes: 280000, federalBenefits: 0, share: 0.05 }
    ],

    metrics: [
      { id: "elder_poverty", name: "Seniors in poverty", icon: "🧓", baseline: 6e6, goodDirection: "down", format: "people", min: 0 },
      { id: "uninsured", name: "Uninsured people", icon: "🩺", baseline: 27e6, goodDirection: "down", format: "people", min: 0 },
      { id: "teachers", name: "Teaching jobs", icon: "🍎", baseline: 3.2e6, goodDirection: "up", format: "jobs", min: 0 }
    ],

    blocs: [
      { id: "seniors", name: "Seniors", icon: "🧓", share: 0.3, baselineApproval: 45 },
      { id: "workers", name: "Working families", icon: "🧑‍🔧", share: 0.5, baselineApproval: 40 },
      { id: "business", name: "Business owners", icon: "💼", share: 0.2, baselineApproval: 50 }
    ],

    headlines: [
      { when: { stat: "deficit", op: "<=", value: 0 }, text: "BUDGET BALANCED", priority: 10 },
      { when: { lever: "pensions", op: "<=", value: -20 }, text: "SENIORS STORM CAPITOL", priority: 5 },
      { when: { lever: "top_rate", op: ">=", value: 45 }, text: "TOP RATE SOARS", priority: 4 },
      { when: { lever: "wealth_tax", op: ">=", value: 1 }, text: "WEALTH TAX PASSES", priority: 4 },
      { when: { stat: "approval", op: "<=", value: 30 }, text: "APPROVAL CRATERS", priority: 6 },
      { when: { stat: "jobs", op: "<=", value: -1e6 }, text: "LAYOFFS MOUNT", priority: 3 },
      { when: { stat: "gdpPct", op: "<=", value: -1 }, text: "RECESSION FEARS", priority: 3 },
      { when: { metric: "uninsured", op: ">=", value: 35e6 }, text: "MILLIONS LOSE COVERAGE", priority: 5 },
      { when: { stat: "deficit", op: ">=", value: -1e9 }, text: "CONGRESS RETURNS TO WORK", priority: 0 }
    ],

    challenges: [
      { id: "no_new_taxes", name: "Read My Lips", icon: "👄", blurb: "Balance without raising taxes.", rules: { noTaxIncreases: true, minApproval: 35 } },
      { id: "protect_seniors", name: "Hands Off", icon: "🤚", blurb: "Balance without touching pensions.", rules: { protect: ["pensions"], maxUnemploymentJobsLost: 1e6 } }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FIXTURE_DATA;
  else root.BUDGET_DATA = FIXTURE_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
