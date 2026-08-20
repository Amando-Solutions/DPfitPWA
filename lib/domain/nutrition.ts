import type { ActivityLevel, Goal, MemberProfile, NutritionTargets } from '~/data/types'

/**
 * Daily targets, computed from the member's own numbers rather than hard-coded.
 *
 *   BMR      Mifflin-St Jeor
 *   TDEE     BMR × activity multiplier
 *   Target   TDEE × goal multiplier
 *   Protein  2 g per kg bodyweight
 *   Fat      25% of the calorie target
 *   Carbs    whatever is left
 *
 * The Figma "Your numbers" card shows exactly this breakdown, which is why the
 * intermediate values are returned rather than just the final macros.
 */

export const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
}

export const goalMultipliers: Record<Goal, number> = {
  'fat-loss': 0.8,
  recomp: 0.9,
  'muscle-gain': 1.1,
}

export const goalApproach: Record<Goal, string> = {
  'fat-loss': 'Steady deficit',
  recomp: 'Balanced recomp',
  'muscle-gain': 'Lean surplus',
}

const PLATE_STRUCTURE =
  'A palm of protein, a cupped hand of carbs, half a thumb of fat, and vegetables to fill the rest.'

/** Mifflin-St Jeor. Falls back to the female equation when sex is unset. */
export const basalRate = (profile: MemberProfile): number => {
  const weight = profile.weightKg ?? 70
  const height = profile.heightCm ?? 168
  const age = profile.age ?? 30
  const base = 10 * weight + 6.25 * height - 5 * age
  return Math.round(profile.sex === 'male' ? base + 5 : base - 161)
}

export const nutritionTargetsFor = (profile: MemberProfile): NutritionTargets => {
  const bmr = basalRate(profile)
  const activityMultiplier = activityMultipliers[(profile.activity || 'moderate') as ActivityLevel]
  const goal = (profile.goal || 'recomp') as Goal
  const goalMultiplier = goalMultipliers[goal]

  const tdee = Math.round(bmr * activityMultiplier)
  const kcalTarget = Math.round(tdee * goalMultiplier)

  const weight = profile.weightKg ?? 70
  const proteinG = Math.round(weight * 2)
  const fatG = Math.round((kcalTarget * 0.25) / 9)
  const carbsG = Math.max(0, Math.round((kcalTarget - proteinG * 4 - fatG * 9) / 4))

  return {
    bmr,
    activityMultiplier,
    goalMultiplier,
    kcalTarget,
    proteinG,
    fatG,
    carbsG,
    approach: goalApproach[goal],
    plateStructure: PLATE_STRUCTURE,
  }
}

/** Rows for the "Your numbers" breakdown card. */
export const targetsBreakdown = (t: NutritionTargets) => [
  { label: 'BMR', value: `${t.bmr} kcal` },
  { label: `Activity ×${t.activityMultiplier}`, value: `${Math.round(t.bmr * t.activityMultiplier)} kcal` },
  { label: 'Goal adjustment', value: `×${t.goalMultiplier}` },
]

// --- Units -----------------------------------------------------------------
export const kgToLb = (kg: number) => kg * 2.2046226218
export const lbToKg = (lb: number) => lb / 2.2046226218

export const formatWeight = (kg: number | null | undefined, units: 'kg' | 'lb'): string => {
  if (kg === null || kg === undefined) return '—'
  return units === 'kg' ? `${round1(kg)}kg` : `${round1(kgToLb(kg))}lb`
}

export const round1 = (n: number) => Math.round(n * 10) / 10
