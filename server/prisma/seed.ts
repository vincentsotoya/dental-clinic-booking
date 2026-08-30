// Seed data for the fictional clinic.
//
// Run with `npx prisma db seed` from server/ — prisma.config.ts wires it to
// `tsx prisma/seed.ts`.
//
// Two things make this more than a bag of sample rows:
//
//   1. Every id is hardcoded and the seed wipes before it inserts, so a reseed
//      is idempotent AND stable. Phase 2's curl commands and test fixtures can
//      name a specific appointment and still be right tomorrow.
//   2. The clinic is deliberately awkward. A lunch gap in every weekday, a
//      part-time hygienist, a Saturday-only window with no lunch, a fully
//      booked day, and a pair of appointments touching exactly at a buffer
//      boundary. Phase 2's availability engine is interval subtraction; a tidy
//      clinic would let naive arithmetic pass every test.

import { prisma } from '../src/db'
import { env } from '../src/env'
import type { Prisma } from '../generated/prisma/client'
import { createClinicCalendar, type ClinicDate } from '../src/services/clinic-time'

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

// Hardcoded rather than generated. Stable ids survive a reseed, which is the
// whole point of wipe-then-insert: anything written against this data in a
// later phase keeps working.

const operatoryIds = {
  one: '0a3d1c00-0000-4000-8000-000000000001',
  two: '0a3d1c00-0000-4000-8000-000000000002',
  three: '0a3d1c00-0000-4000-8000-000000000003',
} as const

const providerIds = {
  osei: '1b4e2d00-0000-4000-8000-000000000001',
  reyes: '1b4e2d00-0000-4000-8000-000000000002',
  raman: '1b4e2d00-0000-4000-8000-000000000003',
  clarke: '1b4e2d00-0000-4000-8000-000000000004',
  vela: '1b4e2d00-0000-4000-8000-000000000005',
} as const

const patientIds = {
  marsh: '2c5f3e00-0000-4000-8000-000000000001',
  nakamura: '2c5f3e00-0000-4000-8000-000000000002',
} as const

const appointmentIds = {
  cleaningMon: '4e716000-0000-4000-8000-000000000001',
  childCleaningMon: '4e716000-0000-4000-8000-000000000002',
  rootCanalTue: '4e716000-0000-4000-8000-000000000003',
  crownTue: '4e716000-0000-4000-8000-000000000004',
  examTue: '4e716000-0000-4000-8000-000000000005',
  crownWedAm1: '4e716000-0000-4000-8000-000000000006',
  crownWedAm2: '4e716000-0000-4000-8000-000000000007',
  rootCanalWedPm: '4e716000-0000-4000-8000-000000000008',
  extractionWedPm: '4e716000-0000-4000-8000-000000000009',
  newPatientFri: '4e716000-0000-4000-8000-00000000000a',
} as const

// ---------------------------------------------------------------------------
// The clinic calendar
// ---------------------------------------------------------------------------

// WorkingHours are integers and dodge timezones entirely (see schema.prisma).
// Appointments cannot: they are real `timestamptz` instants that have to land
// on the right *wall clock* in the clinic's zone. That conversion lives in
// `src/services/clinic-time.ts`, shared with the availability engine — the
// offset is resolved from the zone itself rather than hardcoded as -04:00,
// because hardcoding an offset is precisely the bug Phase 2's DST test exists
// to catch.

const calendar = createClinicCalendar(env.CLINIC_TIMEZONE)
const { clinicInstant, addDays, iso } = calendar

/**
 * The Monday after today, always strictly in the future.
 *
 * Fixed calendar dates would rot: within a few weeks every seeded appointment
 * would be in the past and an availability query would find an empty clinic.
 * Anchoring the week to the next Monday keeps the data permanently just ahead
 * of now while the ids stay fixed.
 */
function nextMonday(): ClinicDate {
  const today = calendar.today()
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
  return addDays(today, (8 - weekday) % 7 || 7)
}

// ---------------------------------------------------------------------------
// Working-hours windows
// ---------------------------------------------------------------------------

// Minutes from midnight. Two weekday windows because the clinic closes for
// lunch — see docs/database-design.md.
const MORNING = { startMinute: 480, endMinute: 720 } // 08:00–12:00
const AFTERNOON = { startMinute: 780, endMinute: 1020 } // 13:00–17:00
const SATURDAY = { startMinute: 540, endMinute: 780 } // 09:00–13:00, unbroken

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

