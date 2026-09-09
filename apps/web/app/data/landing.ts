/**
 * Every word on the landing page, in one place.
 *
 * The same split the member app makes between `data/` and `components/`: the
 * components own layout and behaviour, this file owns the copy. A price change
 * or a new FAQ entry is then an edit here rather than a hunt through templates,
 * and the three places the price appears cannot drift apart.
 *
 * The strings are transcribed from the Figma composition
 * (`DP Fitness · Landing Page`, node 448:2) and should be changed with the
 * design, not around it.
 */

/**
 * The one-time price, in the smallest unit of `PRICE_CURRENCY`.
 *
 * Kobo, not naira, because that is how money is counted anywhere it is counted
 * exactly. The display string below is derived from this rather than authored
 * beside it: two numbers that must agree is a page that can advertise one
 * price while charging another.
 *
 * BUT READ THIS BEFORE CHANGING IT. Under Paystack this number *was* the
 * price — `register.post.ts` handed it over and that is what was charged.
 * Selar does not work that way. The product is created in Selar's dashboard
 * and carries its own price, so this constant no longer instructs anything; it
 * is what the page promises, and what a sale is checked against in
 * `describeAmount`. Changing it changes the promise and not the charge. The
 * two are kept equal by hand, and a sale that comes in under this amount in
 * this currency is logged as a mismatch — which is the only warning there is
 * that the dashboard and the page have drifted apart.
 */
export const PRICE_MINOR = 3_000_000

/**
 * ISO 4217, and only the currency the price is *quoted* in.
 *
 * Selar converts prices into the buyer's own currency at checkout, so a real
 * sale can and often does arrive in something else. Nothing refuses it: see
 * `describeAmount`, which reports an amount in another currency as unchecked
 * rather than as a failure.
 */
export const PRICE_CURRENCY = 'NGN'

/** The one-time price of the challenge, formatted for display. */
export const PRICE = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: PRICE_CURRENCY,
  maximumFractionDigits: 0,
}).format(PRICE_MINOR / 100)

/** Where every "Join the Challenge" call-to-action points. */
export const REGISTER_ANCHOR = '#register'

export interface NavLink {
  label: string
  href: string
}

export const NAV_LINKS: NavLink[] = [
  { label: 'The Package', href: '#package' },
  { label: 'The 6 weeks', href: '#weeks' },
  { label: 'Price', href: '#price' },
  { label: 'FAQ', href: '#faq' },
]

/**
 * When the challenge starts, as `GET /api/challenge` answers it.
 *
 * Declared here rather than beside the route because both ends need it and
 * this file is the one place the page and its server already share — the same
 * reason `PRICE_MINOR` is read from here by `register.post.ts`. Both fields are
 * nullable together: the badge has a date or it has none.
 */
export interface ChallengeStart {
  /** The start day in the cohort's own zone, `YYYY-MM-DD`. */
  startsOn: string | null
  /** The same day as the badge prints it, e.g. `26 Aug`. */
  startsLabel: string | null
}

export interface HeroStat {
  value: string
  caption: string
}

export const HERO_STATS: HeroStat[] = [
  { value: PRICE, caption: 'One-time · 6 weeks' },
  { value: '6 wks', caption: 'Structured phases' },
  { value: '2×', caption: 'Live calls / week' },
]

/**
 * The three-cell diagram under the problem statement: fat down, muscle up, and
 * the word for doing both. `tone` is what the middle and last cells are drawn
 * differently for — rose for the thing that goes up, ink for the conclusion.
 */
export interface RecompCell {
  symbol: string
  label?: string
  tone: 'neutral' | 'accent' | 'ink'
  /** The operator painted on the seam to this cell's left. */
  joiner?: string
}

export const RECOMP_CELLS: RecompCell[] = [
  { symbol: '↓', label: 'Fat mass', tone: 'neutral' },
  { symbol: '↑', label: 'Muscle', tone: 'accent', joiner: '+' },
  { symbol: 'Recomp', tone: 'ink', joiner: '=' },
]

/**
 * What the package contains. `release` is when a member gets it — everything
 * lands on day one except the overload guide, which is deliberately held back
 * until there are two weeks of real numbers to progress from.
 */
export interface PackageItem {
  title: string
  description: string
  release: string
  /** Held-back items get the rose chip instead of the quiet one. */
  staged?: boolean
}

