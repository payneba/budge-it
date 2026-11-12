// Budge It: all content and numbers for the game.
// Money is in billions of nominal US dollars per year unless stated otherwise.
// Baseline: fiscal year 2026 actuals (Oct 1 2025 - Sep 30 2026) from the final
// Monthly Treasury Statement for September 2026, with program detail from its
// tables 4, 5 and 9. Policy-option estimates are annual, fully phased-in figures
// scaled to FY2026, derived from 10-year scores (CBO, JCT, CRFB, PWBM, TPC).
(function (root) {
  const BUDGET_DATA = {
    meta: {
      fiscalYear: 2026,
      asOf: "2026-11",
      gdp: 32100,                    // FY2026 nominal GDP: $1,992B deficit = 6.2% of GDP (CBO)
      population: 343e6,
      households: 133e6,
      debtHeldByPublic: 32400,       // end of FY2026, ~100% of GDP (CBO)
      avgInterestRate: 0.034,        // $1,052B net interest / ~$31.3T average debt held by public
      baselineDeficitGrowth: 0.045,  // CBO baseline: deficits climb from ~$2T toward ~$3T over the decade
      gdpGrowth: 0.04,               // nominal GDP growth (CBO long-run ~3.8-4%)
      revenueFeedbackPerGdpPct: 54,  // receipts are 16.8% of GDP: 1% of GDP ($321B) x 0.168
      jobsPerGdpPct: 1.0e6,          // Okun's law: 1% of GDP ~ 0.5 pt unemployment ~ 0.85M jobs, plus participation
      sources: [
        { label: "US Treasury, Monthly Treasury Statement, September 2026 (FY2026 year-end): table 4 (receipts by source), table 5 (outlays by agency and account), table 9 (outlays by function)", url: "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/" },
        { label: "CBO, Monthly Budget Review: Summary for Fiscal Year 2026 (Nov 2026)", url: "https://www.cbo.gov/publication/61986" },
        { label: "American Action Forum, summary of CBO's FY2026 Monthly Budget Review (where the deficit-to-GDP, debt-to-GDP and corporate-tax-decline figures were read)", url: "https://www.americanactionforum.org/insight/cbo-fy-2026-budget-deficit-totaled-2-trillion/" },
        { label: "CBO, Options for Reducing the Deficit: 2025 to 2034 (Dec 2024)", url: "https://www.cbo.gov/system/files/2024-12/60557-budget-options.pdf" },
        { label: "CRFB, CBO's Revenue Savings Options (scores restated for FY2026-2035)", url: "https://www.crfb.org/blogs/cbos-revenue-savings-options" },
        { label: "CRFB, CBO's Options to Improve Social Security Solvency", url: "https://www.crfb.org/blogs/cbos-options-improve-social-security-solvency" },
        { label: "CRFB, CBO's Medicare Savings Options", url: "https://crfb.org/blogs/cbos-medicare-savings-options" },
        { label: "Census Bureau, Income, Poverty and Health Insurance Coverage: 2025 (Sept 15, 2026)", url: "https://www.census.gov/newsroom/press-releases/2026/income-poverty-health-insurance-coverage.html" },
        { label: "Social Security and Medicare Trustees 2026 reports (CRFB summary)", url: "https://www.crfb.org/blogs/social-security-and-medicare-trustees-release-2026-reports" },
        { label: "KFF, Midterm Election Update: The ACA Marketplaces (enhanced credits expired)", url: "https://www.kff.org/elections/midterm-election-update-the-affordable-care-act-marketplaces/" },
        { label: "KFF, Work requirement provisions in the 2025 reconciliation law", url: "https://www.kff.org/medicaid/issue-brief/a-closer-look-at-the-work-requirement-provisions-in-the-2025-federal-budget-reconciliation-law/" },
        { label: "Marketplace, The tariffs that remain after the Supreme Court ruling (Feb 2026)", url: "https://www.marketplace.org/story/2026/02/23/the-tariffs-that-remain-after-scotus-ruling" },
        { label: "Hellenic Shipping News, reporting a Fitch Ratings estimate (July 2026): US effective tariff rate falls to 7.4%", url: "https://www.hellenicshippingnews.com/?p=1143409" },
        { label: "Program for Public Consultation (Voice of the People), Social Security policy polling", url: "https://vop.org/commonground/social-security/" },
        { label: "Fox Business, Americans split on how to save Social Security as the 2032 deadline looms (poll report)", url: "https://www.foxbusiness.com/economy/americans-split-how-save-social-security-from-insolvency-2032-deadline-looms-poll-finds" }
      ],
      caveats: [
        "This is a one-year snapshot. Real budget changes phase in over many years, and many options here save little in year one but much more later. We show each option at its full, phased-in size at today's prices.",
        "Option estimates are borrowed from official and independent scorekeepers and simply added together. In real life options interact: raising one tax shrinks the base for another, and two cuts to the same program can't both get full credit.",
        "The economic effects (GDP and jobs) are rough, short-to-medium-run estimates. They ignore how the Federal Reserve might respond and the long-run benefits of lower debt, which most economists think are real but slow.",
        "Household effects are illustrative estimates for eight made-up but typical families. Your own situation can differ a lot depending on where you live and how a change is designed.",
        "Voter reaction is a game mechanic loosely calibrated to polling on these policies, not a prediction of any election.",
        "Hardship and shared sacrifice count only the direct dollar effects on the eight example households. They do not include losing health coverage, a job or a public service unless that shows up as dollars for one of those households, so cuts to things like research, roads, housing aid or the military's hardware barely register on them. Each household's share of the country is a rough estimate.",
        "Spending lines are net of fees and offsetting receipts the government collects (for example Medicare premiums), and some agencies' payments into federal retirement funds are netted out, so a few lines look smaller than the gross checks they pay."
      ]
    },

    // ------------------------------------------------------------------
    // WHERE THE MONEY GOES: FY2026 outlays, $7,395.8B total (MTS Sept 2026)
    // ------------------------------------------------------------------
    spending: [
      {
        id: "social_security", name: "Social Security", icon: "👵", group: "mandatory",
        baseline: 1667.1, locked: false, min: -40, max: 30, step: 1,
        blurb: "Monthly checks for retirees, people with disabilities, and surviving spouses and children, paid for mostly by payroll taxes.",
        facts: [
          "About 70 million people get a check every month",
          "Average retired worker: about $2,070 a month in 2026",
          "Keeps 28.8 million people out of poverty, more than any other program (Census, 2025)",
          "The retirement fund alone runs dry in late 2032; combined with the disability fund, 2034. After that, checks would be cut about 22% automatically unless Congress acts"
        ],
        stories: [
          { at: -5, text: "Every check shrinks about 5%: a typical retiree loses roughly $100 a month, about what many spend on groceries in a week." },
          { at: -15, text: "A typical retired couple loses around $580 a month. Roughly 1.5 million more seniors fall below the poverty line, and many move in with their children." },
          { at: -30, text: "Checks drop by nearly a third, deeper than the automatic cut due when the trust fund runs out. Widows living on Social Security alone can no longer cover rent and food in most of the country." },
          { at: 5, text: "Benefits rise 5%: about $100 more a month for the average retiree. The extra money mostly goes to rent, medicine and helping grandkids." },
          { at: 20, text: "A 20% raise puts about $400 a month more in the average retiree's pocket and nearly ends poverty among older widows, but the trust fund runs dry years sooner." }
        ],
        effects: {
          // 1% of a $46,000/yr couple's benefit = $460. ~1.2 depletion years per 1%: 1% of benefits ~4% of the 75-yr gap.
          metrics: { senior_poverty: -60000, poverty: -90000, ss_depletion_year: -1.0 },
          personas: { retired_couple: 460 },
          approval: { seniors: 1.0, working_families: 0.25, young_adults: 0.1, small_business: 0.05, rural_military: 0.35 },
          gdpPct: 0.031 // $16.7B x multiplier 0.6 / $32,100B
        }
      },
      {
        id: "medicare", name: "Medicare", icon: "🏥", group: "mandatory",
        baseline: 1072.6, locked: false, min: -40, max: 30, step: 1,
        blurb: "Health insurance for people 65 and older and some people with disabilities. This is the cost after premiums seniors pay.",
        facts: [
          "About 69 million people are covered",
          "More than half get their Medicare through a private Medicare Advantage plan",
          "Average federal cost: roughly $15,500 per person per year, after premiums",
          "Hospital trust fund is projected to run short in the 2030s (2026 Trustees)"
        ],
        stories: [
          { at: -5, text: "Payments to hospitals and doctors drop about 5%. Some rural hospitals close their maternity or cancer wards, and more doctors stop taking new Medicare patients." },
          { at: -20, text: "A cut this big means higher premiums and copays: the average senior pays roughly $1,500 more a year, and many skip pills or checkups to make it to the end of the month." },
          { at: -35, text: "Medicare stops covering many services. Hundreds of hospitals that depend on older patients go under, and towns lose their biggest employer along with their ER." },
          { at: 5, text: "Extra money could add dental, hearing and vision coverage, which seniors now mostly pay for themselves." },
          { at: 20, text: "A big boost could cap seniors' out-of-pocket costs at a low level and cover long-term home care, so fewer families have to quit jobs to care for a parent." }
        ],
        effects: {
          metrics: { senior_poverty: -15000, poverty: -18000 },
          personas: { retired_couple: 200 }, // ~1% of ~$26,000 coverage value for two, partly absorbed by providers
          approval: { seniors: 0.7, working_families: 0.15, young_adults: 0.05, small_business: 0.05, rural_military: 0.25 },
          gdpPct: 0.0167 // $10.7B x 0.5
        }
      },
      {
        id: "medicaid_chip", name: "Medicaid & CHIP", icon: "🩺", group: "mandatory",
        baseline: 748.0, locked: false, min: -50, max: 50, step: 1,
        blurb: "Health coverage for low-income families, children, pregnant women, people with disabilities, and nursing-home residents. States run it; Washington pays most of the bill.",
        facts: [
          "About 78 million people are covered, including nearly half of all children",
          "Pays for about 4 in 10 births in the US",
          "Pays for most nursing-home care in the country",
          "The 2025 law adds work requirements for many adults starting at the end of 2026; CBO expects about 5 million to lose coverage"
        ],
        stories: [
          { at: -5, text: "States respond to a 5% cut by trimming what they pay doctors and dentists. Waiting lists grow, and about a million people lose coverage as states tighten paperwork." },
          { at: -15, text: "States drop optional benefits like dental and home care, and roughly 3 million people lose coverage. Families of kids with disabilities face months-long waits for therapy." },
          { at: -30, text: "Around 6 million more people become uninsured. Rural hospitals that rely on Medicaid close, and nursing homes start turning away residents who have run out of savings." },
          { at: 10, text: "More money lets states raise what they pay doctors, so more pediatricians and dentists take Medicaid patients and waits get shorter." },
          { at: 30, text: "Enough to cover low-income adults in the states that never expanded Medicaid: roughly 1.5 million more people get insurance, and medical debt in those states drops." }
        ],
        effects: {
          metrics: { uninsured: -200000, poverty: -20000, child_poverty: -8000 },
          personas: { single_mom: 70 }, // ~1% of $7,000 coverage value for her two kids
          approval: { seniors: 0.2, working_families: 0.3, young_adults: 0.15, high_earners: -0.02, small_business: 0.02, rural_military: 0.2 },
          gdpPct: 0.0186 // $7.5B x 0.8
        }
      },
      {
        id: "aca_subsidies", name: "Obamacare (ACA) subsidies", icon: "🧾", group: "mandatory",
        baseline: 126.1, locked: false, min: -100, max: 100, step: 1,
        blurb: "Tax credits that lower monthly premiums for people who buy their own health insurance on HealthCare.gov or a state marketplace.",
        facts: [
          "About 23 million people signed up for 2026, down from a record 24 million in 2025",
          "Extra 'enhanced' subsidies expired at the end of 2025, more than doubling what many enrollees pay",
          "Popular with self-employed people, farmers, early retirees and gig workers"
        ],
        stories: [
          { at: -10, text: "Premium help shrinks 10%: a 50-year-old earning $40,000 pays about $60 more a month, and roughly 400,000 people drop their coverage." },
          { at: -50, text: "Half the help is gone. Premiums for a middle-aged couple in rural areas jump by hundreds of dollars a month, and about 2 million people go uninsured." },
          { at: -100, text: "No more marketplace subsidies. Coverage becomes unaffordable for most of the 20-plus million people who buy their own insurance, and insurers pull out of many counties entirely." },
          { at: 10, text: "Premiums fall for millions of people buying their own coverage, and a few hundred thousand more people sign up." },
          { at: 30, text: "Roughly enough to bring back the extra subsidies that expired in 2025: about 4 million more people get covered, and premiums for families just over the old income limit fall by thousands." }
        ],
        effects: {
          metrics: { uninsured: -120000 },
          personas: { single_mom: 60 }, // 1% of ~$6,000 marketplace premium credit (Dale & Kathy are above 400% of poverty: no credit now)
          approval: { seniors: 0.01, working_families: 0.06, young_adults: 0.04, small_business: 0.04, rural_military: 0.03 },
          gdpPct: 0.0031
        }
      },
      {
        id: "veterans", name: "Veterans' benefits & health care", icon: "🎖️", group: "mandatory",
        baseline: 416.2, locked: false, min: -40, max: 30, step: 1,
        blurb: "Disability payments, pensions, GI Bill education benefits, home loans, and VA hospitals and clinics for the country's 18 million veterans.",
        facts: [
          "About 7 million veterans get disability compensation, averaging around $1,900 a month",
          "The VA runs the largest health system in the US, with about 9 million enrolled",
          "Spending grew about 10% in 2026 alone, largely from the PACT Act for toxic burn-pit exposure"
        ],
        stories: [
          { at: -5, text: "Wait times at VA clinics grow by weeks, and new disability claims take longer to process. Hiring freezes leave many rural clinics short of nurses." },
          { at: -25, text: "Disability checks are trimmed for millions of veterans, and the VA closes smaller hospitals. A Marine with a 70% disability rating loses about $450 a month." },
          { at: 5, text: "More VA doctors and mental-health counselors: waits for appointments shrink, and more veterans get care close to home." },
          { at: 20, text: "Faster claims, bigger caregiver stipends for families looking after wounded vets, and a push to end veteran homelessness." }
        ],
        effects: {
          metrics: { poverty: -5000 },
          personas: { farm_family: 78 }, // Dale's ~$7,800/yr VA disability compensation
          approval: { seniors: 0.1, working_families: 0.05, young_adults: 0.03, high_earners: 0.02, small_business: 0.02, rural_military: 0.3 },
          gdpPct: 0.0078
        }
      },
      {
        id: "defense_personnel", name: "Military pay & benefits", icon: "🪖", group: "defense",
        baseline: 223.3, locked: false, min: -50, max: 50, step: 1,
        blurb: "Salaries, housing allowances and benefits for about 1.3 million active-duty troops and 760,000 Guard and Reserve members.",
        facts: [
          "About 1.3 million active-duty service members",
          "A new private (E-1) earns about $26,000 a year in base pay, plus housing and food allowances",
          "Includes payments toward military retirement for today's troops"
        ],
        stories: [
          { at: -5, text: "A pay freeze and smaller housing allowances: a sergeant's family in San Diego loses about $250 a month, and re-enlistment rates dip." },
          { at: -25, text: "Roughly 165,000 fewer troops. Whole Army brigades and Navy ships are retired, and restaurants and shops near small-town bases lose their customers." },
          { at: -50, text: "About 330,000 fewer troops, a quarter of the force, and deep pay cuts for those who stay. The US can no longer keep forces in Europe, Korea and the Middle East at the same time, and allies scramble to fill the gap." },
          { at: 5, text: "A raise for junior enlisted troops, many of whose families now qualify for food aid. Recruiters have an easier time." },
          { at: 25, text: "Room for about 165,000 more troops plus better pay. The armed forces grow to their largest size since the mid-1990s." }
        ],
        effects: {
          metrics: { military_personnel: 6600 }, // assume half of a 1% change comes from headcount: 0.5% of 1.32M
          personas: { military_family: 360 },    // half of 1% of ~$72k pay and housing allowance
          approval: { seniors: 0.03, working_families: 0.02, small_business: 0.01, high_earners: 0.01, rural_military: 0.18 },
          gdpPct: 0.0056
        }
      },
      {
        id: "defense_operations", name: "Military operations & bases", icon: "⚓", group: "defense",
        baseline: 355.7, locked: false, min: -50, max: 50, step: 1,
        blurb: "Training, fuel, maintenance, military health care, bases at home and abroad, and the day-to-day running of the armed forces.",
        facts: [
          "About 750 military sites in some 80 countries",
          "TRICARE health coverage for about 9 million troops, families and retirees",
          "Includes construction of barracks, runways and family housing"
        ],
        stories: [
          { at: -5, text: "Fewer flight hours and training exercises. Pilots fly less than they'd like, and ship repairs slip by months." },
          { at: -25, text: "Dozens of bases close or shrink. Military towns from North Carolina to Texas lose thousands of civilian jobs, and aircraft sit grounded waiting for parts." },
          { at: -50, text: "The armed forces can barely train. Many aircraft and ships stay in port, and military families lose services like on-base child care and clinics." },
          { at: 10, text: "Repair backlogs shrink, moldy barracks get fixed, and units train more often." },
          { at: 30, text: "Large-scale exercises and more forces stationed in Europe and Asia. Defense contractors near bases hire." }
        ],
        effects: {
          metrics: {},
          personas: { military_family: 50 },
          approval: { seniors: 0.03, working_families: 0.01, young_adults: -0.01, small_business: 0.01, high_earners: 0.01, rural_military: 0.12 },
          gdpPct: 0.0066
        }
      },
      {
        id: "defense_weapons", name: "Weapons, R&D & nuclear arsenal", icon: "🚀", group: "defense",
        baseline: 386.2, locked: false, min: -50, max: 50, step: 1,
        blurb: "Buying ships, planes, missiles and drones, military research, and the Energy Department's nuclear-weapons work.",
        facts: [
          "Procurement $177B and research and development $161B in 2026",
          "An F-35 fighter costs roughly $80-110 million; a new Columbia-class submarine over $9 billion",
          "About $48B goes to nuclear weapons and other defense work outside the Pentagon"
        ],
        stories: [
          { at: -5, text: "Some purchases slow down. A few dozen fighter jets and a ship get pushed to later years, and contractors trim overtime." },
          { at: -25, text: "Several big programs are canceled outright. Shipyards and missile plants in Virginia, Connecticut, Alabama and Arizona lay off tens of thousands." },
          { at: -50, text: "Most new weapons purchases stop. The US relies on aging planes and ships for a decade, and rivals close the technology gap faster." },
          { at: 10, text: "Faster shipbuilding and more drones and missiles to restock what was sent to allies. Factory towns building munitions hire." },
          { at: 30, text: "A Cold War-style buildup: new submarines, bombers, and a space-based missile shield all speed up, adding tens of thousands of defense-industry jobs." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: 0.03, young_adults: -0.03, small_business: 0.02, high_earners: 0.02, rural_military: 0.12 },
          gdpPct: 0.0072
        }
      },
      {
        id: "snap_food", name: "SNAP & food aid", icon: "🥫", group: "mandatory",
        baseline: 136.4, locked: false, min: -100, max: 100, step: 1,
        blurb: "Food stamps (SNAP), school breakfast and lunch, and WIC for pregnant women, babies and toddlers.",
        facts: [
          "About 41 million people use SNAP; the average benefit is about $190 per person per month",
          "Around 30 million kids eat a federally supported school lunch on a typical day",
          "WIC serves about 6.7 million moms, babies and young children",
          "The 2025 law expands work requirements and shifts some costs to states starting in 2028"
        ],
        stories: [
          { at: -10, text: "A family of four on SNAP loses about $75 a month, roughly two days of groceries. Food banks report longer lines by the end of each month." },
          { at: -30, text: "Benefits shrink by a third, and about 6 million people are cut off. Schools in poor districts drop free breakfast." },
          { at: -100, text: "Federal food aid ends. Grocery stores in low-income neighborhoods lose a large share of their sales, food banks can't come close to filling the gap, and child hunger rises sharply." },
          { at: 10, text: "Bigger grocery benefits: a family of four gets about $75 more a month, enough that fewer run out of food before the month ends." },
          { at: 50, text: "Free school meals for every child in the country, plus a summer grocery card for low-income families." }
        ],
        effects: {
          metrics: { food_aid: 200000, poverty: -40000, child_poverty: -15000 },
          personas: { single_mom: 34 }, // 1% of ~$2,400 SNAP + ~$1,000 school meals
          approval: { seniors: 0.01, working_families: 0.06, young_adults: 0.02, high_earners: -0.01, rural_military: 0.02 },
          gdpPct: 0.0051 // $1.36B x 1.2 (food aid is spent fast)
        }
      },
      {
        id: "income_support", name: "Income support (EITC, child credit, SSI, unemployment)", icon: "🤝", group: "mandatory",
        baseline: 288.8, locked: false, min: -50, max: 50, step: 1,
        blurb: "Refundable tax credits for working families, monthly SSI checks for poor elderly and disabled people, unemployment benefits, TANF and child care help.",
        facts: [
          "Earned Income Tax Credit refunds: $68.5B in 2026; child tax credit refunds: $28.6B",
          "About 7.4 million people get SSI; the maximum check is $994 a month in 2026",
          "Unemployment benefits paid about $42B in 2026"
        ],
        stories: [
          { at: -10, text: "Tax refunds for working families shrink. A cashier with two kids loses about $870 of her yearly refund, money many use to catch up on rent and car repairs." },
          { at: -30, text: "SSI checks for the poorest disabled and elderly people drop by about $300 a month, and unemployment benefits run out weeks sooner. Roughly 2 million more people fall into poverty." },
          { at: -50, text: "Half the safety net is gone. Child poverty jumps, and in the next recession laid-off workers get little help, which makes the downturn deeper." },
          { at: 10, text: "Bigger work credits for low-wage workers, including those without children, who now get almost nothing." },
          { at: 30, text: "Larger refunds and SSI checks lift about 2 million people out of poverty, more than half of them children." }
        ],
        effects: {
          metrics: { poverty: -80000, child_poverty: -35000, senior_poverty: -10000 },
          personas: { single_mom: 87 }, // 1% of ~$5,330 EITC + $3,400 refundable child credit
          approval: { seniors: 0.02, working_families: 0.09, young_adults: 0.03, high_earners: -0.02, small_business: -0.01, rural_military: 0.03 },
          gdpPct: 0.009
        }
      },
      {
        id: "federal_retirement", name: "Federal & military pensions", icon: "🏛️", group: "mandatory",
        baseline: 103.2, locked: false, min: -40, max: 30, step: 1,
        blurb: "Pensions and disability payments for retired federal workers and military retirees, after subtracting what agencies pay into the funds (already counted in their budgets).",
        facts: [
          "Pension checks total about $200B a year; agencies pay about half of that into the funds from their own budgets",
          "About 2.7 million civil-service retirees and survivors and 2.3 million military retirees and survivors",
          "A soldier who serves 20 years can retire with a pension in their early 40s"
        ],
        stories: [
          { at: -10, text: "Smaller cost-of-living raises for federal and military retirees: a retired Army master sergeant loses about $150 a month after a few years." },
          { at: -30, text: "Pensions for future federal workers are slashed. Hiring experienced nurses, engineers and air-traffic controllers gets harder." },
          { at: 10, text: "Retirees get bigger annual raises and larger survivor benefits." },
          { at: 25, text: "Military retirees who are also disabled receive both full payments without the current offsets." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: 0.03, working_families: 0.01, rural_military: 0.03 },
          gdpPct: 0.0019
        }
      },
      {
        id: "housing_aid", name: "Housing aid", icon: "🏠", group: "nondefense",
        baseline: 66.0, locked: false, min: -100, max: 100, step: 1,
        blurb: "Housing vouchers, public housing and rent help for low-income seniors, people with disabilities and families.",
        facts: [
          "About 4.6 million households get federal rent help",
          "Only about 1 in 4 eligible families gets help; waiting lists in big cities run for years",
          "A typical voucher family pays about 30% of its income in rent"
        ],
        stories: [
          { at: -10, text: "Housing agencies stop issuing new vouchers. About 450,000 fewer households get rent help over time, and waiting lists get longer." },
          { at: -40, text: "Public-housing repairs stop and roughly 1.8 million households lose rent help. Homeless shelters in big cities fill up." },
          { at: -100, text: "Federal rent help ends. Millions of elderly and disabled tenants face rent they can't pay, and homelessness could double." },
          { at: 10, text: "Hundreds of thousands of families come off the waiting lists, mostly in high-rent cities." },
          { at: 50, text: "Enough to give rent help to about 2 million more households, a big step toward helping everyone who qualifies." }
        ],
        effects: {
          metrics: { rent_aid_households: 46000, poverty: -25000 },
          personas: {},
          approval: { seniors: 0.01, working_families: 0.03, young_adults: 0.03, high_earners: -0.01 },
          gdpPct: 0.0016
        }
      },
      {
        id: "education", name: "Education & job training", icon: "🎓", group: "nondefense",
        baseline: 107.6, locked: false, min: -75, max: 100, step: 1,
        blurb: "Pell grants and student loans, aid for schools in poor areas and for special education, Head Start, job training and social services.",
        facts: [
          "About 6.5 million students get Pell grants, up to $7,395 a year",
          "Special-education funding helps schools serve about 7.5 million students with disabilities",
          "Head Start serves around 750,000 young children",
          "Federal money is only about 10% of what K-12 schools spend; the rest is state and local"
        ],
        stories: [
          { at: -10, text: "Pell grants shrink by about $700 per student, and some community-college students drop to part-time." },
          { at: -40, text: "Schools in poor areas lose federal aid and lay off reading specialists and aides. Head Start closes centers, leaving about 300,000 young kids without a spot." },
          { at: -75, text: "Most federal education aid is gone. Districts raise property taxes or cut special education, and college becomes unaffordable for many low-income students." },
          { at: 10, text: "Bigger Pell grants and more apprenticeship slots for people learning trades." },
          { at: 50, text: "Tuition-free community college in many states and full federal funding for special education, which Congress promised in 1975 but never delivered." }
        ],
        effects: {
          metrics: {},
          personas: { young_renter: 15, median_family: 20, single_mom: 25, military_family: 15 },
          approval: { working_families: 0.05, young_adults: 0.06, rural_military: 0.01 },
          gdpPct: 0.0023
        }
      },
      {
        id: "transportation", name: "Highways, transit & air travel", icon: "🛣️", group: "nondefense",
        baseline: 142.9, locked: false, min: -50, max: 100, step: 1,
        blurb: "Federal money for highways, bridges, buses and subways, air-traffic control and airports, Amtrak, and the Coast Guard.",
        facts: [
          "Highway grants to states: $66B in 2026",
          "Air-traffic controllers guide about 45,000 flights a day",
          "The gas tax that funds highways hasn't gone up since 1993"
        ],
        stories: [
          { at: -10, text: "States delay road and bridge repairs. Potholes stay longer, and a few transit agencies cut late-night service." },
          { at: -40, text: "Thousands of repair projects stop. Construction crews are laid off, flight delays grow as air-traffic control upgrades stall, and some bus routes disappear." },
          { at: 10, text: "More bridges get fixed and airports finally replace decades-old radar systems." },
          { at: 50, text: "A big building push: high-speed rail corridors, rebuilt interstates and new transit lines, employing hundreds of thousands of construction workers." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: 0.01, working_families: 0.02, young_adults: 0.01, high_earners: 0.01, small_business: 0.03, rural_military: 0.03 },
          gdpPct: 0.0045 // $1.43B x 1.0 (construction)
        }
      },
      {
        id: "science_research", name: "Science, space & medical research", icon: "🔬", group: "nondefense",
        baseline: 85.5, locked: false, min: -75, max: 100, step: 1,
        blurb: "The National Institutes of Health, the National Science Foundation, NASA and the Energy Department's science labs.",
        facts: [
          "NIH spent $45.6B in 2026, funding researchers at about 2,500 universities and hospitals",
          "NASA: $23.4B, including the Artemis Moon missions",
          "Federal research helped create GPS, the internet, mRNA vaccines and most new cancer drugs"
        ],
        stories: [
          { at: -10, text: "Thousands of research grants aren't renewed. Labs studying cancer and Alzheimer's let go of graduate students, and some scientists move abroad." },
          { at: -40, text: "NIH funds only the very top proposals, NASA cancels missions, and a generation of young scientists leaves research for other careers or other countries." },
          { at: 10, text: "About 2,000 more grants a year; new drug and battery research speeds up." },
          { at: 50, text: "A research boom: new labs, bigger Moon and Mars programs, and a jump in breakthroughs that may pay off for decades." }
        ],
        effects: {
          metrics: { research_grants: 300 },
          personas: {},
          approval: { seniors: 0.01, working_families: 0.01, young_adults: 0.03, high_earners: 0.02, small_business: 0.01 },
          gdpPct: 0.0019
        }
      },
      {
        id: "foreign_aid", name: "Foreign aid & diplomacy", icon: "🌍", group: "nondefense",
        baseline: 48.0, locked: false, min: -100, max: 200, step: 1,
        blurb: "Embassies and diplomats, global health programs, disaster relief abroad, and military aid to allies.",
        facts: [
          "Less than 1% of the federal budget, though polls find Americans guess it's around a quarter",
          "Global health programs buy HIV drugs, vaccines and malaria nets for millions of people",
          "Includes about $8.5B of military aid to allies"
        ],
        stories: [
          { at: -25, text: "Fewer embassy staff and smaller health programs abroad. HIV clinics in Africa ration drugs, and US food aid shipments shrink." },
          { at: -100, text: "The US stops nearly all aid and closes many embassies. Millions lose HIV treatment, and other powers step in to build influence. Total savings: about 10 days' worth of Social Security checks." },
          { at: 25, text: "More vaccine campaigns and famine relief; US farmers sell more crops for food aid." },
          { at: 100, text: "Doubling aid could fund a global push against malaria and childhood diseases, saving hundreds of thousands of lives a year by most estimates." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: -0.01, working_families: -0.01, young_adults: 0.02, rural_military: -0.02 },
          gdpPct: 0.00015
        }
      },
      {
        id: "border_immigration", name: "Border & immigration enforcement", icon: "🛂", group: "nondefense",
        baseline: 57.0, locked: false, min: -50, max: 100, step: 1,
        blurb: "Customs and Border Protection, Immigration and Customs Enforcement (ICE), and the immigration services agency.",
        facts: [
          "CBP $28.9B, ICE $22.4B in 2026, both growing fast after the 2025 law",
          "CBP inspects about 1 million travelers and $10 billion of imports every day",
          "ICE holds tens of thousands of people in detention on a typical day"
        ],
        stories: [
          { at: -10, text: "ICE stops expanding detention, and fewer deportation flights take off. Some border stations run short-staffed." },
          { at: -40, text: "Enforcement falls back to early-2020s levels. Fewer people are deported, airport and port inspections slow, and the immigration court backlog keeps growing." },
          { at: 10, text: "More inspectors at ports of entry, which speeds up trucks and catches more fentanyl, plus more immigration judges to cut the backlog." },
          { at: 50, text: "A major enforcement surge: many more detention beds and deportations, and a bigger presence at the border and in interior cities." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: 0.02, young_adults: -0.03, rural_military: 0.03 },
          gdpPct: 0.0009
        }
      },
      {
        id: "justice", name: "Law enforcement & courts", icon: "⚖️", group: "nondefense",
        baseline: 52.9, locked: false, min: -50, max: 50, step: 1,
        blurb: "The FBI, DEA, federal prisons, federal courts, US attorneys and grants to local police.",
        facts: [
          "About 155,000 people are in federal prisons",
          "The FBI employs about 37,000 people",
          "Federal courts handle hundreds of thousands of cases a year"
        ],
        stories: [
          { at: -10, text: "Hiring freezes at the FBI and federal prisons. Fraud and cybercrime cases take longer to bring." },
          { at: -40, text: "Federal courts cut jury trials and prisons run dangerously understaffed. Grants for local police and victims' services disappear." },
          { at: 10, text: "More agents for fentanyl trafficking, child exploitation and cybercrime cases." },
          { at: 40, text: "Bigger grants for local police and crime-victim services, and faster federal trials." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: 0.01, working_families: 0.01, rural_military: 0.01 },
          gdpPct: 0.001
        }
      },
      {
        id: "agriculture", name: "Farm support", icon: "🚜", group: "nondefense",
        baseline: 52.6, locked: false, min: -100, max: 100, step: 1,
        blurb: "Crop insurance, payments when prices fall, conservation programs, and the farm research and inspection services.",
        facts: [
          "Crop insurance and price-support programs mostly benefit corn, soybean, wheat, cotton and rice growers",
          "The largest 10% of farms receive a majority of commodity payments",
          "Includes special aid paid to farmers hurt by trade disputes"
        ],
        stories: [
          { at: -10, text: "Smaller crop-insurance discounts: a typical Midwest grain farm pays about $1,800 more a year for coverage." },
          { at: -50, text: "Price-support payments mostly end. Farmers carry more risk in bad years, some smaller farms sell out to bigger neighbors, and rural banks tighten lending." },
          { at: -100, text: "Federal farm support ends entirely. Land prices in farm country drop, and a single drought or price crash could wipe out thousands of family farms." },
          { at: 10, text: "Bigger safety-net payments when crop prices fall, and more money for farmers to protect soil and water." },
          { at: 50, text: "Large new payments to farmers. Land prices and rents rise, which helps landowners more than young farmers trying to get started." }
        ],
        effects: {
          metrics: {},
          personas: { farm_family: 180 }, // 1% of ~$18,000 in farm payments and insurance subsidies
          approval: { young_adults: -0.01, high_earners: -0.01, rural_military: 0.08 },
          gdpPct: 0.001
        }
      },
      {
        id: "energy_environment", name: "Energy, environment & parks", icon: "🌲", group: "nondefense",
        baseline: 78.1, locked: false, min: -75, max: 100, step: 1,
        blurb: "National parks and forests, wildfire fighting, the EPA, the Army Corps of Engineers, clean-water grants and energy programs.",
        facts: [
          "Over 400 Park Service sites, including 63 national parks, with over 300 million visits a year",
          "The Forest Service spends billions a year fighting wildfires",
          "The Army Corps of Engineers maintains levees, dams and ports"
        ],
        stories: [
          { at: -10, text: "Shorter hours at national parks, fewer rangers, and slower cleanup of toxic waste sites." },
          { at: -40, text: "Wildfire crews are cut, some parks close campgrounds, and levee and dam repairs fall behind, raising flood risks in river towns." },
          { at: 10, text: "More firefighters and forest thinning in the West, and faster replacement of lead water pipes." },
          { at: 50, text: "A major clean-energy and conservation push: new power lines, flood defenses, and every lead pipe in the country replaced." }
        ],
        effects: {
          metrics: { co2_emissions: -3 },
          personas: {},
          approval: { working_families: 0.01, young_adults: 0.04, small_business: -0.01, rural_military: -0.01 },
          gdpPct: 0.0015
        }
      },
      {
        id: "everything_else", name: "Everything else", icon: "🗂️", group: "nondefense",
        baseline: 129.8, locked: false, min: -40, max: 40, step: 1,
        blurb: "Public-health agencies (CDC, FDA, community health centers, Indian Health Service), FEMA disaster relief, the IRS, Congress, the courts' buildings and all other government operations, minus oil-lease and spectrum-auction income.",
        facts: [
          "FEMA's disaster relief fund spent $31.8B in 2026",
          "Includes the CDC, FDA, and health centers that serve about 30 million patients",
          "Also nets out about $12B the government earns from offshore oil leases and radio-spectrum auctions"
        ],
        stories: [
          { at: -10, text: "Agencies cut staff across the board. Passport and tax-refund waits grow, food-safety inspections drop, and FEMA has less on hand when the next hurricane hits." },
          { at: -40, text: "Deep cuts to public health and disaster relief: fewer food inspectors, slower outbreak response, and towns wait months for help after floods and wildfires." },
          { at: 10, text: "Faster passport, tax and Social Security office service, and a larger FEMA reserve for disasters." },
          { at: 40, text: "More community health centers and a bigger public-health workforce ready for the next pandemic." }
        ],
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: 0.01, working_families: 0.01, young_adults: 0.01, high_earners: 0.01, small_business: 0.01, rural_military: 0.01 },
          gdpPct: 0.002
        }
      },
      {
        id: "net_interest", name: "Interest on the debt", icon: "💸", group: "interest",
        baseline: 1051.8, locked: true, min: 0, max: 0, step: 1,
        blurb: "Interest paid to the people, companies, pension funds and foreign governments that lent the US money. You can't set it directly: it falls as you shrink the deficit and grows if you add to it.",
        facts: [
          "$1.05 trillion in 2026: more than the entire military budget",
          "Up 11% in one year as old, cheap debt is refinanced at higher rates",
          "Debt held by the public reached $32.4 trillion, about 100% of GDP, the highest since 1946"
        ],
        stories: [],
        effects: { metrics: {}, personas: {}, approval: {}, gdpPct: 0 }
      }
    ],

    // ------------------------------------------------------------------
    // WHERE THE MONEY COMES FROM: FY2026 receipts, $5,403.3B total (MTS table 4)
    // ------------------------------------------------------------------
    revenue: [
      {
        id: "individual_income_tax", name: "Individual income taxes", icon: "🧾", baseline: 2845.5,
        blurb: "The tax most people file every April, on wages, business profits, investments and other income.",
        facts: [
          "More than half of all federal revenue",
          "Seven brackets from 10% to 37%, made permanent by the 2025 tax law",
          "The top 1% of earners pay about 40% of all federal income tax; about 40% of households owe no income tax after credits"
        ]
      },
      {
        id: "social_security_payroll", name: "Social Security payroll tax", icon: "💼", baseline: 1341.5,
        blurb: "12.4% of wages (half from the worker, half from the employer) up to $184,500 in 2026. It goes straight into the Social Security trust funds.",
        facts: [
          "Raises $1.34 trillion, enough to pay about 80% of Social Security benefits",
          "Earnings above $184,500 a year are not taxed for Social Security",
          "Self-employed people pay both halves"
        ]
      },
      {
        id: "medicare_payroll", name: "Medicare payroll tax", icon: "❤️", baseline: 406.1,
        blurb: "2.9% of all wages with no cap (split between worker and employer), plus an extra 0.9% on earnings over $200,000 ($250,000 for couples).",
        facts: [
          "Pays for Medicare's hospital insurance (Part A)",
          "Covers only about a third of total Medicare costs; the rest comes from general taxes and premiums"
        ]
      },
      {
        id: "other_payroll", name: "Unemployment & other payroll taxes", icon: "🧰", baseline: 64.2,
        blurb: "State and federal unemployment insurance taxes on employers, railroad retirement taxes and federal workers' pension contributions.",
        facts: [
          "States collected about $41B of unemployment taxes that pass through federal accounts",
          "The federal unemployment tax is 0.6% on just the first $7,000 of each worker's pay"
        ]
      },
      {
        id: "corporate_income_tax", name: "Corporate income tax", icon: "🏢", baseline: 381.4,
        blurb: "A 21% tax on the profits of corporations that pay tax at the company level (C corporations): nearly all large companies and many smaller ones.",
        facts: [
          "Fell 16% in 2026 as the 2025 law let companies write off equipment and research costs immediately",
          "Down from about a third of federal revenue in the 1950s to about 7% today",
          "Economists think most of the burden falls on shareholders, with some on workers' wages"
        ]
      },
      {
        id: "customs_duties", name: "Tariffs (customs duties)", icon: "📦", baseline: 173.2,
        blurb: "Taxes on imported goods, paid by the importing business and mostly passed on to customers in higher prices.",
        facts: [
          "The Supreme Court struck down the broad emergency tariffs in February 2026, and importers are owed refunds",
          "Replacement tariffs of 10-15% applied through July 2026; since then, 10-12.5% tariffs on 60 countries plus steel, aluminum, car and China tariffs",
          "The average effective tariff rate is now about 7.5%, down from about 16% at the peak but triple the 2024 level"
        ]
      },
      {
        id: "excise_taxes", name: "Excise taxes", icon: "⛽", baseline: 106.0,
        blurb: "Per-item taxes on gasoline and diesel, airline tickets, alcohol, tobacco and a few other products.",
        facts: [
          "Federal gas tax: 18.4 cents a gallon, unchanged since 1993",
          "Highway taxes raised $48.7B; airline-ticket and aviation taxes $23.7B"
        ]
      },
      {
        id: "estate_gift", name: "Estate & gift taxes", icon: "🏰", baseline: 38.7,
        blurb: "A 40% tax on large inheritances and gifts above a $15 million per-person exemption ($30 million per couple).",
        facts: [
          "Fewer than 1 in 1,000 estates owe any tax",
          "The 2025 law raised the exemption to $15 million per person, indexed for inflation"
        ]
      },
      {
        id: "fed_misc", name: "Federal Reserve & other", icon: "🏦", baseline: 46.7,
        blurb: "Profits the Federal Reserve hands over, fees, fines and other miscellaneous receipts.",
        facts: [
          "The Fed sent just $10.5B in 2026; it averaged about $80B a year in the decade before its interest costs rose in 2022",
          "Includes the Universal Service Fund fee on phone bills"
        ]
      }
    ],

    // ------------------------------------------------------------------
    // POLICY LEVERS. Annual, fully phased-in, at FY2026 scale.
    // Conversions: 10-year scores for FY2026-2035 are divided by ~11.5 to
    // express them at 2026 prices (mid-window years are ~15-20% bigger);
    // FY2025-2034 scores by ~11. avg_household_tax effect = $B x 1e9 / 133M
    // households = $7.52 per $1B.
    // ------------------------------------------------------------------
    levers: [
      // ===== Individual income tax =====
      {
        id: "rate_bottom", parent: "individual_income_tax", side: "revenue", type: "slider",
        name: "Bottom tax brackets (10% and 12%)",
        blurb: "Every taxpayer pays these rates on their first ~$50,000 of taxable income ($100,000 for couples). The slider sets the 12% rate; the 10% rate moves up or down by the same amount.",
        unit: "%", min: 7, max: 20, step: 1, current: 12,
        budgetPerUnit: 45, falloff: 0.1,
        // CRFB/CBO: all brackets +1 pt = $1.2T/10yr (~$105B/yr); top four +1 = $300B. Bottom two carry ~$45B/pt.
        source: "CBO Budget Options 2024 (raise all rates by 1 pt, $1.2T/10yr per CRFB), split by bracket",
        stories: [
          { at: 8, text: "Almost every working household gets a tax cut: about $2,900 a year for a family like the Ortizes. The Treasury loses over $150 billion a year." },
          { at: 14, text: "A 2-point rise in the bottom brackets costs a typical two-earner family about $1,450 a year, more than a month of groceries." },
          { at: 18, text: "Middle-class families pay around $4,000 more a year. Even a young worker earning $40,000 pays about $1,500 more." }
        ],
        effects: {
          metrics: { avg_household_tax: 338, poverty: 150000 },
          // 1 pt x taxable income in the 10/12% brackets: Ortiz $72,800 -> $728; Tyler $35,900 -> $359; Parks/Whitfields capped at $100,800 -> $1,008
          personas: { retired_couple: -35, single_mom: -40, median_family: -728, young_renter: -359, military_family: -358, farm_family: -450, professional_couple: -1008, top_household: -1008 },
          approval: { seniors: -0.3, working_families: -1.0, young_adults: -0.8, high_earners: -0.2, small_business: -0.6, rural_military: -0.8 },
          gdpPct: -0.07 // $45B x 0.5 / $321B
        }
      },
      {
        id: "rate_middle", parent: "individual_income_tax", side: "revenue", type: "slider",
        name: "Middle tax brackets (22% and 24%)",
        blurb: "These rates apply to taxable income from about $50,000 to $200,000 for singles ($100,000 to $400,000 for couples). The slider sets the 22% rate; the 24% rate moves with it.",
        unit: "%", min: 17, max: 32, step: 1, current: 22,
        budgetPerUnit: 37, falloff: 0.15,
        source: "CBO Budget Options 2024 (all rates +1 pt $1.2T, top four +1 pt $300B, per CRFB), split by bracket",
        stories: [
          { at: 19, text: "Upper-middle-class families save thousands: a couple earning $250,000 keeps about $3,500 more a year." },
          { at: 25, text: "A couple of nurses earning $160,000 together pays about $800 more a year; a two-doctor household about $8,500 more." },
          { at: 30, text: "Rates in the middle brackets climb to 30% or more, levels last seen in the 1970s. Some two-earner couples rethink whether the second job is worth it." }
        ],
        effects: {
          metrics: { avg_household_tax: 278 },
          personas: { professional_couple: -2842, top_household: -3028 }, // 1 pt x $284,200 (Parks) / $302,750 (Whitfields) in these brackets
          approval: { seniors: -0.3, working_families: -0.9, young_adults: -0.4, high_earners: -0.6, small_business: -0.7, rural_military: -0.6 },
          gdpPct: -0.046
        }
      },
      {
        id: "rate_top", parent: "individual_income_tax", side: "revenue", type: "slider",
        name: "Top tax brackets (32%, 35% and 37%)",
        blurb: "Rates on taxable income above about $200,000 for singles and $400,000 for couples, roughly the top 3% of households. The slider sets the top 37% rate; the 32% and 35% brackets move with it.",
        unit: "%", min: 30, max: 60, step: 1, current: 37,
        budgetPerUnit: 20, falloff: 0.5,
        // CRFB: top four brackets +1 pt = $300B/10yr; the 24% bracket's share removed -> ~$20B/yr. Big falloff: high earners shift income and timing.
        source: "CBO Budget Options 2024 (top four brackets +1 pt = $300B/10yr, per CRFB); falloff reflects JCT-style behavioral response",
        stories: [
          { at: 33, text: "The top rate falls to its lowest level since the early 1990s. A household earning $2 million saves about $60,000 a year; the deficit grows." },
          { at: 40, text: "Back to roughly the 39.6% rate of the 1990s and 2010s. A household with $1 million of taxable income pays about $18,000 more." },
          { at: 50, text: "A 50% top rate, last seen in the mid-1980s. Expect a surge of tax planning: high earners delay bonuses and convert pay into lower-taxed capital gains." }
        ],
        effects: {
          metrics: { avg_household_tax: 150 },
          personas: { top_household: -11000 }, // 1 pt x ~$1.1M of ordinary taxable income above the 32% threshold
          approval: { seniors: 0.05, working_families: 0.1, young_adults: 0.15, high_earners: -1.6, small_business: -0.4 },
          gdpPct: -0.0093
        }
      },
      {
        id: "cap_gains_rate", parent: "individual_income_tax", side: "revenue", type: "slider",
        name: "Capital gains & dividends tax rate",
        blurb: "The top rate on profits from selling stocks, homes above the exclusion, and businesses, and on dividends. Today 20% (plus a 3.8% investment surtax). People can wait to sell, so higher rates raise less than you'd expect.",
        unit: "%", min: 15, max: 40, step: 1, current: 20,
        budgetPerUnit: 5.5, falloff: 0.6,
        // CRFB: +2 pts = $110B/10yr -> ~$5.5B/yr per point; strong falloff because people hold assets longer
        source: "CBO Budget Options 2024, raise capital gains and dividend rates by 2 pts ($110B/10yr, per CRFB)",
        stories: [
          { at: 15, text: "Investors get a break: selling $1 million of stock profit costs $50,000 less in tax. More people sell, so the revenue loss is smaller than it looks." },
          { at: 28, text: "Back to the 28% rate of the late 1980s. Wealthy investors hold onto stock longer to avoid the tax, so each extra point raises less." },
          { at: 40, text: "Gains are taxed like wages. A founder selling a company pays far more, but many investors simply never sell, and revenue barely rises past about 30%." }
        ],
        effects: {
          metrics: { avg_household_tax: 41 },
          personas: { top_household: -65000, professional_couple: -100 }, // 1 pt x $6.5M of gains and dividends
          approval: { working_families: 0.02, young_adults: 0.03, high_earners: -0.5, small_business: -0.1 },
          gdpPct: -0.0034
        }
      },
      {
        id: "gains_at_death", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "Tax capital gains at death",
        blurb: "Today, when someone dies, the gains on their stocks, land and businesses are wiped clean and never taxed. This would tax gains above $5 million per couple at death, with protections for family farms and businesses that stay in the family.",
        budgetPerUnit: 45,
        source: "CBO Budget Options 2024, tax capital gains at death ($570B/10yr, per CRFB), scaled down for a $5M exemption",
        onText: "Billionaires can no longer 'buy, borrow and die' to pass on untaxed fortunes. Heirs of large estates pay tax on decades of growth, sometimes having to sell assets to pay it.",
        effects: {
          metrics: { avg_household_tax: 338 },
          personas: { top_household: -300000 }, // tax on ~$100M+ of unrealized gains, spread over remaining lifetime
          approval: { seniors: -1.0, working_families: 0.5, young_adults: 1.0, high_earners: -5.0, small_business: -1.5, rural_military: -1.0 },
          gdpPct: -0.014
        }
      },
      {
        id: "carried_interest", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "End the carried-interest break",
        blurb: "Private-equity and hedge-fund managers pay the lower capital-gains rate on much of their pay ('carried interest'). This would tax it as ordinary income, like a paycheck.",
        budgetPerUnit: 1.5,
        source: "CBO Budget Options 2024, tax carried interest as ordinary income ($15B/10yr, per CRFB)",
        onText: "Fund managers pay up to 40.8% instead of 23.8% on carried interest. Popular with voters across parties, but it raises little: about $1.5 billion a year, less than two hours' worth of federal spending.",
        effects: {
          metrics: { avg_household_tax: 11 },
          personas: { top_household: -50000 },
          approval: { seniors: 0.3, working_families: 0.5, young_adults: 0.5, high_earners: -0.5, rural_military: 0.3 },
          gdpPct: -0.0005
        }
      },
      {
        id: "salt_cap_10k", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "Return the SALT deduction cap to $10,000",
        blurb: "The 2025 law raised the cap on deducting state and local taxes from $10,000 to $40,000 (shrinking for incomes above $500,000) through 2029. This would restore the $10,000 cap now.",
        budgetPerUnit: 20,
        // ESTIMATE: JCT scored the 2025 SALT increase at roughly $20B+/yr while in effect
        source: "Estimate based on JCT scoring of the 2025 reconciliation law's SALT provision",
        onText: "Upper-middle-class homeowners in high-tax states like New Jersey, New York and California pay more. A couple with $40,000 of state and property taxes in the 24% bracket pays about $7,200 more a year.",
        effects: {
          metrics: { avg_household_tax: 150 },
          personas: { professional_couple: -7200 }, // lose $30,000 of deductions x 24%
          approval: { seniors: -0.3, working_families: -0.3, high_earners: -3.0, small_business: -1.0 },
          gdpPct: -0.012
        }
      },
      {
        id: "itemized_cap_15", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "Limit itemized deductions to a 15% tax break",
        blurb: "Deductions for mortgage interest, state taxes and charity would save everyone at most 15 cents per dollar, instead of up to 35 cents for top earners. Overlaps with the SALT cap: using both counts some savings twice.",
        budgetPerUnit: 100,
        // CRFB: $2.0T/10yr pre-2025-law; with the 2025 law's bigger standard deduction fewer itemize -> ~$1.2T -> ~$100B/yr
        source: "CBO Budget Options 2024, limit the value of itemized deductions to 15% ($2.0T/10yr per CRFB), reduced for fewer itemizers under 2025 law",
        onText: "Itemizers in the 22% bracket and above lose part of their deductions. A big charitable donor or a household with a large mortgage pays thousands more; charities brace for smaller gifts.",
        effects: {
          metrics: { avg_household_tax: 752 },
          personas: { professional_couple: -5850, top_household: -104000 }, // Parks: $65k itemized x (24%-15%); Whitfields: ~$520k x (35%-15%)
          approval: { seniors: -1.0, working_families: -1.5, young_adults: -0.3, high_earners: -6.0, small_business: -2.0, rural_military: -0.8 },
          gdpPct: -0.093
        }
      },
      {
        id: "employer_health_cap", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "Tax generous employer health plans",
        blurb: "Health insurance from your job isn't taxed, the biggest tax break in the code. This would count premiums above the median plan as taxable income (and wages for payroll tax).",
        budgetPerUnit: 95,
        source: "CBO Budget Options 2024, limit the exclusion for employer-sponsored health insurance to the 50th percentile of premiums ($1.2T/10yr, per CRFB)",
        onText: "Workers with expensive plans, often union members, government workers and employees of big firms, pay tax on part of their coverage. Many employers switch to cheaper plans with higher deductibles, which also slows health-cost growth.",
        effects: {
          metrics: { avg_household_tax: 714, uninsured: 500000 },
          personas: { median_family: -1200, young_renter: -300, professional_couple: -2500, top_household: -3000 },
          approval: { seniors: -0.5, working_families: -3.0, young_adults: -1.0, high_earners: -1.5, small_business: -1.0, rural_military: -1.5 },
          gdpPct: -0.089
        }
      },
      {
        id: "repeal_tips_overtime", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "Repeal no tax on tips & overtime, senior and car-loan deductions",
        blurb: "The 2025 law added temporary deductions (2025-2028) for tip income, overtime pay, car-loan interest, and an extra $6,000 per senior. This would end them now.",
        budgetPerUnit: 55,
        // ESTIMATE from JCT scores of the 2025 law: tips + overtime + senior deduction + car-loan interest ~ $220-230B over ~4 years
        source: "JCT estimates for P.L. 119-21 (tips, overtime, senior and auto-loan deductions), annualized",
        onText: "Servers, bartenders and hourly workers who earn overtime lose a tax break worth several hundred to a couple thousand dollars a year. Middle-income seniors lose up to $1,400. People with big car loans lose a few hundred.",
        effects: {
          metrics: { avg_household_tax: 414 },
          personas: { retired_couple: -1200, median_family: -720, young_renter: -720, military_family: -100, farm_family: -240 },
          approval: { seniors: -3.0, working_families: -2.0, young_adults: -3.0, small_business: -1.0, rural_military: -1.5 },
          gdpPct: -0.086
        }
      },
      {
        id: "niit_passthrough", parent: "individual_income_tax", side: "revenue", type: "toggle",
        name: "Close the 3.8% surtax gap for business owners",
        blurb: "High earners pay a 3.8% Medicare or investment surtax on wages and investment income, but some business owners' profits escape both. This applies it to them above $400,000 of income.",
        budgetPerUnit: 40,
        source: "CBO Budget Options 2024, expand the Net Investment Income Tax to pass-through business income ($440B/10yr, per CRFB)",
        onText: "Owners of law firms, medical practices and other profitable partnerships earning over $400,000 pay up to 3.8% more on their business income. Smaller businesses are unaffected.",
        effects: {
          metrics: { avg_household_tax: 301 },
          personas: { top_household: -57000 }, // 3.8% x $1.5M of active business income
          approval: { seniors: 0.3, working_families: 0.3, young_adults: 0.3, high_earners: -3.0, small_business: -3.0, rural_military: 0.3 },
          gdpPct: -0.025
        }
      },
      {
        id: "ctc_amount", parent: "individual_income_tax", side: "revenue", type: "slider",
        name: "Child tax credit per child",
        blurb: "A credit for each child under 17; $2,200 under the 2025 law, with up to $1,700 refundable for low earners. Raising it costs money (it's a tax cut); lowering it raises money.",
        unit: "$", min: 0, max: 3600, step: 100, current: 2200,
        budgetPerUnit: -0.055, falloff: 0,
        // ~61M children claimed; with phase-ins and phase-outs ~$5.5B per $100/child
        source: "Estimate from JCT/Treasury scoring of the 2025 law's $2,200 credit (~$5.5B per $100 per child)",
        stories: [
          { at: 0, text: "No more child tax credit. A family with two kids pays $4,400 more a year, and over 1 million more children fall into poverty." },
          { at: 1500, text: "The credit drops by $700 per child: a family with two kids loses $1,400 a year, about what many spend on school clothes and supplies." },
          { at: 3000, text: "Close to the size of the 2021 pandemic credit. A family with two kids gets $1,600 more a year, and child poverty falls, especially if the credit is also made fully refundable." }
        ],
        effects: {
          metrics: { avg_household_tax: -0.41, child_poverty: -600, poverty: -900 },
          personas: { single_mom: 2, median_family: 2, military_family: 2, professional_couple: 2 }, // two kids each: +$2 per +$1
          approval: { working_families: 0.004, young_adults: 0.001, high_earners: -0.0005, rural_military: 0.002 },
          gdpPct: 0.000137
        }
      },
      {
        id: "irs_enforcement", parent: "individual_income_tax", side: "revenue", type: "slider",
        name: "Extra IRS enforcement funding",
        blurb: "Billions per year added to (or cut from) IRS audits and collection. Each dollar spent brings back more than a dollar in taxes that were owed but unpaid; the figure shown is the net gain. Returns shrink as the easy cases are collected.",
        unit: "$B", min: -5, max: 20, step: 1, current: 0,
        budgetPerUnit: 1.5, falloff: 0.5,
        source: "CBO estimates of returns on IRS enforcement funding (2023-2024); net of the added cost",
        stories: [
          { at: -5, text: "Fewer auditors means more people cheat and get away with it. The IRS stops chasing many big unpaid bills, and the deficit grows." },
          { at: 10, text: "Thousands of new auditors focus on high-income tax returns and complex partnerships. More honest taxpayers notice that cheaters pay up." },
          { at: 20, text: "A major enforcement surge, the biggest in decades. Payoffs keep coming but slow down, and audit anxiety spreads beyond the very rich." }
        ],
        effects: {
          metrics: { avg_household_tax: 11 },
          personas: { top_household: -500 },
          approval: { working_families: 0.05, young_adults: 0.05, high_earners: -0.3, small_business: -0.3, rural_military: -0.1 },
          gdpPct: -0.0005
        }
      },

      // ===== Payroll taxes =====
      {
        id: "ss_payroll_rate", parent: "social_security_payroll", side: "revenue", type: "slider",
        name: "Social Security payroll tax rate",
        blurb: "Today 12.4% of wages up to $184,500, split evenly between worker and employer. Economists think workers end up bearing both halves through lower pay.",
        unit: "%", min: 10.4, max: 18.4, step: 0.2, current: 12.4,
        budgetPerUnit: 85, falloff: 0.1,
        // $1,341.5B / 12.4 = $108B per point gross; less ~25% income-tax offset (CBO convention) -> ~$85B
        source: "Treasury receipts ($1,341.5B at 12.4%) less CBO's standard 25% income-tax offset; CBO Budget Options 2024 (1-pt payroll tax ~$1.3T/10yr)",
        stories: [
          { at: 10.4, text: "A 2-point payroll tax cut, like the one in 2011-12, puts about $1,000 a year in a median worker's pocket. Social Security's trust fund runs dry sooner." },
          { at: 13.4, text: "A 1-point increase costs a $60,000 worker about $600 a year. It closes nearly a quarter of Social Security's long-term gap." },
          { at: 16.4, text: "A 4-point increase nearly closes Social Security's long-term funding gap on its own, but a $60,000 worker pays about $2,400 more a year." }
        ],
        effects: {
          metrics: { avg_household_tax: 639, ss_depletion_year: 6, poverty: 100000 },
          // 1% of capped wages: Jenna $32,000 -> $320; Ortiz $105,000 -> $1,050; Parks 2 x $184,500 -> $3,690
          personas: { single_mom: -320, median_family: -1050, young_renter: -580, military_family: -680, farm_family: -877, professional_couple: -3690, top_household: -1845 },
          approval: { seniors: -0.2, working_families: -2.0, young_adults: -1.8, high_earners: -0.8, small_business: -2.0, rural_military: -1.6 },
          gdpPct: -0.132
        }
      },
      {
        id: "ss_cap_250k", parent: "social_security_payroll", side: "revenue", type: "toggle",
        name: "Apply Social Security tax to wages above $250,000",
        blurb: "Today wages above $184,500 are not taxed for Social Security. This would also tax earnings above $250,000, leaving a 'donut hole' in between, without raising those workers' benefits.",
        budgetPerUnit: 135,
        source: "CBO option via CRFB: apply payroll tax above $250,000 without crediting benefits ($1.6T/10yr FY2026-35; closes ~70% of the 75-year gap)",
        onText: "Only a few percent of workers, those earning over $250,000, pay more. An executive earning $1 million pays about $93,000 more a year. Social Security's trust fund lasts roughly two decades longer.",
        effects: {
          metrics: { avg_household_tax: 1015, ss_depletion_year: 20 },
          personas: { top_household: -155000 }, // ($1.5M - $250k) x 12.4%
          approval: { seniors: 1.0, working_families: 1.0, young_adults: 1.0, high_earners: -8.0, small_business: -2.0, rural_military: 0.5 },
          gdpPct: -0.084
        }
      },
      {
        id: "medicare_payroll_rate", parent: "medicare_payroll", side: "revenue", type: "slider",
        name: "Medicare payroll tax rate",
        blurb: "Today 2.9% of all wages, split between worker and employer, with no cap. (High earners pay another 0.9% on top.)",
        unit: "%", min: 1.9, max: 6.9, step: 0.1, current: 2.9,
        budgetPerUnit: 100, falloff: 0.15,
        // ~$12.5T of wage and self-employment income x 1% = $125B, less ~20-25% income-tax offset
        source: "Treasury receipts ($406.1B) and wage base; CBO Budget Options 2024 (new 1-pt payroll tax without cap ~$1.3T/10yr)",
        stories: [
          { at: 1.9, text: "A 1-point Medicare tax cut gives a $60,000 worker about $600 a year. Medicare's hospital fund runs short much sooner." },
          { at: 3.9, text: "A 1-point increase costs a $60,000 worker about $600 a year and secures Medicare's hospital fund for decades." },
          { at: 5.9, text: "Medicare taxes double. A two-earner family making $105,000 pays about $3,100 more a year; payroll taxes become by far the biggest tax most families pay." }
        ],
        effects: {
          metrics: { avg_household_tax: 752, poverty: 100000 },
          personas: { single_mom: -320, median_family: -1050, young_renter: -580, military_family: -680, farm_family: -877, professional_couple: -4500, top_household: -15000 },
          approval: { seniors: -0.2, working_families: -1.8, young_adults: -1.5, high_earners: -1.2, small_business: -1.8, rural_military: -1.5 },
          gdpPct: -0.14
        }
      },

      // ===== Corporate =====
      {
        id: "corp_rate", parent: "corporate_income_tax", side: "revenue", type: "slider",
        name: "Corporate income tax rate",
        blurb: "Big companies pay 21% on profits since 2018 (down from 35%). Most of the burden falls on shareholders, and some on workers through lower wages over time.",
        unit: "%", min: 15, max: 35, step: 1, current: 21,
        budgetPerUnit: 11, falloff: 0.3,
        // CRFB: +1 pt = $140B/10yr FY2026-35 -> ~$12B; scaled to 2026's lower corporate receipts after full expensing -> ~$11B
        source: "CBO Budget Options 2024, raise corporate rate by 1 pt ($140B/10yr FY2026-35, per CRFB)",
        stories: [
          { at: 15, text: "A cut to 15% makes the US one of the lowest-tax places among rich countries. Companies invest a bit more and shareholders gain, but the deficit grows by about $50 billion a year." },
          { at: 25, text: "A 25% rate, close to the average of other rich countries. Stock prices dip slightly; each point raises about $11 billion." },
          { at: 35, text: "Back to the pre-2018 rate. Companies shift profits and patents abroad, so each extra point raises less, and some investment moves overseas." }
        ],
        effects: {
          metrics: { avg_household_tax: 83 },
          // Incidence ~75% capital / 25% labor (JCT/CBO): $11B, ~22% borne by the top 0.1% -> ~$18,000 per top household
          personas: { retired_couple: -20, single_mom: -5, median_family: -40, young_renter: -15, military_family: -10, farm_family: -10, professional_couple: -600, top_household: -18000 },
          approval: { working_families: 0.03, young_adults: 0.05, high_earners: -0.5, small_business: -0.25 },
          gdpPct: -0.015
        }
      },
      {
        id: "foreign_income_full_rate", parent: "corporate_income_tax", side: "revenue", type: "toggle",
        name: "Tax US companies' foreign profits at the full rate",
        blurb: "US multinationals pay a reduced minimum tax on profits booked in other countries. This would tax them at the full 21%, with credit for foreign taxes paid.",
        budgetPerUnit: 30,
        source: "CBO Budget Options 2024, tax foreign income at the full corporate rate ($345B/10yr, per CRFB)",
        onText: "Moving profits to Ireland or Bermuda stops paying off. Big tech and drug companies pay more; some may try moving headquarters abroad.",
        effects: {
          metrics: { avg_household_tax: 226 },
          personas: { median_family: -10, professional_couple: -150, top_household: -8000 },
          approval: { working_families: 0.2, young_adults: 0.2, high_earners: -1.0, small_business: -0.3 },
          gdpPct: -0.019
        }
      },
      {
        id: "end_full_expensing", parent: "corporate_income_tax", side: "revenue", type: "toggle",
        name: "End immediate write-offs for equipment",
        blurb: "The 2025 law permanently lets businesses deduct the full cost of machines and equipment the year they buy them. This would go back to spreading the deduction over the machine's life.",
        budgetPerUnit: 30,
        // ESTIMATE: JCT scored permanent 100% bonus depreciation at several hundred billion over 10 years, front-loaded
        source: "Estimate from JCT scoring of P.L. 119-21 permanent 100% bonus depreciation",
        onText: "Businesses pay more tax in the year they buy a tractor, truck or production line. Investment slows a little; manufacturers and farmers grumble loudest.",
        effects: {
          metrics: { avg_household_tax: 226 },
          personas: { farm_family: -1500, professional_couple: -50, top_household: -5000 },
          approval: { high_earners: -1.0, small_business: -3.0, rural_military: -1.5 },
          gdpPct: -0.047
        }
      },

      // ===== Tariffs =====
      {
        id: "tariff_rate", parent: "customs_duties", side: "revenue", type: "slider",
        name: "Average tariff rate",
        blurb: "The average tax on imported goods. It was about 2.5% before 2025, peaked near 16%, and is about 7.5% now after the Supreme Court ruling and replacement tariffs. Importers pass most of it on to customers, and other countries retaliate.",
        unit: "%", min: 2.5, max: 25, step: 0.5, current: 7.5,
        budgetPerUnit: 22, falloff: 0.4,
        // ~$3.3T imports x 1% = $33B static, minus lower imports and the income/payroll tax offset -> ~$22B
        source: "Yale Budget Lab and CBO tariff revenue estimates; Fitch effective rate 7.4% (July 2026)",
        stories: [
          { at: 2.5, text: "Tariffs drop back to the pre-2025 level. Prices of cars, appliances and clothes ease, saving a typical family roughly $1,000 a year, and farmers regain export markets. Revenue falls by over $100 billion." },
          { at: 12, text: "Tariffs go back up toward the pre-ruling peak. A typical household pays about $900 more a year in higher prices, and soybean farmers lose sales to China." },
          { at: 20, text: "The highest tariffs since the 1930s. Store shelves look emptier, prices jump, and trading partners hit back at US exports. Revenue grows, but slower than the rate because people buy fewer imports." }
        ],
        effects: {
          metrics: { avg_household_tax: 165, poverty: 40000 },
          // ~$22B/yr spread over households, tilted toward big spenders and farm exporters
          personas: { retired_couple: -120, single_mom: -110, median_family: -200, young_renter: -110, military_family: -180, farm_family: -250, professional_couple: -500, top_household: -1500 },
          approval: { seniors: -0.4, working_families: -0.6, young_adults: -0.5, high_earners: -0.3, small_business: -0.8, rural_military: -0.3 },
          gdpPct: -0.05
        }
      },

      // ===== Excise and consumption taxes =====
      {
        id: "gas_tax", parent: "excise_taxes", side: "revenue", type: "slider",
        name: "Federal gas tax",
        blurb: "18.4 cents a gallon on gasoline (24.4 on diesel), unchanged since 1993; it has lost about half its value to inflation. It pays for highways and transit.",
        unit: "¢", min: 0, max: 100, step: 1, current: 18.4,
        budgetPerUnit: 1.4, falloff: 0.2,
        // ~180 billion gallons/yr: 1 cent = $1.8B gross, ~$1.4B after the income-tax offset
        source: "CBO Budget Options 2024, increase motor fuel taxes ($215B/10yr, per CRFB); EIA fuel volumes",
        stories: [
          { at: 0, text: "No federal gas tax: drivers save about 18 cents a gallon, roughly $180 a year for a typical household, but the Highway Trust Fund runs dry." },
          { at: 40, text: "Gas rises about 22 cents a gallon, roughly what the 1993 tax would be with inflation. A typical household pays about $220 more a year." },
          { at: 80, text: "Gas jumps about 60 cents a gallon. Rural families with long commutes pay the most, about $800 more a year; fuel use drops a few percent." }
        ],
        effects: {
          metrics: { avg_household_tax: 10.5, gas_price: 0.01, co2_emissions: -2 },
          personas: { retired_couple: -7, single_mom: -9, median_family: -12, young_renter: -6, military_family: -12, farm_family: -25, professional_couple: -12, top_household: -20 },
          approval: { seniors: -0.05, working_families: -0.08, young_adults: -0.04, high_earners: -0.01, small_business: -0.05, rural_military: -0.12 },
          gdpPct: -0.0022
        }
      },
      {
        id: "carbon_tax", parent: "excise_taxes", side: "revenue", type: "slider",
        name: "Carbon tax",
        blurb: "A fee per ton of carbon dioxide on coal, oil and natural gas, collected where fuels enter the economy. It raises energy prices to push emissions down. (Here the money goes to deficit reduction, not rebates.)",
        unit: "$/ton", min: 0, max: 100, step: 5, current: 0,
        budgetPerUnit: 3.0, falloff: 0.3,
        // CRFB: $25/ton rising 5%/yr = $960B/10yr -> ~$80B/yr at ~$27 average
        source: "CBO Budget Options 2024, $25/ton carbon tax rising 5% a year ($960B/10yr, per CRFB)",
        stories: [
          { at: 25, text: "A $25-a-ton fee adds about 22 cents a gallon to gas and about $10 a month to a typical electric bill. Coal plants close faster, and emissions fall several percent." },
          { at: 50, text: "Energy costs rise about $1,100 a year for a typical household. Emissions fall by roughly a fifth over a decade as power companies switch to cleaner sources." },
          { at: 100, text: "A $100-a-ton fee: gas up nearly 90 cents, heating bills sharply higher, and coal nearly gone. Lower-income and rural households feel it most unless they get rebates." }
        ],
        effects: {
          metrics: { avg_household_tax: 22.6, gas_price: 0.0089, co2_emissions: -19 },
          personas: { retired_couple: -16, single_mom: -15, median_family: -22, young_renter: -14, military_family: -20, farm_family: -45, professional_couple: -40, top_household: -150 },
          approval: { seniors: -0.05, working_families: -0.08, young_adults: 0.03, high_earners: -0.02, small_business: -0.08, rural_military: -0.15 },
          gdpPct: -0.0047
        }
      },
      {
        id: "tobacco_alcohol", parent: "excise_taxes", side: "revenue", type: "toggle",
        name: "Raise alcohol and tobacco taxes",
        blurb: "Taxes beer, wine and spirits at the same rate per ounce of alcohol and indexes them to inflation, and raises the cigarette tax.",
        budgetPerUnit: 13,
        source: "CBO Budget Options 2024: standardize and index alcohol taxes ($105B) + increase tobacco taxes ($50B) over 10yr, per CRFB",
        onText: "A six-pack of beer costs about $1 more and a pack of cigarettes about 50 cents more. Smoking and heavy drinking drop a little, especially among young people.",
        effects: {
          metrics: { avg_household_tax: 98 },
          personas: { retired_couple: -40, single_mom: -60, median_family: -60, young_renter: -100, military_family: -60, farm_family: -80, professional_couple: -60, top_household: -100 },
          approval: { working_families: -0.3, young_adults: -0.5, small_business: -0.2, rural_military: -0.4 },
          gdpPct: -0.02
        }
      },
      {
        id: "vat", parent: "excise_taxes", side: "revenue", type: "slider",
        name: "National sales tax (VAT)",
        blurb: "A value-added tax: a sales tax collected at each stage of production, used by every other rich country (average rate about 20%). Applies broadly, including to groceries and rent.",
        unit: "%", min: 0, max: 10, step: 0.5, current: 0,
        budgetPerUnit: 60, falloff: 0.1,
        source: "CBO Budget Options 2024, 5% broad-based VAT ($3.5T/10yr FY2026-35, per CRFB)",
        stories: [
          { at: 3, text: "A 3% VAT adds about $3 to every $100 spent. It raises about $180 billion a year, and hits lower-income families hardest relative to income." },
          { at: 5, text: "A 5% VAT raises nearly $300 billion a year. Prices jump once when it starts; families like the Ortizes pay about $2,800 more a year." },
          { at: 10, text: "A 10% VAT raises over half a trillion dollars a year (about $540 billion), at a rate still well below most rich countries'. Social Security benefits rise with prices, but working families feel the squeeze." }
        ],
        effects: {
          metrics: { avg_household_tax: 451, gas_price: 0.031, poverty: 150000 },
          // 1% x ~70% of household spending
          personas: { retired_couple: -350, single_mom: -240, median_family: -560, young_renter: -315, military_family: -490, farm_family: -490, professional_couple: -1750, top_household: -10500 },
          approval: { seniors: -1.0, working_families: -1.4, young_adults: -1.1, high_earners: -0.4, small_business: -1.2, rural_military: -1.2 },
          gdpPct: -0.093
        }
      },
      {
        id: "ftt", parent: "excise_taxes", side: "revenue", type: "slider",
        name: "Financial transaction tax",
        blurb: "A tiny tax on each purchase of stocks, bonds and derivatives, in hundredths of a percent ('basis points'). Mostly paid by frequent traders; ordinary savers pay a little through their funds.",
        unit: " bp", min: 0, max: 10, step: 1, current: 0,
        budgetPerUnit: 25, falloff: 0.6,
        source: "CBO Budget Options 2024, 0.01% (1 bp) tax on financial transactions ($340B/10yr, per CRFB); falloff for reduced trading",
        stories: [
          { at: 1, text: "A 0.01% tax: $1 on every $10,000 traded. High-speed trading firms pay most of it; a buy-and-hold saver barely notices." },
          { at: 5, text: "High-frequency trading shrinks sharply and some trading moves to London and Singapore, so revenue grows much less than the rate." },
          { at: 10, text: "A 0.1% tax. Trading volume falls by half or more, and retirement funds pay a bit more each year. Revenue tops out." }
        ],
        effects: {
          metrics: { avg_household_tax: 188 },
          personas: { retired_couple: -10, median_family: -15, young_renter: -5, professional_couple: -150, top_household: -6000 },
          approval: { seniors: -0.3, working_families: 0.1, young_adults: 0.2, high_earners: -1.2, small_business: -0.2 },
          gdpPct: -0.012
        }
      },

      // ===== Estate, gift and wealth =====
      {
        id: "estate_rate", parent: "estate_gift", side: "revenue", type: "slider",
        name: "Estate tax rate",
        blurb: "The tax rate on inheritances above $15 million per person ($30 million per couple). Today 40%; 0% means repealing the estate tax.",
        unit: "%", min: 0, max: 60, step: 5, current: 40,
        budgetPerUnit: 0.95, falloff: 0.1,
        // $38.7B / 40 pts ~ $0.97B per point
        source: "Treasury receipts ($38.7B at a 40% rate)",
        stories: [
          { at: 0, text: "The estate tax is repealed. The few thousand richest families pass on fortunes untaxed; the Treasury loses about $35 billion a year." },
          { at: 55, text: "A 55% rate, last used in the early 2000s. The richest estates hire more lawyers and set up trusts to shrink their taxable estate." }
        ],
        effects: {
          metrics: { avg_household_tax: 7.1 },
          personas: { top_household: -45000 }, // 1% x ~$135M taxable estate, spread over ~30 years
          approval: { seniors: 0.02, working_families: 0.02, young_adults: 0.02, high_earners: -0.25, small_business: -0.15, rural_military: -0.1 },
          gdpPct: -0.00015
        }
      },
      {
        id: "estate_exemption_35m", parent: "estate_gift", side: "revenue", type: "toggle",
        name: "Lower the estate tax exemption to $3.5 million",
        blurb: "Go back to the 2009 exemption of $3.5 million per person (without inflation adjustment) and a 45% rate, instead of $15 million and 40%.",
        budgetPerUnit: 30,
        // ESTIMATE: Treasury/TPC scores of 2009-parameter proposals ~$400B+/10yr
        source: "Estimate based on Treasury and Tax Policy Center scores of returning to 2009 estate-tax parameters",
        onText: "About 10 times as many estates owe tax, roughly 1 in 150 deaths. Owners of valuable farmland and family businesses push hard for special rules so heirs aren't forced to sell.",
        effects: {
          metrics: { avg_household_tax: 226 },
          personas: { top_household: -170000, professional_couple: -5000, farm_family: -7500 }, // expected tax at death spread over ~30 years
          approval: { seniors: -1.0, working_families: 0.3, young_adults: 0.5, high_earners: -4.0, small_business: -3.0, rural_military: -3.0 },
          gdpPct: -0.0047
        }
      },
      {
        id: "wealth_tax", parent: "estate_gift", side: "revenue", type: "toggle",
        name: "Annual wealth tax on the ultra-rich",
        blurb: "A yearly tax of 2% on net worth above $50 million and 3% above $1 billion, hitting about 75,000 households. Estimates vary widely because the rich are skilled at avoiding taxes and assets are hard to value.",
        budgetPerUnit: 150,
        // Penn Wharton (2019) estimated $2.2-2.7T/10yr for this design after avoidance; Saez-Zucman higher. Scaled to 2026 wealth, taking the cautious end.
        source: "Penn Wharton Budget Model analysis of a 2%/3% wealth tax (about $2.2-2.7T/10yr), conservative end",
        onText: "A household worth $150 million pays about $2 million a year. Billionaires pay more each year than most do in income tax. Expect court challenges over whether it's constitutional and a fight over valuing private companies and art.",
        effects: {
          metrics: { avg_household_tax: 1128 },
          personas: { top_household: -2000000 }, // 2% x ($150M - $50M)
          approval: { seniors: 0.5, working_families: 1.5, young_adults: 2.5, high_earners: -12.0, small_business: -3.0 },
          gdpPct: -0.07
        }
      },

      // ===== Social Security reforms =====
      {
        id: "ss_retirement_age", parent: "social_security", side: "spending", type: "slider",
        name: "Social Security full retirement age",
        blurb: "The age at which you get your full benefit; 67 for anyone born in 1960 or later. Each year it rises is roughly a 6-7% benefit cut for future retirees. Current retirees are not affected. (Adds to whatever you do with the main Social Security slider.)",
        unit: " yrs", min: 65, max: 70, step: 1, current: 67,
        budgetPerUnit: -50, falloff: 0,
        // CRFB: to 70 by 2 months/yr saves $150B over 10 years while phasing in; fully phased-in each year ~6.5% of retired-worker benefits (~$1.2T) less disability offsets -> ~$50B
        source: "CBO option via CRFB, raise the full retirement age to 70 ($150B/10yr while phasing in; closes ~35% of the gap), fully phased-in estimate",
        stories: [
          { at: 65, text: "Back to full benefits at 65. Future retirees get about 13% more a month; the trust fund runs dry years sooner." },
          { at: 68, text: "Future retirees wait an extra year for full benefits, or take about 6% less for life. Manageable for many office workers, hard for roofers and nurses' aides whose bodies give out first." },
          { at: 70, text: "Full benefits at 70. Someone retiring at 67 gets about 20% less for life. Life expectancy has risen far more for high earners than low earners, so this cut hits lower earners harder." }
        ],
        effects: {
          metrics: { ss_depletion_year: 3, senior_poverty: 150000, poverty: 170000 },
          personas: {}, // current retirees are grandfathered
          approval: { seniors: -3.0, working_families: -2.5, young_adults: -1.5, small_business: -0.5, rural_military: -2.0 },
          gdpPct: -0.03 // spending cut drag partly offset by people working longer
        }
      },
      {
        id: "ss_chained_cpi", parent: "social_security", side: "spending", type: "toggle",
        name: "Slower cost-of-living raises (chained CPI)",
        blurb: "Use a measure of inflation that grows a bit slower (about 0.25 points a year) to set Social Security and other benefit raises. The cut is tiny at first and grows every year.",
        budgetPerUnit: -30,
        source: "CBO option via CRFB, chained CPI for COLAs ($260B/10yr; closes ~10% of the gap), shown at its average size over the decade",
        onText: "Each year's raise is a little smaller. After 10 years a typical retiree's check is about $50 a month lower; after 20 years about $100. The oldest retirees, often widows, lose the most.",
        effects: {
          metrics: { ss_depletion_year: 2, senior_poverty: 100000, poverty: 100000 },
          personas: { retired_couple: -500 }, // ~1.1% average reduction over the decade x $46,000
          approval: { seniors: -4.0, working_families: -0.5, rural_military: -1.0 },
          gdpPct: -0.056
        }
      },
      {
        id: "ss_high_earner_trim", parent: "social_security", side: "spending", type: "toggle",
        name: "Trim Social Security for higher earners",
        blurb: "Change the benefit formula so future retirees with above-average lifetime earnings get smaller checks, while lower earners are protected. Phases in by 2030; current retirees unaffected.",
        budgetPerUnit: -30,
        source: "CBO option via CRFB, reduce top-half benefit-formula factors ($280B/10yr phased in by 2030; closes ~40% of the gap)",
        onText: "A future retiree who earned well all career gets about $500 a month less than promised; a low-wage worker's check is unchanged. Critics say it turns Social Security into welfare and weakens its support.",
        effects: {
          metrics: { ss_depletion_year: 8 },
          personas: {},
          approval: { seniors: -1.0, young_adults: 0.3, high_earners: -2.0 },
          gdpPct: -0.028
        }
      },
      {
        id: "ss_expand_benefits", parent: "social_security", side: "spending", type: "toggle",
        name: "Expand Social Security benefits",
        blurb: "Raise everyone's benefit about 2%, set a higher minimum benefit for low-wage workers, and give larger raises to the oldest retirees.",
        budgetPerUnit: 50,
        // ESTIMATE modeled on Social Security 2100 Act-style benefit provisions scored by SSA's actuaries
        source: "Estimate based on SSA Office of the Chief Actuary scoring of Social Security 2100-style benefit increases",
        onText: "A typical retiree gets about $40 more a month and lifelong low-wage workers much more, cutting poverty among the oldest seniors. The trust fund runs dry sooner unless taxes rise too.",
        effects: {
          metrics: { ss_depletion_year: -4, senior_poverty: -600000, poverty: -700000 },
          personas: { retired_couple: 920 }, // 2% x $46,000
          approval: { seniors: 5.0, working_families: 1.0, young_adults: 0.5, high_earners: -0.5, rural_military: 2.0 },
          gdpPct: 0.109
        }
      },

      // ===== Medicare reforms =====
      {
        id: "medicare_age", parent: "medicare", side: "spending", type: "slider",
        name: "Medicare eligibility age",
        blurb: "Medicare starts at 65. Raising the age saves money but leaves people in their mid-60s to find other coverage; lowering it costs money and covers more people. (Adds to the main Medicare slider.)",
        unit: " yrs", min: 60, max: 67, step: 1, current: 65,
        budgetPerUnit: -12, falloff: 0,
        // CBO's 2018 estimate for raising to 67: modest net savings because many 65-66s move to Medicaid/ACA subsidies or keep working
        source: "CBO Budget Options (2018), raise the Medicare eligibility age to 67; scaled to 2026",
        stories: [
          { at: 60, text: "Medicare at 60 covers millions more people in their early 60s, many of whom have health problems and trouble finding work. Costs rise by about $60 billion a year." },
          { at: 67, text: "65- and 66-year-olds lose Medicare. Many stay on their job's plan or buy marketplace insurance; a few hundred thousand go uninsured." }
        ],
        effects: {
          metrics: { uninsured: 300000 },
          personas: {},
          approval: { seniors: -1.0, working_families: -1.2, young_adults: -0.2, small_business: -0.3, rural_military: -0.6 },
          gdpPct: -0.019
        }
      },
      {
        id: "medicare_drug_negotiation", parent: "medicare", side: "spending", type: "toggle",
        name: "Expand Medicare drug price negotiation",
        blurb: "Medicare now negotiates prices for a small number of expensive drugs each year. This would cover many more drugs, faster, and cap launch prices.",
        budgetPerUnit: -40,
        source: "CBO score of H.R. 3 (2019), Lower Drug Costs Now Act (~$456B/10yr), scaled",
        onText: "Seniors pay less at the pharmacy, saving the average enrollee a few hundred dollars a year. Drug companies earn less, and CBO expects slightly fewer new drugs to reach market over the next 30 years.",
        effects: {
          metrics: {},
          personas: { retired_couple: 300 },
          approval: { seniors: 2.5, working_families: 1.0, young_adults: 0.5, high_earners: -0.3, rural_military: 1.0 },
          gdpPct: -0.025
        }
      },
      {
        id: "medicare_advantage_reform", parent: "medicare", side: "spending", type: "toggle",
        name: "Pay Medicare Advantage plans less",
        blurb: "Private Medicare Advantage plans are paid more per person than traditional Medicare would spend, partly because they record patients as sicker. This would close much of that gap.",
        budgetPerUnit: -40,
        source: "CBO options via CRFB, Medicare Advantage coding-intensity and benchmark reforms (several hundred billion over 10yr)",
        onText: "Insurers trim extras like gym memberships, dental and vision benefits, and some raise premiums. The roughly 35 million people in these plans notice; taxpayers save billions.",
        effects: {
          metrics: {},
          personas: { retired_couple: -200 },
          approval: { seniors: -2.0, working_families: 0.1, rural_military: -0.8 },
          gdpPct: -0.037
        }
      },
      {
        id: "site_neutral", parent: "medicare", side: "spending", type: "toggle",
        name: "Same price for the same care (site-neutral pay)",
        blurb: "Medicare pays more for a routine office visit or scan at a hospital-owned clinic than at an independent doctor's office. This would pay the same either way.",
        budgetPerUnit: -14,
        source: "CBO options via CRFB, site-neutral payments for hospital outpatient departments (~$150B/10yr)",
        onText: "Seniors pay lower copays at hospital-owned clinics. Hospitals lose revenue, and some rural hospitals warn they may cut services.",
        effects: {
          metrics: {},
          personas: { retired_couple: 50 },
          approval: { seniors: 0.3, rural_military: -0.4 },
          gdpPct: -0.013
        }
      },

      // ===== Medicaid and ACA =====
      {
        id: "medicaid_per_capita_caps", parent: "medicaid_chip", side: "spending", type: "toggle",
        name: "Cap federal Medicaid money per person",
        blurb: "Instead of paying a share of whatever states spend, Washington would pay a fixed amount per enrollee, growing with inflation. States would have to cover the rest or cut. (Adds to the main Medicaid slider.)",
        budgetPerUnit: -80,
        // CBO 2024 option: per-capita caps growing at CPI-U, roughly $900B/10yr. Coverage loss is not scored by CBO; ~4M is an estimate.
        source: "CBO Budget Options 2024, establish per-capita caps on federal Medicaid spending (~$900B/10yr); coverage effect estimated",
        onText: "States get a fixed check per enrollee. As health costs outpace inflation, states cut payments to doctors, limit benefits, and roughly 4 million people lose coverage over a decade.",
        effects: {
          metrics: { uninsured: 4000000, poverty: 300000 },
          personas: { single_mom: -1500 }, // probability-weighted loss of her kids' coverage and benefits
          approval: { seniors: -1.5, working_families: -2.5, young_adults: -1.0, high_earners: 0.5, rural_military: -2.0 },
          gdpPct: -0.2
        }
      },
      {
        id: "cancel_medicaid_work_req", parent: "medicaid_chip", side: "spending", type: "toggle",
        name: "Cancel the new Medicaid work requirement",
        blurb: "Starting at the end of 2026, many adults on Medicaid must show they work, study or volunteer 80 hours a month. This would cancel that rule.",
        budgetPerUnit: 30,
        source: "CBO estimate of P.L. 119-21 work requirements (-$326B/10yr, ~5 million fewer enrollees), via KFF",
        onText: "About 5 million low-income adults keep coverage they would have lost, many of them people who already work but struggle with the paperwork. Supporters of the rule say it pushes able-bodied adults toward jobs.",
        effects: {
          metrics: { uninsured: -5000000 },
          personas: {},
          approval: { seniors: -0.3, working_families: 0.5, young_adults: 0.5, high_earners: -0.5, small_business: -0.5, rural_military: -0.8 },
          gdpPct: 0.075
        }
      },
      {
        id: "restore_aca_enhanced", parent: "aca_subsidies", side: "spending", type: "toggle",
        name: "Bring back the extra ACA subsidies",
        blurb: "The larger premium tax credits from 2021-2025 expired at the end of 2025. This would restore them: no one pays more than 8.5% of income for a benchmark plan, and lower earners pay little or nothing.",
        budgetPerUnit: 35,
        source: "CBO estimates of permanently extending the enhanced premium tax credits (~$350B/10yr, ~3.8M more insured)",
        onText: "Premiums drop for over 20 million people buying their own coverage. A 60-year-old couple earning $90,000 saves more than $10,000 a year; about 4 million more people get insured.",
        effects: {
          metrics: { uninsured: -3800000, poverty: -100000 },
          personas: { single_mom: 600, farm_family: 8000 }, // Hutchins are just over 400% of poverty: enhanced credits remove the cliff
          approval: { seniors: 0.5, working_families: 2.0, young_adults: 1.5, high_earners: -0.5, small_business: 2.0, rural_military: 1.0 },
          gdpPct: 0.087
        }
      },

      // ===== Defense reforms =====
      {
        id: "troop_levels", parent: "defense_personnel", side: "spending", type: "slider",
        name: "Active-duty troop levels",
        blurb: "The number of active-duty service members, in thousands. Each 10,000 troops costs roughly $1.2 billion a year in pay, benefits, training and support. (Adds to the main military-pay slider.)",
        unit: "k", min: 1000, max: 1600, step: 10, current: 1320,
        budgetPerUnit: 0.12, falloff: 0,
        source: "CBO, Costs of Military Pay and Benefits; roughly $120,000 per active-duty member per year all-in",
        stories: [
          { at: 1100, text: "220,000 fewer troops, more than the entire Marine Corps. The Army closes divisions, and the US can handle one major war at a time, not two." },
          { at: 1500, text: "180,000 more troops, the biggest force since the early 1990s. Recruiters must sign up many more young people, so bonuses grow." }
        ],
        effects: {
          metrics: { military_personnel: 1000 },
          personas: {},
          approval: { seniors: 0.002, young_adults: -0.002, rural_military: 0.008 },
          gdpPct: 0.0003
        }
      },
      {
        id: "cancel_golden_dome", parent: "defense_weapons", side: "spending", type: "toggle",
        name: "Cancel the Golden Dome missile shield",
        blurb: "A planned nationwide missile-defense system including space-based interceptors, with cost estimates ranging from the administration's $175 billion to CBO's roughly $1.2 trillion over 20 years (May 2026).",
        budgetPerUnit: -15,
        // ESTIMATE of near-term annual spending: administration figure ~$175B total (~$185B budgeted so far); CBO (May 2026) ~$1.2T over 20 years
        source: "Estimate of near-term yearly spending, based on administration ($175B total) and CBO (May 2026: about $1.2 trillion over 20 years) cost figures",
        onText: "Savings of roughly $15 billion a year. Supporters warn the US stays exposed to new hypersonic and long-range missiles; critics say the system was unlikely to work as promised.",
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: -0.5, working_families: 0.2, young_adults: 0.5, rural_military: -1.5 },
          gdpPct: -0.028
        }
      },
      {
        id: "delay_sentinel", parent: "defense_weapons", side: "spending", type: "toggle",
        name: "Delay the new ICBM; extend the old Minuteman missiles",
        blurb: "The Sentinel program to replace land-based nuclear missiles has run more than 80% over budget. This would extend the existing Minuteman III missiles for now.",
        budgetPerUnit: -4,
        source: "CBO Budget Options 2024 and CBO nuclear forces cost projections (delay/cancel Sentinel)",
        onText: "About $4 billion a year saved. The Air Force must keep 1970s-era missiles working longer; missile-base towns in Wyoming, Montana and North Dakota lose expected construction jobs.",
        effects: {
          metrics: {},
          personas: {},
          approval: { young_adults: 0.2, rural_military: -0.8 },
          gdpPct: -0.0075
        }
      },
      {
        id: "close_overseas_bases", parent: "defense_operations", side: "spending", type: "toggle",
        name: "Close a third of overseas bases",
        blurb: "The US keeps about 170,000 troops stationed abroad, mostly in Japan, Germany and South Korea. This would bring many home and close a third of overseas bases.",
        budgetPerUnit: -8,
        // ESTIMATE from RAND/CBO analyses of overseas basing costs
        source: "Estimate based on RAND and CBO analyses of overseas basing costs",
        onText: "Tens of thousands of troops and families come home. Allies like Japan and Germany worry about US commitment, and US forces would take longer to reach a crisis.",
        effects: {
          metrics: {},
          personas: {},
          approval: { seniors: -0.3, working_families: 0.2, young_adults: 0.5, rural_military: -1.0 },
          gdpPct: -0.0025
        }
      },

      // ===== Other spending reforms =====
      {
        id: "farm_subsidy_limits", parent: "agriculture", side: "spending", type: "toggle",
        name: "Limit farm subsidies for big operations",
        blurb: "Cap commodity payments per farm and reduce crop-insurance premium subsidies for the largest operations.",
        budgetPerUnit: -5,
        source: "CBO Budget Options 2024, reduce crop-insurance premium subsidies and limit commodity payments",
        onText: "The biggest farms lose tens of thousands of dollars a year in support; a mid-sized family farm pays about $3,000 more for crop insurance.",
        effects: {
          metrics: {},
          personas: { farm_family: -3000 },
          approval: { working_families: 0.2, young_adults: 0.2, high_earners: 0.1, rural_military: -1.5 },
          gdpPct: -0.0078
        }
      },
      {
        id: "reverse_snap_cuts", parent: "snap_food", side: "spending", type: "toggle",
        name: "Reverse the 2025 SNAP cuts",
        blurb: "The 2025 law extends SNAP work requirements to adults up to 64 and to parents of teens, and makes states pay part of benefit costs from 2028. This would undo those changes.",
        budgetPerUnit: 13,
        source: "CBO estimates of P.L. 119-21 SNAP work requirements (-$68.6B/10yr, 2.4M fewer participants) and state cost-sharing (-$41B)",
        onText: "About 2.4 million people keep food aid they would have lost, many of them older adults in their late 50s and early 60s. States avoid a new bill that might force them to cut benefits.",
        effects: {
          metrics: { food_aid: 2400000, poverty: -250000, child_poverty: -80000 },
          personas: { single_mom: 100 },
          approval: { seniors: -0.2, working_families: 0.6, young_adults: 0.3, high_earners: -0.3, rural_military: -0.3 },
          gdpPct: 0.049
        }
      },
      {
        id: "student_loan_forgiveness", parent: "education", side: "spending", type: "toggle",
        name: "Forgive $10,000 of student debt per borrower",
        blurb: "Cancel up to $10,000 of federal student loans for borrowers earning under $125,000. The one-time cost of about $400 billion is shown spread over 10 years.",
        budgetPerUnit: 40,
        source: "CBO (2022) cost estimate of $10,000 student-loan cancellation (~$400B), annualized",
        onText: "About 40 million borrowers get relief, and roughly a third have their loans wiped out. Monthly payments fall by about $110 for a typical borrower. Critics ask why people who didn't go to college or already paid off their loans should foot the bill.",
        effects: {
          metrics: {},
          personas: { young_renter: 1300 },
          approval: { seniors: -1.5, working_families: 0.5, young_adults: 5.0, high_earners: -1.0, small_business: -0.5, rural_military: -1.5 },
          gdpPct: 0.05
        }
      },
      {
        id: "universal_prek", parent: "education", side: "spending", type: "toggle",
        name: "Free preschool for every 3- and 4-year-old",
        blurb: "Federal funding for states to offer free, full-day preschool to all 3- and 4-year-olds.",
        budgetPerUnit: 30,
        source: "CBO score of the Build Back Better Act (2021) universal pre-K provisions, annualized",
        onText: "About 6 million kids get free preschool, saving families thousands a year in child care and letting more parents work more hours. Some studies find lasting gains for low-income kids; others find the gains fade.",
        effects: {
          metrics: { child_poverty: -100000 },
          personas: { single_mom: 3000, military_family: 2500 },
          approval: { seniors: -0.3, working_families: 2.5, young_adults: 1.5, high_earners: -0.3, small_business: 0.3 },
          gdpPct: 0.09
        }
      },
      {
        id: "paid_leave", parent: "income_support", side: "spending", type: "toggle",
        name: "12 weeks of national paid family leave",
        blurb: "Pay workers about two-thirds of their wages, up to a cap, for up to 12 weeks after a birth, adoption, or serious illness in the family. The US is the only rich country without it.",
        budgetPerUnit: 50,
        source: "Estimate based on CBO and Urban Institute analyses of the FAMILY Act (12 weeks)",
        onText: "A new mom earning $40,000 gets about $500 a week while she recovers and bonds with her baby, instead of choosing between a paycheck and her family. Small businesses worry about covering absences.",
        effects: {
          metrics: { poverty: -150000, child_poverty: -60000 },
          personas: { single_mom: 400, median_family: 300, young_renter: 300, professional_couple: 200 }, // expected value: chance of using leave in a given year
          approval: { seniors: -0.2, working_families: 3.0, young_adults: 2.0, high_earners: -0.5, small_business: -2.0, rural_military: 0.5 },
          gdpPct: 0.11
        }
      },
      {
        id: "ctc_fully_refundable", parent: "income_support", side: "spending", type: "toggle",
        name: "Make the child tax credit fully refundable",
        blurb: "Today families must earn money to get the full credit, so the poorest children get less. This would give the full credit to every child regardless of parents' earnings, as in 2021.",
        budgetPerUnit: 20,
        source: "Estimate based on Columbia Center on Poverty and Social Policy and Treasury analyses of 2021 credit refundability",
        onText: "About 17 million children in the lowest-income families get the full credit for the first time. Child poverty falls by more than 1 million. Critics worry it reduces the incentive for parents to work.",
        effects: {
          metrics: { child_poverty: -1400000, poverty: -2000000 },
          personas: {},
          approval: { seniors: -0.3, working_families: 1.0, young_adults: 0.2, high_earners: -0.3, rural_military: -0.3 },
          gdpPct: 0.056
        }
      }
    ],

    // ------------------------------------------------------------------
    // KITCHEN-TABLE HOUSEHOLDS (illustrative; 2026 tax law)
    // `share` = the fraction of US households each one stands in for, used to
    // population-weight the Hardship lens. These are rough ESTIMATES, judged from
    // Census CPS income/age distributions and IRS SOI income percentiles; they sum to 1.
    // ------------------------------------------------------------------
    personas: [
      {
        id: "retired_couple", name: "Walt & Denise", icon: "👴", tagline: "Retired couple, Ohio",
        income: 80000,
        detail: "He was a machinist, she was a school aide. They get $46,000 a year from Social Security plus a $24,000 pension and some IRA withdrawals, and both are on Medicare Advantage. The new $6,000 senior deduction cut their income tax to almost nothing.",
        // Income tax ~$350 (taxable ~$3,500 after std + senior deductions) + ~$1,000 excise/tariff costs
        federalTaxes: 1350,
        // Social Security $46,000 + Medicare coverage worth ~$26,000 for two after premiums
        federalBenefits: 72000,
        // share: Households headed by someone 65+ are ~27% of US households (Census CPS ASEC 2025: ~36M of 133M). (estimate)
        share: 0.27
      },
      {
        id: "single_mom", name: "Jenna", icon: "👩‍👧‍👦", tagline: "Single mom of two, retail worker, Georgia",
        income: 32000,
        detail: "Jenna works full-time as a pharmacy-store shift lead and raises two kids, 4 and 8. The kids are on Medicaid (PeachCare) and she buys a marketplace plan with a premium credit; the family gets SNAP and a big tax refund from the EITC and child tax credit.",
        // Payroll tax 7.65% = $2,448 + ~$400 excise/tariffs; income tax wiped out by credits
        federalTaxes: 2850,
        // EITC ~$5,330 + refundable child credit $3,400 + SNAP ~$2,400 + school meals ~$1,000 + kids' Medicaid ~$7,000 + premium credit ~$6,000
        federalBenefits: 25100,
        // share: Lower-income working-age households (roughly the bottom fifth by income, under ~$40k) who rely on refundable credits, SNAP or Medicaid. (estimate)
        share: 0.20
      },
      {
        id: "median_family", name: "Dan & Maria Ortiz", icon: "👨‍👩‍👧‍👦", tagline: "Two-earner family, two kids, Arizona",
        income: 105000,
        detail: "Dan is an HVAC technician and Maria is a dental hygienist. They have health insurance through Dan's job, a mortgage, and two kids in public school. About $72,800 of their income is taxable after the standard deduction, all of it in the 10% and 12% brackets.",
        // Income tax $8,240 - $4,400 child credit = $3,840; payroll $8,033; ~$900 excise/tariffs
        federalTaxes: 12800,
        federalBenefits: 500,
        // share: Middle-income working families, roughly $60k-$150k with a W-2 job and employer coverage (the broad middle of the IRS/Census distribution). (estimate)
        share: 0.24
      },
      {
        id: "young_renter", name: "Tyler", icon: "🧑‍🍳", tagline: "27, restaurant assistant manager, Denver",
        income: 58000,
        detail: "Tyler rents a one-bedroom with a roommate and is paying off $32,000 in student loans. He's paid by the hour, and about $9,000 of his pay is overtime, now partly tax-free under the 2025 law. He gets health insurance through work.",
        // Income tax ~$3,700 after overtime deduction; payroll $4,437; ~$600 other
        federalTaxes: 8700,
        federalBenefits: 300,
        // share: Young and single workers with moderate wages, renters, no kids; about a fifth of households are under-35 or single-person working households. (estimate)
        share: 0.19
      },
      {
        id: "military_family", name: "Sgt. Jess & Marcus Reyes", icon: "🪖", tagline: "Army family, two kids, Fort Hood, Texas",
        income: 90000,
        detail: "Jess is an Army staff sergeant with 10 years in; Marcus works part-time at a credit union. Her $50,000 base pay is taxed, but her $22,000 housing allowance is tax-free, and the family is covered by TRICARE. Her paycheck itself comes from the federal budget.",
        // Payroll ~$5,200 on $68k taxable pay, income tax ~$1,500 after child credit, ~$800 other
        federalTaxes: 7500,
        // Housing allowance $22,000 + TRICARE worth ~$14,000 (salary not counted)
        federalBenefits: 36000,
        // share: Active-duty, Guard/Reserve and DoD civilian households: ~2.5M, about 2% of households. (estimate)
        share: 0.02
      },
      {
        id: "farm_family", name: "Dale & Kathy Hutchins", icon: "🌽", tagline: "Corn & soybean farmers, Iowa",
        income: 95000,
        detail: "They farm 1,200 acres, mostly rented. Their grown kids live nearby. Dale, an Army veteran, gets VA disability pay. They rely on subsidized crop insurance and price-support payments, pay self-employment tax on the farm's profit, and buy their own health insurance at full price since the extra ACA subsidies expired. Tariff fights hit their soybean prices.",
        // Self-employment tax ~$13,400 + income tax ~$5,000 + ~$900 other
        federalTaxes: 19300,
        // Farm payments + crop-insurance premium subsidy ~$18,000 + VA disability ~$7,800
        federalBenefits: 25800,
        // share: Farm households (~2M per USDA ERS) plus rural self-employed households tied to farm programs: about 2%. (estimate)
        share: 0.02
      },
      {
        id: "professional_couple", name: "Nina & James Park", icon: "👩‍⚕️", tagline: "Doctor & engineer, two kids, New Jersey suburbs",
        income: 450000,
        detail: "She's a pediatrician, he's a software engineer; each earns about $225,000. They itemize (state and property taxes up to the new $40,000 SALT cap, plus mortgage interest), top out in the 24% bracket, and max out their 401(k)s. They receive essentially no direct federal benefits.",
        // Income tax ~$75,700 + payroll ~$31,200 + ~$3,000 other
        federalTaxes: 110000,
        federalBenefits: 0,
        // share: High earners below the very top: roughly the top 6% of households (above ~$250k), excluding the top 0.1%. (estimate)
        share: 0.059
      },
      {
        id: "top_household", name: "The Whitfields", icon: "🛥️", tagline: "Tech founder & investor family, Florida",
        income: 8000000,
        detail: "One of the top 0.1% of households. About $1.5 million comes from salary and business income; the other $6.5 million is capital gains and dividends, taxed at 23.8%. Their net worth is around $150 million, mostly stock they've never sold.",
        // Ordinary income ~$520,000 + capital income $6.5M x 23.8% = $1.55M + Medicare/SS ~$47,000
        federalTaxes: 2100000,
        federalBenefits: 0,
        // share: Literally the top 0.1% of households by income (~133,000 households). (estimate)
        share: 0.001
      }
    ],

    // ------------------------------------------------------------------
    // NATIONWIDE HUMAN OUTCOMES
    // ------------------------------------------------------------------
    metrics: [
      { id: "uninsured", name: "People without health insurance", icon: "🏥", baseline: 26.7e6, goodDirection: "down", format: "people", min: 0 },
      { id: "poverty", name: "People in poverty (supplemental measure)", icon: "📉", baseline: 44.9e6, goodDirection: "down", format: "people", min: 0 },
      { id: "child_poverty", name: "Children in poverty", icon: "🧒", baseline: 9.6e6, goodDirection: "down", format: "people", min: 0 },
      { id: "senior_poverty", name: "Seniors in poverty", icon: "🧓", baseline: 9.0e6, goodDirection: "down", format: "people", min: 0 },
      { id: "food_aid", name: "People getting SNAP food aid", icon: "🥫", baseline: 41e6, goodDirection: "up", format: "people", min: 0 },
      { id: "rent_aid_households", name: "Households getting federal rent help", icon: "🏠", baseline: 4.6e6, goodDirection: "up", format: "number", min: 0 },
      { id: "military_personnel", name: "Active-duty troops", icon: "🪖", baseline: 1.32e6, goodDirection: "up", format: "people", min: 0 },
      { id: "research_grants", name: "New federal research grants per year", icon: "🔬", baseline: 20000, goodDirection: "up", format: "number", min: 0 },
      { id: "gas_price", name: "Average gas price ($/gallon)", icon: "⛽", baseline: 3.10, goodDirection: "down", format: "dollars", min: 0 },
      { id: "avg_household_tax", name: "Average federal taxes per household", icon: "🧾", baseline: 40600, goodDirection: "down", format: "dollars", min: 0 },
      { id: "ss_depletion_year", name: "Year Social Security's trust funds run dry", icon: "⏳", baseline: 2034, goodDirection: "up", format: "year" },
      { id: "co2_emissions", name: "US carbon emissions (million tons a year)", icon: "🏭", baseline: 4800, goodDirection: "down", format: "number", min: 0 }
    ],

    // ------------------------------------------------------------------
    // VOTER BLOCS (shares of the electorate sum to 1)
    // ------------------------------------------------------------------
    blocs: [
      { id: "seniors", name: "Seniors", icon: "🧓", share: 0.22, baselineApproval: 52 },
      { id: "working_families", name: "Working families", icon: "👨‍👩‍👧", share: 0.26, baselineApproval: 51 },
      { id: "young_adults", name: "Young adults", icon: "🎧", share: 0.16, baselineApproval: 47 },
      { id: "high_earners", name: "High earners & investors", icon: "💼", share: 0.08, baselineApproval: 55 },
      { id: "small_business", name: "Small-business owners", icon: "🏪", share: 0.10, baselineApproval: 52 },
      { id: "rural_military", name: "Rural & military communities", icon: "🌾", share: 0.18, baselineApproval: 52 }
    ],
    // ------------------------------------------------------------------
    // NEWSPAPER HEADLINES (higher priority wins)
    // ------------------------------------------------------------------
    headlines: [
      // Deficit milestones
      { when: { stat: "deficit", op: "<=", value: -200 }, text: "SURPLUS! ACCOUNTANTS WEEP TEARS OF JOY", priority: 10 },
      { when: { stat: "deficit", op: "<=", value: 0 }, text: "BUDGET BALANCED FOR FIRST TIME SINCE 2001!", priority: 9 },
      { when: { stat: "deficit", op: "<=", value: 996 }, text: "DEFICIT CUT IN HALF; DEBT HAWKS COO", priority: 7 },
      { when: { stat: "deficit", op: ">=", value: 2600 }, text: "RED INK FLOODS CAPITOL AS DEFICIT BALLOONS", priority: 7 },
      // Approval, jobs and the economy
      { when: { stat: "approval", op: "<=", value: 15 }, text: "PITCHFORK SALES SOAR NATIONWIDE", priority: 8 },
      { when: { stat: "approval", op: ">=", value: 60 }, text: "BUDGET MIRACLE: VOTERS ACTUALLY HAPPY", priority: 8 },
      { when: { stat: "gdpPct", op: "<=", value: -3 }, text: "RECESSION! ECONOMISTS SAY 'TOLD YOU SO'", priority: 8 },
      { when: { stat: "jobs", op: "<=", value: -3000000 }, text: "PINK SLIPS PILE UP: MILLIONS OF JOBS GONE", priority: 8 },
      { when: { stat: "jobs", op: ">=", value: 1000000 }, text: "HELP WANTED SIGNS SPROUT LIKE DANDELIONS", priority: 6 },
      // Shared sacrifice and hardship (the household lenses)
      { when: { stat: "brink", op: ">=", value: 3 }, text: "HOUSEHOLDS ACROSS AMERICA LOSE A QUARTER OF THEIR PAY", priority: 8 },
      { when: { stat: "brink", op: ">=", value: 1 }, text: "FAMILY PUSHED TO THE BRINK BY BUDGET PLAN", priority: 7 },
      { when: { stat: "hardship", op: ">=", value: 12 }, text: "BELTS TIGHTEN TO THE LAST NOTCH AT KITCHEN TABLES NATIONWIDE", priority: 7 },
      { when: { stat: "fairness", op: "<=", value: 10 }, text: "ONE HOUSEHOLD FOOTS THE BILL WHILE THE REST BARELY NOTICE", priority: 6 },
      { when: { all: [{ stat: "fairness", op: ">=", value: 90 }, { stat: "hardship", op: ">=", value: 2 }] }, text: "EVERYBODY CHIPS IN: PAIN SPLIT SO EVENLY ECONOMISTS CHECK THEIR MATH", priority: 8 },
      { when: { stat: "hardship", op: "<=", value: -3 }, text: "HOUSEHOLDS COME OUT AHEAD AS WASHINGTON SQUEEZES ELSEWHERE", priority: 5 },
      // Human outcomes
      { when: { metric: "uninsured", op: ">=", value: 35e6 }, text: "ER WAITING ROOMS OVERFLOW AS MILLIONS LOSE COVERAGE", priority: 6 },
      { when: { metric: "uninsured", op: "<=", value: 18e6 }, text: "INSURANCE CARDS FOR (ALMOST) EVERYBODY", priority: 5 },
      { when: { metric: "child_poverty", op: "<=", value: 6e6 }, text: "CHILD POVERTY PLUNGES TO RECORD LOW", priority: 6 },
      { when: { metric: "ss_depletion_year", op: ">=", value: 2060 }, text: "SOCIAL SECURITY SAVED (FOR NOW, AGAIN)", priority: 6 },
      // Spending lines
      { when: { lever: "social_security", op: "<=", value: -20 }, text: "GRANDMA GOES BACK TO WORK AS SOCIAL SECURITY SLASHED", priority: 6 },
      { when: { lever: "social_security", op: "<=", value: -5 }, text: "SENIORS MARCH ON CAPITOL AS CHECKS SHRINK", priority: 4 },
      { when: { lever: "social_security", op: ">=", value: 15 }, text: "EARLY-BIRD SPECIAL ON THE HOUSE: SENIORS GET BIG RAISE", priority: 4 },
      { when: { lever: "medicare", op: "<=", value: -20 }, text: "MEDICARE GETS THE KNIFE; HOSPITALS GET THE CHILLS", priority: 5 },
      { when: { lever: "medicaid_chip", op: "<=", value: -25 }, text: "GOVERNORS PANIC AS MEDICAID MONEY VANISHES", priority: 5 },
      { when: { lever: "veterans", op: "<=", value: -20 }, text: "VETERANS MARCH ON WASHINGTON, AGAIN", priority: 5 },
      { when: { lever: "defense_weapons", op: "<=", value: -30 }, text: "PENTAGON HOLDS BAKE SALE TO BUY FIGHTER JET", priority: 5 },
      { when: { lever: "defense_operations", op: "<=", value: -30 }, text: "BASE CLOSES; SUB SHOP OUTSIDE THE GATE CLOSES TOO", priority: 4 },
      { when: { lever: "defense_personnel", op: ">=", value: 25 }, text: "UNCLE SAM WANTS YOU. AND YOU. AND YOU.", priority: 4 },
      { when: { lever: "snap_food", op: "<=", value: -50 }, text: "FOOD BANKS OVERWHELMED AS SNAP SLASHED", priority: 5 },
      { when: { lever: "foreign_aid", op: "<=", value: -90 }, text: "FOREIGN AID AXED; BUDGET BARELY NOTICES", priority: 3 },
      { when: { lever: "foreign_aid", op: ">=", value: 100 }, text: "MOSQUITOES FURIOUS AS MALARIA AID DOUBLES", priority: 3 },
      { when: { lever: "science_research", op: "<=", value: -40 }, text: "SCIENTISTS PACK BAGS FOR EUROPE AS LABS GO DARK", priority: 4 },
      { when: { lever: "science_research", op: ">=", value: 50 }, text: "MOON BASE BACK ON THE MENU", priority: 3 },
      { when: { lever: "education", op: "<=", value: -50 }, text: "SCHOOL'S OUT: FEDERAL EDUCATION AID GUTTED", priority: 4 },
      { when: { lever: "transportation", op: ">=", value: 50 }, text: "ORANGE CONES EVERYWHERE: NATION BECOMES ONE BIG ROADWORK ZONE", priority: 3 },
      { when: { lever: "agriculture", op: "<=", value: -75 }, text: "FARMERS SEE RED AS SUBSIDIES DRY UP", priority: 4 },
      { when: { lever: "energy_environment", op: "<=", value: -50 }, text: "SMOKEY BEAR GETS A PINK SLIP", priority: 3 },
      // Tax levers
      { when: { lever: "tariff_rate", op: ">=", value: 20 }, text: "SMOOT-HAWLEY CALLED; IT WANTS ITS TARIFFS BACK", priority: 4 },
      { when: { lever: "tariff_rate", op: "<=", value: 3 }, text: "FREE TRADE RETURNS: CHEAP SOCKS FOR ALL", priority: 3 },
      { when: { lever: "rate_top", op: ">=", value: 50 }, text: "MILLIONAIRES DISCOVER SUDDEN LOVE FOR MONACO", priority: 4 },
      { when: { lever: "rate_bottom", op: ">=", value: 16 }, text: "EVERYBODY'S TAXES GO UP; NOBODY'S HAPPY", priority: 4 },
      { when: { lever: "corp_rate", op: "<=", value: 15 }, text: "CEOS POP CHAMPAGNE AS CORPORATE RATE PLUNGES", priority: 3 },
      { when: { lever: "corp_rate", op: ">=", value: 30 }, text: "CORPORATIONS EYE IRELAND, AGAIN", priority: 3 },
      { when: { lever: "gas_tax", op: ">=", value: 60 }, text: "FILL 'ER UP? MORE LIKE FILL 'ER HALFWAY", priority: 4 },
      { when: { lever: "carbon_tax", op: ">=", value: 50 }, text: "COAL'S LAST GASP AS CARBON TAX BITES", priority: 3 },
      { when: { lever: "vat", op: ">=", value: 5 }, text: "AMERICA DISCOVERS THE VAT; EUROPE SAYS 'WELCOME TO THE CLUB'", priority: 4 },
      { when: { lever: "ss_payroll_rate", op: ">=", value: 15 }, text: "PAYCHECKS SHRINK AS SOCIAL SECURITY TAX JUMPS", priority: 4 },
      { when: { lever: "ss_retirement_age", op: ">=", value: 69 }, text: "WORK TILL YOU DROP: RETIREMENT AGE SOARS", priority: 4 },
      { when: { lever: "cap_gains_rate", op: ">=", value: 35 }, text: "INVESTORS VOW NEVER TO SELL ANYTHING EVER AGAIN", priority: 3 },
      // Default for the untouched baseline
      { when: { stat: "deficit", op: ">=", value: -1e9 }, text: "CONGRESS STARES AT $2 TRILLION DEFICIT, ORDERS LUNCH", priority: 0 }
    ],

    // ------------------------------------------------------------------
    // CHALLENGES
    // ------------------------------------------------------------------
    challenges: [
      { id: "no_new_taxes", name: "Read My Lips", icon: "👄", blurb: "Balance the budget without raising any tax.", rules: { noTaxIncreases: true } },
      { id: "hands_off_seniors", name: "Hands Off Grandma", icon: "👵", blurb: "Balance the budget without touching Social Security or Medicare.", rules: { protect: ["social_security", "medicare"] } },
      { id: "no_spending_cuts", name: "Just Send the Bill", icon: "🧾", blurb: "Balance the budget without cutting any spending. Taxes only.", rules: { noSpendingCuts: true } },
      { id: "landslide", name: "Landslide", icon: "🗳️", blurb: "Balance the budget and keep overall approval at 40 or above.", rules: { minApproval: 40 } },
      { id: "soft_landing", name: "Soft Landing", icon: "🛬", blurb: "Balance the budget while losing fewer than 2.5 million jobs.", rules: { maxUnemploymentJobsLost: 2.5e6 } },
      { id: "safety_net", name: "Safety Net Intact", icon: "🕸️", blurb: "Balance the budget without cutting Social Security, Medicaid, food aid or income support.", rules: { protect: ["social_security", "medicaid_chip", "snap_food", "income_support"] } },
      { id: "grand_bargain", name: "Grand Bargain", icon: "🤝", blurb: "Balance the budget with approval of at least 35 and fewer than 3 million jobs lost.", rules: { minApproval: 35, maxUnemploymentJobsLost: 3e6 } },
      // Lens challenges. Thresholds checked with a plan search on this data: the best balanced
      // plans found reach shared sacrifice ~100, hardship about -17%, and approval ~56, but not
      // all at once (approval 40 + shared sacrifice 60 + hardship 3% is feasible; approval 50 with
      // the same two was not found).
      { id: "all_together", name: "All in This Together", icon: "⚖️", blurb: "Balance the budget so the burden falls evenly: shared sacrifice of at least 70.", rules: { minFairness: 70 } },
      { id: "do_no_harm", name: "First, Do No Harm", icon: "🩹", blurb: "Balance the budget while keeping hardship to the equivalent of 2% of take-home pay or less.", rules: { maxHardship: 2 } },
      { id: "triple_crown", name: "Triple Crown", icon: "👑", blurb: "Win on all three scorecards at once: approval of 40 or more, shared sacrifice of 60 or more, and hardship of 3% or less.", rules: { minApproval: 40, minFairness: 60, maxHardship: 3 } }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BUDGET_DATA;
  else root.BUDGET_DATA = BUDGET_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
