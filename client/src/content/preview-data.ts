// TEMPORARY. Delete this file when `GET /api/services` and `GET /api/providers`
// exist — nothing here should outlive them.
//
// These are transcribed from `server/prisma/seed.ts` so the pages can be looked
// at before the endpoints are written. Transcribed data is data that can drift:
// the seed is the source of truth, this is a photocopy of it.

export type PreviewService = {
  slug: string
  name: string
  durationMins: number
  priceCents: number
  providerType: 'DENTIST' | 'HYGIENIST'
}

export const PREVIEW_SERVICES: PreviewService[] = [
  { slug: 'routine-cleaning', name: 'Routine Cleaning', durationMins: 60, priceCents: 12_000, providerType: 'HYGIENIST' },
  { slug: 'routine-exam', name: 'Routine Exam', durationMins: 30, priceCents: 8_500, providerType: 'DENTIST' },
  { slug: 'new-patient-exam', name: 'New Patient Exam & X-rays', durationMins: 45, priceCents: 15_000, providerType: 'DENTIST' },
  { slug: 'emergency-visit', name: 'Emergency Toothache Visit', durationMins: 30, priceCents: 12_000, providerType: 'DENTIST' },
  { slug: 'child-cleaning', name: 'Child Cleaning', durationMins: 45, priceCents: 9_000, providerType: 'HYGIENIST' },
  { slug: 'deep-cleaning', name: 'Deep Cleaning (per quadrant)', durationMins: 90, priceCents: 32_000, providerType: 'HYGIENIST' },
  { slug: 'composite-filling', name: 'Composite Filling', durationMins: 60, priceCents: 22_000, providerType: 'DENTIST' },
  { slug: 'tooth-extraction', name: 'Tooth Extraction (simple)', durationMins: 60, priceCents: 25_000, providerType: 'DENTIST' },
  { slug: 'root-canal', name: 'Root Canal (single canal)', durationMins: 120, priceCents: 95_000, providerType: 'DENTIST' },
  { slug: 'crown-preparation', name: 'Crown Preparation', durationMins: 90, priceCents: 130_000, providerType: 'DENTIST' },
]

export type PreviewProvider = {
  id: string
  firstName: string
  lastName: string
  title: string
  type: 'DENTIST' | 'HYGIENIST'
  bio: string
}

export const PREVIEW_PROVIDERS: PreviewProvider[] = [
  {
    id: 'osei',
    firstName: 'Amara',
    lastName: 'Osei',
    title: 'DDS',
    type: 'DENTIST',
    bio: 'General and restorative dentistry, with a focus on nervous patients.',
  },
  {
    id: 'reyes',
    firstName: 'Daniel',
    lastName: 'Reyes',
    title: 'DDS',
    type: 'DENTIST',
    bio: 'Endodontics and crown work. Fifteen years in single-visit root canal therapy.',
  },
  {
    id: 'raman',
    firstName: 'Priya',
    lastName: 'Raman',
    title: 'DDS',
    type: 'DENTIST',
    bio: 'Family dentistry. Holds the clinic’s Saturday morning list.',
  },
  {
    id: 'clarke',
    firstName: 'Naomi',
    lastName: 'Clarke',
    title: 'RDH',
    type: 'HYGIENIST',
    bio: 'Preventive care and periodontal maintenance.',
  },
  {
    id: 'vela',
    firstName: 'Tomas',
    lastName: 'Vela',
    title: 'RDH',
    type: 'HYGIENIST',
    bio: 'Hygiene and patient education. Works Mondays, Wednesdays and Fridays.',
  },
]

/** List price before insurance — ADR-0003: the system records a plan, it cannot compute a share. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

export function initialsOf(provider: PreviewProvider): string {
  return `${provider.firstName[0]}${provider.lastName[0]}`
}
