/**
 * General marketing copy. Cohort and program details come from Firestore.
 *
 * The same split the member app makes between `data/` and `components/`: the
 * components own layout and behaviour, this file owns the words. Prices, dates,
 * duration, the pre-order window and the program's weeks come from
 * `/api/challenge`; everything here is copy that does not change per cohort.
 *
 * Transcribed from the "Body Recomp Challenge" design reference. Anything in
 * [square brackets] is a placeholder the design ships with, waiting on real
 * content. Search for `PLACEHOLDER` to find them all.
 */
import { TERMS_PATH } from './terms'

/** Where every "book a slot" call-to-action points. */
export const REGISTER_ANCHOR = '#join'

/** The name of the app the challenge runs in, as the copy says it. */
export const APP_NAME = 'DP Fitness app'

export interface NavLink {
  label: string
  href: string
}

export const NAV_LINKS: NavLink[] = [
  { label: 'results', href: '#results' },
  { label: 'program', href: '#included' },
  { label: 'weekly focus', href: '#weeks' },
  { label: 'coach', href: '#coach' },
  { label: 'faq', href: '#faq' },
]

/** Social proof beside the hero buttons. */
export const PROOF = { strong: '100+ women', rest: 'coached since 2024' }

/**
 * PLACEHOLDER: stock portraits for the avatar stack beside `PROOF`, until there
 * are client photos to use. Cropped to the face at 2x the 32px circles.
 */
export const PROOF_AVATARS: string[] = [
  '1611432579699-484f7990b127',
  '1487412720507-e7ab37603c6f',
  '1531123897727-8f129e1688ce',
].map((id) => `https://images.unsplash.com/photo-${id}?w=64&h=64&fit=crop&crop=faces&q=80`)

/** Training cadence. Not stored on the cohort, so it lives with the copy. */
export const TRAINING_DAYS = 4
export const TRAINING_SPLIT = '3 lower, 1 upper per week'
export const EQUIPMENT = 'Gym access required'

// ---------------------------------------------------------------------------
// PLACEHOLDER: client transformations for the results strip. The photos are
// real; the stats and quotes are still the design's, and the card shows none
// of its text for now (the lines are commented out in `ResultsSection`).
// ---------------------------------------------------------------------------
export interface ResultCard {
  stat: string
  detail: string
  quote: string
  name: string
  /**
   * 352×640, cut to the card's photo slot around the subject. Masters are in
   * `public/before-and-after-images`.
   */
  before: string
  after: string
}

/** The before / after pair for client `n` under `public/landing/results`. */
const resultPhotos = (n: number) => ({
  before: `/landing/results/${n}-before.jpg`,
  after: `/landing/results/${n}-after.jpg`,
})

export const RESULTS: ResultCard[] = [
  { stat: '[-6 cm]', detail: '[waist, in 6 weeks]', quote: '"[Client quote about her experience and result]"', name: '[Client name]', ...resultPhotos(1) },
  { stat: '[+20 kg]', detail: '[hip thrust, in 6 weeks]', quote: '"[Client quote about her experience and result]"', name: '[Client name]', ...resultPhotos(2) },
  { stat: '[-4 cm]', detail: '[hips, in 6 weeks]', quote: '"[Client quote about her experience and result]"', name: '[Client name]', ...resultPhotos(3) },
  { stat: '[-5 kg]', detail: '[body fat, in 6 weeks]', quote: '"[Client quote about her experience and result]"', name: '[Client name]', ...resultPhotos(4) },
  { stat: '[result]', detail: '[what changed]', quote: '"[Client quote about her experience and result]"', name: '[Client name]', ...resultPhotos(5) },
  { stat: '[result]', detail: '[what changed]', quote: '"[Client quote about her experience and result]"', name: '[Client name]', ...resultPhotos(6) },
]

// ---------------------------------------------------------------------------
// App screenshots for the "everything included" panel.
// ---------------------------------------------------------------------------
export interface AppScreen {
  /**
   * 440×1068, the whole screen top to bottom; the phone frame shows the top.
   * Masters are in `public/app-mock`.
   */
  src: string
  alt: string
}

export const APP_SCREENS: AppScreen[] = [
  { src: '/landing/app/train.jpg', alt: "Today's workout in the app: each exercise with its sets, reps and a weight log" },
  { src: '/landing/app/fuel.jpg', alt: 'Daily fuel in the app: calorie, protein, carb and fat targets with nutrition tips' },
  { src: '/landing/app/chat.jpg', alt: 'The cohort group chat in the app, with the coach and other members' },
]

