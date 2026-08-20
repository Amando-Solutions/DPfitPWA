import type { ActivityLevel, Goal } from './types'

// Content for the intro carousel + access-code screens.
export interface OnboardingSlide {
  id: string
  eyebrow: string
  title: string
  /** Full-bleed illustration, cropped by the card. */
  illustration: string
  cta: string
}

export const onboardingSlides: OnboardingSlide[] = [
  {
    id: 'slide-1',
    eyebrow: 'The Challenge',
    title: 'Six weeks. A new body of evidence.',
    illustration: '/onboarding_tour/vector1.svg',
    cta: 'Next',
  },
  {
    id: 'slide-2',
    eyebrow: 'How it works',
    title: 'Log it. Prove it. Own it.',
    illustration: '/onboarding_tour/vector2.svg',
    cta: 'Next',
  },
  {
    id: 'slide-3',
    eyebrow: 'You · The Cohort',
    title: 'Nobody recomps alone.',
    illustration: '/onboarding_tour/vector3.svg',
    cta: 'I have my access code',
  },
]

// Options used by the multi-step setup flow. The ids are the persisted values,
// so they must match the `Goal` / `ActivityLevel` unions in `types.ts`.
export const goalOptions: { id: Goal; label: string; desc: string; icon: string }[] = [
  {
    id: 'fat-loss',
    label: 'Lose fat first',
    desc: 'Slight deficit, protein held high',
    icon: 'flame',
  },
  {
    id: 'recomp',
    label: 'Balanced recomp',
    desc: 'Lean out and build at the same time',
    icon: 'activity',
  },
  {
    id: 'muscle-gain',
    label: 'Build muscle first',
    desc: 'Small surplus, strength-led',
    icon: 'train',
  },
]

export const activityOptions: { id: ActivityLevel; label: string; desc: string }[] = [
  { id: 'sedentary', label: 'Sedentary', desc: 'Desk job, little exercise' },
  { id: 'light', label: 'Lightly active', desc: '1–2 days / week' },
  { id: 'moderate', label: 'Moderately active', desc: '3–4 days / week' },
  { id: 'very', label: 'Very active', desc: '5+ days / week' },
]

export const trainingDayOptions = [2, 3, 4, 5, 6]

export const callSlots = [
  { id: 'tue-7pm', label: 'Tue · 7PM' },
  { id: 'sat-10am', label: 'Sat · 10AM' },
]
