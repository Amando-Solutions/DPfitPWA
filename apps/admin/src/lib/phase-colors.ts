import type { programPhases } from "@/lib/cohort-pulse"

// Muted, print-friendly series colours: slate blue, amber, brick, green, violet.
export const PALETTE = ["#44678a", "#c8813f", "#b04437", "#43705a", "#7a5aa6"] as const

/** Each phase takes the next palette colour, in program order. */
export function phaseColor(phases: ReturnType<typeof programPhases>, week: number) {
  const index = phases.findIndex((phase) => week >= phase.fromWeek && week <= phase.toWeek)
  return PALETTE[Math.max(0, index) % PALETTE.length]!
}