export const PACKAGE_ITEMS: PackageItem[] = [
  {
    title: 'Main Training Program',
    description:
      'Your core 6-week lifting structure, the anchor everything else builds on.',
    release: 'Day 1',
  },
  {
    title: 'Warm-Up Guide',
    description:
      'Same sequence every session, so your body is primed and the guesswork is gone.',
    release: 'Day 1',
  },
  {
    title: 'Core Workout Guide',
    description: 'Dedicated core work woven through the plan, never an afterthought.',
    release: 'Day 1',
  },
  {
    title: 'Cardio Guide',
    description:
      'Options by equipment and preference, built to support recomp instead of sabotaging it.',
    release: 'Day 1',
  },
  {
    title: 'Dynamic Stretch Guide',
    description:
      'Mobility work from week one, so you keep moving well as intensity climbs.',
    release: 'Day 1',
  },
  {
    title: 'Progressive Overload Guide',
    description:
      "The exact rules for adding weight and reps, released once you've got two weeks of real numbers to build from.",
    release: 'Week 3',
    staged: true,
  },
  {
    title: 'Nutrition Guide',
    description:
      'How to eat for recomp: protein and portion guidance, sensible calorie ranges, and everyday food swaps you can build any meal around. General principles you apply to your own food, not a rigid meal plan.',
    release: 'Day 1',
  },
]

export interface Phase {
  weeks: string
  title: string
  description: string
  /** The middle phase is the turn of the challenge, so it is drawn in rose. */
  featured?: boolean
}

export const PHASES: Phase[] = [
  {
    weeks: 'Week 1–2',
    title: 'Foundation',
    description:
      'Baseline lifts, form, and habits lock in. Nutrition, warm-up, core and cardio rhythm at moderate volume.',
  },
  {
    weeks: 'Week 3–4',
    title: 'Overload',
    description:
      'Progressive Overload Guide unlocks. Weight and reps climb based on your own Week 1–2 numbers. This is where change becomes visible.',
    featured: true,
  },
  {
    weeks: 'Week 5–6',
    title: 'Push & Peak',
    description:
      'Highest intensity of the challenge, then a finishing week, so you end feeling strong instead of wrecked.',
  },
]

export interface WeeklyItem {
  title: string
  description: string
}

export const WEEKLY_ITEMS: WeeklyItem[] = [
  {
    title: 'Two live group calls',
    description: 'Same session, two time slots. Pick whichever fits your time zone.',
  },
  {
    title: 'Private group chat',
    description: 'Direct access to the community and to me, all in one place.',
  },
  {
    title: 'Weekly check-in',
    description:
      "A 2-minute form covering adherence, energy, what's working and what's not.",
  },
  {
    title: 'Private progress photos',
    description:
      'Optional and always private by default, so you track for yourself first.',
  },
]

export const FIT_FOR_YOU: string[] = [
  "You're a complete beginner or you've trained a while and stalled. Both are welcome",
  'You want visible change without an extreme diet or 2-hour gym sessions',
  'You want your nutrition tailored to you, not a generic meal plan',
  "You're willing to actually watch the form videos if you're new to lifting",
  "You'll show up to at least one call and one check-in a week",
]

export const NOT_FOR_YOU: string[] = [
  'You want daily personal check-ins from me',
  "You're looking for a crash diet or extreme fast results",
  'You have an injury that needs individual clearance first',
  "You can't commit any time over the next 6 weeks",
]

export interface GalleryImage {
  src: string
  alt: string
  width: number
  height: number
}

export const GALLERY: GalleryImage[] = [
  {
    src: '/landing/gallery-dumbbell-floor.jpg',
    alt: 'A woman working through a set on a weight bench',
    width: 900,
    height: 668,
  },
  {
    src: '/landing/gallery-strength-session.jpg',
    alt: 'A woman mid-swing with a kettlebell in a busy gym',
    width: 675,
    height: 900,
  },
  {
    src: '/landing/gallery-dumbbell-rack.jpg',
    alt: 'A full rack of dumbbells along a gym wall',
    width: 900,
    height: 600,
  },
]

export const PRICE_INCLUDES: string[] = [
  'Full 6-week training program',
  'Warm-up, core, cardio & stretch guides',
  'Progressive overload guide (Week 3)',
  'Nutrition guide with protein and portion guidance',
  'Exercise video library',
  '2× weekly live group calls',
  'Private group chat + weekly check-ins',
]

export interface FaqEntry {
  question: string
  answer: string
}

/**
 * The Figma frame shows every row collapsed, so it carries the questions but no
 * answers. These are written from what the rest of the page already commits to
 * — the cardio guide's equipment options, the two call slots, the group format,
 * the "principles not a meal plan" line — so nothing here promises anything the
 * page doesn't. The refund wording is the one that needs the real policy before
 * launch; see the note on `REFUND_ANSWER_IS_PLACEHOLDER`.
 */
