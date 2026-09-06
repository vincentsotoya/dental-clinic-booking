// Services. The price list, read from `GET /api/services`.
//
// The headline counts what the endpoint returned rather than stating a number
// written into the page: a retired treatment used to leave the heading claiming
// ten of them.

import type { CatalogueService } from '@dental/shared'
import { Link } from 'react-router'
import { useServices } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatPrice, numberWord } from '@/lib/format'

export default function Services() {
  const { data, isPending, isError, refetch } = useServices()

  const services = data?.services ?? []
  const hygiene = services.filter((s) => s.providerType === 'HYGIENIST')
  const dental = services.filter((s) => s.providerType === 'DENTIST')

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-20">
      <h1 className="font-display max-w-3xl text-4xl leading-[1] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">
        {isPending || isError ? 'Our treatments' : `${numberWord(services.length)} treatments`}
        {', '}
        <span className="text-primary">one honest price list</span>
      </h1>
      <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
        These are list prices before insurance. We record your plan on your chart, but we
        don&rsquo;t estimate what it will cover — a number we invented would be worth less to you
        than the one your insurer gives.
      </p>

      {isError ? (
        <div className="mt-12">
          <LoadFailed what="our treatments" onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
          {/* Grouped by who performs it, because that is what decides who you can
              book with — ADR-0002 keeps cleaning and exam separately bookable. */}
          <ServiceGroup
            title="With a hygienist"
            blurb="Cleaning and preventive care."
            services={hygiene}
            isPending={isPending}
          />
          <ServiceGroup
            title="With a dentist"
            blurb="Examination, restorative and urgent treatment."
            services={dental}
            isPending={isPending}
          />
        </>
      )}

      <div className="mt-14 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-6">
        <p className="flex-1 text-sm text-muted-foreground">
          Booking opens with the treatment, then the provider, then a real time from the calendar.
        </p>
        <Button asChild className="rounded-pill">
          <Link to="/book">Book an appointment</Link>
        </Button>
      </div>
    </div>
  )
}

function ServiceGroup({
  title,
  blurb,
  services,
  isPending,
}: {
  title: string
  blurb: string
  services: CatalogueService[]
  isPending: boolean
}) {
  // A group with nothing in it is hidden rather than shown empty: "with a
  // hygienist" above a blank card reads as a fault, not as a clinic that
  // currently employs none.
  if (!isPending && services.length === 0) return null

  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        {isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-baseline justify-between gap-6 p-5">
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-5 w-20" />
              </li>
            ))
          : services.map((service) => (
              <li
                key={service.slug}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-5"
              >
                <h3 className="font-display min-w-0 flex-1 text-base font-bold tracking-tight">
                  {service.name}
                </h3>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatDuration(service.durationMins)}
                </span>
                <span className="font-display w-20 text-right text-lg font-bold tabular-nums">
                  {formatPrice(service.priceCents)}
                </span>
              </li>
            ))}
      </ul>
    </section>
  )
}
