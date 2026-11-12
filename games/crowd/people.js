// The Crowd: who is in the crowd and what they care about. Content only; the
// simulation in crowd-model.js is generic and keys everything off these tables
// and the ids in shared/data.js.
//
// Money in $ per year per HOUSEHOLD unless stated. Shares are fractions of US
// ADULTS (18+). Sources are cited beside each number; anything marked
// "estimate" is a judgment call, not a sourced figure.
(function (root) {
  const CROWD_DATA = {
    // Shown in the game's "About the numbers" section.
    meta: {
      caveats: [
        "How many people are in each group comes from Census, SSA, BLS and other official counts. How strongly each group reacts to a change, and how much people care about each worry, are our estimates, loosely guided by published polling.",
        "Some small groups (the top 0.1%, troops, farmers, scientists and others) always get at least one figure, even when their share of the country would round to none, so they stay visible. That over-draws them slightly; each figure says how many real adults it stands for.",
        "Dollar effects on each figure are rough: they use typical incomes, tax brackets and benefit amounts for the group, not anyone's real return or check.",
        "Lost jobs, lost coverage and lost rent help are dealt out from the budget model's national counts. Who gets hit is random within the groups most exposed, and the counts are themselves estimates.",
        "The crowd reacts to the whole change landing at once. A real plan phases in over years and gives people time to adjust, so balancing the budget in one year looks harsher here than it would be.",
        "Moods and the vote estimate are a game mechanic, not a poll or a prediction of any election."
      ],
      sources: [
        "Census Bureau, Vintage 2024 population estimates; CPS ASEC 2025",
        "Social Security Administration, Fast Facts & Figures 2025",
        "Bureau of Labor Statistics, Current Population Survey and Consumer Expenditure Survey 2023",
        "IRS Rev. Proc. 2025-32 (2026 tax brackets and standard deduction)",
        "DOE, US Energy and Employment Report 2025",
        "Pew Research Center: policy priorities (Feb 2024), taxes and fairness (April 2023), science funding (Feb 2025)",
        "Gallup: government role (Sept 2024), taxes (April 2025), defense spending (Feb 2025)",
        "KFF Health Tracking Polls (2023-2025); AP-NORC polling (2021-2025)"
      ]
    },

    // Census Bureau, Vintage 2024 population estimates: ~262 million residents 18+.
    adults: 262e6,
    defaultSize: 260,

    // mood thresholds: level i if mood >= levelThresholds[i]; otherwise the last level (5).
    levelThresholds: [30, 12, -14, -32, -55],
    levelNames: ["Cheering", "Happy", "Content", "Uneasy", "Angry", "Furious"],

    // Tuning constants for the mood engine (see README "How the simulation works").
    tuning: {
      opinionSpread: 12,        // sd of each person's baseline opinion around the archetype mean
      lossLinear: 2.5,          // loss impact = -(lossLinear*pct + lossQuad*pct^2), pct = % of resources
      lossQuad: 0.15,
      gainLinear: 1.25,          // gain impact = gainLinear*pct / (1 + pct/gainSoft)
      gainSoft: 15,
      wealthYield: 0.04,        // resources = income + wealthYield * net worth
      minResources: 8000,
      futureWeight: [[30, 0.15], [50, 0.25], [62, 0.4]],   // [age below, weight] for benefits paid years from now
      bigReason: 20,            // |impact| at or above this adds linearly (catastrophes are not softened)
      pileExponent: 1.5,        // smaller reasons combine as a p-norm: piles of gripes have diminishing returns
      positiveDamp: 0.6,        // worries: relief at an increase counts this much of the alarm at an equal cut
      minImpact: 0.5,           // reasons smaller than this are dropped
      // Discrete outcomes (mood points)
      lostJob: -45, gotHired: 28, jobFear: -14, jobBoost: 6,
      lostCoverage: -30, gotCoverage: 18, coverageFear: -9,
      lostRent: -35, gotRent: 20, rentFear: -10,
      lostFood: -22, gotFood: 10, foodFear: -7,
      // Lenses
      voteMid: -12, voteScale: 10,   // P(vote for you) = logistic((mood - voteMid) / voteScale)
      fairnessK: 15,                 // fairness = 100 * exp(-sd(moodDelta) / fairnessK)
      hardshipK: 50                  // hardship = mean(pain + pain^2 / hardshipK), pain = max(0, -moodDelta)
    },

    // Tax arithmetic for personal bases (2026 law).
    // IRS Rev. Proc. 2025-32 (2026 inflation adjustments as amended by P.L. 119-21):
    // standard deduction $16,100 single / $32,200 joint; 12% bracket tops out at
    // $50,400 / $100,800; 24% bracket at $201,775 / $403,550. SSA: 2026 wage base $184,500.
    tax: {
      stdSingle: 16100, stdCouple: 32200,
      bottomSingle: 50400, bottomCouple: 100800,
      middleSingle: 151375, middleCouple: 302750,
      ssWageCap: 184500,
      ssCapThreshold: 250000,
      // Household consumption from income (estimate, fitted to BLS Consumer Expenditure
      // Survey 2023 spending by income quintile): 90% of the first $50k, 60% of the next
      // $150k, 15% above $200k.
      consumption: [[50000, 0.9], [200000, 0.6], [Infinity, 0.15]]
    },

    // ------------------------------------------------------------------
    // ARCHETYPES. Shares are of US adults and sum to 1. Real people belong to several
    // of these at once; each adult is counted once, under the stake that dominates their
    // budget exposure (e.g. a retired veteran is a retiree; a teacher who is also a
    // parent is a teacher). Folded in: part-time students into worker groups; working
    // 65+ people into retirees or near-retirees; Postal workers into transport;
    // DoD civilians into federal employees; homemakers into middle-class parents.
    // `bases` give per-household dollar stakes: [probability, low, high] (uniform), or
    // { p, f } = f x household income. `look` options are picked per person.
    // ------------------------------------------------------------------
    archetypes: [
      {
        id: "retiree_low", group: "Retirees on a small check", share: 0.075,
        // SSA: ~52M retired-worker beneficiaries; ~40% of 65+ beneficiaries get at least
        // half their income from Social Security (SSA Fast Facts 2025). Census: 61M adults 65+.
        source: "SSA Fast Facts & Figures 2025; Census CPS ASEC 2025",
        age: [66, 92], income: [16000, 36000], married: 0.3, mood: 0,
        capShare: 0, wageShare: 0, taxableFrac: 0.15, itFactor: 0.3, uninsured: 0.01, netWorth: [0, 150000],
        bases: { ss: [1, 13000, 24000], medicare: [1, 13000, 20000], ma: [0.55, 80, 200], drugs: [1, 120, 280], copay: [1, 20, 50],
                 snap: [0.3, 1500, 3000], credits: [0.15, 3000, 8000], tipsOT: [0.15, 200, 500], sin: [0.4, 20, 80] },
        labels: ["Retired school cook", "Retired home health aide", "Widowed, retired seamstress", "Retired janitor", "Retired farmhand", "Retired bus driver", "Retired grocery clerk"],
        look: { outfit: ["cardigan", "casual"], hat: ["none", "none", "cap", "straw"], prop: ["cane", "none", "cane"] },
        about: "Lives mostly on a Social Security check of about {ss_mo} a month, with Medicare for health care.",
        idle: ["My granddaughter calls every Sunday. Best part of my week.", "Tomatoes are coming in nicely this year.", "The senior center has bingo on Thursdays.", "I walk to the pharmacy; it keeps me young."],
        workplace: ["the senior center"], job: ["my part-time job"]
      },
      {
        id: "retiree_middle", group: "Middle-income retirees", share: 0.085,
        source: "SSA Fast Facts & Figures 2025; Census CPS ASEC 2025 (65+ household income)",
        age: [65, 88], income: [40000, 95000], married: 0.6, mood: 5,
        capShare: 0.05, wageShare: 0.03, taxableFrac: 0.35, uninsured: 0.005, netWorth: [150000, 900000],
        bases: { ss: [1, 24000, 46000], medicare: [1, 15000, 26000], ma: [0.5, 100, 250], drugs: [1, 150, 300], copay: [1, 25, 50],
                 tipsOT: [0.8, 600, 1400], fedpension: [0, 0, 0], sin: [0.5, 30, 100] },
        labels: ["Retired machinist", "Retired nurse", "Retired school secretary", "Retired electrician", "Retired insurance agent", "Retired dental hygienist", "Retired truck dispatcher"],
        look: { outfit: ["cardigan", "casual", "casual"], hat: ["none", "cap", "none"], prop: ["none", "cane", "book"] },
        about: "Gets about {ss_mo} a month from Social Security plus some savings, and is on Medicare.",
        idle: ["We finally took that trip to see the Grand Canyon.", "I volunteer at the library two mornings a week.", "My knee replacement was the best thing I ever did.", "Golf on Tuesdays, grandkids on Saturdays."],
        workplace: ["my part-time job"], job: ["my part-time job"]
      },
      {
        id: "retiree_affluent", group: "Well-off retirees", share: 0.04,
        source: "Census CPS ASEC 2025 (65+ households above $100k); Fed SCF 2022 retirement assets",
        age: [65, 90], income: [100000, 320000], married: 0.7, mood: 8,
        capShare: 0.25, wageShare: 0.02, taxableFrac: 0.8, uninsured: 0, netWorth: [1500000, 8000000],
        bases: { ss: [1, 40000, 62000], medicare: [1, 20000, 26000], ma: [0.35, 100, 250], drugs: [1, 150, 300], copay: [1, 25, 50],
                 tipsOT: [0.3, 600, 1400], itemized: [0.35, 1000, 5000], salt: [0.25, 1000, 4000], sin: [0.5, 40, 120] },
        labels: ["Retired engineer", "Retired dentist", "Retired executive", "Retired lawyer", "Retired pharmacist", "Retired professor"],
        look: { outfit: ["cardigan", "suit", "casual"], hat: ["none", "cap", "none"], prop: ["none", "book", "cane"] },
        about: "A comfortable retirement: Social Security of about {ss_mo} a month plus investments and a pension.",
        idle: ["Our book club is reading Lincoln biographies this year.", "We're thinking about downsizing to a condo.", "I tutor kids in math at the library.", "The grandkids want to go to Yellowstone."],
        workplace: ["my consulting gig"], job: ["my consulting gig"]
      },
      {
        id: "retiree_federal", group: "Federal & military retirees", share: 0.015, mustShow: true,
        // data.js facts: ~2.7M civil-service and ~2.3M military retirees and survivors (OPM, DoD Actuary).
        source: "OPM Retirement statistics; DoD Office of the Actuary statistical report FY2024",
        age: [44, 86], income: [50000, 115000], married: 0.7, mood: 4,
        capShare: 0.05, wageShare: 0.25, taxableFrac: 0.8, uninsured: 0, netWorth: [200000, 1200000],
        bases: { fedpension: [1, 22000, 52000], ss: [0.6, 15000, 32000], medicare: [0.6, 15000, 24000], drugs: [0.6, 120, 250], copay: [0.6, 20, 40],
                 va: [0.35, 6000, 22000], tipsOT: [0.4, 600, 1200], sin: [0.5, 30, 100] },
        labels: ["Retired Army master sergeant", "Retired air-traffic controller", "Retired Navy chief", "Retired IRS examiner", "Retired VA nurse", "Retired Air Force pilot"],
        look: { outfit: ["casual", "cardigan", "camo"], hat: ["cap", "none", "beret"], prop: ["none", "cane", "book"] },
        about: "Draws a federal or military pension of about {fedpension_mo} a month after a career in public service.",
        idle: ["Twenty-two years in, and I still wake up at 0500.", "I coach Little League now.", "My unit has a reunion every fall.", "Retirement means finally fixing up the boat."],
        workplace: ["my second career"], job: ["my second-career job"]
      },
      {
        id: "disabled", group: "People with disabilities", share: 0.03,
        // SSA: ~7.2M disabled workers on SSDI (2025) and ~4.7M SSI recipients under 65.
        source: "SSA Annual Statistical Report on SSDI 2024; SSI Annual Statistical Report 2024",
        age: [28, 64], income: [13000, 36000], married: 0.35, mood: -6,
        capShare: 0, wageShare: 0.15, taxableFrac: 0.2, itFactor: 0.2, uninsured: 0.04, netWorth: [0, 60000],
        bases: { ss: [0.75, 11000, 22000], credits: [0.35, 6000, 11900], medicare: [0.55, 12000, 16000], snap: [0.45, 1800, 3500],
                 copay: [0.55, 20, 40], drugs: [0.55, 100, 250], sin: [0.3, 20, 80] },
        labels: ["On disability after a back injury", "Former trucker on SSDI", "Lives with multiple sclerosis", "Blind since birth, works part-time", "Former nurse's aide on SSDI", "Uses a wheelchair after a car crash"],
        look: { outfit: ["casual", "cardigan"], hat: ["none", "cap"], prop: ["cane", "none", "book"] },
        about: "Can no longer work full-time and lives on disability payments of about {ss_mo} a month, with Medicare or Medicaid.",
        idle: ["Physical therapy is going better this month.", "My service dog, Biscuit, is the best.", "I'm learning to code from free videos.", "The new ramp at the library is a game changer."],
        workplace: ["my part-time job"], job: ["my part-time job"]
      },
      {
        id: "veteran", group: "Veterans", share: 0.015, mustShow: true,
        // VA: ~6.9M veterans receive disability compensation (FY2025); roughly half are under 65.
        source: "VA Annual Benefits Report FY2025; VA National Center for Veterans Analysis",
        age: [27, 64], income: [45000, 115000], married: 0.65, mood: 2,
        capShare: 0.02, taxableFrac: 0.8, uninsured: 0.03, netWorth: [20000, 400000],
        bases: { va: [1, 7000, 46000], tipsOT: [0.4, 400, 1500], kids: [0.5, 1, 3], sin: [0.6, 40, 140] },
        labels: ["Marine veteran, now a welder", "Army veteran, warehouse supervisor", "Navy veteran, police dispatcher", "Air Force veteran, HVAC tech", "Army medic veteran, nursing student", "Coast Guard veteran, harbor pilot"],
        look: { outfit: ["camo", "casual", "hivis"], hat: ["cap", "cap", "none"], prop: ["none", "toolbox", "none"] },
        about: "Served, came home with a service-connected disability, and gets about {va_mo} a month from the VA plus VA health care.",
        idle: ["I run with a veterans' group every Saturday.", "The VA clinic got my appointment right this time.", "My daughter wants to enlist. I'm proud and nervous.", "Woodworking keeps my head clear."],
        workplace: ["the plant"], job: ["my job at the plant"]
      },
      {
        id: "military", group: "Active-duty troops", share: 0.005, mustShow: true,
        // DoD DMDC: ~1.31M active-duty members (2026); data.js metric military_personnel 1.32M.
        source: "DoD Defense Manpower Data Center, active-duty strength 2026",
        age: [19, 42], income: [35000, 98000], married: 0.5, mood: 4,
        capShare: 0, wageShare: 0.7, taxableFrac: 0.75, uninsured: 0, netWorth: [0, 80000],
        bases: { milpay: { p: 1, f: 0.85 }, kids: [0.45, 1, 3], prek: [0.2, 2000, 5000], sin: [0.6, 40, 140] },
        labels: ["Army sergeant", "Navy petty officer", "Air Force airman", "Marine corporal", ["Army staff sergeant, two kids", 26, 42], "Navy submarine electrician", "Space Force satellite operator"],
        look: { outfit: ["camo", "uniform"], hat: ["helmet", "beret", "cap"], prop: ["none", "none", "clipboard"] },
        about: "On active duty; their pay of about {milpay_mo} a month, housing allowance and TRICARE all come from the defense budget.",
        jobTexts: {
          loss: ["I'm being separated from the service after {cause}.", "They cut my unit after {cause}. I'm a civilian next month.", "Twelve years in, and I'm out after {cause}."],
          fear: ["Re-enlistment is frozen after {cause}. I might be forced out.", "My unit is on the list to be cut after {cause}.", "They're thinning the ranks after {cause}. I could be next."],
          gain: ["The force is growing after {cause}. My re-enlistment bonus went up."],
          shortLoss: ["Forced out of service"], shortFear: ["Is my unit next?"], shortGain: ["Bonus went up"]
        },
        idle: ["Twelve weeks until my deployment ends.", "The chow hall got a new taco night.", "Saving up for a used truck.", "My kid lost her first tooth on FaceTime."],
        workplace: ["my unit"], job: ["my spot in the service"]
      },
      {
        id: "defense_worker", group: "Defense-industry workers", share: 0.004, mustShow: true,
        // ESTIMATE: ~1.1M direct defense-industrial-base jobs (AIA 2024 Facts & Figures counts
        // ~2.2M aerospace & defense direct jobs, about half defense-related).
        source: "AIA 2024 Facts & Figures (estimate of the defense-related half)",
        age: [23, 62], income: [55000, 145000], married: 0.6, mood: 4,
        capShare: 0.02, uninsured: 0.02, netWorth: [20000, 500000],
        bases: { tipsOT: [0.6, 600, 2400], ehc: [0.4, 800, 2000], kids: [0.5, 1, 3], sin: [0.5, 30, 120] },
        labels: ["Shipyard welder", "Missile plant machinist", "Aerospace engineer", "Drone factory electronics assembler", "Submarine pipefitter", "Munitions plant inspector"],
        look: { outfit: ["hivis", "casual", "overalls"], hat: ["hardhat", "cap", "hardhat"], prop: ["toolbox", "wrench", "laptop"] },
        about: "Builds ships, planes or missiles; the paycheck depends on Pentagon contracts.",
        idle: ["We launched a new hull last month. Proudest day.", "Overtime paid for the new roof.", "My dad worked this yard too.", "The union picnic is next week."],
        workplace: ["the shipyard", "the plant", "the missile line"], job: ["my job at the shipyard", "my job on the missile line", "my contract job"]
      },
      {
        id: "federal_worker", group: "Federal employees", share: 0.009, mustShow: true,
        // OPM FedScope: ~2.3M federal civilian employees excluding the Postal Service (2025).
        source: "OPM FedScope, federal civilian workforce 2025",
        age: [24, 63], income: [55000, 165000], married: 0.55, mood: 0,
        capShare: 0.02, uninsured: 0, netWorth: [20000, 600000],
        bases: { ehc: [0.3, 600, 1800], kids: [0.45, 1, 3], sin: [0.5, 30, 100] },
        labels: ["VA hospital clerk", "Park ranger", "IRS customer-service rep", "Border Patrol agent", "FEMA logistics specialist", "Army base civilian mechanic", "Air-traffic controller", "FDA food inspector", "State Department foreign-service officer"],
        look: { outfit: ["uniform", "suit", "casual"], hat: ["none", "cap", "none"], prop: ["clipboard", "briefcase", "laptop"] },
        about: "Works for a federal agency; the job exists because Congress funds it.",
        idle: ["Our office finally got new computers.", "I love helping someone sort out a mess.", "I'm coaching my son's soccer team.", "Fifteen years in, ten to go."],
        workplace: ["my agency", "my office"], job: ["my federal job", "my job at the agency"]
      },
      {
        id: "scientist", group: "Scientists & researchers", share: 0.005, mustShow: true,
        // NSF NCSES: ~1.3M people work in federally funded academic and lab research
        // (incl. ~140k federally supported grad students and postdocs). Estimate from
        // NCSES HERD survey personnel counts and federal lab staffing.
        source: "NSF NCSES Higher Education R&D survey FY2023 (estimate)",
        age: [24, 66], income: [38000, 185000], married: 0.5, mood: 3,
        capShare: 0.03, uninsured: 0.02, netWorth: [0, 700000],
        bases: { loanRelief: [0.35, 900, 1300], kids: [0.35, 1, 2], sin: [0.4, 20, 80] },
        labels: ["Cancer researcher", ["Postdoc studying Alzheimer's", 26, 40], "NASA engineer", "University lab manager", "Climate scientist at a national lab", "Vaccine immunologist", ["Physics grad student", 22, 32]],
        look: { outfit: ["labcoat", "casual", "labcoat"], hat: ["none"], prop: ["clipboard", "laptop", "book"] },
        about: "Does research paid for by federal grants: NIH, NSF, NASA or the Energy Department's labs.",
        idle: ["The experiment finally replicated! Champagne in beakers.", "Writing a grant renewal. Send coffee.", "My students presented at a conference this week.", "We got telescope time in March."],
        workplace: ["the lab"], job: ["my lab position", "my research job"]
      },
      {
        id: "nurse", group: "Nurses & hospital staff", share: 0.03,
        // BLS OES 2024: ~3.3M registered nurses; hospitals employ ~6.5M (CES).
        source: "BLS Occupational Employment and Wages May 2024; BLS CES hospitals",
        age: [23, 64], income: [50000, 145000], married: 0.6, mood: 2,
        capShare: 0.02, uninsured: 0.02, netWorth: [10000, 500000],
        bases: { tipsOT: [0.6, 500, 2000], ehc: [0.35, 800, 2000], kids: [0.5, 1, 3], prek: [0.12, 2500, 6000], leave: [1, 200, 400], loanRelief: [0.3, 800, 1300], sin: [0.5, 30, 100] },
        labels: ["ER nurse", "Hospital pharmacy tech", "Respiratory therapist", "Labor and delivery nurse", "Rural hospital lab tech", "ICU nurse", "Hospital medical coder"],
        look: { outfit: ["scrubs"], hat: ["none"], prop: ["stethoscope", "clipboard", "stethoscope"] },
        about: "Works at a hospital or clinic that gets much of its money from Medicare and Medicaid.",
        idle: ["Three twelves in a row. Sleeping all weekend.", "A patient's family brought us cookies today.", "Night shift has its own kind of quiet.", "I'm studying for my nurse practitioner license."],
        workplace: ["the hospital", "my clinic"], job: ["my hospital job", "my job at the clinic"]
      },
      {
        id: "care_aide", group: "Home & nursing-home aides", share: 0.02,
        // BLS OES 2024: ~3.9M home health and personal care aides + ~1.3M nursing assistants.
        // Medicaid pays for most long-term care (data.js facts).
        source: "BLS Occupational Employment and Wages May 2024",
        age: [20, 64], income: [22000, 46000], married: 0.4, mood: -2,
        capShare: 0, taxableFrac: 0.8, itFactor: 0.4, uninsured: 0.15, netWorth: [0, 40000],
        bases: { snap: [0.3, 1800, 4500], credits: [0.4, 1500, 6000], kids: [0.5, 1, 3], prek: [0.2, 2500, 5000], ctcRefund: [0.3, 600, 1800], leave: [1, 250, 450], tipsOT: [0.3, 300, 1000], sin: [0.4, 20, 80] },
        labels: ["Home health aide", "Nursing-home aide", "Personal care aide for a man with ALS", "Certified nursing assistant", "Hospice aide"],
        look: { outfit: ["scrubs", "casual"], hat: ["none"], prop: ["none", "clipboard"] },
        about: "Cares for elderly and disabled people at home or in a nursing home, mostly paid for by Medicaid.",
        idle: ["Mrs. Patel taught me a new card game today.", "Six clients this week. My feet hurt, my heart's full.", "I take two buses to my first client.", "My daughter made the honor roll!"],
        workplace: ["my agency", "the nursing home"], job: ["my job at the care agency", "my nursing-home shifts"]
      },
      {
        id: "health_pro", group: "Doctors & dentists", share: 0.006, mustShow: true,
        // BLS OES 2024: ~1.0M physicians and surgeons, ~0.15M dentists, plus pharmacists' leaders.
        source: "BLS Occupational Employment and Wages May 2024; AAMC physician workforce",
        age: [30, 70], income: [220000, 620000], married: 0.8, mood: 5,
        capShare: 0.08, uninsured: 0, netWorth: [600000, 6000000],
        bases: { itemized: [0.6, 3000, 12000], salt: [0.5, 2000, 7000], ehc: [0.3, 1500, 3000], niit: [0.25, 1, 1], kids: [0.6, 1, 3], sin: [0.5, 50, 150] },
        labels: ["Family doctor at a rural clinic", "Pediatrician", "Hospital surgeon", "Dentist", "Psychiatrist", "Emergency physician"],
        look: { outfit: ["labcoat", "scrubs"], hat: ["none"], prop: ["stethoscope", "clipboard"] },
        about: "A physician or dentist; roughly a third of their patients' bills are paid by Medicare or Medicaid.",
        idle: ["Delivered twins at 3 a.m. Worth it.", "Prior authorizations are my nemesis.", "I'm teaching residents this fall.", "Finally took a real vacation."],
        workplace: ["my practice", "the hospital"], job: ["my practice", "my hospital position"]
      },
      {
        id: "teacher", group: "Teachers & school staff", share: 0.02,
        // NCES Digest 2024: ~3.8M public and private K-12 teachers; plus aides and Head Start staff.
        source: "NCES Digest of Education Statistics 2024, tables 208.20, 213.10",
        age: [23, 64], income: [45000, 115000], married: 0.6, mood: 0,
        capShare: 0.02, uninsured: 0.02, netWorth: [10000, 400000],
        bases: { ehc: [0.4, 600, 1800], kids: [0.5, 1, 3], prek: [0.15, 2500, 6000], leave: [1, 200, 400], loanRelief: [0.35, 800, 1300], sin: [0.4, 30, 90] },
        labels: ["Third-grade teacher", "Special-education teacher", "Head Start teacher", "High school chemistry teacher", "Reading specialist", "School counselor", "Teacher's aide"],
        look: { outfit: ["cardigan", "casual"], hat: ["none"], prop: ["book", "clipboard", "book"] },
        about: "Teaches in a school where federal money pays for special education, reading help or Head Start.",
        idle: ["One of my kids read a whole chapter book today!", "Grading 120 essays this weekend.", "Field trip to the science museum on Friday.", "I bought my own classroom supplies again."],
        workplace: ["my school", "the district"], job: ["my teaching job", "my school job"]
      },
      {
        id: "student", group: "College students", share: 0.04,
        // NCES: ~19M students enrolled in degree-granting institutions (fall 2024);
        // ~6.5M Pell recipients (data.js). Here: ~10.5M full-time, mostly 18-26.
        source: "NCES Digest 2024, table 303.10; Dept. of Education Pell end-of-year report 2024-25",
        age: [18, 26], income: [8000, 32000], married: 0.05, mood: 2,
        capShare: 0, taxableFrac: 0.6, itFactor: 0.5, uninsured: 0.08, netWorth: [0, 15000],
        bases: { pell: [0.45, 3000, 7395], loanRelief: [0.45, 500, 1300], tipsOT: [0.35, 200, 1200], sin: [0.5, 20, 80] },
        labels: ["Community-college nursing student", "First-generation engineering student", "Biology major working at a cafe", ["Grad student in chemistry", 22, 26], "Welding student at a tech college", "Music education major"],
        look: { outfit: ["casual"], hat: ["gradcap", "cap", "none", "none"], prop: ["book", "laptop", "book"] },
        about: "In college, often working part-time; Pell grants and federal loans are how the bills get paid.",
        idle: ["Midterms are crushing me.", "I got the internship!", "Ramen again tonight.", "Our robotics team made state finals."],
        workplace: ["the campus job"], job: ["my campus job"]
      },
      {
        id: "young_grad", group: "Young grads with loans", share: 0.035,
        // Dept. of Education: ~43M federal student-loan borrowers; ~15M are under 35 (FSA portfolio by age, 2025).
        source: "Federal Student Aid portfolio by borrower age 2025",
        age: [23, 34], income: [35000, 88000], married: 0.3, mood: -2,
        capShare: 0.01, uninsured: 0.08, netWorth: [0, 60000],
        bases: { loanRelief: [1, 800, 1300], tipsOT: [0.3, 300, 1500], ehc: [0.2, 300, 800], leave: [1, 300, 500], kids: [0.15, 1, 1], sin: [0.6, 40, 140] },
        labels: ["Junior accountant", "Social worker", "Physical therapy assistant", "Marketing coordinator", "Lab technician", "Restaurant assistant manager", "Paralegal"],
        look: { outfit: ["casual", "suit"], hat: ["none", "cap"], prop: ["laptop", "none", "briefcase"] },
        about: "A few years out of school, renting, and paying down student loans of about {loan_total}.",
        idle: ["My roommate adopted a cat without asking.", "Trying to save for a down payment. Someday.", "Trivia night at the brewery tonight.", "Just ran my first half marathon."],
        workplace: ["my office", "the restaurant"], job: ["my job"]
      },
      {
        id: "farmer", group: "Farmers & ranchers", share: 0.008, mustShow: true,
        // USDA 2022 Census of Agriculture: 1.9M farms, 3.4M producers, ~1.9M whose primary
        // occupation is farming. Farm program payments per USDA ERS farm income data.
        source: "USDA NASS 2022 Census of Agriculture; USDA ERS Farm Income and Wealth Statistics 2025",
        age: [26, 76], income: [45000, 185000], married: 0.75, mood: 0,
        capShare: 0.05, uninsured: 0.08, netWorth: [800000, 6000000], gallons: [2000, 3500], energyMult: 2.0,
        bases: { farm: [1, 6000, 60000], farmTrade: [0.8, 150, 900], aca: [0.3, 3000, 9000], acaEnh: [0.35, 3000, 9000],
                 expensing: [0.8, 800, 3000], va: [0.1, 6000, 15000], kids: [0.4, 1, 3], sin: [0.5, 30, 100] },
        labels: ["Corn and soybean farmer", "Dairy farmer", "Cattle rancher", "Wheat farmer", "Peach grower", "Rice farmer", "Hog farmer"],
        look: { outfit: ["overalls", "casual"], hat: ["straw", "cowboy", "cap"], prop: ["none", "toolbox", "wrench"] },
        about: "Runs a family farm that relies on subsidized crop insurance and price-support payments of about {farm} a year.",
        idle: ["Planting went well; now we pray for rain.", "The new calves are doing fine.", "Coffee at the co-op is where you hear everything.", "My grandson drove the combine for the first time."],
        workplace: ["the farm"], job: ["the farm"]
      },
      {
        id: "construction", group: "Construction workers", share: 0.026,
        // BLS CES: ~8.3M construction employees (2026).
        source: "BLS Current Employment Statistics, construction 2026",
        age: [19, 64], income: [38000, 98000], married: 0.55, mood: 0,
        capShare: 0, uninsured: 0.2, netWorth: [0, 250000], gallons: [1300, 2000],
        bases: { tipsOT: [0.6, 500, 2200], kids: [0.5, 1, 3], prek: [0.15, 2500, 5000], leave: [1, 200, 400], sin: [0.7, 50, 180] },
        labels: ["Highway crew foreman", "Bridge ironworker", "Carpenter", "Electrician's apprentice", "Concrete finisher", "Heavy-equipment operator", "Roofer"],
        look: { outfit: ["hivis"], hat: ["hardhat", "hardhat", "cap"], prop: ["toolbox", "wrench", "none"] },
        about: "Builds roads, bridges and buildings; a lot of the work is paid for with federal highway and infrastructure money.",
        idle: ["Poured the last deck on the bridge today.", "Up at 4:30, home by 4. Good trade.", "My apprentice is getting really good.", "Bass fishing on Sunday."],
        workplace: ["the job site", "my crew"], job: ["my construction job", "my spot on the crew"]
      },
      {
        id: "transport", group: "Transport & logistics workers", share: 0.022,
        // BLS CES: ~6.6M transportation and warehousing employees (2026), incl. Postal delivery.
        source: "BLS Current Employment Statistics, transportation and warehousing 2026",
        age: [21, 64], income: [36000, 95000], married: 0.5, mood: 0,
        capShare: 0, uninsured: 0.12, netWorth: [0, 250000], gallons: [1300, 2200],
        bases: { tipsOT: [0.6, 500, 2400], ehc: [0.25, 600, 1800], kids: [0.45, 1, 3], leave: [1, 200, 400], sin: [0.6, 40, 150] },
        labels: ["Long-haul trucker", "City bus driver", "Airline mechanic", "Warehouse forklift driver", "Delivery driver", "Freight rail conductor", "Mail carrier"],
        look: { outfit: ["hivis", "uniform"], hat: ["cap", "none"], prop: ["none", "clipboard", "toolbox"] },
        about: "Keeps goods and people moving on the roads, rails and airports that federal money helps maintain.",
        idle: ["Six states in four days. Home tonight.", "Traffic on 95 was a nightmare.", "My route has the friendliest dogs.", "Got my commercial license renewed."],
        workplace: ["the depot", "the warehouse"], job: ["my driving job", "my job at the depot"]
      },
      {
        id: "manufacturing", group: "Factory workers", share: 0.033,
        // BLS CES: ~12.7M manufacturing employees (2026); defense plants counted separately.
        source: "BLS Current Employment Statistics, manufacturing 2026",
        age: [20, 64], income: [40000, 98000], married: 0.55, mood: 0,
        capShare: 0.01, uninsured: 0.06, netWorth: [0, 300000],
        bases: { tipsOT: [0.65, 600, 2400], ehc: [0.35, 800, 2000], kids: [0.5, 1, 3], leave: [1, 200, 400], sin: [0.6, 40, 150] },
        labels: ["Auto plant assembler", "Steelworker", "Food-processing line worker", "Machinist", "Chemical plant operator", "Pharmaceutical packaging tech", "Appliance factory welder"],
        look: { outfit: ["hivis", "overalls"], hat: ["hardhat", "cap"], prop: ["wrench", "toolbox", "none"] },
        about: "Works on a factory floor where orders rise and fall with the economy, tariffs and government contracts.",
        idle: ["Line ran clean all week.", "Overtime's steady this month.", "Union meeting tonight.", "My shift wins the safety award again."],
        workplace: ["the plant", "the factory"], job: ["my job at the plant", "my factory job"]
      },
      {
        id: "service_worker", group: "Retail & restaurant workers", share: 0.055,
        // BLS CES: ~15.6M retail + ~12.4M food-service employees; many are young or part-time.
        source: "BLS Current Employment Statistics, retail trade and food services 2026",
        age: [18, 62], income: [21000, 55000], married: 0.3, mood: -2,
        capShare: 0, taxableFrac: 0.85, itFactor: 0.6, uninsured: 0.18, netWorth: [0, 40000],
        bases: { tipsOT: [0.55, 500, 3000], snap: [0.2, 1800, 4500], credits: [0.3, 800, 4000], kids: [0.35, 1, 2], ctcRefund: [0.15, 600, 1500], leave: [1, 250, 450], sin: [0.6, 40, 150] },
        labels: ["Server at a diner", "Line cook", "Grocery cashier", "Bartender", "Hotel housekeeper", "Pizza delivery driver", "Big-box stocker"],
        look: { outfit: ["apron", "casual"], hat: ["none", "chefhat", "cap"], prop: ["tray", "none", "tray"] },
        about: "Works for wages and tips, often without paid leave, and feels every change in prices.",
        idle: ["Brunch rush was wild today.", "A regular left me a 40% tip!", "Picking up a double on Saturday.", "Saving for a car that starts every time."],
        workplace: ["the restaurant", "the store"], job: ["my shifts", "my job at the store"]
      },
      {
        id: "low_income_parent", group: "Low-income parents", share: 0.04,
        // USDA: ~41M SNAP participants; Census: ~11M low-income working parents (SPM below 200%).
        source: "USDA FNS SNAP data 2026; Census CPS ASEC 2025 supplemental poverty tables",
        age: [20, 48], income: [17000, 42000], married: 0.35, mood: -4,
        capShare: 0, taxableFrac: 0.8, itFactor: 0.1, uninsured: 0.12, netWorth: [0, 15000],
        bases: { snap: [0.85, 3500, 8000], credits: [0.95, 4000, 11000], kids: [1, 1, 3], prek: [0.45, 2500, 6000], ctcRefund: [0.85, 800, 2400], leave: [1, 300, 500], aca: [0.25, 3000, 6000], sin: [0.5, 40, 100] },
        labels: ["Single parent, pharmacy shift lead", "Parent of three, warehouse picker", "Parent of two, school cafeteria worker", "Single parent, auto parts clerk", "Parent working nights at a call center", ["Grandparent raising two grandkids", 40, 99]],
        look: { outfit: ["casual", "apron"], hat: ["none", "cap"], prop: ["stroller", "stroller", "none"] },
        about: "Works full-time and raises kids on about {income} a year; the kids are on Medicaid and the family gets SNAP and a big tax refund.",
        idle: ["My son's science project won a ribbon!", "Somebody at work covered my shift so I could see the recital.", "Making tamales with my mom this weekend.", "Library story time is free and the kids love it."],
        workplace: ["the warehouse", "my job"], job: ["my job"]
      },
      {
        id: "housing_aid", group: "Renters with rent help", share: 0.015, mustShow: true,
        // HUD: ~4.6M households receive federal rental assistance (data.js); ~6M adults.
        source: "HUD Picture of Subsidized Households 2024; CBPP rental assistance fact sheets",
        age: [25, 88], income: [11000, 34000], married: 0.2, mood: -3,
        capShare: 0, taxableFrac: 0.6, itFactor: 0.1, uninsured: 0.08, netWorth: [0, 10000],
        bases: { ss: [0.35, 10000, 20000], credits: [0.5, 2000, 9000], snap: [0.6, 1800, 4500], medicare: [0.3, 12000, 15000], kids: [0.35, 1, 3], ctcRefund: [0.3, 800, 2000], sin: [0.4, 20, 80] },
        labels: [["Grandparent with a Section 8 voucher", 50, 99], "Parent with a Section 8 voucher", "Public-housing resident, part-time cashier", "Disabled veteran in subsidized housing", "Home care worker with a housing voucher", ["Senior in a HUD apartment building", 62, 99]],
        look: { outfit: ["casual", "cardigan"], hat: ["none", "cap"], prop: ["none", "cane", "stroller"] },
        about: "Pays about 30% of a small income in rent; a federal voucher or public housing covers the rest.",
        idle: ["The building's community garden is blooming.", "My neighbor and I swap recipes.", "Waited six years for this apartment. I love it.", "Church potluck on Sunday."],
        workplace: ["my job"], job: ["my part-time job"]
      },
      {
        id: "middle_family", group: "Middle-class parents", share: 0.075,
        // Census CPS ASEC 2025: ~33M married-couple families with children; middle incomes $70k-$150k.
        source: "Census CPS ASEC 2025, family income by type",
        age: [28, 54], income: [70000, 155000], married: 0.9, mood: 2,
        capShare: 0.02, uninsured: 0.04, netWorth: [40000, 600000],
        bases: { kids: [1, 1, 3], ehc: [0.35, 800, 2000], tipsOT: [0.45, 300, 1600], prek: [0.25, 3000, 7000], leave: [1, 200, 400], loanRelief: [0.25, 600, 1300], salt: [0.05, 500, 2000], sin: [0.5, 40, 120] },
        labels: ["HVAC technician, two kids", "Dental hygienist, two kids", "Insurance claims adjuster, two kids", "Plumber with three kids", "Police dispatcher, one kid", "Bank branch manager, one kid", "Stay-at-home parent of three"],
        look: { outfit: ["casual"], hat: ["none", "cap"], prop: ["stroller", "none", "briefcase"] },
        about: "Two paychecks, a mortgage, kids in public school and health insurance through work: income about {income}.",
        idle: ["Soccer practice, then piano, then homework. Every night.", "We finally paid off the minivan.", "Planning a camping trip with the kids.", "Back-to-school shopping is no joke."],
        workplace: ["my workplace"], job: ["my job"]
      },
      {
        id: "office_worker", group: "Office & admin workers", share: 0.03,
        // BLS OES 2024: ~18M office and administrative support jobs; residual working adults.
        source: "BLS Occupational Employment and Wages May 2024 (office and admin support)",
        age: [24, 62], income: [40000, 95000], married: 0.45, mood: 0,
        capShare: 0.02, uninsured: 0.06, netWorth: [0, 250000],
        bases: { ehc: [0.3, 600, 1800], tipsOT: [0.25, 300, 1200], kids: [0.35, 1, 2], leave: [1, 200, 400], loanRelief: [0.2, 600, 1300], sin: [0.5, 30, 110] },
        labels: ["Bank teller", "Medical billing specialist", "Paralegal", "HR assistant", "Call-center supervisor", "Insurance underwriter", "Nonprofit program coordinator"],
        look: { outfit: ["suit", "casual"], hat: ["none"], prop: ["briefcase", "laptop", "none"] },
        about: "Works an office job with a steady paycheck and employer health insurance.",
        idle: ["Someone microwaved fish again.", "Our team hit the quarterly target.", "I'm taking a night class in project management.", "Trying a new recipe every Friday."],
        workplace: ["the office"], job: ["my office job"]
      },
      {
        id: "tech_professional", group: "Tech & professional workers", share: 0.04,
        // BLS OES 2024: ~5M computer and math occupations + ~3M engineers + accountants.
        source: "BLS Occupational Employment and Wages May 2024 (computer, engineering, business ops)",
        age: [24, 62], income: [110000, 270000], married: 0.6, mood: 4,
        capShare: 0.05, uninsured: 0.01, netWorth: [80000, 1500000],
        bases: { ehc: [0.4, 1500, 3000], salt: [0.2, 1500, 5000], itemized: [0.2, 800, 3000], kids: [0.5, 1, 3], prek: [0.15, 4000, 8000], leave: [1, 200, 400], loanRelief: [0.2, 800, 1300], sin: [0.5, 40, 120] },
        labels: ["Software developer", "Accountant", "Civil engineer", "Data analyst", "Pharmacist", "Architect", "Chip designer"],
        look: { outfit: ["casual", "suit"], hat: ["none", "cap"], prop: ["laptop", "laptop", "briefcase"] },
        about: "A well-paid professional with an employer 401(k) and health plan; pays a lot in income and payroll taxes.",
        idle: ["Our app update shipped without a single bug. Allegedly.", "Training for a triathlon.", "Mentoring two new hires.", "Working from the coffee shop today."],
        workplace: ["the company", "my firm"], job: ["my job at the firm"]
      },
      {
        id: "small_business", group: "Small-business owners", share: 0.03,
        // SBA Office of Advocacy 2025: ~6.5M employer firms and ~28M nonemployer firms;
        // here owners whose business is their main income (~8M adults).
        source: "SBA Office of Advocacy, Small Business Profile 2025 (estimate of owner-operators)",
        age: [28, 70], income: [50000, 260000], married: 0.65, mood: 2,
        capShare: 0.08, uninsured: 0.1, netWorth: [150000, 2500000],
        bases: { aca: [0.3, 3000, 10000], acaEnh: [0.3, 2000, 9000], expensing: [0.6, 1000, 6000], niit: [0.08, 1, 1], kids: [0.4, 1, 3], sin: [0.5, 40, 120] },
        labels: ["Owns a diner", "Runs a landscaping company", "Owns a hardware store", "Family auto-repair shop owner", "Runs a hair salon", "Owns a small trucking firm", "Runs a bakery"],
        look: { outfit: ["apron", "casual", "hivis"], hat: ["none", "cap"], prop: ["clipboard", "toolbox", "none"] },
        about: "Owns a small business, makes payroll every two weeks, and pays self-employment tax.",
        idle: ["Made payroll again. Every time it feels like a win.", "We hired our first full-time employee!", "Saturday is our busiest day.", "My daughter wants to take over someday."],
        workplace: ["my shop"], job: ["my business"]
      },
      {
        id: "high_earner", group: "High earners", share: 0.03,
        // IRS SOI 2022: top 5% of returns starts near $260k AGI; ~6.5M households, ~8M adults
        // here after removing the top 1% and doctors.
        source: "IRS Statistics of Income, individual returns by AGI percentile, TY2022",
        age: [32, 66], income: [300000, 900000], married: 0.8, mood: 6,
        capShare: 0.12, uninsured: 0, netWorth: [1500000, 12000000],
        bases: { salt: [0.55, 3000, 9000], itemized: [0.8, 4000, 16000], ehc: [0.3, 2000, 3500], niit: [0.18, 1, 1], kids: [0.55, 1, 3], sin: [0.5, 50, 150] },
        labels: ["Corporate lawyer", "Orthodontist", "Tech manager", "Finance executive", "Partner at an accounting firm", "Sales director"],
        look: { outfit: ["suit"], hat: ["none"], prop: ["briefcase", "laptop"] },
        about: "Earns well into six figures, itemizes deductions, and pays a large share of the income tax.",
        idle: ["Board meeting ran long again.", "Our kid got into her first-choice college.", "Doing a charity 5K this weekend.", "Learning Italian before the trip."],
        workplace: ["the firm"], job: ["my position"]
      },
      {
        id: "affluent_investor", group: "The top 1%", share: 0.0095,
        // IRS SOI / Fed DFA: top 1% of households ~1.3M; income above ~$800k; ~2.5M adults.
        source: "IRS SOI TY2022 top 1% AGI threshold; Federal Reserve Distributional Financial Accounts 2026Q1",
        age: [40, 80], income: [900000, 4000000], married: 0.85, mood: 8,
        capShare: 0.5, uninsured: 0, netWorth: [12000000, 45000000],
        bases: { itemized: [1, 20000, 90000], salt: [0.6, 3000, 7000], niit: [0.35, 1, 1], carried: [0.08, 20000, 80000], sin: [0.5, 80, 300] },
        labels: ["Retired surgeon with a stock portfolio", "Owner of a regional car-dealership chain", "Hedge fund portfolio manager", "Commercial real-estate developer", "Law firm managing partner"],
        look: { outfit: ["suit"], hat: ["none"], prop: ["briefcase", "none"] },
        about: "In the top 1%: much of the income comes from investments and business ownership.",
        idle: ["The foundation's scholarship dinner is next month.", "Sailing on the weekend if the weather holds.", "My portfolio is mostly index funds, honestly.", "We're endowing a wing at the children's hospital."],
        workplace: ["my firm"], job: ["my firm"]
      },
      {
        id: "ultra_rich", group: "The top 0.1%", share: 0.0005, mustShow: true,
        // IRS SOI: top 0.1% ~133k households; Fed DFA: top 0.1% hold ~14% of household wealth.
        source: "IRS SOI TY2022; Federal Reserve Distributional Financial Accounts 2026Q1",
        age: [42, 82], income: [6000000, 30000000], married: 0.85, mood: 8,
        capShare: 0.8, uninsured: 0, netWorth: [80000000, 600000000],
        bases: { itemized: [1, 400000, 1200000], niit: [0.8, 1, 1], carried: [0.35, 30000, 200000], sin: [0.5, 100, 400] },
        labels: ["Tech founder", "Private-equity partner", "Heir to a manufacturing fortune", "Hedge fund founder", "Software company CEO"],
        look: { outfit: ["suit"], hat: ["none"], prop: ["briefcase", "none"] },
        about: "One of the richest households in the country, worth about {networth}, mostly in stock that has never been sold.",
        idle: ["Our foundation funds malaria nets in three countries.", "Flew back from the board meeting in Zurich.", "Thinking about a second act: teaching.", "My kids want to start their own companies."],
        workplace: ["my company"], job: ["my company"]
      },
      {
        id: "unemployed", group: "Job seekers", share: 0.025,
        // BLS: ~7.4M unemployed (4.4% rate, 2026).
        source: "BLS Employment Situation, 2026 annual average",
        age: [19, 63], income: [7000, 32000], married: 0.3, mood: -10,
        capShare: 0, taxableFrac: 0.6, itFactor: 0.2, uninsured: 0.3, netWorth: [0, 30000],
        bases: { credits: [0.45, 4000, 12000], snap: [0.4, 1800, 5000], aca: [0.2, 2000, 6000], kids: [0.3, 1, 2], ctcRefund: [0.3, 800, 2000], sin: [0.5, 30, 100] },
        labels: ["Laid-off warehouse worker", "Former retail manager looking for work", ["Recent grad hunting for a first job", 21, 28], "Laid-off software tester", "Former trucker between jobs", ["Returning to work after caring for a parent", 35, 63]],
        look: { outfit: ["casual"], hat: ["none", "cap"], prop: ["clipboard", "none", "laptop"] },
        about: "Out of work and looking; unemployment benefits and food aid are bridging the gap.",
        idle: ["Two interviews this week. Fingers crossed.", "Rewrote my resume for the tenth time.", "Volunteering at the food bank keeps me busy.", "Taking a forklift certification class."],
        workplace: ["the job center"], job: ["a job"]
      },
      {
        id: "caregiver", group: "Family caregivers", share: 0.015, mustShow: true,
        // AARP/NAC Caregiving in the US 2025: ~63M family caregivers; ~4M are out of work
        // or cut back sharply to give care (estimate).
        source: "AARP & National Alliance for Caregiving, Caregiving in the US 2025 (estimate)",
        age: [30, 70], income: [24000, 72000], married: 0.55, mood: -5,
        capShare: 0, taxableFrac: 0.7, itFactor: 0.5, uninsured: 0.12, netWorth: [0, 200000],
        bases: { credits: [0.3, 1500, 6000], snap: [0.25, 1800, 4000], leave: [1, 500, 1200], kids: [0.3, 1, 2], aca: [0.2, 3000, 8000], sin: [0.4, 20, 80] },
        labels: ["Caring full-time for a parent with dementia", "Home with a son who has autism", "Caring for a spouse after a stroke", "Looking after both elderly parents", "Raising a daughter with cerebral palsy"],
        look: { outfit: ["cardigan", "casual"], hat: ["none"], prop: ["none", "stroller", "cane"] },
        about: "Gave up most paid work to care for a family member whose care is paid for by Medicaid and Medicare.",
        idle: ["Mom recognized me today. Good day.", "Respite care gave me four whole hours.", "My support group meets on Tuesdays.", "Learned to cook pureed food that actually tastes good."],
        workplace: ["my part-time job"], job: ["my part-time job"]
      },
      {
        id: "immigrant_family", group: "Immigrant families", share: 0.025,
        // Pew Research 2025: ~47.8M immigrants; ~22M people live in mixed-status families.
        // Here: households where immigration enforcement is a daily concern (estimate);
        // most immigrants are counted in other groups by their job.
        source: "Pew Research Center, US immigrant population 2025; Migration Policy Institute mixed-status estimates",
        age: [20, 60], income: [24000, 82000], married: 0.65, mood: 0,
        capShare: 0, taxableFrac: 0.85, itFactor: 0.5, uninsured: 0.25, netWorth: [0, 80000],
        bases: { kids: [0.6, 1, 3], tipsOT: [0.5, 400, 2000], snap: [0.15, 2000, 5000], credits: [0.35, 1000, 6000], ctcRefund: [0.3, 800, 2000], leave: [1, 250, 450], sin: [0.4, 20, 80] },
        labels: ["Green-card holder, landscaper", "Naturalized citizen, nursing assistant", "Farmworker", "Restaurant cook, here 12 years", "Software engineer on a work visa", "Hotel cleaner, three kids"],
        look: { outfit: ["casual", "hivis", "apron"], hat: ["cap", "none", "straw"], prop: ["none", "toolbox", "stroller"] },
        about: "Came to the US for work and family; some relatives are citizens and some are not.",
        idle: ["My daughter is the first in our family to go to college.", "Sunday is for the whole family at my mother's house.", "Studying for my citizenship test.", "Sent money home for my nephew's school fees."],
        workplace: ["the job site", "the kitchen"], job: ["my job"]
      },
      {
        id: "marketplace", group: "Self-employed & early retirees", share: 0.03,
        // CMS: ~23M ACA marketplace enrollees in 2026 (data.js); ~20M adults.
        source: "CMS 2026 Open Enrollment Report; KFF marketplace enrollee profiles",
        age: [28, 64], income: [32000, 110000], married: 0.5, mood: -2,
        capShare: 0.03, uninsured: 0.1, netWorth: [20000, 700000],
        bases: { aca: [1, 3000, 13000], acaEnh: [1, 1500, 10000], expensing: [0.2, 500, 2000], kids: [0.3, 1, 2], sin: [0.5, 30, 110] },
        labels: ["Freelance graphic designer", "Rideshare driver", ["Early retiree who buys their own insurance", 55, 64], "Real-estate agent", "Self-employed electrician", "Musician and music teacher", "Home daycare owner"],
        look: { outfit: ["casual", "hivis"], hat: ["none", "cap"], prop: ["laptop", "none", "toolbox"] },
        about: "Works for themselves or retired early and buys health insurance on HealthCare.gov with a premium credit of about {aca_mo} a month.",
        idle: ["Landed a big client this month.", "I set my own hours and I love it.", "Open enrollment is my least favorite season.", "Gig work is feast or famine."],
        workplace: ["my client work"], job: ["my client work"]
      },
      {
        id: "first_responder", group: "Police, firefighters & EMTs", share: 0.007, mustShow: true,
        // BLS OES 2024: ~0.8M police and sheriff's officers, ~0.33M firefighters, ~0.27M EMTs/paramedics.
        source: "BLS Occupational Employment and Wages May 2024 (protective service, EMTs)",
        age: [22, 60], income: [55000, 125000], married: 0.65, mood: 2,
        capShare: 0.01, uninsured: 0.01, netWorth: [20000, 500000],
        bases: { tipsOT: [0.85, 1000, 3500], ehc: [0.4, 800, 2000], kids: [0.55, 1, 3], leave: [1, 200, 400], sin: [0.5, 30, 110] },
        labels: ["Police officer", "Firefighter", "Paramedic", "Wildland firefighter", "Sheriff's deputy", "911 dispatcher"],
        look: { outfit: ["uniform"], hat: ["cap", "helmet"], prop: ["none", "clipboard"] },
        about: "Answers the 911 calls; federal grants pay for some of the department's officers, gear and disaster training.",
        idle: ["Quiet shift. Don't say the q-word.", "We did a fire-safety talk at the elementary school.", "Twenty-four on, forty-eight off.", "Got the new rig this month."],
        workplace: ["the department", "the station"], job: ["my spot at the department"]
      },
      {
        id: "energy_worker", group: "Energy workers", share: 0.01, mustShow: true,
        // DOE US Energy and Employment Report 2025: ~2.7M jobs in fuels and electric power
        // generation and transmission (excluding efficiency and motor vehicles).
        source: "DOE US Energy and Employment Report 2025",
        age: [21, 63], income: [48000, 130000], married: 0.6, mood: 2,
        capShare: 0.02, uninsured: 0.04, netWorth: [20000, 400000], gallons: [1500, 2500], energyMult: 1.3,
        bases: { tipsOT: [0.7, 800, 3000], ehc: [0.35, 800, 2000], kids: [0.5, 1, 3], sin: [0.6, 40, 150] },
        labels: ["Oil-field roughneck", "Coal miner", "Power company lineman", "Solar installer", "Refinery operator", "Wind-turbine technician", "Natural-gas pipeline welder"],
        look: { outfit: ["hivis", "overalls"], hat: ["hardhat", "hardhat", "cap"], prop: ["wrench", "toolbox"] },
        about: "Works in oil, gas, coal, power lines or renewables, an industry shaped by energy policy and prices.",
        idle: ["Storm season means long hours restoring power.", "Two weeks on the rig, two weeks home.", "Finished a solar farm last month.", "My crew is the best I've worked with."],
        workplace: ["the rig", "the plant", "the utility"], job: ["my job on the rig", "my job at the utility", "my job at the plant"]
      },
      {
        id: "near_retiree", group: "Workers nearing retirement", share: 0.04,
        // Census: ~42M adults aged 55-64; about two thirds work. Here those not counted elsewhere.
        source: "Census Vintage 2024 population by age; BLS CPS labor force by age 2026",
        age: [55, 64], income: [45000, 125000], married: 0.6, mood: 0,
        capShare: 0.05, uninsured: 0.07, netWorth: [50000, 900000],
        bases: { ehc: [0.35, 800, 2000], tipsOT: [0.3, 400, 1500], aca: [0.1, 4000, 12000], leave: [1, 200, 500], sin: [0.5, 30, 110] },
        labels: ["Warehouse supervisor", "Hospital janitor", "School bus mechanic", "Factory floor supervisor", "Office manager", "Postal clerk", "Union carpenter with bad knees"],
        look: { outfit: ["casual", "hivis"], hat: ["none", "cap"], prop: ["none", "briefcase", "toolbox"] },
        about: "A few years from retirement and counting on Social Security and Medicare starting on schedule.",
        idle: ["Seven more years. I've got a spreadsheet.", "My grandson starts kindergarten this fall.", "Took up pickleball. Ruthless game.", "My back says retire; my wallet says not yet."],
        workplace: ["my workplace"], job: ["my job"]
      }
    ],

    // Display names for keys that are stats, not budget ids.
    statTopics: { deficit: "The national debt", ss_depletion_year: "Social Security's future", fairness: "Who pays", jobs: "The economy" },
    // How a cause reads inside a sentence ("I lost my job after {cause}"). {name} = control name.
    causes: { spendingCut: "the {name} cuts", spendingRaise: "the boost to {name}", leverOn: "the “{name}” change", leverMove: "the “{name}” change",
              jobs: { loss: "the slowdown", gain: "the pickup in the economy" } },

    // ------------------------------------------------------------------
    // MONEY. Each rule: dollars/yr = units x per x base, where units = the control's
    // change (spending: % change; slider lever: value - current; toggle: 1 when on) and
    // base = the citizen's own $ stake (from `bases` or derived in crowd-model.js:
    // taxBottom, taxMiddle, taxTop, capgains, wage, wageCapped, consumption-based
    // tariff/vat, gasCent, energy, corp, foreignInc, ftt, estateRate, estateEx,
    // gainsDeath, wealth, ssCap, niitAmt, irs, ssFuture, ssFutureHigh, ssExpand, farmLimit).
    // family picks the phrasing: benefit (a check), tax, price, cost (bills you pay).
    // `future`: a change to benefits years from now, weighted by age.
    // ------------------------------------------------------------------
    money: [
      // Spending lines. Per-1% factors follow data.js persona effects.
      { control: "social_security", base: "ss", per: 0.01, family: "benefit", what: "Social Security check", ws: "SS check", monthly: true },
      { control: "medicare", base: "medicare", per: 0.0077, family: "cost", what: "Medicare premiums and copays", ws: "Medicare bills", monthly: true },
      { control: "veterans", base: "va", per: 0.01, family: "benefit", what: "VA disability check", ws: "VA check", monthly: true },
      { control: "defense_personnel", base: "milpay", per: 0.005, family: "benefit", what: "military pay and housing allowance", plural: true, ws: "My pay", monthly: true },
      { control: "snap_food", base: "snap", per: 0.01, family: "benefit", what: "SNAP grocery benefit", ws: "SNAP", monthly: true },
      { control: "income_support", base: "credits", per: 0.01, family: "benefit", what: "tax refund from family credits", ws: "Refund",
        whatBy: { disabled: "SSI check", unemployed: "unemployment check", retiree_low: "SSI check", housing_aid: "SSI check", caregiver: "family tax credit" } },
      // Net line ~$103B vs ~$200B of pension checks: 1% of the line ~0.5% of checks.
      { control: "federal_retirement", base: "fedpension", per: 0.005, family: "benefit", what: "pension", ws: "Pension", monthly: true },
      { control: "education", base: "pell", per: 0.01, family: "benefit", what: "Pell grant", ws: "Pell grant" },
      { control: "agriculture", base: "farm", per: 0.01, family: "benefit", what: "crop-insurance and price-support help", ws: "Farm aid" },
      { control: "aca_subsidies", base: "aca", per: 0.01, family: "benefit", what: "health-insurance premium credit", ws: "Premium help", monthly: true },

      // Income tax levers (rates in points; 1 point = 1% of the income in those brackets).
      { control: "rate_bottom", base: "taxBottom", per: -0.01, family: "tax", what: "income tax", ws: "Income tax" },
      { control: "rate_middle", base: "taxMiddle", per: -0.01, family: "tax", what: "income tax", ws: "Income tax" },
      { control: "rate_top", base: "taxTop", per: -0.01, family: "tax", what: "top-bracket income tax", ws: "Top-rate tax" },
      { control: "cap_gains_rate", base: "capgains", per: -0.01, family: "tax", what: "tax on investment gains", ws: "Cap-gains tax" },
      { control: "gains_at_death", base: "gainsDeath", per: -1, family: "tax", what: "tax our heirs will owe on unsold stock", ws: "Estate gains tax",
        texts: { loss: ["Our heirs would owe tax on stock we never sold: about {amt} on average.", "Taxing gains at death costs our family roughly {amt}, spread over the years."] } },
      { control: "carried_interest", base: "carried", per: -1, family: "tax", what: "tax on my fund's carried interest", ws: "Carried interest" },
      { control: "salt_cap_10k", base: "salt", per: -1, family: "tax", what: "income tax after losing the state-tax deduction", ws: "SALT deduction" },
      { control: "itemized_cap_15", base: "itemized", per: -1, family: "tax", what: "tax after the deduction limit", ws: "Deductions" },
      { control: "employer_health_cap", base: "ehc", per: -1, family: "tax", what: "tax on my job's health plan", ws: "Health-plan tax" },
      { control: "repeal_tips_overtime", base: "tipsOT", per: -1, family: "tax", what: "tax on my tips and overtime", ws: "Tips/OT tax",
        whatBy: { retiree_low: "tax without the senior deduction", retiree_middle: "tax without the senior deduction", retiree_affluent: "tax without the senior deduction", retiree_federal: "tax without the senior deduction" } },
      { control: "niit_passthrough", base: "niitAmt", per: -1, family: "tax", what: "surtax on my business income", ws: "Business surtax" },
      { control: "ctc_amount", base: "kids", per: 1, family: "benefit", what: "child tax credit", ws: "Child credit" },
      { control: "irs_enforcement", base: "irs", per: -1, family: "tax", what: "tax after closer IRS scrutiny", ws: "IRS audits" },
      // Payroll: workers bear both halves (CBO). 1 point = 1% of covered wages.
      { control: "ss_payroll_rate", base: "wageCapped", per: -0.01, family: "tax", what: "payroll tax", ws: "Payroll tax" },
      { control: "ss_cap_250k", base: "ssCap", per: -1, family: "tax", what: "Social Security tax on pay over $250,000", ws: "Payroll tax" },
      { control: "medicare_payroll_rate", base: "wage", per: -0.01, family: "tax", what: "Medicare payroll tax", ws: "Medicare tax" },
      // Corporate taxes fall mostly on shareholders, some on wages (JCT/CBO ~75/25).
      { control: "corp_rate", base: "corp", per: -1, family: "tax", what: "share of the corporate tax", ws: "Corporate tax",
        texts: { loss: ["Through my stocks and my paycheck, the corporate tax costs us about {amt} more.", "A higher corporate rate comes out of my stocks and my pay: about {amt}."],
                 gain: ["A lower corporate rate is worth about {amt} to us, through my stocks and pay.", "Through my stocks and paycheck, the corporate-tax cut puts about {amt} our way."] } },
      { control: "foreign_income_full_rate", base: "foreignInc", per: -1, family: "tax", what: "share of the tax on companies' foreign profits", ws: "Corporate tax",
        texts: { loss: ["Taxing companies' foreign profits at the full rate costs us about {amt} through our stocks.", "Our stocks take a hit from the foreign-profits tax: about {amt}."] } },
      { control: "end_full_expensing", base: "expensing", per: -1, family: "tax", what: "tax bill in the year I buy equipment", ws: "Equipment tax" },
      // Consumption taxes
      { control: "tariff_rate", base: "tariff", per: -1, family: "price", what: "imported goods", plural: true, ws: "Prices" },
      { control: "tariff_rate", base: "farmTrade", per: -1, family: "price", what: "export sales", plural: true, ws: "Export sales",
        texts: { loss: ["When other countries hit back, our farm loses about {amt} in export sales.", "Retaliation tariffs cost us about {amt} in lost sales overseas."],
                 gain: ["Lower tariffs reopen export markets: about {amt} more in sales for our farm.", "Other countries drop their retaliation, and we sell about {amt} more abroad."] } },
      { control: "gas_tax", base: "gasCent", per: -1, family: "price", what: "gas", ws: "Gas" },
      { control: "carbon_tax", base: "energy", per: -1, family: "price", what: "energy bills and gas", plural: true, ws: "Energy bills" },
      { control: "tobacco_alcohol", base: "sin", per: -1, family: "price", what: "beer, wine and cigarettes", plural: true, ws: "Beer & smokes" },
      { control: "vat", base: "vatBase", per: -1, family: "price", what: "everything we buy", ws: "Prices" },
      { control: "ftt", base: "fttBase", per: -1, family: "tax", what: "trading costs on my investments", plural: true, ws: "Trading tax" },
      { control: "estate_rate", base: "estateRate", per: -1, family: "tax", what: "estate tax", ws: "Estate tax",
        texts: { loss: ["Our heirs would owe more estate tax: about {amt} on average.", "A higher estate-tax rate costs our family roughly {amt}, spread over the years."],
                 gain: ["A lower estate-tax rate saves our heirs about {amt}.", "Our kids would keep about {amt} more of what we leave them."] } },
      { control: "estate_exemption_35m", base: "estateEx", per: -1, family: "tax", what: "estate tax", ws: "Estate tax",
        texts: { loss: ["With a $3.5 million exemption, our kids would owe estate tax: about {amt} on average.", "Lowering the estate-tax exemption costs our family roughly {amt}, spread over the years."] } },
      { control: "wealth_tax", base: "wealth", per: -1, family: "tax", what: "wealth tax", ws: "Wealth tax" },
      // Social Security reforms
      { control: "ss_retirement_age", base: "ssFuture", per: -0.065, family: "benefit", what: "future Social Security check", ws: "Future SS", monthly: true, future: true,
        texts: { loss: ["When I retire, my Social Security check will be {amt} smaller unless I work to {val}.", "Full benefits at {val}? That's {amt} less unless I keep working.", "{Amt} less in retirement unless I work until {val}. My knees won't last that long.", "I'm {age}. Waiting until {val} for full benefits, or taking {amt} less."] } },
      { control: "ss_chained_cpi", base: "ss", per: -0.011, family: "benefit", what: "Social Security check (after a decade of smaller raises)", ws: "SS raises", monthly: true },
      { control: "ss_chained_cpi", base: "fedpension", per: -0.011, family: "benefit", what: "pension (after years of smaller raises)", ws: "Pension COLA", monthly: true },
      { control: "ss_chained_cpi", base: "va", per: -0.011, family: "benefit", what: "VA check (after years of smaller raises)", ws: "VA COLA", monthly: true },
      { control: "ss_high_earner_trim", base: "ssFutureHigh", per: -1, family: "benefit", what: "future Social Security check", ws: "Future SS", monthly: true, future: true,
        texts: { loss: ["Because I earned more, my future Social Security check gets trimmed {amt}. I paid in like everyone else.", "When I retire, my check will be {amt} smaller for having earned a decent wage.", "{Amt} less in retirement. I paid the full tax my whole career."] } },
      { control: "ss_expand_benefits", base: "ssExpand", per: 1, family: "benefit", what: "Social Security check", ws: "SS check", monthly: true },
      // Medicare reforms
      { control: "medicare_drug_negotiation", base: "drugs", per: 1, family: "cost", what: "pharmacy bills", plural: true, ws: "Pharmacy" },
      { control: "medicare_advantage_reform", base: "ma", per: -1, family: "benefit", what: "Medicare Advantage extras (dental, glasses, gym)", plural: true, ws: "MA extras" },
      { control: "site_neutral", base: "copay", per: 1, family: "cost", what: "clinic copays", plural: true, ws: "Copays" },
      // ACA, farm, education, family
      { control: "restore_aca_enhanced", base: "acaEnh", per: 1, family: "benefit", what: "premium help", ws: "Premium help", monthly: true },
      { control: "farm_subsidy_limits", base: "farmLimit", per: -1, family: "benefit", what: "crop-insurance subsidy", ws: "Crop insurance" },
      { control: "student_loan_forgiveness", base: "loanRelief", per: 1, family: "cost", what: "student-loan payments", plural: true, ws: "Loan payments", monthly: true },
      { control: "universal_prek", base: "prek", per: 1, family: "cost", what: "child care", ws: "Child care", monthly: true },
      { control: "paid_leave", base: "leave", per: 1, family: "benefit", what: "paid-leave protection (what it's worth to us in a typical year)", ws: "Paid leave",
        texts: { gain: ["If the baby comes or Mom gets sick, I'd still get paid. That's worth about {amt} to us.", "Twelve weeks of paid leave means I don't have to choose between a paycheck and my family.", "Paid leave: I could finally take time off when it matters, without losing {amt}."] } },
      { control: "ctc_fully_refundable", base: "ctcRefund", per: 1, family: "benefit", what: "child tax credit", ws: "Child credit" }
    ],

    // ------------------------------------------------------------------
    // DISCRETE OUTCOMES. National counts are dealt to individual figures in true
    // proportion: hits in archetype a = count x w_a P_a / sum_b(w_b P_b), where
    // w = relative risk and P = real adults in the archetype (for `eligible` pools,
    // only those with that base). The same people (by fixed random rank) are hit first.
    // ------------------------------------------------------------------
    pools: {
      // Health coverage. Counts come from result.metrics.uninsured drivers (data.js).
      coverage: {
        metric: "uninsured", lossSign: 1, adultShareDefault: 0.6, status: "lost_coverage",
        lossKey: "lostCoverage", gainKey: "gotCoverage", fearKey: "coverageFear", baseUninsured: true,
        drivers: {
          medicaid_chip: { adultShare: 0.6, risk: { low_income_parent: 1, care_aide: 0.6, service_worker: 0.35, disabled: 0.7, unemployed: 0.8, immigrant_family: 0.5, caregiver: 0.6, housing_aid: 0.9, retiree_low: 0.15, young_grad: 0.08, construction: 0.15, student: 0.12 } },
          medicaid_per_capita_caps: { adultShare: 0.6, risk: { low_income_parent: 1, care_aide: 0.6, service_worker: 0.35, disabled: 0.8, unemployed: 0.8, immigrant_family: 0.5, caregiver: 0.7, housing_aid: 0.9, retiree_low: 0.25 } },
          // Work requirements apply to expansion adults 19-64 without young kids or disabilities.
          cancel_medicaid_work_req: { adultShare: 1, risk: { unemployed: 1, service_worker: 0.45, construction: 0.25, young_grad: 0.2, immigrant_family: 0.35, caregiver: 0.35, care_aide: 0.35, low_income_parent: 0.2, housing_aid: 0.5, student: 0.15 } },
          aca_subsidies: { adultShare: 0.9, risk: { marketplace: 1, small_business: 0.45, farmer: 0.5, service_worker: 0.08, young_grad: 0.08, near_retiree: 0.12, immigrant_family: 0.2, unemployed: 0.2, caregiver: 0.2 } },
          restore_aca_enhanced: { adultShare: 0.9, risk: { marketplace: 1, small_business: 0.45, farmer: 0.5, service_worker: 0.1, young_grad: 0.1, near_retiree: 0.15, immigrant_family: 0.25, unemployed: 0.25, caregiver: 0.2 } },
          employer_health_cap: { adultShare: 0.7, risk: { service_worker: 0.4, manufacturing: 0.3, middle_family: 0.25, office_worker: 0.3, transport: 0.3, construction: 0.3, young_grad: 0.3 } }
        },
        texts: {
          loss: ["I lost my health coverage after {cause}.", "My insurance card stopped working after {cause}.", "No more coverage for me. One ER visit could wipe us out.", "They dropped my coverage. My inhaler is $60 now."],
          fear: ["People like me are losing coverage after {cause}. Am I next?", "My sister lost her coverage. I'm checking my mail every day.", "The clinic says a lot of patients are losing insurance."],
          gain: ["I finally have health insurance again!", "Covered! I can see a doctor about my back.", "We got coverage. No more praying nobody gets sick."]
        },
        shorts: { loss: ["Lost my coverage", "Insurance gone", "Can't afford a doctor"], fear: ["Is my coverage next?", "Worried about coverage"], gain: ["Finally insured!", "Covered again"] }
      },
      // Federal rent help. Counts from result.metrics.rent_aid_households drivers (households; ~1.3 adults each).
      rent: {
        metric: "rent_aid_households", lossSign: -1, adultShareDefault: 1.3, status: "lost_rent_help",
        lossKey: "lostRent", gainKey: "gotRent", fearKey: "rentFear",
        lossRisk: { housing_aid: 1, retiree_low: 0.02, disabled: 0.03 },
        gainRisk: { low_income_parent: 0.35, retiree_low: 0.15, disabled: 0.3, service_worker: 0.1, unemployed: 0.25, care_aide: 0.15, caregiver: 0.15 },
        drivers: { housing_aid: {} },
        texts: {
          loss: ["Our voucher is gone. Rent is due on the 1st and I don't know how.", "We lost our rent help. We may have to move in with my sister.", "Without the voucher, rent takes almost everything I make."],
          fear: ["The housing office stopped issuing vouchers. Ours renews in March.", "Everyone in our building is scared about the rent-help cuts."],
          gain: ["We got off the waiting list after five years! A real lease.", "Rent help came through. My kids can stay in their school."]
        },
        shorts: { loss: ["Lost our rent help", "Facing eviction"], fear: ["Is our voucher safe?"], gain: ["Rent help at last!"] }
      },
      // SNAP. Counts from result.metrics.food_aid drivers (people; ~0.55 adults each).
      food: {
        metric: "food_aid", lossSign: -1, adultShareDefault: 0.55, status: "lost_food_aid", eligible: "snap",
        lossKey: "lostFood", gainKey: "gotFood", fearKey: "foodFear",
        lossRisk: { default: 1, unemployed: 1.6, low_income_parent: 0.8, retiree_low: 0.5, disabled: 0.5 },
        gainRisk: { low_income_parent: 1, unemployed: 1, service_worker: 0.6, care_aide: 0.6, retiree_low: 0.5, disabled: 0.5, housing_aid: 0.6, caregiver: 0.5, immigrant_family: 0.4 },
        drivers: { snap_food: {}, reverse_snap_cuts: { gainNote: true } },
        texts: {
          loss: ["They cut us off SNAP. The food bank line was around the block.", "No more SNAP for us. I'm skipping lunch so the kids can eat.", "We lost our food aid. Groceries come before the electric bill now."],
          fear: ["The SNAP office sent a letter about new rules. I'm scared.", "Half my neighbors lost their SNAP. We might be next."],
          gain: ["We qualify for SNAP now. The fridge isn't empty at the end of the month.", "Keeping our food aid means the kids get breakfast."]
        },
        shorts: { loss: ["Cut off SNAP", "Kids need to eat"], fear: ["Will we lose SNAP?"], gain: ["Groceries covered"] }
      },
      // Jobs. Direct job counts per unit of each control (estimates explained inline); the
      // economy-wide count (result.jobs) is dealt across all workers by `macroRisk`.
      jobs: {
        status: "lost_job", lossKey: "lostJob", gainKey: "jobBoost", fearKey: "jobFear", hireKey: "gotHired",
        hireArchetype: "unemployed", hireShare: 0.5,
        // Share of economy-wide job changes by group (estimate from BLS CES employment
        // weighted by cyclical sensitivity; construction, manufacturing and services swing most).
        macroRisk: { construction: 1.8, manufacturing: 1.6, service_worker: 1.4, transport: 1.3, office_worker: 0.9, tech_professional: 0.6, small_business: 0.8, middle_family: 0.7, young_grad: 1.1, near_retiree: 0.7, immigrant_family: 1.2, energy_worker: 1.0, marketplace: 1.0, care_aide: 0.6, nurse: 0.3, teacher: 0.2, defense_worker: 0.6, low_income_parent: 1.0 },
        drivers: {
          // Defense procurement & R&D: ~3,000 direct jobs per $1B (estimate from AIA 2024 Facts & Figures:
          // ~1.1M defense-related direct jobs on ~$340B of contracts). 1% = $3.86B -> 11,600.
          defense_weapons: { perUnit: 11600, share: { defense_worker: 0.6, manufacturing: 0.2, scientist: 0.1, tech_professional: 0.1 } },
          cancel_golden_dome: { perUnit: -45000, share: { defense_worker: 0.6, scientist: 0.15, tech_professional: 0.15, manufacturing: 0.1 } },
          delay_sentinel: { perUnit: -12000, share: { defense_worker: 0.55, construction: 0.35, manufacturing: 0.1 } },
          // Operations & bases: ~2,500 jobs per $1B (DoD civilians, base contractors, local businesses; estimate). 1% = $3.56B.
          defense_operations: { perUnit: 8900, share: { federal_worker: 0.35, defense_worker: 0.25, construction: 0.15, service_worker: 0.25 } },
          // Troops: data.js military_personnel effects (6,600 per 1%; 1,000 per 1k on troop_levels).
          defense_personnel: { perUnit: 6600, share: { military: 1 } },
          troop_levels: { perUnit: 1000, share: { military: 1 } },
          close_overseas_bases: { perUnit: -6000, share: { service_worker: 0.5, federal_worker: 0.5 } },
          // NIH/NSF/NASA: ~6,000 directly funded research positions per $1B (estimate; NIH reports
          // ~7 jobs per $1M including indirect). 1% = $0.855B.
          science_research: { perUnit: 5100, share: { scientist: 0.75, student: 0.15, tech_professional: 0.1 } },
          // Highway/transit: FHWA ~13,000 job-years per $1B; ~10,000 used. 1% = $1.43B.
          transportation: { perUnit: 14300, share: { construction: 0.6, transport: 0.25, manufacturing: 0.15 } },
          energy_environment: { perUnit: 5500, share: { federal_worker: 0.3, construction: 0.3, energy_worker: 0.3, first_responder: 0.1 } },
          // Title I / IDEA / Head Start pay staff: ~12,000 per $1B (estimate). 1% = $1.08B.
          education: { perUnit: 12900, share: { teacher: 0.85, office_worker: 0.15 } },
          universal_prek: { perUnit: 150000, share: { teacher: 0.7, service_worker: 0.3 } },
          // Health providers: ~3,500 jobs per $1B of health spending, half of a Medicare cut
          // passed through to staffing (estimate from BLS health employment / NHE). 1% = $10.7B.
          medicare: { perUnit: 18800, share: { nurse: 0.5, care_aide: 0.25, health_pro: 0.1, office_worker: 0.15 } },
          medicaid_chip: { perUnit: 15700, share: { care_aide: 0.5, nurse: 0.35, health_pro: 0.05, office_worker: 0.1 } },
          medicaid_per_capita_caps: { perUnit: -168000, share: { care_aide: 0.5, nurse: 0.35, health_pro: 0.05, office_worker: 0.1 } },
          site_neutral: { perUnit: -14000, share: { nurse: 0.6, office_worker: 0.4 } },
          medicare_advantage_reform: { perUnit: -10000, share: { office_worker: 0.6, nurse: 0.4 } },
          medicare_drug_negotiation: { perUnit: -15000, share: { scientist: 0.4, manufacturing: 0.6 } },
          // VA health staffing (VA ~480k staff): 1% of the line, ~35% of it health care -> ~5,400.
          veterans: { perUnit: 5400, share: { federal_worker: 0.5, nurse: 0.4, health_pro: 0.1 } },
          // Agency operations: federal payroll ~$130k per job (OPM). Estimates.
          everything_else: { perUnit: 4000, share: { federal_worker: 0.7, office_worker: 0.15, nurse: 0.15 } },
          justice: { perUnit: 2500, share: { federal_worker: 0.5, first_responder: 0.5 } },
          border_immigration: { perUnit: 2500, share: { federal_worker: 0.8, construction: 0.2 } },
          foreign_aid: { perUnit: 1200, share: { federal_worker: 0.5, office_worker: 0.3, farmer: 0.2 } },
          housing_aid: { perUnit: 800, share: { construction: 0.5, office_worker: 0.5 } },
          irs_enforcement: { perUnit: 7000, share: { federal_worker: 1 } },
          // Carbon tax: fossil-fuel job losses net of clean-energy gains, ~1,000 per $1/ton (estimate).
          carbon_tax: { perUnit: -1000, share: { energy_worker: 0.7, manufacturing: 0.2, transport: 0.1 } },
          end_full_expensing: { perUnit: -20000, share: { manufacturing: 0.6, construction: 0.4 } }
        },
        texts: {
          loss: ["I lost {job} after {cause}.", "Laid off. {Cause} took {job}.", "Pink slip on Friday. {Cause} hit us hard.", "They let our whole crew go after {cause}."],
          fear: ["{Workplace} is talking about layoffs after {cause}.", "Rumors of cuts at {workplace} since {cause}. I could be next.", "{Workplace} froze hiring after {cause}. Everybody's nervous.", "Half my team got notices after {cause}. Am I next?"],
          gain: ["{Workplace} is hiring again thanks to {cause}.", "More hours and overtime at {workplace} since {cause}.", "Things are picking up at {workplace}. My job feels safe."],
          hire: ["I got hired! First paycheck in months.", "New job starts Monday. I can breathe.", "Somebody finally called me back. I start next week."]
        },
        shorts: { loss: ["I lost my job", "Laid off", "Save our jobs!"], fear: ["Layoffs coming?", "Save our jobs!"], gain: ["Hiring again!", "Overtime's back"], hire: ["I got hired!", "Back to work!"] }
      }
    },

    // Medicare eligibility age. Raising it: people within `window` years below today's
    // age who would now wait longer. Lowering it: people between the new and current age.
    ageRules: [
      { control: "medicare_age", loseImpact: -18, gainImpact: 16, minAge: 55, window: 2,
        texts: { loss: ["I'm {age}. Raising Medicare's age to {val} means more years buying my own insurance.", "Medicare at {val} instead of {cur}: {years} of paying for my own coverage."],
                 gain: ["Medicare at {val}? I could drop my $900-a-month plan.", "I'm {age}. Medicare now instead of waiting: that's a huge relief."] },
        shorts: { loss: ["Medicare at {val}?!"], gain: ["Medicare now!"] } }
    ],

    // ------------------------------------------------------------------
    // WORRIES: non-monetary concerns. holders: archetype -> [probability of holding it,
    // mean intensity]; each holder's intensity varies 0.6x-1.4x. drivers: control ->
    // mood points per unit of change at intensity 1 (sign: + means increases please
    // and cuts alarm). Per worry, the total is softened by cap*I*tanh(raw/(cap*I)).
    // `dollars: true` drivers use the $B change instead of units.
    // Templates: down/up by direction of the control's change ({pct}, {val}, {topic}, {dollars}).
    // ------------------------------------------------------------------
    worries: [
      {
        id: "security", name: "National security", cap: 30,
        // Pew Research (Feb 29 2024 policy priorities, fielded Jan 16-21): 63% call defending
        // against terrorism a top priority; strengthening the military 56% of Republicans vs
        // 23% of Democrats (~39% overall, derived).
        // Holder share ~45%; military, veterans and defense workers far higher (estimate).
        calibration: "Pew Research Center, Feb 2024 policy priorities (defending vs terrorism 63%; strengthening the military ~39%, derived from 56% R / 23% D)",
        holders: { default: [0.45, 0.7], military: [0.95, 1.4], veteran: [0.9, 1.3], defense_worker: [0.9, 1.2], retiree_federal: [0.85, 1.2], retiree_low: [0.6, 0.9], retiree_middle: [0.6, 0.9], retiree_affluent: [0.6, 0.9], farmer: [0.6, 1], first_responder: [0.7, 1], student: [0.25, 0.5], scientist: [0.3, 0.6], young_grad: [0.3, 0.55] },
        drivers: {
          defense_weapons: { coef: 0.35, down: ["We just cut weapons and R&D by {pct}. China and Russia aren't cutting theirs.", "Canceling ships and missiles by {pct}? Our troops deserve the best gear.", "A {pct} cut to new weapons leaves us flying 40-year-old planes."], up: ["Restocking missiles and building ships: good. Deterrence keeps the peace.", "{pct} more for weapons and research. Strength prevents wars."], shortDown: ["Don't gut defense!", "Peace through strength"], shortUp: ["Strong defense"] },
          defense_operations: { coef: 0.3, down: ["Cutting training and maintenance by {pct}? Grounded jets don't deter anyone.", "A {pct} cut to bases and training. Readiness is what keeps us out of wars."], up: ["Finally fixing the barracks and training more. Readiness matters.", "{pct} more for training and repairs. Ships that sail and jets that fly keep the peace."], shortDown: ["Readiness matters!"], shortUp: ["Ready forces"] },
          defense_personnel: { coef: 0.3, down: ["Cutting military pay and troops by {pct} weakens us when the world is this dangerous.", "{pct} less for the people in uniform? That's not how you support the troops."], up: ["More troops and better pay: our people in uniform earned it.", "A raise for junior troops, some of whom qualify for food aid now. Good.", "{pct} more for the people in uniform. Recruiting gets easier."], shortDown: ["Support our troops!"], shortUp: ["Pay our troops"] },
          troop_levels: { coef: 0.035, down: ["Shrinking the force to {val} troops? We couldn't handle two crises at once.", "Down to {val} active-duty troops. That's thin for a world on fire."], up: ["Growing the force to {val}. We need the numbers.", "{val} active-duty troops: enough to deter two crises at once.", "A bigger force at {val}. Our rivals notice that."], shortDown: ["Too few troops"], shortUp: ["More boots"] },
          cancel_golden_dome: { coef: -6, on: ["Canceling missile defense leaves our cities exposed to hypersonic missiles.", "No Golden Dome? I want something between my kids and a missile."], shortOn: ["Keep missile defense"] },
          delay_sentinel: { coef: -3, on: ["Keeping 1970s nuclear missiles in the silos isn't a plan.", "Delaying the new ICBM sends the wrong signal to our rivals."], shortOn: ["Modernize the nukes"] },
          close_overseas_bases: { coef: -6, on: ["Pulling out of a third of our bases tells our allies we're unreliable.", "Close bases in Japan and Germany? Our rivals will fill that gap."], shortOn: ["Allies need us"] },
          border_immigration: { coef: 0.05, down: ["Fewer border agents means more fentanyl getting through.", "Cutting border inspections by {pct} lets more fentanyl through the ports.", "Fewer agents at the ports of entry means fewer drugs caught."], up: [], shortDown: ["Stop the fentanyl"] },
          foreign_aid: { coef: 0.02, down: ["Closing embassies makes us less safe, not more.", "Diplomats prevent wars that soldiers have to fight. Don't gut the embassies.", "Cutting diplomacy {pct}? Generals say that just means buying more ammunition."], up: [], shortDown: ["Diplomacy keeps us safe"] }
        }
      },
      {
        id: "military_waste", name: "Pentagon waste", cap: 15,
        // Gallup Feb 2025: ~32% say the US spends too much on defense (estimate of holders ~20%).
        calibration: "Gallup Military and National Defense trend, Feb 2025 (about a third say too much is spent on defense)",
        holders: { default: [0.18, 0.6], student: [0.35, 0.8], scientist: [0.3, 0.7], young_grad: [0.3, 0.7], teacher: [0.25, 0.6], military: [0.02, 0.4], veteran: [0.12, 0.6], defense_worker: [0, 0], retiree_federal: [0.08, 0.5] },
        drivers: {
          defense_weapons: { coef: -0.12, down: ["Good: {pct} off weapons. The Pentagon has never passed an audit.", "Trimming {pct} from weapons programs that run billions over budget? About time."], up: ["{pct} more for weapons? The Pentagon can't even pass an audit.", "Another {dollars} for weapons while our schools beg for supplies."], shortDown: ["Pass an audit first"], shortUp: ["Audit the Pentagon!"] },
          defense_operations: { coef: -0.05, down: ["Closing some bases nobody needs is long overdue.", "Trimming {pct} from bases and operations. Some of those bases date from the Cold War."], up: ["More bases and exercises? We already outspend the next nine countries.", "{pct} more for bases and exercises, and the Pentagon still can't pass an audit."], shortDown: ["Trim the bases"], shortUp: ["Too much for war"] },
          cancel_golden_dome: { coef: 5, on: ["Canceling a space missile shield that may never work: smart.", "CBO says Golden Dome could cost over a trillion dollars. Good call."], shortOn: ["No space shield"] },
          delay_sentinel: { coef: 3, on: ["Sentinel ran 80% over budget. Pausing it is just common sense.", "Pausing a missile program that's 80% over budget. That's just being careful with money.", "Sentinel's cost blew up. Extending the old missiles a while is sensible."], shortOn: ["Stop the overruns"] },
          close_overseas_bases: { coef: 4, on: ["Bringing troops home from Europe and Asia: our allies are rich enough to defend themselves.", "Closing a third of the overseas bases. Japan and Germany can pay more of their own defense.", "Bringing troops home saves billions. About time."], shortOn: ["Bring them home"] },
          troop_levels: { coef: -0.008, down: ["A smaller standing army suits a country that isn't at war.", "A leaner military of {val} troops saves billions.", "Down to {val} troops. We're not fighting a land war."], up: ["Recruiting {val} troops means more kids sent abroad.", "Growing the military to {val} troops in peacetime? That money could go home.", "{val} troops means bigger recruiting bonuses we can't afford."], shortDown: ["Smaller is fine"], shortUp: ["Too many troops"] }
        }
      },
      {
        id: "future", name: "Science & the future", cap: 30,
        // Pew Research (Feb 2025): ~78% say government investment in scientific research
        // is usually worthwhile; AP-NORC (2025): ~6 in 10 oppose cuts to medical research.
        // Holder share ~40% generally, near-universal among researchers (estimate).
        calibration: "Pew Research Center, Feb 2025 (78% say government research investment is worthwhile); AP-NORC 2025 medical-research polling",
        holders: { default: [0.4, 0.6], scientist: [1, 1.5], student: [0.7, 1.1], tech_professional: [0.7, 1], health_pro: [0.8, 1.1], young_grad: [0.6, 0.9], teacher: [0.6, 0.9], middle_family: [0.5, 0.8], nurse: [0.6, 0.9], retiree_low: [0.3, 0.6], retiree_middle: [0.35, 0.7], retiree_affluent: [0.45, 0.8], caregiver: [0.6, 0.9] },
        drivers: {
          science_research: { coef: 0.35, down: ["We just cut the research budget by {pct}. Who cures Alzheimer's now?", "{pct} less for NIH and NASA. The next mRNA vaccine gets invented somewhere else.", "Cutting science by {pct} eats our seed corn. My kids will pay for that in 20 years.", "My mom has Parkinson's. A {pct} cut to medical research is personal."], up: ["{pct} more for research. That's how we got GPS, the internet and cancer drugs.", "More NIH grants means more shots at curing diseases like my dad's."], shortDown: ["Fund the cures!", "Science pays off", "Who cures cancer now?"], shortUp: ["Go science!"] },
          education: { coef: 0.06, down: ["Fewer Pell grants today means fewer engineers tomorrow.", "A {pct} cut to college aid means fewer engineers and nurses in ten years.", "Cutting student aid {pct} shrinks the next generation of scientists."], up: [], shortDown: ["Train tomorrow's engineers"] },
          energy_environment: { coef: 0.04, down: ["Cutting energy research while other countries race ahead on batteries.", "Cutting energy research {pct} while China builds the batteries we'll have to buy.", "Battery and grid research takes a {pct} hit. That's tomorrow's jobs."], up: [], shortDown: ["Fund energy research"] },
          everything_else: { coef: 0.03, down: ["Cutting the CDC and FDA is how the next pandemic gets ahead of us.", "A {pct} cut to the CDC and FDA. Outbreaks don't wait for budgets.", "Fewer FDA reviewers after a {pct} cut means slower approvals for new treatments."], up: [], shortDown: ["Fund the CDC and FDA"] },
          medicare_drug_negotiation: { coef: -2, on: ["Cheaper drugs now, but fewer new cures later; CBO says so too.", "Lower drug prices, but CBO expects a few fewer new medicines over 30 years. Trade-off.", "Negotiating prices could mean fewer drug companies betting on rare diseases."], shortOn: ["Fewer new cures?"] },
          student_loan_forgiveness: { coef: 0.8, on: ["Debt relief lets young people take research jobs instead of chasing salaries.", "With $10,000 off, my friends can take lab jobs that don't pay like finance.", "Debt relief means more grads can afford to go into research and teaching."], shortOn: ["Free the grads"] }
        }
      },
      {
        id: "education", name: "Schools & kids", cap: 25,
        // Pew Research (Feb 2024): improving the educational system a top priority for ~55%.
        calibration: "Pew Research Center, Feb 2024 policy priorities (education ~55% top priority)",
        holders: { default: [0.35, 0.6], teacher: [1, 1.4], student: [0.8, 1.1], low_income_parent: [0.75, 1], middle_family: [0.65, 0.9], young_grad: [0.5, 0.8], caregiver: [0.5, 0.8], immigrant_family: [0.6, 0.9], retiree_low: [0.25, 0.5] },
        drivers: {
          education: { coef: 0.25, down: ["A {pct} cut means my kid's reading specialist is gone.", "Special-ed and Head Start take a {pct} hit. The kids who need help most lose it.", "Pell grants shrink with a {pct} cut. College slips out of reach for kids like mine."], up: ["{pct} more for schools: reading help, special ed, bigger Pell grants.", "Finally funding special education like Congress promised in 1975."], shortDown: ["Fund our schools!", "Kids first!"], shortUp: ["Schools win!"] },
          universal_prek: { coef: 6, on: ["Free preschool for every 3- and 4-year-old. Best investment we could make.", "Pre-K for all: kids start kindergarten ready to learn."], shortOn: ["Pre-K for all!"] },
          snap_food: { coef: 0.02, down: ["Hungry kids can't learn. School meals matter.", "Kids who skip breakfast can't focus in class. Food aid is school aid.", "A {pct} cut to food aid shows up in my classroom by Thursday."], up: [], shortDown: ["Hungry kids can't learn"] }
        }
      },
      {
        id: "climate", name: "Climate & environment", cap: 25,
        // Pew Research (Feb 2024): protecting the environment a top priority for 45%; dealing
        // with climate change 59% of Democrats vs 12% of Republicans (~37% overall, derived).
        // Holders ~30%, higher among the young.
        calibration: "Pew Research Center, Feb 2024 (environment 45% top priority; climate ~37%, derived from 59% D / 12% R)",
        holders: { default: [0.3, 0.6], student: [0.6, 1], scientist: [0.7, 1], young_grad: [0.55, 0.9], teacher: [0.45, 0.8], farmer: [0.25, 0.6], energy_worker: [0.2, 0.5], retiree_low: [0.25, 0.5], retiree_middle: [0.25, 0.5], immigrant_family: [0.35, 0.7] },
        drivers: {
          energy_environment: { coef: 0.25, down: ["Cutting the EPA and parks by {pct} while the summers keep getting hotter.", "A {pct} cut to clean water and parks. My kids' generation pays for this."], up: ["{pct} more for clean energy, clean water and parks. Good.", "Replacing lead pipes and building clean power: finally."], shortDown: ["There is no planet B", "Protect our parks"], shortUp: ["Clean air wins"] },
          carbon_tax: { coef: 0.12, up: ["A ${val}-a-ton carbon fee: polluters finally pay for the damage.", "A carbon price is the cheapest way to cut emissions. Economists agree."], down: [], shortUp: ["Price carbon!"] },
          gas_tax: { coef: 0.03, up: ["A higher gas tax nudges people toward cleaner cars.", "A {val}-cent gas tax nudges people toward cleaner cars.", "With a {val}-cent gas tax people drive a bit less, and the air gets cleaner."], down: ["Making gas cheaper means more pollution.", "Making gas cheaper means more driving and more pollution.", "A gas-tax cut is a subsidy for burning more oil."], shortUp: ["Drive less"], shortDown: ["More smog"] },
          transportation: { coef: 0.03, down: ["Bus and train cuts put more cars on the road.", "Cutting transit {pct} means more traffic and dirtier air."], up: ["More transit means cleaner air.", "More buses and trains mean cleaner air.", "{pct} more for transit: fewer cars idling in traffic."], shortDown: ["Save our buses"], shortUp: ["Transit, not smog"] }
        }
      },
      {
        id: "disaster", name: "Disaster readiness", cap: 25,
        // ESTIMATE: no direct polling on FEMA funding priority; AP-NORC (2024) finds ~7 in 10
        // concerned about extreme weather. Holders ~30%, higher where disasters hit.
        calibration: "Estimate; AP-NORC 2024 extreme-weather concern polling as a guide",
        holders: { default: [0.3, 0.6], farmer: [0.6, 1], first_responder: [0.9, 1.2], federal_worker: [0.5, 0.8], retiree_low: [0.4, 0.7], retiree_middle: [0.4, 0.7], construction: [0.35, 0.7], immigrant_family: [0.3, 0.6], energy_worker: [0.4, 0.7] },
        drivers: {
          everything_else: { coef: 0.25, down: ["Cutting FEMA and the CDC by {pct} right before hurricane season.", "When the next flood comes, a {pct} smaller FEMA means waiting months for help.", "Fewer food-safety inspectors and a slower outbreak response. That's a gamble."], up: ["A bigger disaster fund means help arrives in days, not months.", "{pct} more for FEMA and the CDC. Cheaper than cleaning up after."], shortDown: ["Who comes after a flood?", "Fund FEMA!"], shortUp: ["Ready for storms"] },
          energy_environment: { coef: 0.12, down: ["Fewer wildfire crews and slower levee repairs. My town floods every few years.", "A {pct} cut to firefighting and dams. That's insurance we'll miss."], up: ["More forest thinning and levee repair. Cheaper than the disaster.", "More wildfire crews before fire season: that's money well spent."], shortDown: ["Fire season's coming"], shortUp: ["Fix the levees"] },
          transportation: { coef: 0.04, down: ["The Coast Guard and air-traffic control are safety, not luxuries.", "A {pct} cut to the agency that runs the Coast Guard and air-traffic control? Risky."], up: [], shortDown: ["Safety isn't optional"] }
        }
      },
      {
        id: "infrastructure", name: "Roads & infrastructure", cap: 25,
        // Pew/AP-NORC: ~3 in 4 support more infrastructure spending (AP-NORC 2021-2024 trend);
        // as a personal priority, holders ~35% (estimate).
        calibration: "AP-NORC infrastructure polling 2021-2024 (about 3 in 4 support more spending); holder share estimated",
        holders: { default: [0.35, 0.6], construction: [0.85, 1.1], transport: [0.85, 1.1], small_business: [0.5, 0.8], farmer: [0.5, 0.8], energy_worker: [0.4, 0.7], near_retiree: [0.35, 0.6] },
        drivers: {
          transportation: { coef: 0.3, down: ["A {pct} cut to highways and transit. That bridge on my commute is already rated poor.", "Potholes, delayed flights, fewer buses: that's what a {pct} cut buys.", "Air-traffic control still runs on floppy disks, and we cut it {pct}?"], up: ["{pct} more for roads, bridges and airports. About time.", "Fixing bridges and modernizing air-traffic control: money well spent."], shortDown: ["Fix our bridges!", "Potholes everywhere"], shortUp: ["Build it!"] },
          gas_tax: { coef: 0.05, up: ["A {val}-cent gas tax actually pays to fix the roads.", "The gas tax hasn't gone up since 1993. Roads don't fix themselves."], down: ["Cutting the gas tax drains the highway fund.", "A gas tax of {val} cents won't fix a single bridge."], shortUp: ["Pay for the roads"], shortDown: ["Who fixes roads?"] },
          energy_environment: { coef: 0.04, down: ["The Army Corps keeps our ports and dams working. Don't cut that.", "Our river locks are 80 years old. A {pct} cut to the Corps is a gamble."], up: [], shortDown: ["Fix the locks and dams"] }
        }
      },
      {
        id: "world_role", name: "America's role abroad", cap: 20,
        // Pew Research (2024): ~half say the US should be active in world affairs; AP-NORC
        // (2025) finds most underestimate foreign aid. Holders ~20% (estimate).
        calibration: "Pew Research Center 2024 global engagement; holder share estimated",
        holders: { default: [0.2, 0.5], scientist: [0.4, 0.7], veteran: [0.4, 0.7], military: [0.5, 0.8], retiree_federal: [0.45, 0.8], high_earner: [0.35, 0.6], immigrant_family: [0.5, 0.8], farmer: [0.4, 0.8], student: [0.35, 0.6], affluent_investor: [0.4, 0.6] },
        drivers: {
          foreign_aid: { coef: 0.12, down: ["Cutting aid by {pct} saves pennies and hands influence to China.", "HIV clinics rationing drugs because we cut aid by {pct}. That's not who we are.", "Foreign aid is under 1% of the budget. Cutting it {pct} buys us nothing but enemies."], up: ["Malaria nets and vaccines are the best deal in the budget.", "{pct} more aid builds friends we'll need later."], shortDown: ["Aid is 1% of budget!", "Lives, not pennies"], shortUp: ["Help the world"] },
          close_overseas_bases: { coef: -4, on: ["Pulling back from our allies invites trouble.", "Close a third of our bases and our allies start hedging their bets."], shortOn: ["Don't abandon allies"] },
          tariff_rate: { coef: -0.8, up: ["{val}% tariffs: our trading partners will hit back, and farmers pay first.", "A trade war at {val}% tariffs. Nobody wins those."], down: ["Lower tariffs mean friends and customers abroad again.", "Tariffs down to {val}%: our farmers can sell overseas again."], shortUp: ["Trade wars hurt"], shortDown: ["Free trade"] },
          defense_weapons: { coef: 0.03, down: ["Our allies are watching what we cut.", "Allies count on our arsenal. A {pct} cut makes them nervous."], up: [], shortDown: ["Allies are watching"] }
        }
      },
      {
        id: "safety_net", name: "Helping people in need", cap: 30,
        // Pew Research (2024): ~70% oppose cutting Social Security benefits; KFF (2025):
        // ~3 in 4 have a favorable view of Medicaid. Holders ~50% (estimate).
        calibration: "Pew 2024 Social Security attitudes; KFF Health Tracking Poll 2025 (Medicaid ~77% favorable); holder share estimated",
        holders: { default: [0.5, 0.7], teacher: [0.7, 1], nurse: [0.7, 1], care_aide: [0.8, 1.1], caregiver: [0.8, 1.1], low_income_parent: [0.7, 1], retiree_low: [0.65, 0.9], retiree_middle: [0.6, 0.9], student: [0.6, 0.9], health_pro: [0.6, 0.9], affluent_investor: [0.3, 0.5], ultra_rich: [0.3, 0.5], high_earner: [0.35, 0.6] },
        drivers: {
          snap_food: { coef: 0.12, down: ["Cutting food aid by {pct}. There are kids in my town who only eat at school.", "A {pct} SNAP cut. The food bank where I volunteer is already empty by Thursday."], up: ["More families can put food on the table.", "{pct} more for food aid: fewer kids hungry by the end of the month."], shortDown: ["Feed the kids!"], shortUp: ["No one goes hungry"] },
          income_support: { coef: 0.12, down: ["Cutting the EITC and SSI by {pct} hits the poorest people we have.", "A {pct} cut to the safety net, in this economy?"], up: ["Bigger work credits reward people who work hard for little pay.", "{pct} more for the EITC and SSI lifts families out of poverty."], shortDown: ["Protect the poor"], shortUp: ["Reward work"] },
          housing_aid: { coef: 0.08, down: ["Cutting rent help by {pct} means more grandmothers in shelters.", "Homelessness is already up. A {pct} housing cut makes it worse."], up: ["Getting families off the waiting list: good.", "{pct} more rent help means fewer kids sleeping in cars."], shortDown: ["Housing is a right"], shortUp: ["Homes for families"] },
          medicaid_chip: { coef: 0.14, down: ["A {pct} Medicaid cut. Nursing homes and kids' doctors run on that money.", "My neighbor's son has autism. His therapy is Medicaid. A {pct} cut is a disaster."], up: ["More Medicaid means fewer families going broke over a hospital stay.", "{pct} more for Medicaid: kids see a dentist sooner."], shortDown: ["Hands off Medicaid"], shortUp: ["Health care for all"] },
          social_security: { coef: 0.12, down: ["Cutting Social Security {pct} breaks a promise to people who paid in for 40 years.", "My mother lives on her check. A {pct} cut means choosing between food and pills."], up: ["Seniors need it. Fewer widows in poverty.", "A {pct} raise for Social Security keeps grandparents out of poverty."], shortDown: ["Keep the promise!", "Hands off my SS"], shortUp: ["Seniors first"] },
          medicare: { coef: 0.08, down: ["A {pct} cut to Medicare. Rural hospitals will close.", "Gutting Medicare {pct}. My parents can't afford higher copays."], up: ["Dental and hearing for seniors? Long overdue.", "{pct} more for Medicare could finally cap what seniors pay out of pocket."], shortDown: ["Save Medicare!"], shortUp: ["Care for seniors"] },
          veterans: { coef: 0.12, down: ["Cutting veterans' care by {pct}. They kept their promise; we should keep ours.", "A {pct} cut to the VA? Disgraceful."], up: ["Shorter VA waits. Our vets earned it.", "{pct} more for veterans: faster claims and more counselors."], shortDown: ["Honor our vets!"], shortUp: ["Vets first"] },
          aca_subsidies: { coef: 0.03, down: ["Cutting premium help means more people go uninsured.", "A {pct} cut to marketplace help. My cousin will drop her coverage."], up: [], shortDown: ["Keep premium help"] },
          medicaid_per_capita_caps: { coef: -7, on: ["Capping Medicaid means states cut care for disabled kids and nursing-home residents.", "Medicaid caps: four million people lose coverage over a decade."], shortOn: ["No Medicaid caps!"] },
          cancel_medicaid_work_req: { coef: 4, on: ["Good: no more losing coverage over paperwork when you already work.", "Most people losing Medicaid to work rules already work. Canceling the rule is right."], shortOn: ["Coverage, not paperwork"] },
          reverse_snap_cuts: { coef: 3, on: ["Keeping food aid for 60-year-olds who can't find work. That's decent.", "Undoing the SNAP cuts: 2.4 million people keep groceries on the table."], shortOn: ["Food for all"] },
          ctc_fully_refundable: { coef: 4, on: ["The poorest kids finally get the full child credit. Child poverty drops by a million.", "A full child credit for every kid, like in 2021. Child poverty fell nearly in half back then."], shortOn: ["End child poverty"] },
          paid_leave: { coef: 3, on: ["Every other rich country has paid leave. About time we did.", "Paid family leave: nobody should lose a job for having a baby."], shortOn: ["Paid leave now!"] },
          ss_chained_cpi: { coef: -3, on: ["Smaller raises every year for the oldest widows. That's cruel math.", "Chained CPI looks tiny, but after 20 years it's $100 a month gone."], shortOn: ["Keep full COLAs"] },
          ss_expand_benefits: { coef: 3, on: ["A higher minimum check for lifelong low-wage workers. That's fair.", "Bigger raises for the oldest retirees, who've outlived their savings. Good."], shortOn: ["Raise the minimum"] },
          ss_retirement_age: { coef: -1.5, up: ["Retirement at {val}? Tell that to a roofer or a nurse's aide.", "Raising the age to {val} hits the people whose bodies give out first."], down: ["Full benefits at {val}: people who do hard physical work deserve it.", "Back to retiring at {val}. Bodies wear out."], shortUp: ["Not everyone sits at a desk"], shortDown: ["Retire at {val}!"] },
          ctc_amount: { coef: 0.002, down: ["Shrinking the child credit to ${val} pushes kids into poverty.", "A ${val} child credit? Diapers didn't get cheaper."], up: ["A ${val} child credit: kids lifted out of poverty.", "Raising the child credit to ${val} helps every working family."], shortDown: ["Don't cut kids' credit"], shortUp: ["Help families"] },
          universal_prek: { coef: 2, on: ["Free preschool helps the families who can't afford child care.", "Pre-K for every 3- and 4-year-old: one of the best anti-poverty tools there is."], shortOn: ["Pre-K for all!"] },
          restore_aca_enhanced: { coef: 3, on: ["Bringing back the extra ACA help: 4 million more people insured.", "Restoring the premium help: no more $1,000 premiums for a couple in their 60s."], shortOn: ["Affordable care!"] }
        }
      },
      {
        id: "border", name: "Border security", cap: 20,
        // Pew Research (Feb 2024): dealing with immigration a top priority for 57%; Gallup
        // (2025) ~ half want immigration decreased. Holders ~35% (estimate).
        calibration: "Pew Research Center, Feb 2024 (immigration 57% top priority); Gallup immigration trend 2025",
        holders: { default: [0.35, 0.7], retiree_low: [0.5, 0.9], retiree_middle: [0.5, 0.9], retiree_affluent: [0.45, 0.8], farmer: [0.45, 0.8], first_responder: [0.55, 0.9], military: [0.5, 0.8], veteran: [0.5, 0.8], immigrant_family: [0.05, 0.4], student: [0.15, 0.4], scientist: [0.15, 0.4] },
        drivers: {
          border_immigration: { coef: 0.2, down: ["Cutting the Border Patrol by {pct}? We need control of our border.", "{pct} less for border enforcement. Fentanyl comes through those gaps."], up: ["{pct} more for the border: more inspectors, more fentanyl caught.", "Finally enforcing the law at the border."], shortDown: ["Secure the border!"], shortUp: ["Border secured"] }
        }
      },
      {
        id: "work_rules", name: "Work should come first", cap: 15,
        // KFF Health Tracking Poll (Jan 2025): ~6 in 10 initially favor Medicaid work
        // requirements (support falls when told people may lose coverage). Holders ~30%.
        calibration: "KFF Health Tracking Poll, Jan 2025 (about 6 in 10 initially favor Medicaid work requirements); holder share estimated",
        holders: { default: [0.3, 0.6], small_business: [0.55, 0.9], farmer: [0.5, 0.8], retiree_middle: [0.4, 0.7], retiree_affluent: [0.45, 0.7], energy_worker: [0.45, 0.7], construction: [0.35, 0.6], high_earner: [0.4, 0.6], student: [0.15, 0.4], low_income_parent: [0.1, 0.4], unemployed: [0.1, 0.3] },
        drivers: {
          cancel_medicaid_work_req: { coef: -4, on: ["Dropping the work rule? Able-bodied adults can work 20 hours a week.", "I work two jobs. Asking healthy adults to work or train for Medicaid is fair."], shortOn: ["Work for welfare"] },
          reverse_snap_cuts: { coef: -3, on: ["Scrapping SNAP work rules. Help should come with a push toward a job.", "Undoing the SNAP work requirement: I've hired people off food stamps. Work works."], shortOn: ["A hand up, not a handout"] },
          ctc_fully_refundable: { coef: -1.5, on: ["A full credit for parents with no earnings at all? It should reward work.", "Credits should go with a paycheck. That's the deal that built welfare reform."], shortOn: ["Reward work"] },
          paid_leave: { coef: -1.5, on: ["Twelve weeks of leave is hard on a five-person shop like mine.", "Paid leave is nice, but who covers the shift? Small employers pay for it."], shortOn: ["Small shops can't cover"] }
        }
      },
      {
        id: "local_hospital", name: "Keeping the local hospital open", cap: 20,
        // ESTIMATE. Context: Chartis 2025 counts ~430 rural hospitals vulnerable to closure;
        // AP-NORC (2023) finds most rural adults worry about access to care.
        calibration: "Estimate; Chartis Center for Rural Health 2025 vulnerability report as context",
        holders: { default: [0.15, 0.6], nurse: [0.8, 1], health_pro: [0.85, 1.1], care_aide: [0.6, 0.9], farmer: [0.55, 0.9], retiree_low: [0.35, 0.7], retiree_middle: [0.35, 0.7], energy_worker: [0.3, 0.6] },
        drivers: {
          medicare: { coef: 0.12, down: ["Our county hospital lives on Medicare. A {pct} cut and the maternity ward closes.", "Cutting Medicare {pct} means the nearest ER could be an hour away."], up: ["More Medicare money keeps small hospitals open.", "{pct} more for Medicare: our county keeps its ER."], shortDown: ["Save our hospital"], shortUp: ["Hospital stays open"] },
          medicaid_chip: { coef: 0.1, down: ["Medicaid pays for most of our patients. A {pct} cut closes wards.", "A {pct} Medicaid cut and our nursing home stops taking new residents."], up: ["Better Medicaid rates mean more doctors take new patients.", "{pct} more Medicaid money keeps the maternity ward open."], shortDown: ["Save our hospital"], shortUp: ["More doctors"] },
          site_neutral: { coef: -3, on: ["Site-neutral pay sounds fair, but our rural hospital's clinics depend on that money.", "Paying hospital clinics less could close the only clinic in our county."], shortOn: ["Rural clinics at risk"] },
          medicare_advantage_reform: { coef: -1, on: ["Insurers will squeeze hospitals when their Medicare Advantage pay drops.", "Cut what Advantage plans get and they'll deny more claims at our hospital."], shortOn: ["Hospitals squeezed"] }
        }
      },
      {
        id: "health_costs", name: "Health-care prices", cap: 15,
        // Pew Research (Feb 2024): reducing health-care costs a top priority for ~60%;
        // KFF (2023): ~8 in 10 favor Medicare negotiating drug prices. Holders ~40% (estimate).
        calibration: "Pew Research Center, Feb 2024 (health costs ~60% top priority); KFF Health Tracking Poll 2023 (drug negotiation ~80% favor)",
        holders: { default: [0.4, 0.6], retiree_low: [0.6, 0.9], retiree_middle: [0.6, 0.9], retiree_affluent: [0.5, 0.7], disabled: [0.6, 0.9], marketplace: [0.6, 0.9], caregiver: [0.6, 0.9], health_pro: [0.25, 0.5] },
        drivers: {
          medicare_drug_negotiation: { coef: 4, on: ["Medicare already negotiates a few drug prices. Doing it for many more is overdue.", "Insulin and blood thinners at fair prices. About time."], shortOn: ["Lower drug prices!"] },
          site_neutral: { coef: 2, on: ["Same price for the same X-ray, whoever owns the building. That's just fair.", "Hospitals charging double for a checkup because they bought the clinic? Glad that's over."], shortOn: ["Same care, same price"] },
          medicare_advantage_reform: { coef: 1, on: ["Insurers padding Medicare bills by coding patients sicker: good to stop it.", "Medicare Advantage plans get paid more than regular Medicare would cost. Closing that gap is fair."], shortOn: ["Stop the upcoding"] }
        }
      },
      {
        id: "public_health", name: "Public health", cap: 15,
        // ESTIMATE. Context: KFF (2025) ~6 in 10 trust the CDC; Gallup finds majorities
        // favor higher tobacco taxes when asked (2010s trend).
        calibration: "Estimate; KFF 2025 trust-in-CDC polling and Gallup tobacco-tax trend as context",
        holders: { default: [0.2, 0.5], nurse: [0.75, 1], health_pro: [0.9, 1.1], scientist: [0.5, 0.8], teacher: [0.4, 0.7], care_aide: [0.4, 0.7], caregiver: [0.4, 0.7] },
        drivers: {
          tobacco_alcohol: { coef: 3, on: ["A higher cigarette tax: fewer teenagers start smoking. I've seen what lung cancer does.", "Pricier cigarettes and liquor save lives. The data is clear."], shortOn: ["Fewer kids smoking"] },
          everything_else: { coef: 0.12, down: ["Cutting the CDC and FDA by {pct}. The next outbreak won't wait.", "Fewer food inspectors after a {pct} cut. That's how salmonella gets through."], up: ["A real public-health workforce before the next pandemic.", "{pct} more for the CDC and community health centers. Prevention is cheap."], shortDown: ["Fund the CDC"], shortUp: ["Ready for outbreaks"] },
          medicaid_chip: { coef: 0.04, down: ["Uninsured patients show up sicker and later.", "When people lose Medicaid, the ER becomes their doctor."], up: [], shortDown: ["Coverage keeps us healthy"] }
        }
      },
      {
        id: "deportation_fear", name: "Family and deportation", cap: 25,
        // Pew Research (2025): ~ 4 in 10 Hispanic adults worry they or someone close could
        // be deported. Holders concentrated in immigrant families (estimate elsewhere).
        calibration: "Pew Research Center 2025 Latino deportation-worry survey; elsewhere estimated",
        holders: { default: [0.08, 0.5], immigrant_family: [0.9, 1.3], service_worker: [0.2, 0.8], construction: [0.2, 0.8], care_aide: [0.25, 0.8], student: [0.2, 0.6], farmer: [0.15, 0.6], low_income_parent: [0.15, 0.7] },
        drivers: {
          border_immigration: { coef: -0.3, up: ["{pct} more for ICE. My cousin is afraid to drive to work.", "More raids. My kids ask if I'll be home after school.", "A {pct} enforcement surge. Our church is half empty; people are scared."], down: ["Fewer raids. My neighbors can breathe again.", "Less money for detention means families stay together."], shortUp: ["Families belong together", "Stop the raids"], shortDown: ["Families stay together"] }
        }
      },
      {
        id: "crime", name: "Crime & public safety", cap: 20,
        // Pew Research (Feb 2024): reducing crime a top priority for 58%.
        calibration: "Pew Research Center, Feb 2024 (reducing crime 58% top priority)",
        holders: { default: [0.4, 0.6], first_responder: [0.95, 1.2], retiree_low: [0.5, 0.8], retiree_middle: [0.55, 0.8], middle_family: [0.5, 0.8], federal_worker: [0.4, 0.7], small_business: [0.5, 0.8], student: [0.25, 0.5] },
        drivers: {
          justice: { coef: 0.25, down: ["Cutting the FBI and police grants by {pct}? Fraud and fentanyl cases will sit.", "A {pct} cut to courts and police. Victims wait longer for justice."], up: ["More agents for fentanyl and child-exploitation cases. Good.", "Grants for local police and victim services: that keeps my street safe."], shortDown: ["Support our police", "Fund the courts"], shortUp: ["Safer streets"] }
        }
      },
      {
        id: "fairness", name: "Fair share (the top should pay)", cap: 25, mode: "fairness", direction: "egalitarian",
        // Pew Research (2023): 61% say wealthy people pay too little in federal taxes; 60%
        // say large corporations pay too little.
        calibration: "Pew Research Center, April 2023 (61% say the wealthy pay too little; 60% corporations)",
        holders: { default: [0.5, 0.6], low_income_parent: [0.75, 1.1], service_worker: [0.65, 1], care_aide: [0.7, 1], teacher: [0.65, 1], student: [0.65, 1], young_grad: [0.6, 0.9], unemployed: [0.7, 1], retiree_low: [0.6, 1], nurse: [0.55, 0.9], high_earner: [0.25, 0.5], affluent_investor: [0.15, 0.4], ultra_rich: [0.1, 0.4], small_business: [0.35, 0.6] },
        // Which set is used depends on what drives the signal: bad = cuts to programs for
        // low and middle earners (no new taxes at the top), badMixed = the same with some
        // top-end taxes, badTax / badTaxMixed = broad taxes, badTopCut = tax cuts at the
        // top; good = top-end taxes rose, goodHelp = more for those programs, goodTaxCut =
        // broad taxes cut. {cut} = the program, {tax} = the tax move, both as labels.
        texts: {
          bad: ["{cut}: cut. The richest: nothing extra. That's backwards.", "{cut} on the chopping block, and the top 1% gets off free?", "{cut}: cut. Billionaires: untouched. Who wrote this plan?", "First on the chopping block: {cut}. Nobody asked the wealthy to chip in."],
          badMixed: ["Biggest hit: {cut}. The rich pay a little more, but it's still lopsided.", "Biggest cut: {cut}. Working people carry this plan, not the top.", "Some taxes on the top, sure. But the real money comes from cuts to {cut}."],
          badTax: ["Biggest tax change: {tax}. Working families feel that far more than the rich do.", "{tax}: that takes a bigger bite from working families than from the top bracket. Not fair."],
          badTaxMixed: ["The top pays a bit more, but the biggest change, {tax}, lands hardest on people living paycheck to paycheck.", "Some new taxes on the top, but the biggest one, {tax}, takes a bigger share of working families' pay."],
          badTopCut: ["Tax cuts at the top while the country is deep in debt? Backwards.", "Biggest tax break: {tax}. It goes to the people who need it least.", "{tax}: a break for the top, while the rest of us wait. Backwards."],
          good: ["The richest finally pay more. Biggest step: {tax}. That's fair.", "{tax}: everybody pays their share, starting at the top.", "Asking the top to pay their share. Good."],
          goodHelp: ["More for {cut}: help goes to the people who need it most.", "{cut}: more help, not less. Good priorities."],
          goodTaxCut: ["Biggest tax cut: {tax}. That's one working families actually feel.", "{tax}: a break for paychecks, not portfolios. Fair."]
        },
        drivers: {
          carried_interest: { coef: 4, on: ["Fund managers paying a lower rate than nurses? Closing that loophole is overdue.", "Carried interest taxed like a paycheck. Finally."], shortOn: ["Close the loophole"] },
          farm_subsidy_limits: { coef: 2.5, on: ["Why should the biggest farms get the biggest checks? Capping them is fair.", "Most farm payments go to the largest 10% of farms. Good to cap them."], shortOn: ["Cap mega-farm aid"] }
        },
        shorts: { bad: ["Tax the rich first!", "Make the top pay", "Who's paying? Us."], badTopCut: ["No breaks for the top", "Backwards priorities"], good: ["Fair share!", "Top pays more"], goodHelp: ["Good priorities", "Fair to working folks"] }
      },
      {
        id: "fair_share_right", name: "Fair share (don't punish success)", cap: 25, mode: "fairness", direction: "merit",
        // Pew (2023): ~30% say the wealthy pay their fair share or too much. Holders ~25%.
        calibration: "Pew Research Center, April 2023 (about 3 in 10 say the wealthy pay a fair share or too much)",
        holders: { default: [0.22, 0.4], high_earner: [0.75, 1.1], affluent_investor: [0.9, 1.3], ultra_rich: [1, 1.4], small_business: [0.6, 0.8], tech_professional: [0.4, 0.5], farmer: [0.5, 0.6], health_pro: [0.6, 0.9], retiree_affluent: [0.5, 0.7], student: [0.1, 0.3] },
        texts: {
          bad: ["{tax}? The top 1% already pays 40% of the income tax.", "{tax}: that soaks the successful and pushes investment overseas.", "{tax}: punishing the people who build businesses and hire.", "{tax}? That feels like a penalty for succeeding."],
          good: ["Lower taxes at the top mean more investment and more jobs.", "Finally, a break for the people who invest and hire."],
          goodBroad: ["Everybody pays a little: fairer than soaking one group.", "A broad tax everyone pays beats piling it all on the top 1%."]
        },
        drivers: {
          carried_interest: { coef: -3, on: ["Carried interest is a reward for risk. Tax it like wages and fewer startups get funded.", "Ending the carried-interest rate punishes the people who fund new companies."], shortOn: ["Investors take risks"] }
        },
        shorts: { bad: ["Don't punish success", "We already pay 40%"], good: ["Invest in America", "Everyone chips in"] }
      },
      {
        id: "gov_size", name: "Size of government", cap: 25, mode: "dollars",
        // Gallup (Sept 2024): 51% say government is doing too many things best left to
        // individuals and businesses; ~half say they pay too much income tax (Gallup April 2025).
        calibration: "Gallup Governance poll Sept 2024 (51% government doing too much); Gallup taxes poll April 2025",
        holders: { default: [0.4, 0.7], small_business: [0.75, 1.1], farmer: [0.7, 1], high_earner: [0.6, 0.9], affluent_investor: [0.7, 1], ultra_rich: [0.7, 1], retiree_affluent: [0.6, 0.9], energy_worker: [0.6, 0.9], retiree_middle: [0.5, 0.8], student: [0.2, 0.4], low_income_parent: [0.25, 0.4], teacher: [0.2, 0.4], care_aide: [0.25, 0.4], scientist: [0.15, 0.4] },
        // per $B: every spending line (cut = good) and every revenue lever (more tax = bad).
        allSpending: -0.03, allSpendingLevers: -0.03, allRevenue: -0.035,
        overrides: { foreign_aid: -0.3, everything_else: -0.06, irs_enforcement: -0.6 },
        texts: {
          // {pct} is only defined for the main spending sliders and {deficit} only while
          // there is one; templates that need a missing value are skipped.
          spendDown: ["{topic}: {dollars} less. Washington can live within its means.", "{topic} trimmed {pct}. About time someone tightened the belt.", "{topic}: {dollars} cut. Every family has to budget; so should DC.", "{topic}: {dollars} saved. About time someone tightened the belt."],
          spendUp: ["{topic}: another {dollars}? We can't afford what we've got.", "{topic}: {dollars} more, with a {deficit} deficit?", "{topic}: {dollars} more. Who's paying for that?"],
          taxUp: ["{topic}: another {dollars} out of the economy and into Washington.", "{topic}: {dollars} more in taxes. Spend less instead.", "{topic}? {dollars} more in taxes. The problem is spending, not taxes."],
          taxDown: ["{topic}: {dollars} back in people's pockets.", "{topic}: lower taxes. Good."],
          foreignAid: ["Foreign aid cut {pct}. Charity begins at home.", "Good. Spend our money here, not overseas."]
        },
        shorts: { spendDown: ["Live within our means", "Cut the waste"], spendUp: ["Stop the spending!"], taxUp: ["No new taxes!", "Taxed enough already"], taxDown: ["Keep your money"] }
      },
      {
        id: "debt", name: "The national debt", cap: 30, mode: "deficit", key: "deficit",
        // Pew Research (Feb 2024 topline): reducing the budget deficit a top priority for 54%
        // (57% in Jan 2023);
        // Gallup (March 2025): ~ 4 in 10 worry "a great deal" about federal spending and
        // the deficit. Holders ~55%, older and business-owning groups higher.
        calibration: "Pew Research Center, Feb 2024 topline (deficit 54% top priority); Gallup worry trend March 2025",
        holders: { default: [0.55, 0.8], retiree_low: [0.6, 0.8], retiree_middle: [0.7, 1.1], retiree_affluent: [0.75, 1.1], retiree_federal: [0.7, 1], small_business: [0.7, 1.1], high_earner: [0.65, 1], affluent_investor: [0.7, 1], ultra_rich: [0.7, 1], farmer: [0.7, 1], military: [0.55, 0.9], student: [0.35, 0.6], young_grad: [0.4, 0.7], low_income_parent: [0.4, 0.6], unemployed: [0.4, 0.6], near_retiree: [0.6, 0.9] },
        // impact = I * clamp(base + slope * closure, min, max); closure = share of the baseline deficit closed.
        base: -12, slope: 30, min: -30, max: 18,
        texts: {
          standing: ["We borrow about {deficit} a year. Somebody has to pay that back.", "Interest on the debt is now more than the military budget. That scares me.", "My grandkids will be paying for this {deficit} deficit.", "{deficit} of red ink every year. No family could run like that."],
          // better: progress that outweighs the worry (impact >= 0); betterWorried: progress,
          // but still a net worry (impact < 0), so it never reads as a cheer.
          better: ["The deficit is down to {deficit}. It's a real start.", "Borrowing {saved} less a year. Finally some grown-ups.", "{saved} less borrowing. My grandkids thank you."],
          betterWorried: ["Down to {deficit}. Still far too much borrowing.", "{saved} less borrowing helps, but {deficit} a year is still too much.", "Better, but we'd still borrow {deficit} a year."],
          balanced: ["A balanced budget! I didn't think I'd live to see it.", "No more borrowing on our kids' credit card.", "Balanced. Now keep it that way."],
          worse: ["Now the deficit is {deficit}?! That's on our kids.", "{added} more borrowing a year. Who pays it back?"]
        },
        shorts: { standing: ["Fix the debt!", "Stop the red ink"], better: ["Debt going down", "Good start on debt"], betterWorried: ["Still too much debt", "Not enough yet"], balanced: ["Balanced! Finally", "Budget balanced!"], worse: ["Stop borrowing!", "Debt bomb!"] }
      },
      {
        id: "retirement", name: "Will Social Security be there?", cap: 20, mode: "metric", key: "ss_depletion_year",
        metric: "ss_depletion_year", excludeDrivers: ["social_security"],
        // Gallup (April 2025): ~ 6 in 10 non-retirees expect Social Security to be a major
        // source of retirement income; AP-NORC (2024): ~ 7 in 10 worried about its future.
        calibration: "Gallup Economy and Personal Finance April 2025; AP-NORC 2024 Social Security worry",
        holders: { default: [0.4, 0.6], near_retiree: [0.85, 1.1], middle_family: [0.6, 0.8], office_worker: [0.6, 0.8], young_grad: [0.45, 0.7], construction: [0.5, 0.7], manufacturing: [0.55, 0.75], retiree_low: [0.5, 0.8], retiree_middle: [0.45, 0.6], student: [0.3, 0.5], ultra_rich: [0.05, 0.3], affluent_investor: [0.1, 0.3] },
        // impact = I * clamp(base + slope * years gained, min, max)
        base: -5, slope: 0.6, min: -15, max: 8,
        texts: {
          standing: ["Social Security's trust funds run dry around {year}. Will it be there for me?", "They say checks get cut 22% when the trust fund runs out. I'm planning on it."],
          // {years} = "1 year" / "3 years"
          better: ["{topic}: Social Security's trust funds last about {years} longer. That's my retirement.", "Fixing Social Security's money gap: about {years} more of full checks."],
          betterWorried: ["{topic}: Social Security lasts {years} longer, but it still runs short. Fix it for good.", "About {years} more of full Social Security checks. Not enough; it still runs dry."],
          worse: ["{topic}: Social Security runs dry {years} sooner. Great.", "The trust funds run dry {years} earlier now. Thanks a lot."]
        },
        shorts: { standing: ["Save Social Security"], better: ["SS fund lasts longer"], betterWorried: ["Fix SS for good"], worse: ["SS runs dry sooner"] }
      }
    ],

    // Lists for the fairness worries (shared ids). $B of each move is computed by the model.
    fairness: {
      // Cuts that land mostly on low- and middle-income people (cutting = $B saved).
      lowCuts: ["social_security", "medicare", "medicaid_chip", "aca_subsidies", "snap_food", "income_support", "housing_aid", "veterans", "education",
                "ss_chained_cpi", "ss_retirement_age", "medicaid_per_capita_caps", "medicare_age", "medicare_advantage_reform"],
      // Taxes that fall broadly, including on low earners ($B raised).
      broadTaxes: ["rate_bottom", "ss_payroll_rate", "medicare_payroll_rate", "vat", "gas_tax", "tariff_rate", "carbon_tax", "tobacco_alcohol", "repeal_tips_overtime", "employer_health_cap", "ctc_amount"],
      // Taxes and cuts that fall mostly on the top ($B raised or saved).
      topTaxes: ["rate_top", "cap_gains_rate", "gains_at_death", "carried_interest", "niit_passthrough", "ss_cap_250k", "wealth_tax", "estate_rate",
                 "estate_exemption_35m", "corp_rate", "foreign_income_full_rate", "end_full_expensing", "itemized_cap_15", "salt_cap_10k", "ftt", "irs_enforcement", "ss_high_earner_trim"],
      // egalitarian signal S = (lowCuts + broadWeight*broadTaxes - topTaxes) / scale
      broadWeight: 0.5, scale: 100, coef: 4, goodCoef: 3,
      // merit signal = (topTaxes - meritBroadWeight * broadTaxes) / scale: soaking the top is bad,
      // cutting top taxes or spreading the bill broadly is good
      meritCoef: 6, meritBroadWeight: 0.3
    },

    // Names: first names reflecting the country's mix (SSA baby-name and Census surname
    // data informed the spread; no name is tied to an archetype).
    names: [
      "Rosa", "James", "Maria", "Michael", "Aaliyah", "David", "Mei", "Jose", "Priya", "Robert", "Fatima", "John", "Linda", "Carlos", "Keisha", "William",
      "Linh", "Elena", "Darnell", "Sarah", "Ahmed", "Patricia", "Hiroshi", "Jennifer", "Luis", "Grace", "Tyrone", "Barbara", "Raj", "Susan", "Miguel", "Jessica",
      "Kwame", "Karen", "Wei", "Nancy", "DeShawn", "Lisa", "Ana", "Daniel", "Yolanda", "Matthew", "Sofia", "Anthony", "Imani", "Mark", "Leilani", "Donald",
      "Ximena", "Steven", "Aisha", "Paul", "Min-jun", "Sandra", "Jamal", "Ashley", "Diego", "Kimberly", "Omar", "Donna", "Quang", "Emily", "Marcus", "Michelle",
      "Lucia", "Joshua", "Ebony", "Kenneth", "Esperanza", "Kevin", "Nadia", "Brian", "Haruka", "Carol", "Andre", "Amanda", "Guadalupe", "George", "Zainab", "Edward",
      "Mariana", "Ronald", "Jasmine", "Timothy", "Ravi", "Rebecca", "Juan", "Laura", "Chenoa", "Jason", "Tamika", "Jeffrey", "Isabel", "Ryan", "Samira", "Jacob",
      "Thu", "Stephanie", "Malik", "Dorothy", "Rafael", "Melissa", "Ingrid", "Gary", "Esther", "Nicholas", "Lakshmi", "Eric", "Camila", "Jonathan", "Dakota", "Sharon",
      "Tomas", "Cynthia", "Kofi", "Kathleen", "Yusuf", "Amy", "Marisol", "Larry", "Hana", "Frank", "Destiny", "Scott", "Arjun", "Angela", "Mateo", "Helen",
      "Bao", "Deborah", "Xavier", "Rachel", "Layla", "Benjamin", "Jun", "Shirley", "Alejandro", "Brenda", "Tariq", "Pamela", "Kalani", "Gregory", "Ines", "Walt",
      "Dolores", "Ezekiel", "Mae", "Hector", "Bernadette", "Sven", "Olga", "Dmitri", "Bridget", "Seamus", "Winona", "Earl", "Pearl", "Abdul", "Noor", "Gabriel"
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CROWD_DATA;
  else root.CROWD_DATA = CROWD_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
