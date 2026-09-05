// Home. Previews Services and Dentists rather than containing them — each has
// its own route, so a link can be sent to either.

import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { ProviderStrip } from '../components/ProviderStrip'
import { PREVIEW_SERVICES, formatDuration, formatPrice } from '../content/preview-data'

export default function Home() {
  const featured = PREVIEW_SERVICES.slice(0, 4)

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
        <h1 className="font-display max-w-4xl text-5xl leading-[0.95] font-extrabold tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl">
          Same-week care, <span className="text-primary">booked in seconds</span>
        </h1>

        <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
          Every time you see is read from the clinic&rsquo;s real calendar. If it is on the screen,
          it is genuinely free — no phone tag, and nothing offered that we would have to take back.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="rounded-pill">
            <Link to="/services">See our treatments</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-pill">
            <Link to="/dentists">Meet the team</Link>
          </Button>
        </div>

        {/* Deployed before the booking flow exists. Saying so is cheaper than a
            visitor discovering it by pressing the button. */}
        <p className="mt-4 text-sm text-muted-foreground">
          Choosing a time online is still being built — the treatment list and the team are ready
          to browse now.
        </p>

        <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Stat value="5" label="Dentists & hygienists" />
          <Stat value="10" label="Bookable treatments" />
          <Stat value="Sat" label="Morning list, weekly" />
          <Stat value="Live" label="Availability, not a form" />
        </dl>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Who you&rsquo;ll see
              </h2>
              <p className="mt-2 max-w-[52ch] text-muted-foreground">
                Three dentists and two hygienists. You can choose, or let us pick whoever is free
                soonest.
              </p>
            </div>
            <Link to="/dentists" className="text-sm font-medium text-primary hover:underline">
              All five &rarr;
            </Link>
          </div>

          <div className="mt-8">
            <ProviderStrip />
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                What we treat
              </h2>
              {/* ADR-0003 in the patient's own words: the system records a plan
                  and cannot compute a share, so it must not imply one. */}
              <p className="mt-2 max-w-[52ch] text-muted-foreground">
                List prices, before insurance. We record your plan — we don&rsquo;t guess what it
                will pay.
              </p>
            </div>
            <Link to="/services" className="text-sm font-medium text-primary hover:underline">
              All ten &rarr;
            </Link>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {featured.map((service) => (
              <li
                key={service.slug}
                className="flex items-baseline justify-between gap-4 rounded-card border border-border bg-card p-5"
              >
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold tracking-tight">
                    {service.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDuration(service.durationMins)} ·{' '}
                    {service.providerType === 'DENTIST' ? 'Dentist' : 'Hygienist'}
                  </p>
                </div>
                <span className="font-display shrink-0 text-lg font-bold tabular-nums">
                  {formatPrice(service.priceCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-3xl font-extrabold tracking-tight">{value}</dd>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
