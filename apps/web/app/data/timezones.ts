/**
 * The time zones the registration form offers, and how a browser's guess is
 * turned into one of them.
 *
 * The field used to be a text input — "e.g. Lagos, WAT" — and what came back
 * was whatever somebody typed: a city, a country, an abbreviation, a blank
 * space. It is the answer that decides which of the two live-call slots a
 * member is pointed at, so it is the one field where a typo costs somebody a
 * call, and there is no way to tell a typo from a place you have not heard of
 * after the fact. Picking from a list removes the question.
 *
 * The list comes from `@vvo/tzdb` rather than from `Intl.supportedValuesOf`,
 * which is the same 400-odd raw IANA names with no cities, no country and no
 * grouping — so every label here would have had to be authored by hand. tzdb
 * ships a curated 315: one entry per zone people actually distinguish, each
 * with the cities that identify it, and the aliases that resolve onto it.
 *
 * What gets stored is the IANA name (`Africa/Lagos`), not the label. That is
 * what the cohort document already speaks — see `Cohort.timezone` in the member
 * app — so a registration and a cohort can now be compared rather than read.
 */
import { rawTimeZones } from '@vvo/tzdb'

export interface TimezoneOption {
  /** The IANA name, and what the form submits. */
  value: string
  /** Cities first, because that is what somebody scans for. */
  label: string
  /**
   * What the picker's search box matches against: every city tzdb carries and
   * not just the two on the label, the country, the zone's own name, its
   * abbreviation, and the IANA name with its punctuation opened out. Somebody
   * types "nigeria", "WAT", "abuja" or "new york" and lands on the same row.
   */
  search: string
}

export interface TimezoneGroup {
  continent: string
  zones: TimezoneOption[]
}

/**
 * Africa first, then roughly by how many people register from there.
 *
 * The coach is in Lagos and so are most buyers, and the alternative — strict
 * alphabetical — opens the list on Antarctica. Anything not named here is
 * appended alphabetically, so a new continent in the data cannot vanish.
 */
const CONTINENT_ORDER = [
  'Africa',
  'Europe',
  'North America',
  'Asia',
  'South America',
  'Oceania',
  'Antarctica',
]

/**
 * `+01:00` from `60`.
 *
 * Standard time, deliberately, not the offset in force today. The page is
 * prerendered, so a label computed from "now" is computed at build time and
 * would be wrong for half the year in every zone that keeps DST — and wrong in
 * the HTML a crawler and a first paint both show. The stored value is the zone
 * itself, which is unambiguous whatever the date, so the offset here is an aid
 * to finding your own row rather than a fact anything downstream reads.
 */
function formatOffset(minutes: number) {
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  const rest = String(absolute % 60).padStart(2, '0')
  return `GMT${sign}${hours}:${rest}`
}

/**
 * "Lagos, Kano — West Africa Time (GMT+01:00)".
 *
 * Two cities, not the four tzdb carries. They are ordered by population, so the
 * first two are the ones somebody recognises, and the label has to survive a
 * closed select on a phone — where a third city is what pushes the zone's own
 * name off the end.
 */
const describe = (zone: (typeof rawTimeZones)[number]) =>
  `${zone.mainCities.slice(0, 2).join(', ')} — ${zone.alternativeName} (${formatOffset(
    zone.rawOffsetInMinutes,
  )})`

/**
 * Lower-cased and stripped of accents, so a query typed on a phone keyboard
 * matches "Bouaké" and "Asunción". Applied to both sides of the comparison.
 */
export const normalise = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const haystack = (zone: (typeof rawTimeZones)[number]) =>
  normalise(
    [
      ...zone.mainCities,
      zone.countryName,
      zone.alternativeName,
      zone.abbreviation,
      // `America/New_York` is not a thing anybody types, but `new york` is.
      zone.name.replace(/[_/]/g, ' '),
    ].join(' '),
  )

/** The option list, grouped into the `<optgroup>`s the picker renders. */
export const TIMEZONE_GROUPS: TimezoneGroup[] = (() => {
  const byContinent = new Map<string, TimezoneOption[]>()
  for (const zone of rawTimeZones) {
    const zones = byContinent.get(zone.continentName) ?? []
    zones.push({ value: zone.name, label: describe(zone), search: haystack(zone) })
    byContinent.set(zone.continentName, zones)
  }

  const rank = (continent: string) => {
    const index = CONTINENT_ORDER.indexOf(continent)
    return index === -1 ? CONTINENT_ORDER.length : index
  }

  return [...byContinent.entries()]
    .map(([continent, zones]) => ({
      continent,
      // By label, so the group reads as a list of cities in alphabetical
      // order. Ordering by offset would group the rows that share a slot, but
      // nobody scans for their zone by its number.
      zones: zones.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => rank(a.continent) - rank(b.continent) || a.continent.localeCompare(b.continent))
})()

/**
 * Every name that resolves to a zone on the list, including the aliases.
 *
 * A browser can report any of the 553 names IANA carries — `Africa/Accra`,
 * `US/Eastern`, `EST5EDT` — and only 315 of them are offered here. Canonical
 * names are written first and never overwritten, because an alias of one zone
 * is frequently the canonical name of another: `Africa/Accra` is listed under
 * `Africa/Abidjan`'s group *and* is a row of its own, and the row is the better
 * answer for somebody in Accra.
 */
const RESOLVED = (() => {
  const resolved = new Map<string, string>()
  for (const zone of rawTimeZones) resolved.set(zone.name, zone.name)
  for (const zone of rawTimeZones) {
    for (const alias of zone.group) if (!resolved.has(alias)) resolved.set(alias, zone.name)
  }
  return resolved
})()

/** Whether a submitted value is one of the zones the picker offers. */
export const isTimezone = (value: string) => RESOLVED.get(value) === value

/**
 * The visitor's own zone, as one of the offered rows, or `''`.
 *
 * Empty rather than a guess: a browser that reports nothing useful — or `UTC`,
 * which is what a hardened one says instead of the truth — leaves the select on
 * its placeholder, and somebody picks. A wrong zone quietly pre-filled is worse
 * than an empty one, because nobody checks a field that looks answered.
 */
export function detectTimezone() {
  try {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone
    return (guess && RESOLVED.get(guess)) || ''
  } catch {
    // `Intl` is present everywhere this site runs, but `resolvedOptions` is
    // allowed to throw and a registration form is not the place to find out.
    return ''
  }
}
