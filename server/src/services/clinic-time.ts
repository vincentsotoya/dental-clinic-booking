// The clinic's calendar — civil dates and wall-clock minutes, resolved to real
// instants in the clinic's timezone.
//
// WHY THIS MODULE EXISTS
//
// `WorkingHours` stores minutes from midnight (480 = 08:00) rather than
// timestamps, because working hours are wall-clock *rules*, not instants — see
// schema.prisma. That keeps the schema out of timezone arithmetic entirely and
// pushes all of it here, into one place, where it can be tested.
//
// The whole job of this module is the conversion the schema deliberately does
// not do: given the civil date 2026-03-16 and minute 480, produce the instant
// at which the clinic's clock reads 08:00. In America/New_York that is 13:00Z
// in March and 12:00Z in July, and a hardcoded -04:00 gets one of those right
// and the other silently wrong for eight months of the year.
//
// Nothing here reads `env`. The zone is an argument, so tests can drive
// America/New_York regardless of the machine they run on — and a second clinic
// in a second zone would need no change.

/** A civil date in the clinic's calendar. No time, no zone, no instant. */
export type ClinicDate = { year: number; month: number; day: number }

/**
 * The seven values of the schema's `Weekday` enum, indexed by
 * `Date.getUTCDay()` — which is 0 for Sunday.
 */
const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const

export type Weekday = (typeof WEEKDAYS)[number]

export type ClinicCalendar = {
  readonly timeZone: string
  clinicInstant(date: ClinicDate, minuteOfDay: number): Date
  today(): ClinicDate
  addDays(date: ClinicDate, days: number): ClinicDate
  weekdayOf(date: ClinicDate): Weekday
  iso(date: ClinicDate): string
}

/** Pull one numeric field out of formatToParts without indexing blindly. */
function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
  timeZone: string,
): number {
  const found = parts.find((p) => p.type === type)
  if (!found) throw new Error(`Intl produced no "${type}" part for ${timeZone}`)
  return Number(found.value)
}

/**
 * Civil date arithmetic. Free-standing because it involves no clock at all —
 * `Date.UTC` normalises out-of-range days, so adding 8 to the 27th rolls the
 * month, and there is no time-of-day for DST to act on.
 */
export function addDays(date: ClinicDate, days: number): ClinicDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** The schema's `Weekday` for a civil date. Also zone-free, for the same reason. */
export function weekdayOf(date: ClinicDate): Weekday {
  const index = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
  // Every index 0-6 is in range; the assertion is for the compiler, not for us.
  return WEEKDAYS[index] as Weekday
}

/** `2026-09-07`. */
export function iso(date: ClinicDate): string {
  const month = String(date.month).padStart(2, '0')
  const day = String(date.day).padStart(2, '0')
  return `${date.year}-${month}-${day}`
}

/**
 * Build a calendar bound to one IANA timezone.
 *
 * A factory rather than free functions taking a zone: `Intl.DateTimeFormat` is
 * expensive to construct and the availability engine calls this once per
 * working-hours row per date per provider. One formatter, reused.
 */
export function createClinicCalendar(timeZone: string): ClinicCalendar {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  /** How far ahead of UTC the clinic's clock is running at a given instant. */
  function zoneOffsetMs(instant: Date): number {
    const parts = formatter.formatToParts(instant)
    const wallClockAsIfUtc = Date.UTC(
      part(parts, 'year', timeZone),
      part(parts, 'month', timeZone) - 1,
      part(parts, 'day', timeZone),
      part(parts, 'hour', timeZone),
      part(parts, 'minute', timeZone),
      part(parts, 'second', timeZone),
    )
    return wallClockAsIfUtc - instant.getTime()
  }

  return {
    timeZone,

    /**
     * The instant at which the clinic's clock reads `date` at `minuteOfDay`
     * (minutes from midnight, matching WorkingHours).
     *
     * Two passes: guess the instant by pretending the wall clock is UTC,
     * measure the real offset there, correct, then measure again. The second
     * pass matters only near a DST boundary, where the first guess can land on
     * the wrong side of the transition and read an offset an hour off.
     */
    clinicInstant(date, minuteOfDay) {
      // Date.UTC normalises out-of-range values, so minute 780 is simply 13:00
      // and minute 1440 is midnight the following day.
      const wallClock = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay)
      const firstGuess = wallClock - zoneOffsetMs(new Date(wallClock))
      return new Date(wallClock - zoneOffsetMs(new Date(firstGuess)))
    },

    /** Today's date on the clinic's calendar — not the server's. */
    today() {
      const parts = formatter.formatToParts(new Date())
      return {
        year: part(parts, 'year', timeZone),
        month: part(parts, 'month', timeZone),
        day: part(parts, 'day', timeZone),
      }
    },

    addDays,
    weekdayOf,
    iso,
  }
}
