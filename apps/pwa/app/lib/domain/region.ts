import type { DateKey, MemberRegion, RegionId } from '~/data/types'
import { canonicalZone, dateKeyIn } from '~/lib/time'

/*
  Where a member's days turn over.

  The picker offers regions, and what gets stored is the IANA zone behind one:
  `America/New_York`, not "US Eastern". A zone knows when its clocks change, so
  daylight saving moves the member's midnight twice a year with nobody touching
  anything. A label would break on both days.

  Mirrors `REGIONS` in `apps/functions/src/regions.ts`, which is what `setRegion`
  accepts. If you change one, change both.
*/

export interface RegionOption {
  id: RegionId
  label: string
  /** The one zone behind the option. */
  timezone?: string
  /**
   * Instead of `timezone`: too broad for one zone — Accra and Nairobi are three
   * hours apart — so the member picks theirs, from zones starting with this.
   * The empty string is any zone.
   */
  area?: string
}

/** A starter list. Reorder or add to it here, and in the function. */
export const REGIONS: RegionOption[] = [
  { id: 'west-africa', label: 'West Africa (WAT)', timezone: 'Africa/Lagos' },
  { id: 'uk-ireland', label: 'UK & Ireland', timezone: 'Europe/London' },
  { id: 'us-eastern', label: 'US Eastern', timezone: 'America/New_York' },
  { id: 'us-central', label: 'US Central', timezone: 'America/Chicago' },
  { id: 'us-pacific', label: 'US Pacific', timezone: 'America/Los_Angeles' },
  { id: 'other-africa', label: 'Other Africa', area: 'Africa/' },
  { id: 'europe', label: 'Europe', area: 'Europe/' },
  { id: 'other', label: 'Other', area: '' },
]

/** Where everybody starts, and what a member with no region is on. */
export const DEFAULT_REGION = REGIONS[0]!

export const regionOption = (id: string | undefined): RegionOption | undefined =>
  REGIONS.find((option) => option.id === id)

/** What the picker holds before it is sent. `timezone` is empty until a broad option has one. */
export interface RegionChoice {
  id: RegionId
  timezone: string
}

/** The choice a stored region is, or the default for a member without one. */
export const choiceOf = (region: MemberRegion | undefined): RegionChoice =>
  region ? { id: region.id, timezone: region.timezone } : { id: DEFAULT_REGION.id, timezone: DEFAULT_REGION.timezone! }

/** Whether a choice is complete enough to send. */
export const isCompleteChoice = (choice: RegionChoice): boolean => {
  const option = regionOption(choice.id)
  if (!option) return false
  if (option.timezone) return true
  const zone = canonicalZone(choice.timezone)
  return !!zone && zone.startsWith(option.area ?? '')
}

/** For browsers without `Intl.supportedValuesOf`: the zones people ask for most. */
const COMMON_ZONES = [
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg',
  'Africa/Kampala', 'Africa/Kigali', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Dar_es_Salaam',
  'America/Denver', 'America/Halifax', 'America/Phoenix', 'America/Sao_Paulo', 'America/Toronto',
  'America/Vancouver', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Riyadh', 'Asia/Singapore',
  'Asia/Tokyo', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Brussels',
  'Europe/Dublin', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Rome', 'Europe/Stockholm', 'Europe/Zurich', 'Pacific/Auckland', 'UTC',
]

/** The zones a broad option offers, from this browser's own list. */
export const zonesFor = (option: RegionOption): string[] => {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : COMMON_ZONES
  return all.filter((zone) => zone.startsWith(option.area ?? ''))
}

/**
 * The device's zone, as a starting suggestion for a broad option's picker and
 * nothing else. The member confirms it; no day is ever read in it.
 */
export const deviceZone = (): string | null => {
  try {
    return canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return null
  }
}

/** "Johannesburg", "Buenos Aires · Argentina", "UTC". */
export const zoneCity = (zone: string): string => {
  const parts = zone.split('/').map((part) => part.replace(/_/g, ' '))
  const city = parts.at(-1) ?? zone
  return parts.length > 2 ? `${city} · ${parts[1]}` : city
}

/** "US Eastern", or "Europe · Paris" for a broad option. */
export const regionLabel = (choice: RegionChoice): string => {
  const option = regionOption(choice.id)
  if (!option) return zoneCity(choice.timezone)
  return option.timezone ? option.label : `${option.label} · ${zoneCity(choice.timezone)}`
}

/** The zone a member's days turn over in: their region's, or the cohort's until they pick one. */
export const memberZone = (region: MemberRegion | undefined, cohortZone: string): string =>
  canonicalZone(region?.timezone) ?? cohortZone

/**
 * The member's day: their region's date, held at the floor their last switch
 * left, so it only ever moves forward. What the day-lock reads — the same rule
 * as `memberDay` in `apps/functions/src/day-lock.ts`, which is the one that
 * decides; this one only draws the screens to match.
 */
export const memberDay = (now: Date, region: MemberRegion | undefined, cohortZone: string): DateKey => {
  const day = dateKeyIn(now, memberZone(region, cohortZone))
  const floor = region?.floor ?? ''
  return floor > day ? floor : day
}