export interface IncludedItem {
  title: string
  description: string
}

/** `weeks` is the cohort's duration, so "Full app access for N weeks" is right. */
export const includedItems = (weeks: number): IncludedItem[] => [
  {
    title: `${TRAINING_DAYS}-day training program`,
    description: '3 lower body days and 1 upper body day each week, built for glute and leg growth.',
  },
  {
    title: 'Workout tracker and overload guide',
    description: 'Log every set and know exactly when to add weight or reps.',
  },
  {
    title: 'Nutrition guide',
    description: 'Your calorie and protein targets, a simple meal structure and easy food swaps.',
  },
  {
    title: 'Weekly check-ins',
    description: 'Submit your progress each week. Coach Dayo reads every one and adjusts your plan.',
  },
  {
    title: 'Live group calls',
    // PLACEHOLDER: the call cadence.
    description: '[Weekly] live calls for questions, form tips and motivation.',
  },
  {
    title: 'Progress tracking',
    description: 'Photos, measurements and strength markers, so you see what the scale misses.',
  },
  {
    title: 'Community chat',
    description: 'A private in-app group with the goal-driven women in your cohort.',
  },
  {
    title: `Full app access for ${weeks} weeks`,
    description: 'Everything above, on your phone, from day one.',
  },
]

export interface WeekFocus {
  title: string
  description: string
}

/**
 * The six focuses from the design, used only when the cohort's published
 * program has no weeks to show. The program in Firestore wins when it has them.
 */
export const DEFAULT_WEEK_FOCUSES: WeekFocus[] = [
  { title: 'foundations', description: 'Learn the movements, set your baseline measurements and lock in good form before we add load.' },
  { title: 'fuel and habits', description: 'Hit your protein target daily, set your routine and make consistency the easy part.' },
  { title: 'progressive overload', description: 'Start adding weight and reps with intent. Your logbook becomes your coach.' },
  { title: 'intensity', description: 'Train closer to failure, control your tempo and feel every rep in the right muscle.' },
  { title: 'recovery', description: 'Sleep, steps and stress. The progress you make outside the gym is part of the program.' },
  { title: 'peak and re-test', description: 'Your strongest week. Final check-in, progress photos and a plan for what comes next.' },
]

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** "six", or the digits past twelve. */
export const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

export const FIT_FOR_YOU: string[] = [
  `You have gym access and can train ${TRAINING_DAYS} days a week`,
  'You want to build muscle, especially glutes and legs, while losing fat',
  'You are ready to track your workouts and your food',
  'You want structure, coaching and real accountability',
  'You are a beginner or intermediate lifter ready to take training seriously',
]

export const NOT_FOR_YOU: string[] = [
  'You want a quick fix or a crash diet',
  'You can only train at home or cannot get to a gym',
  'You are not willing to check in every week',
  'You want daily one-on-one programming built only around you',
  'You have an injury or health condition and have not been cleared to train',
]

export const COACH = {
  first: 'Dayo',
  last: 'Pius',
  bio: 'Dayo has been training since 2023 and has coached over 100 women since 2024. Her approach is simple: science-based training, research-proven methods and no gimmicks. Programs that fit real lives and build results you keep.',
  stats: [
    { value: '3+ years', caption: 'Training, since 2023' },
    { value: '100+', caption: 'Women coached since 2024' },
  ],
}

export const NEXT_STEPS: string[] = [
  'Book your slot here',
  'Pay securely on Selar',
  'Get app access by email',
]

export interface FaqEntry {
  id: string
  question: string
  answer: string
}

/**
 * The FAQ. A function because two answers name things only known at runtime:
 * the cohort's start day and the contact address.
 */
