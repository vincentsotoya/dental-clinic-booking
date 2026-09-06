// Home. Previews Services and Dentists rather than containing them — each has
// its own route, so a link can be sent to either.
//
// Every count on this page is read from the catalogue. They were written into
// the markup while the data was a transcript, and a page that says "ten
// treatments" beside a list of nine is worse than one that says neither.

import { Link } from 'react-router'
import { useProviders, useServices } from '@/api/hooks'
import { ProviderStrip } from '@/components/ProviderStrip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatPrice, numberWord, providerRole } from '@/lib/format'

/**
 * The four treatments the front page leads with — an editorial choice, not the
 * first four the API happened to return. Anything missing (retired, or the
 * catalogue not loaded) is backfilled from the top of the list.
 */
const FEATURED = ['routine-cleaning', 'routine-exam', 'new-patient-exam', 'emergency-visit']

export default function Home() {
  const services = useServices()
  const providers = useProviders()

  const all = services.data?.services ?? []
  const featured = [
    ...FEATURED.map((slug) => all.find((s) => s.slug === slug)).filter((s) => s !== undefined),
    ...all.filter((s) => !FEATURED.includes(s.slug)),
  ].slice(0, 4)

  const team = providers.data?.providers ?? []
  const dentists = team.filter((p) => p.type === 'DENTIST').length
  const hygienists = team.length - dentists

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
            <Link to="/book">Book an appointment</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-pill">
            <Link to="/services">See our treatments</Link>
          </Button>
        </div>

        <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          {/* An em dash while the count is unknown: a "0" that resolves to "5" a
              moment later is a number the page never meant. */}
          <Stat value={team.length ? String(team.length) : '—'} label="Dentists & hygienists" />
          <Stat value={all.length ? String(all.length) : '—'} label="Bookable treatments" />
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
                {team.length
                  ? `${cap(numberWord(dentists))} dentist${plural(dentists)} and ${numberWord(hygienists)} hygienist${plural(hygienists)}.`
                  : 'Our dentists and hygienists.'}{' '}
                You can choose, or let us pick whoever is free soonest.
              </p>
            </div>
            {team.length > 0 && (
              <Link to="/dentists" className="text-sm font-medium text-primary hover:underline">
                All {numberWord(team.length)} &rarr;
              </Link>
            )}
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
            {all.length > 0 && (
              <Link to="/services" className="text-sm font-medium text-primary hover:underline">
                All {numberWord(all.length)} &rarr;
              </Link>
            )}
          </div>

          {/* The front page stays quiet when the catalogue fails: a visitor can do
              nothing about it here, and /services is where it is explained. */}
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {services.isPending
              ? Array.from({ length: 4 }, (_, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-4 rounded-card border border-border bg-card p-5"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-5 w-44" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </li>
                ))
              : featured.map((service) => (
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
                        {providerRole({ type: service.providerType })}
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

const plural = (n: number) => (n === 1 ? '' : 's')
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-3xl font-extrabold tracking-tight">{value}</dd>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
