import { currencyScale } from '~/data/challenge'

/**
 * The cohort's dates and price, worded the way the landing page prints them.
 *
 * Every section reads the same active cohort, and several print the same date
 * in different lengths — "mon, 26 october" in the stats row, "Monday, 26
 * October" in the booking details, "fri, 23 oct" on the phone's sticky bar —
 * so they are all made here, once, from `/api/challenge`.
 *
 * Every formatter is pinned to a zone so the server render and the browser
 * agree: the start day is a calendar date already resolved in the cohort's own
 * zone (formatted as UTC noon so no zone can push it across midnight), and the
 * pre-order close is an instant shown in the cohort's zone.
 */
export const useCohortLabels = () => {
  const challenge = useChallenge()

  /**
   * "Friday, 23 October", assembled from parts rather than taken whole: Node
   * and browsers ship different ICU data, and one prints "Fri 23 Oct" where
   * the other prints "Fri, 23 Oct" — a hydration mismatch on every load.
   */
  const day = (at: Date, timeZone: string, weekday: 'long' | 'short', month: 'long' | 'short') => {
    const parts = new Intl.DateTimeFormat('en-GB', { weekday, day: 'numeric', month, timeZone }).formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    // "Sept" in newer ICU; the design abbreviates to three letters.
    const m = month === 'short' ? part('month').slice(0, 3) : part('month')
    return `${part('weekday')}, ${part('day')} ${m}`
  }

  const startDate = computed(() =>
    challenge.value ? new Date(`${challenge.value.startsOn}T12:00:00Z`) : null)

  const preorderEnd = computed(() => challenge.value?.preorder ? new Date(challenge.value.preorder.endsAt) : null)
  const preorderStart = computed(() => challenge.value?.preorder ? new Date(challenge.value.preorder.startsAt) : null)
  const zone = computed(() => challenge.value?.timezone ?? 'UTC')

  /** "Monday, 26 October" */
  const startsLong = computed(() => startDate.value ? day(startDate.value, 'UTC', 'long', 'long') : null)
  /** "mon, 26 october" */
  const startsShort = computed(() => startDate.value ? day(startDate.value, 'UTC', 'short', 'long').toLowerCase() : null)
  /** "26 October", for running copy. */
  const startsPlain = computed(() => startDate.value
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(startDate.value)
    : null)

  /** "Friday, 23 October" */
  const closesLong = computed(() => preorderEnd.value ? day(preorderEnd.value, zone.value, 'long', 'long') : null)
  /** "fri, 23 october" */
  const closesShort = computed(() => preorderEnd.value ? day(preorderEnd.value, zone.value, 'short', 'long').toLowerCase() : null)
  /** "fri, 23 oct" */
  const closesTiny = computed(() => preorderEnd.value
    ? day(preorderEnd.value, zone.value, 'short', 'short').toLowerCase()
    : null)
  /** "thu, 15 october" */
  const opensShort = computed(() => preorderStart.value ? day(preorderStart.value, zone.value, 'short', 'long').toLowerCase() : null)
  /** "Thursday, 15 October" */
  const opensLong = computed(() => preorderStart.value ? day(preorderStart.value, zone.value, 'long', 'long') : null)

  const weeks = computed(() => challenge.value?.durationWeeks ?? null)
  const state = computed(() => challenge.value?.preorder?.state ?? null)

  const money = (minor: number, currency: string) => {
    const scale = currencyScale(currency)
    const whole = minor % scale === 0
    return new Intl.NumberFormat('en-NG', {
      style: 'currency', currency,
      minimumFractionDigits: whole ? 0 : undefined,
      maximumFractionDigits: whole ? 0 : undefined,
    }).format(minor / scale)
  }

  /** "₦45,000" — no ".00" on a whole amount. */
  const price = computed(() => {
    const p = challenge.value?.price
    return p ? money(p.minor, p.currency) : null
  })

  /** "₦7,500", the price spread over the weeks, rounded to a whole unit. */
  const perWeek = computed(() => {
    const p = challenge.value?.price
    const w = weeks.value
    if (!p || !w) return null
    const scale = currencyScale(p.currency)
    return money(Math.round(p.minor / w / scale) * scale, p.currency)
  })

  /** One line on when enrolment closes (or opens, or that it has). */
  const enrolmentLine = computed(() => {
    if (state.value === 'upcoming' && opensLong.value) return `Enrolment opens ${opensLong.value}`
    if (state.value === 'open' && closesLong.value) return `Enrolment closes ${closesLong.value}`
    if (state.value === 'closed') return 'Enrolment for this cohort is closed'
    return null
  })

  return {
    challenge, weeks, state, price, perWeek,
    startsLong, startsShort, startsPlain, closesLong, closesShort, closesTiny, opensLong, opensShort, enrolmentLine,
  }
}