export const FAQS: FaqEntry[] = [
  {
    question: 'Do I need a gym membership?',
    answer:
      'A gym makes the lifting program easiest to follow, because it is built around barbells, dumbbells and machines. The cardio guide gives you options by equipment and preference, so that part works wherever you train.',
  },
  {
    question: "What if I've never trained before?",
    answer:
      "Complete beginners are welcome — the program starts from baseline lifts and form in Weeks 1–2 before any weight goes up. The one thing asked of you is that you actually watch the form videos if lifting is new to you.",
  },
  {
    question: 'What if I miss a live call?',
    answer:
      'The same session runs twice a week in two different time slots, so you pick whichever fits your time zone. If you miss both, the group chat is where the week gets picked back up.',
  },
  {
    question: 'Is this 1-on-1 coaching?',
    answer:
      'No — this is a 6-week group challenge. You get the live calls, the private group chat and a weekly check-in that I read. What it is not is daily personal programming built around one person.',
  },
  {
    question: "What if I have allergies or don't eat certain foods?",
    answer:
      'The nutrition guide is principles rather than a fixed meal plan: protein and portion guidance, sensible calorie ranges, and everyday swaps you apply to your own food. You build meals from what you actually eat.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Tell me before the cohort starts and we will sort it out. Once the program has been released, the full package is already in your hands, so refunds are handled case by case — reach out and ask.',
  },
]

/**
 * The refund answer above is written to be plausible, not authoritative. Swap it
 * for the actual policy before this page goes live.
 */
export const REFUND_ANSWER_IS_PLACEHOLDER = true

export const LEGAL_DISCLAIMER =
  'Results vary by individual and depend on consistency with training and nutrition. This program does not replace medical advice, so check with a doctor before starting if you have any health concerns.'

/**
 * The line under the lockup in the footer.
 *
 * A compressed restatement of the page rather than new argument — someone who
 * has scrolled this far has already read the case, and someone who landed here
 * from a shared link needs one sentence telling them what this is.
 */
export const FOOTER_BLURB =
  'The 6-week group challenge for people who are done choosing between losing fat and building muscle. Coached programming, live calls, and a check-in every week.'

/**
 * Turn the configured Instagram handle into the row the footer draws.
 *
 * Tolerates the three things that actually get pasted into a `.env` — `dpfit`,
 * `@dpfit`, and the full profile URL — because this value is edited by hand in
 * a file with no validation behind it, and being wrong about which form was
 * meant produces a dead link on the live page that nobody notices for weeks.
 *
 * Returns null when unset, which is what keeps the row out rather than drawing
 * a link to `instagram.com/`.
 */
export function instagramLink(handle: string): NavLink | null {
  const raw = handle.trim().replace(/\/+$/, '')
  if (!raw) return null
  // A pasted URL is reduced to its last path segment, which is the handle.
  const name = (raw.startsWith('http') ? raw.split('/').pop() : raw)?.replace(/^@/, '')
  if (!name) return null
  return { label: `@${name}`, href: `https://instagram.com/${name}` }
}

/**
 * The runtime values the footer needs, none of which this file can know.
 *
 * All three are deployment configuration rather than copy — the member app's
 * origin, the address the business answers on, the handle it posts from — so
 * they arrive from `runtimeConfig.public` instead of being written here. That
 * is the whole reason `footerColumns` is a function.
 */
export interface FooterConfig {
  appUrl: string
  /** Brevo's verified sender, which is also the published contact. */
  contactEmail: string
  /** A bare handle, an `@handle`, or a full profile URL. */
  instagramHandle: string
}

export interface FooterColumn {
  title: string
  links: NavLink[]
}

/**
 * The footer's link columns.
 *
 * A function rather than a constant because three of the links are not knowable
 * from here — they are deployment configuration, not copy, and arrive from
 * `runtimeConfig.public`. Everything else is reused rather than restated:
 * "Explore" *is* `NAV_LINKS`, so the header and the footer cannot come to
 * disagree about what the page contains.
 *
 * The contact column is dropped entirely when neither the address nor the
 * handle is configured, which is what keeps a half-configured deployment from
 * shipping an empty heading — or worse, a heading over one lonely link to
 * nowhere.
 */
export function footerColumns(config: FooterConfig): FooterColumn[] {
  const { appUrl, contactEmail, instagramHandle } = config

  const contact: NavLink[] = []
  if (contactEmail) contact.push({ label: contactEmail, href: `mailto:${contactEmail}` })
  const instagram = instagramLink(instagramHandle)
  if (instagram) contact.push(instagram)

  return [
    { title: 'Explore', links: NAV_LINKS },
    {
      title: 'Get started',
      links: [
        { label: 'Join the challenge', href: REGISTER_ANCHOR },
        { label: 'Member sign-in', href: appUrl },
      ],
    },
    ...(contact.length ? [{ title: 'Contact', links: contact }] : []),
  ]
}
