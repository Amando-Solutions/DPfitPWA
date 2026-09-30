// =============================================================================
// The regions a member can pick, and the zone behind each.
//
// What is stored is the IANA zone, not the label: `America/New_York` knows when
// New York changes its clocks, and "US Eastern" does not. So daylight saving
// moves the member's midnight on its own, twice a year, with nobody touching
// anything.
//
// Three options are too broad for one zone — Nairobi and Accra are three hours
// apart — so those ask the member for the zone itself, from the area named.
//
// Mirrors `REGIONS` in `apps/pwa/app/lib/domain/region.ts`, which draws the
// picker. If you change one, change both: an id this list does not know is
// refused.
// =============================================================================
import { canonicalZone } from './calendar.js'

export interface RegionOption {
  id: string
  label: string
  /** The one zone behind the option. */
  timezone?: string
  /**
   * Instead of `timezone`: the member picks a zone, and it has to start with
   * this. The empty string takes any zone.
   */
  area?: string
}

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

export interface RegionChoice {
  id: string
  timezone: string
}

/**
 * The region a member asked for, with its zone settled, or `null` if it is not
 * one on the list.
 *
 * A fixed option takes its own zone whatever the caller sent. A broad one takes
 * the caller's zone if the runtime knows it and it sits in the option's area.
 */
export const resolveRegion = (id: unknown, timezone: unknown): RegionChoice | null => {
  const option = REGIONS.find((region) => region.id === id)
  if (!option) return null
  if (option.timezone) return { id: option.id, timezone: option.timezone }
  const zone = canonicalZone(timezone)
  if (!zone || !zone.startsWith(option.area ?? '')) return null
  return { id: option.id, timezone: zone }
}
