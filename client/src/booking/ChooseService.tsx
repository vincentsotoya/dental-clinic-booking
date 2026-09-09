// Step one: which treatment.
//
// The same grouping the treatments page uses, and for the same reason — who
// performs it is what decides who can be booked for it (ADR-0002), so the
// grouping is also a preview of the next question.
//
// Two doors sit above the list because six of the ten services are diagnoses a
// dentist makes, not things a patient can name — see `docs/booking-composition.md`.

import type { CatalogueService } from '@dental/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatPrice } from '@/lib/format'

// The order patients need these in. The catalogue answers alphabetically, which
// led with Child Cleaning and buried the emergency visit sixth. A slug missing
// from this list sorts to the end rather than disappearing.
const ORDER = [
  'routine-cleaning',
  'deep-cleaning',
  'child-cleaning',
  'routine-exam',
  'new-patient-exam',
  'emergency-visit',
  'composite-filling',
  'crown-preparation',
  'root-canal',
  'tooth-extraction',
]

// Questions, not procedure names: the two journeys where knowing the treatment
// is least likely and getting there fastest matters most. The service they lead
// to is named from the catalogue, never transcribed here.
const DOORS = [
  { slug: 'emergency-visit', question: 'In pain today?' },
  { slug: 'new-patient-exam', question: 'First visit?' },
]

type Props = {
  services: CatalogueService[]
  isPending: boolean
  onChoose: (slug: string) => void
}

export function ChooseService({ services, isPending, onChoose }: Props) {
  const hygiene = inOrder(services.filter((s) => s.providerType === 'HYGIENIST'))
  const dental = inOrder(services.filter((s) => s.providerType === 'DENTIST'))

  // A door for a retired service would offer a visit the clinic cannot deliver,
  // so they are built from the catalogue rather than assumed to exist.
  const doors = DOORS.flatMap(({ slug, question }) => {
    const service = services.find((s) => s.slug === slug)
    return service ? [{ question, service }] : []
  })

  if (isPending) {
    return (
      <div className="mt-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-card" />
        ))}
      </div>
    )
  }

  return (
    <section aria-labelledby="choose-service">
      <h2 id="choose-service" className="font-display text-xl font-bold tracking-tight">
        What do you need?
      </h2>

      {doors.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {doors.map(({ question, service }) => (
            <li key={service.slug}>
              {/* Cobalt and priceless, against neutral cards that carry a price:
                  a door has to read as a way in, not as service eleven. */}
              <button
                type="button"
                onClick={() => onChoose(service.slug)}
                className="flex h-full w-full flex-col gap-1 rounded-card border border-primary/40 bg-card p-4 text-left pressable hover:border-primary"
              >
                <span className="font-display text-base font-bold tracking-tight text-primary">
                  {question}
                </span>
                <span className="text-sm leading-snug text-muted-foreground">{service.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Group title="With a hygienist" services={hygiene} onChoose={onChoose} />
      <Group title="With a dentist" services={dental} onChoose={onChoose} />
    </section>
  )
}

function inOrder(services: CatalogueService[]): CatalogueService[] {
  const rank = (service: CatalogueService) => {
    const index = ORDER.indexOf(service.slug)
    return index === -1 ? ORDER.length : index
  }

  return [...services].sort((a, b) => rank(a) - rank(b))
}

function Group({
  title,
  services,
  onChoose,
}: {
  title: string
  services: CatalogueService[]
  onChoose: (slug: string) => void
}) {
  if (services.length === 0) return null

  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>

      <ul className="mt-3 space-y-3">
        {services.map((service) => (
          <li key={service.slug}>
            {/* The whole card is the control. A row with a button in the corner
                makes the patient aim; the row is what they are choosing. */}
            <button
              type="button"
              onClick={() => onChoose(service.slug)}
              className="w-full rounded-card border border-border bg-card p-5 text-left pressable hover:border-primary"
            >
              <span className="font-display text-lg leading-snug font-bold tracking-tight">
                {service.name}
              </span>

              {service.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
              )}

              {/* Under the name, not opposite it: an anxious patient should read
                  what the visit is before what it costs. */}
              <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                {formatDuration(service.durationMins)} in the chair · {formatPrice(service.priceCents)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
