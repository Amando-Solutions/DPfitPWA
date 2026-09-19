// Content for the "Tools and tips" card on the Fuel screen.
export interface FuelTip {
  title: string
  body: string
}

/**
 * Habits that make the targets easy to hit, not rules to log against. The
 * screen promises "no logging, no counting", so nothing here asks for either.
 */
export const fuelTips: FuelTip[] = [
  {
    title: 'Build each meal around protein',
    body: 'Pick the protein first, then add carbs and vegetables around it. It is the simplest way to reach your protein number.',
  },
  {
    title: 'Cook protein in batches',
    body: 'Make two or three days of chicken, eggs, beans or mince at once, so something is always ready when you are hungry.',
  },
  {
    title: "Swap, don't cut",
    body: 'Keep the meals you enjoy and change one part: grilled instead of fried, a little less rice and more vegetables.',
  },
  {
    title: 'A kitchen scale, for one week',
    body: 'Weigh your usual portions for a few days to see what your targets look like on a plate. After that, your eye does the job.',
  },
  {
    title: 'A water bottle you carry',
    body: 'Keep it with you and refill it through the day, especially on training days.',
  },
]
