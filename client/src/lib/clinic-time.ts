// Clinic time on the client, and the one rule that keeps it correct.
//
// The server already did the hard part: every slot carries `date`, the civil
// date in the clinic's zone that it falls under, and the response echoes
// `timeZone`. So the client never derives a day from an instant — it groups by
// the string it was given and formats instants *in the clinic's zone*.
//
// Both halves matter for a patient who is not in Austin. Formatting `startsAt`
// with the browser's zone shows a Californian 6:00 AM for an 8:00 AM
// appointment; deriving the day from it puts a late slot on the wrong date. The
// clinic's morning is the same morning wherever you book it from.

/** `2026-09-10` → the components, with no instant in between. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

/**
 * A civil date as a `Date` at *local* midnight, for react-day-picker.
 *
 * Local, deliberately. The calendar compares and renders in the browser's zone,
 * so a local-midnight Date maps 1:1 onto the civil date and back. Building it
 * from `new Date('2026-09-10')` instead would parse as UTC midnight and land on
 * the 9th for anyone west of Greenwich — the same bug `clinic-time.ts` exists
 * to prevent on the server.
 */
export function civilToLocalDate(value: string): Date {
  const { year, month, day } = parseIsoDate(value)
  return new Date(year, month - 1, day)
}

/** The inverse, read off the local components rather than through an ISO string. */
export function localDateToCivil(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** "8:00 AM" — the time as the clinic keeps it, whatever zone the patient is in. */
export function formatClinicTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant))
}

/** "Thursday, September 10" from a civil date, with no zone conversion at all. */
export function formatCivilDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(civilToLocalDate(value))
}

/** "Thu, Sep 10" — the same date where the long form will not fit. */
export function formatCivilDateShort(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(civilToLocalDate(value))
}

/** `2026-09-10` plus n days, staying in civil dates the whole way. */
export function addCivilDays(value: string, days: number): string {
  const date = civilToLocalDate(value)
  date.setDate(date.getDate() + days)
  return localDateToCivil(date)
}

/**
 * The civil dates spanning the month `date` falls in, as the availability
 * query wants them.
 *
 * `from` never reaches back further than yesterday. The clinic's zone is not
 * known until a response arrives — it is echoed on one — and asking from the
 * browser's yesterday covers the clinic's today from any zone on earth. Past
 * dates cost nothing to ask for: the lead time means they carry no slots.
 */
export function monthRange(date: Date): { from: string; to: string } {
  const firstOfMonth = localDateToCivil(new Date(date.getFullYear(), date.getMonth(), 1))
  const lastOfMonth = localDateToCivil(new Date(date.getFullYear(), date.getMonth() + 1, 0))
  const yesterday = addCivilDays(localDateToCivil(new Date()), -1)

  return { from: firstOfMonth < yesterday ? yesterday : firstOfMonth, to: lastOfMonth }
}