// Buffers deliberately span 10–30 minutes: a uniform buffer would let the
// availability engine hardcode one number and still look correct. Prices are
// integer cents — never a float (schema.prisma). providerType follows
// ADR-0002: a cleaning is a hygienist service, and the dentist's exam is a
// separate bookable service rather than something that overlaps it.

type ServiceSeed = {
  id: string
  name: string
  slug: string
  description: string
  durationMins: number
  bufferMins: number
  priceCents: number
  providerType: 'DENTIST' | 'HYGIENIST'
}

const services = {
  routineCleaning: {
    id: '3d604f00-0000-4000-8000-000000000001',
    name: 'Routine Cleaning',
    slug: 'routine-cleaning',
    description: 'Scale, polish and fluoride for a healthy mouth. The standard six-month visit.',
    durationMins: 60,
    bufferMins: 15,
    priceCents: 12_000,
    providerType: 'HYGIENIST',
  },
  deepCleaning: {
    id: '3d604f00-0000-4000-8000-000000000002',
    name: 'Deep Cleaning (per quadrant)',
    slug: 'deep-cleaning',
    description: 'Scaling and root planing below the gumline, one quadrant at a time.',
    durationMins: 90,
    bufferMins: 20,
    priceCents: 32_000,
    providerType: 'HYGIENIST',
  },
  childCleaning: {
    id: '3d604f00-0000-4000-8000-000000000003',
    name: 'Child Cleaning',
    slug: 'child-cleaning',
    description: 'A shorter, gentler cleaning for patients under twelve.',
    durationMins: 45,
    bufferMins: 15,
    priceCents: 9_000,
    providerType: 'HYGIENIST',
  },
  newPatientExam: {
    id: '3d604f00-0000-4000-8000-000000000004',
    name: 'New Patient Exam & X-rays',
    slug: 'new-patient-exam',
    description: 'Full assessment, digital X-rays and a treatment plan for your first visit.',
    durationMins: 45,
    bufferMins: 15,
    priceCents: 15_000,
    providerType: 'DENTIST',
  },
  routineExam: {
    id: '3d604f00-0000-4000-8000-000000000005',
    name: 'Routine Exam',
    slug: 'routine-exam',
    description:
      'A dentist checks teeth, gums and existing work. Booked separately from a cleaning.',
    durationMins: 30,
    bufferMins: 10,
    priceCents: 8_500,
    providerType: 'DENTIST',
  },
  emergencyVisit: {
    id: '3d604f00-0000-4000-8000-000000000006',
    name: 'Emergency Toothache Visit',
    slug: 'emergency-visit',
    description: 'Same-week assessment and pain relief for a tooth that will not wait.',
    durationMins: 30,
    bufferMins: 15,
    priceCents: 12_000,
    providerType: 'DENTIST',
  },
  compositeFilling: {
    id: '3d604f00-0000-4000-8000-000000000007',
    name: 'Composite Filling',
    slug: 'composite-filling',
    description: 'Tooth-coloured restoration for a single cavity.',
    durationMins: 60,
    bufferMins: 20,
    priceCents: 22_000,
    providerType: 'DENTIST',
  },
  crownPrep: {
    id: '3d604f00-0000-4000-8000-000000000008',
    name: 'Crown Preparation',
    slug: 'crown-preparation',
    description:
      'Shaping, impressions and a temporary crown. The lab-made crown is fitted later.',
    durationMins: 90,
    bufferMins: 30,
    priceCents: 130_000,
    providerType: 'DENTIST',
  },
  rootCanal: {
    id: '3d604f00-0000-4000-8000-000000000009',
    name: 'Root Canal (single canal)',
    slug: 'root-canal',
    description: 'Removal of infected pulp, cleaning and sealing of one canal.',
    durationMins: 120,
    bufferMins: 30,
    priceCents: 95_000,
    providerType: 'DENTIST',
  },
  extraction: {
    id: '3d604f00-0000-4000-8000-00000000000a',
    name: 'Tooth Extraction (simple)',
    slug: 'tooth-extraction',
    description: 'Removal of a visible tooth under local anaesthetic, with aftercare instructions.',
    durationMins: 60,
    bufferMins: 30,
    priceCents: 25_000,
    providerType: 'DENTIST',
  },
} as const satisfies Record<string, ServiceSeed>

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/**
 * Build one appointment row, deriving the two times that must agree with the
 * service.
 *
 * `blockedUntil` is not decoration: `CHECK appointments_blocked_until_honest`
 * rejects any row where it is not exactly `endsAt + bufferMins`, and
 * `bufferMins` is snapshotted from the service so that editing a Service later
 * cannot retroactively move an appointment already on the books (ADR-0004).
 */