export function faqs(context: { startsOn: string | null; contactEmail: string }): FaqEntry[] {
  const contact = context.contactEmail ? `email ${context.contactEmail}` : 'get in touch'
  const before = context.startsOn ? `before ${context.startsOn}` : 'before the cohort starts'
  return [
    {
      id: 'faq-coaching',
      question: 'Is this 1-on-1 coaching?',
      answer: 'No, this is a group challenge. You get the live calls, the private group chat and a weekly check-in that I read. What it is not is daily personal programming built around one person.',
    },
    {
      id: 'faq-where',
      question: 'Where does the challenge happen?',
      answer: `Everything runs in the ${APP_NAME}: workouts, logging, nutrition, check-ins, progress tracking, live calls and the community chat. You train at your own gym and follow along on your phone.`,
    },
    {
      id: 'faq-pay',
      question: 'How do I pay?',
      answer: "After you book your slot, you complete payment on Selar, a secure payment platform. Your receipt, app download link and access code are sent to your email. Check your spam or promotions folder if you don't see it.",
    },
    {
      id: 'faq-refund',
      question: 'Can I get a refund?',
      answer: `Your spot, app access and coaching time are reserved for you from day one. So once the cohort starts and you've received your links and access code, refunds aren't available. You'll already have the full program and resources, and check-ins and live calls are planned around each cohort. It also keeps everyone committed, which is a big part of why the group works. If something changes ${before}, ${contact}.`,
    },
    {
      id: 'faq-missed',
      question: 'What if I miss a workout or a week?',
      answer: 'Life happens. Pick up where you left off, tell me in your check-in and we adjust. Consistency over six weeks matters more than one perfect week.',
    },
    {
      id: 'faq-scale',
      question: 'Will I lose weight on the scale?',
      answer: "Maybe, maybe not, and that's okay. In a recomp you build muscle while losing fat, so the scale can move slowly while your shape changes. That's why we track photos, measurements and strength too.",
    },
    {
      id: 'faq-abroad',
      question: 'Can I join from outside Nigeria?',
      answer: "Yes. The challenge runs in the app, so you can join from anywhere. That's why we ask for your timezone when you book.",
    },
    {
      id: 'faq-health',
      question: 'I have a health condition or injury. Can I join?',
      answer: 'Please check with your doctor before starting. This program does not replace medical advice, and your safety comes first.',
    },
  ]
}

/** Where the "refund policy" links go: the refund answer, opened. */
export const REFUND_ANCHOR = '#faq-refund'

export const LEGAL_DISCLAIMER =
  'Results vary by individual and depend on consistency with training and nutrition. This program does not replace medical advice, so check with a doctor before starting if you have any health concerns.'

export const FOOTER_BLURB = 'Science-based coaching for women who want to get strong and feel it.'

export type SocialNetwork = 'instagram' | 'tiktok'

/** A profile link drawn as the network's icon, `label` being its accessible name. */
export interface SocialLink extends NavLink {
  network: SocialNetwork
}

const SOCIAL_NETWORKS: Record<SocialNetwork, { base: string; name: string }> = {
  instagram: { base: 'https://instagram.com/', name: 'Instagram' },
  tiktok: { base: 'https://www.tiktok.com/@', name: 'TikTok' },
}

/**
 * Turn a configured social handle into a link.
 *
 * Tolerates the three things that actually get pasted into a `.env` — `dpfit`,
 * `@dpfit`, and the full profile URL. A URL copied from the app's share sheet
 * carries a tracking query (`?stkn=…`, `?igsh=…`), which is cut off rather
 * than passed on to every visitor. Returns null when unset.
 */
export function socialLink(handle: string, network: SocialNetwork): SocialLink | null {
  const raw = handle.trim().replace(/[?#].*$/, '').replace(/\/+$/, '')
  if (!raw) return null
  const name = (raw.startsWith('http') ? raw.split('/').pop() : raw)?.replace(/^@/, '')
  if (!name) return null
  const { base, name: networkName } = SOCIAL_NETWORKS[network]
  return { label: `DP Fitness on ${networkName}`, href: `${base}${name}`, network }
}

export interface FollowConfig {
  instagramHandle: string
  tiktokHandle: string
}

/** The footer's "follow" icons, leaving out any network with no handle configured. */
export function followLinks(config: FollowConfig): SocialLink[] {
  return [socialLink(config.instagramHandle, 'instagram'), socialLink(config.tiktokHandle, 'tiktok')]
    .filter((link): link is SocialLink => link !== null)
}

export interface FooterColumn {
  title: string
  links: NavLink[]
}

export function footerColumns(contactEmail: string): FooterColumn[] {
  const support: NavLink[] = [
    { label: 'faq', href: '#faq' },
    { label: 'refund policy', href: REFUND_ANCHOR },
    { label: 'terms and conditions', href: TERMS_PATH },
    { label: 'about the coach', href: '#coach' },
  ]
  if (contactEmail) support.push({ label: contactEmail, href: `mailto:${contactEmail}` })

  return [
    {
      title: 'challenge',
      links: [
        { label: 'results', href: '#results' },
        { label: "what's included", href: '#included' },
        { label: 'weekly focus', href: '#weeks' },
        { label: 'book a slot', href: REGISTER_ANCHOR },
      ],
    },
    { title: 'support', links: support },
  ]
}
