// Step one: which treatment.
//
// The same grouping the treatments page uses, and for the same reason — who
// performs it is what decides who can be booked for it (ADR-0002), so the
// grouping is also a preview of the next question.

import type { CatalogueService } from '@dental/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatPrice } from '@/lib/format'

type Props = {
  services: CatalogueService[]
  isPending: boolean
  onChoose: (slug: string) => void
}

export function ChooseService({ services, isPending, onChoose }: Props) {
  const hygiene = services.filter((s) => s.providerType === 'HYGIENIST')
  const dental = services.filter((s) => s.providerType === 'DENTIST')

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-card" />
        ))}
      </div>
    )
  }

  return (
    <section aria-labelledby="choose-service">
      <h2 id="choose-service" className="font-display text-xl font-bold tracking-tight">
        What do you need?
      </h2>

      <Group title="With a hygienist" services={hygiene} onChoose={onChoose} />
      <Group title="With a dentist" services={dental} onChoose={onChoose} />
    </section>
  )
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
              className="w-full rounded-card border border-border bg-card p-5 text-left transition-colors hover:border-primary"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-display text-base font-bold tracking-tight">
                  {service.name}
                </span>
                <span className="font-display text-lg font-bold tabular-nums">
                  {formatPrice(service.priceCents)}
                </span>
              </div>

              {service.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
              )}

              <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                {formatDuration(service.durationMins)} in the chair
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
