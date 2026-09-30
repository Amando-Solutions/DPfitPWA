export interface Price {
  minor: number
  currency: string
  label: string
}

/** Public metadata only; never workout prescriptions or guide content. */
export interface Challenge {
  id: string
  name: string
  startsOn: string
  startsLabel: string
  endsOn: string
  timezone: string
  durationWeeks: number
  program: { id: string; name: string; version: number } | null
  weeks: { number: number; title: string; subtitle: string }[]
  guides: { id: string; title: string; description: string; unlockWeek: number }[]
  price: Price | null
  registrationOpen: boolean
}

/** Stored in cohorts/{id}.registration; money is always in minor units. */
export interface CohortRegistration {
  amountMinor: number
  currency: string
  codeTtlDays: number
}

export function readRegistration(value: unknown): CohortRegistration {
  const data = value as Partial<CohortRegistration> | null
  if (!data || !Number.isSafeInteger(data.amountMinor) || data.amountMinor! < 0 ||
      typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency) ||
      !Number.isInteger(data.codeTtlDays) || data.codeTtlDays! < 1 || data.codeTtlDays! > 365) {
    throw new Error('The cohort needs a valid registration amountMinor, currency and codeTtlDays.')
  }
  return {
    amountMinor: data.amountMinor!, currency: data.currency,
    codeTtlDays: data.codeTtlDays!,
  }
}

export const currencyScale = (currency: string): number =>
  10 ** (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2)

export function formatPrice(minor: number, currency: string): Price {
  const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency })
  return { minor, currency, label: formatter.format(minor / currencyScale(currency)) }
}