function appointmentRow(args: {
  id: string
  patientId: string
  providerId: string
  operatoryId: string
  service: ServiceSeed
  date: ClinicDate
  startMinute: number
  notes?: string
}): Prisma.AppointmentCreateManyInput {
  const { service, date, startMinute } = args
  const endMinute = startMinute + service.durationMins
  return {
    id: args.id,
    patientId: args.patientId,
    providerId: args.providerId,
    serviceId: service.id,
    operatoryId: args.operatoryId,
    startsAt: clinicInstant(date, startMinute),
    endsAt: clinicInstant(date, endMinute),
    blockedUntil: clinicInstant(date, endMinute + service.bufferMins),
    bufferMins: service.bufferMins,
    status: 'CONFIRMED',
    ...(args.notes === undefined ? {} : { notes: args.notes }),
  }
}

// ---------------------------------------------------------------------------
// The seed
// ---------------------------------------------------------------------------

async function main() {
  const monday = nextMonday()
  const tuesday = addDays(monday, 1)
  const wednesday = addDays(monday, 2)
  const thursday = addDays(monday, 3)
  const friday = addDays(monday, 4)
  const trainingDay = addDays(monday, 8) // Tuesday of the following week

  // Wipe first. Appointments lead because every one of their foreign keys is
  // onDelete: Restrict — nothing they point at can go while they exist.
  // WorkingHours and TimeOff would cascade from Provider, but are deleted
  // explicitly so this list reads as the dependency order it is.
  await prisma.appointment.deleteMany()
  await prisma.workingHours.deleteMany()
  await prisma.timeOff.deleteMany()
  await prisma.clinicClosure.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.service.deleteMany()
  await prisma.operatory.deleteMany()
  await prisma.provider.deleteMany()

  // --- Rooms --------------------------------------------------------------
  // Interchangeable on purpose: Phase 2 picks whichever is free, so the room
  // is never something the patient chooses.
  await prisma.operatory.createMany({
    data: [
      { id: operatoryIds.one, name: 'Operatory 1' },
      { id: operatoryIds.two, name: 'Operatory 2' },
      { id: operatoryIds.three, name: 'Operatory 3' },
    ],
  })

  // --- Providers ----------------------------------------------------------
  await prisma.provider.createMany({
    data: [
      {
        id: providerIds.osei,
        type: 'DENTIST',
        firstName: 'Amara',
        lastName: 'Osei',
        title: 'DDS',
        bio: 'General and restorative dentistry, with a focus on nervous patients.',
      },
      {
        id: providerIds.reyes,
        type: 'DENTIST',
        firstName: 'Daniel',
        lastName: 'Reyes',
        title: 'DDS',
        bio: 'Endodontics and crown work. Fifteen years in single-visit root canal therapy.',
      },
      {
        id: providerIds.raman,
        type: 'DENTIST',
        firstName: 'Priya',
        lastName: 'Raman',
        title: 'DDS',
        bio: 'Family dentistry. Holds the clinic’s Saturday morning list.',
      },
      {
        id: providerIds.clarke,
        type: 'HYGIENIST',
        firstName: 'Naomi',
        lastName: 'Clarke',
        title: 'RDH',
        bio: 'Preventive care and periodontal maintenance.',
      },
      {
        id: providerIds.vela,
        type: 'HYGIENIST',
        firstName: 'Tomas',
        lastName: 'Vela',
        title: 'RDH',
        bio: 'Hygiene and patient education. Works Mondays, Wednesdays and Fridays.',
      },
    ],
  })

  // --- Services -----------------------------------------------------------
  await prisma.service.createMany({ data: Object.values(services) })

  // --- Patients -----------------------------------------------------------
  // One insured, one not. Insurance is recorded and never adjudicated
  // (ADR-0003) — both are quoted the same cash price.
  await prisma.patient.createMany({
    data: [
      {
        id: patientIds.marsh,
        firstName: 'Elena',
        lastName: 'Marsh',
        email: 'elena.marsh@example.com',
        phone: '+1-555-0142',
        dateOfBirth: new Date('1988-04-17'),
        recallIntervalMonths: 6,
        insuranceProvider: 'Northlake Dental Plan',
        insuranceMemberId: 'NDP-4471902',
      },
      {
        id: patientIds.nakamura,
        firstName: 'Victor',
        lastName: 'Nakamura',
        email: 'victor.nakamura@example.com',
        phone: '+1-555-0198',
        dateOfBirth: new Date('1975-11-02'),
        recallIntervalMonths: 12,
      },
    ],
  })

  // --- Working hours ------------------------------------------------------
  // Deliberately not uniform. Three shapes the availability engine has to
  // handle separately:
  //   · the standard two-window weekday, with a lunch gap to subtract around
  //   · a provider who does not work on a day the clinic is open
  //   · a single unbroken window, so no code may assume every day has a gap
  const workingHours: Prisma.WorkingHoursCreateManyInput[] = []

  for (const providerId of [providerIds.osei, providerIds.reyes, providerIds.clarke]) {
    for (const weekday of WEEKDAYS) {
      workingHours.push({ providerId, weekday, ...MORNING })
      workingHours.push({ providerId, weekday, ...AFTERNOON })
    }
  }

  // Raman: the full week plus the Saturday list, which has no lunch break.
  for (const weekday of WEEKDAYS) {
    workingHours.push({ providerId: providerIds.raman, weekday, ...MORNING })
    workingHours.push({ providerId: providerIds.raman, weekday, ...AFTERNOON })
  }
  workingHours.push({ providerId: providerIds.raman, weekday: 'SATURDAY', ...SATURDAY })

  // Vela: part-time. Tuesday and Thursday are open at the clinic but closed
  // for this hygienist — availability is per provider, not per clinic.
  for (const weekday of ['MONDAY', 'WEDNESDAY', 'FRIDAY'] as const) {
    workingHours.push({ providerId: providerIds.vela, weekday, ...MORNING })
    workingHours.push({ providerId: providerIds.vela, weekday, ...AFTERNOON })
  }

  await prisma.workingHours.createMany({ data: workingHours })

  // --- Time off and closures ----------------------------------------------
  // On different days on purpose. If Phase 2 subtracts one and not the other,
  // overlapping them would hide the bug.
  await prisma.timeOff.create({
    data: {
      providerId: providerIds.raman,
      startsAt: clinicInstant(thursday, 0),
      endsAt: clinicInstant(thursday, 1440),
      reason: 'Continuing education',
    },
  })

  await prisma.clinicClosure.create({
    data: {
      startsAt: clinicInstant(trainingDay, 0),
      endsAt: clinicInstant(trainingDay, 1440),
      reason: 'Staff training day',
    },
  })

  // --- Appointments -------------------------------------------------------
  // Shapes chosen to break a careless availability engine. Written last,
  // because every one of them points at four rows above.
  const appointments: Prisma.AppointmentCreateManyInput[] = [
    // Monday, Operatory 1, Clarke. The second starts at exactly the first's
    // blockedUntil (09:15). Legal only because tstzrange bounds are '[)' — if
    // the constraints used '[]' this pair would be rejected, which makes these
    // two rows a standing test of the schema.
    appointmentRow({
      id: appointmentIds.cleaningMon,
      patientId: patientIds.marsh,
      providerId: providerIds.clarke,
      operatoryId: operatoryIds.one,
      service: services.routineCleaning,
      date: monday,
      startMinute: 480, // 08:00 → ends 09:00, blocked until 09:15
    }),
    appointmentRow({
      id: appointmentIds.childCleaningMon,
      patientId: patientIds.nakamura,
      providerId: providerIds.clarke,
      operatoryId: operatoryIds.one,
      service: services.childCleaning,
      date: monday,
      startMinute: 555, // 09:15 → starts the instant the buffer above ends
      notes: 'Back-to-back with the 08:00 cleaning; no gap by design.',
    }),

    // Tuesday, Operatory 2, Osei. A long treatment eating most of the morning,
    // then an afternoon crown that leaves two 60-minute gaps — too small for a
    // 90-minute service, wide enough for a 30-minute one.
    appointmentRow({
      id: appointmentIds.rootCanalTue,
      patientId: patientIds.nakamura,
      providerId: providerIds.osei,
      operatoryId: operatoryIds.two,
      service: services.rootCanal,
      date: tuesday,
      startMinute: 480, // 08:00 → ends 10:00, blocked until 10:30
    }),
    appointmentRow({
      id: appointmentIds.crownTue,
      patientId: patientIds.marsh,
      providerId: providerIds.osei,
      operatoryId: operatoryIds.two,
      service: services.crownPrep,
      date: tuesday,
      startMinute: 840, // 14:00 → ends 15:30, blocked until 16:00
    }),

    // Tuesday again — a day Vela does not work at all. A dentist is still
    // bookable, so an engine that keys availability off the clinic rather than
    // the provider gets this day wrong in both directions.
    appointmentRow({
      id: appointmentIds.examTue,
      patientId: patientIds.nakamura,
      providerId: providerIds.reyes,
      operatoryId: operatoryIds.one,
      service: services.routineExam,
      date: tuesday,
      startMinute: 540, // 09:00 → ends 09:30, blocked until 09:40
    }),

    // Wednesday, Operatory 3, Reyes: both windows filled edge to edge. A
    // provider with working hours and zero remaining availability.
    //   morning   480 →(120)→ 600 →(120)→ 720
    //   afternoon 780 →(150)→ 930 →(90)→ 1020
    appointmentRow({
      id: appointmentIds.crownWedAm1,
      patientId: patientIds.marsh,
      providerId: providerIds.reyes,
      operatoryId: operatoryIds.three,
      service: services.crownPrep,
      date: wednesday,
      startMinute: 480,
    }),
    appointmentRow({
      id: appointmentIds.crownWedAm2,
      patientId: patientIds.nakamura,
      providerId: providerIds.reyes,
      operatoryId: operatoryIds.three,
      service: services.crownPrep,
      date: wednesday,
      startMinute: 600,
    }),
    appointmentRow({
      id: appointmentIds.rootCanalWedPm,
      patientId: patientIds.marsh,
      providerId: providerIds.reyes,
      operatoryId: operatoryIds.three,
      service: services.rootCanal,
      date: wednesday,
      startMinute: 780,
    }),
    appointmentRow({
      id: appointmentIds.extractionWedPm,
      patientId: patientIds.nakamura,
      providerId: providerIds.reyes,
      operatoryId: operatoryIds.three,
      service: services.extraction,
      date: wednesday,
      startMinute: 930,
      notes: 'Fills the afternoon window exactly — Reyes has no Wednesday availability left.',
    }),

    // Friday, so the week is not empty after Wednesday.
    appointmentRow({
      id: appointmentIds.newPatientFri,
      patientId: patientIds.marsh,
      providerId: providerIds.osei,
      operatoryId: operatoryIds.one,
      service: services.newPatientExam,
      date: friday,
      startMinute: 780, // 13:00, the first slot after lunch
    }),
  ]

  await prisma.appointment.createMany({ data: appointments })

  // --- Report -------------------------------------------------------------
  console.log('Seeded dental_clinic:')
  console.log(`  operatories     ${await prisma.operatory.count()}`)
  console.log(`  providers       ${await prisma.provider.count()}`)
  console.log(`  services        ${await prisma.service.count()}`)
  console.log(`  patients        ${await prisma.patient.count()}`)
  console.log(`  working hours   ${await prisma.workingHours.count()}`)
  console.log(`  time off        ${await prisma.timeOff.count()}`)
  console.log(`  clinic closures ${await prisma.clinicClosure.count()}`)
  console.log(`  appointments    ${await prisma.appointment.count()}`)
  console.log('')
  console.log(`Seeded week starts Monday ${iso(monday)} (${env.CLINIC_TIMEZONE}).`)
  console.log(`Raman is off Thursday ${iso(thursday)}; the clinic is shut ${iso(trainingDay)}.`)
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
