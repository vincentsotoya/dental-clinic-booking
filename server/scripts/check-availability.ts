// Exercises `findAvailability` against the real seeded database.
//
// Run with `npm run db:availability --workspace=@dental/server` after a seed.
// This is not a test — it is the "prove it for real" step: the unit tests run
// the engine on fixtures, and this runs the whole path on actual rows, in the
// clinic's actual timezone, against a schema Postgres is enforcing.
//
// The last section is the point of the task: it cancels a seeded appointment,
// re-queries, and shows the slot come back. Nothing is left changed.

import { prisma } from '../src/db'
import { env } from '../src/env'
import { findAvailability } from '../src/services/availability-query'
import { addDays, type ClinicDate, createClinicCalendar, iso } from '../src/services/clinic-time'
import type { Slot } from '../src/services/availability'

const calendar = createClinicCalendar(env.CLINIC_TIMEZONE)

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.CLINIC_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.CLINIC_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `now` is pinned well before the seeded week so the lead time never hides a slot. */
const NOW = new Date(Date.now() - 24 * 60 * 60 * 1000)

function nextMonday(): ClinicDate {
  const today = calendar.today()
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
  return addDays(today, (8 - weekday) % 7 || 7)
}

async function providerNames(): Promise<Map<string, string>> {
  const rows = await prisma.provider.findMany({ select: { id: true, lastName: true } })
  return new Map(rows.map((row) => [row.id, row.lastName]))
}

function byDate(slots: readonly Slot[]): Map<string, Slot[]> {
  const grouped = new Map<string, Slot[]>()
  for (const slot of slots) {
    const key = day.format(slot.startsAt)
    grouped.set(key, [...(grouped.get(key) ?? []), slot])
  }
  return grouped
}

async function main() {
  const names = await providerNames()
  const monday = nextMonday()
  const saturday = addDays(monday, 5)
  const trainingDay = addDays(monday, 8)

  console.log(`Clinic timezone ${env.CLINIC_TIMEZONE}; seeded week starts ${iso(monday)}.\n`)

  // --- The week, per day, for a dentist service ----------------------------
  const week = await findAvailability(prisma, {
    serviceSlug: 'routine-exam',
    from: monday,
    to: saturday,
    timeZone: env.CLINIC_TIMEZONE,
    now: NOW,
  })

  console.log(`${week.service.name} — ${week.service.durationMins}m + ${week.service.bufferMins}m buffer`)
  for (const [date, slots] of byDate(week.slots)) {
    const providers = [...new Set(slots.map((slot) => names.get(slot.providerId)))].sort()
    console.log(
      `  ${date}  ${String(slots.length).padStart(3)} slots  ` +
        `${clock.format(slots[0]!.startsAt)}–${clock.format(slots.at(-1)!.startsAt)}  ` +
        `${providers.join(', ')}`,
    )
  }
  console.log('  (Saturday is Raman only; Thursday should be missing her — she is on time off)\n')

  // --- The clinic closure --------------------------------------------------
  const closed = await findAvailability(prisma, {
    serviceSlug: 'routine-exam',
    from: trainingDay,
    to: trainingDay,
    timeZone: env.CLINIC_TIMEZONE,
    now: NOW,
  })
  console.log(`Staff training day ${iso(trainingDay)}: ${closed.slots.length} slots (expected 0)\n`)

  // --- CONFIRMED only ------------------------------------------------------
  // Clarke is booked 08:00–09:15 on the seeded Monday. Cancelling that row
  // must free her 08:00 immediately, because the exclusion constraints are
  // partial on status = 'CONFIRMED' and this loader filters the same way.
  const cancelledId = '4e716000-0000-4000-8000-000000000001'
  const clarkeMonday = async () => {
    const result = await findAvailability(prisma, {
      serviceSlug: 'child-cleaning',
      from: monday,
      to: monday,
      timeZone: env.CLINIC_TIMEZONE,
      now: NOW,
    })
    return result.slots
      .filter((slot) => names.get(slot.providerId) === 'Clarke')
      .map((slot) => clock.format(slot.startsAt))
  }

  const before = await clarkeMonday()
  console.log(`Child Cleaning, Clarke, ${iso(monday)}`)
  console.log(`  with the 08:00 cleaning CONFIRMED: ${before.slice(0, 4).join(' ')} …`)

  await prisma.appointment.update({
    where: { id: cancelledId },
    data: { status: 'CANCELLED' },
  })
  const after = await clarkeMonday()
  console.log(`  after cancelling it:               ${after.slice(0, 4).join(' ')} …`)

  await prisma.appointment.update({
    where: { id: cancelledId },
    data: { status: 'CONFIRMED' },
  })
  const restored = await clarkeMonday()
  console.log(`  restored:                          ${restored.slice(0, 4).join(' ')} …`)

  const freed = after.filter((time) => !before.includes(time))
  console.log(`  cancelling freed: ${freed.join(' ') || 'nothing — WRONG'}`)
  console.log(`  restore matches original: ${JSON.stringify(restored) === JSON.stringify(before)}`)

  // --- Rejected queries ----------------------------------------------------
  console.log('')
  for (const [label, query] of [
    ['unknown service', { serviceSlug: 'teeth-whitening', from: monday, to: monday }],
    ['reversed range', { serviceSlug: 'routine-exam', from: saturday, to: monday }],
    ['range too long', { serviceSlug: 'routine-exam', from: monday, to: addDays(monday, 400) }],
  ] as const) {
    try {
      await findAvailability(prisma, { ...query, timeZone: env.CLINIC_TIMEZONE, now: NOW })
      console.log(`${label}: NOT rejected — WRONG`)
    } catch (error) {
      const code = error instanceof Error ? (error as { code?: string }).code : undefined
      console.log(`${label}: rejected as ${code}`)
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
