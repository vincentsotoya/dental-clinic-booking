// Dentists. The directory, read from `GET /api/providers`.
//
// A grid, not the horizontal strip Home uses: on the page that exists to show
// everyone, putting three of five off-screen behind a scroll hides the answer.
// The strip is a preview device, and its real second home is the booking flow's
// provider step.

import type { CatalogueProvider } from '@dental/shared'
import { Link } from 'react-router'
import { useProviders } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { numberWord, providerInitials, providerName, providerRole } from '@/lib/format'

export default function Dentists() {
  const { data, isPending, isError, refetch } = useProviders()

  const providers = data?.providers ?? []
  const dentists = providers.filter((p) => p.type === 'DENTIST').length
  const hygienists = providers.filter((p) => p.type === 'HYGIENIST').length

  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-20">
      <h1 className="font-display max-w-3xl text-4xl leading-[1] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">
        {/* Counted, not asserted — a provider who leaves used to leave this
            heading lying about the size of the practice. */}
        {isPending || isError ? (
          <>
            Meet <span className="text-primary">the team</span>
          </>
        ) : (
          <>
            {numberWord(dentists)} dentist{dentists === 1 ? '' : 's'},{' '}
            <span className="text-primary">
              {numberWord(hygienists)} hygienist{hygienists === 1 ? '' : 's'}
            </span>
          </>
        )}
      </h1>
      <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
        You can book with whoever you like. If you don&rsquo;t mind, leaving it open usually finds
        you an earlier appointment.
      </p>

      {isError ? (
        <div className="mt-12">
          <LoadFailed what="our providers" onRetry={() => void refetch()} />
        </div>
      ) : (
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending
            ? Array.from({ length: 5 }, (_, i) => (
                <li key={i}>
                  <div className="flex h-full flex-col gap-4 rounded-card border border-border bg-card p-6">
                    <Skeleton className="size-14 rounded-pill" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                  </div>
                </li>
              ))
            : providers.map((provider) => (
                <li key={provider.id}>
                  <ProviderProfile provider={provider} />
                </li>
              ))}
        </ul>
      )}

      <div className="mt-14 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-6">
        <p className="flex-1 text-sm text-muted-foreground">
          Booking starts with the treatment, so we only offer you providers who perform it.
        </p>
        <Button asChild className="rounded-pill">
          <Link to="/book">Book an appointment</Link>
        </Button>
      </div>
    </div>
  )
}

function ProviderProfile({ provider }: { provider: CatalogueProvider }) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-card border border-border bg-card p-6">
      {/* Monogram, not a portrait — PRODUCT.md forbids a stock face under a
          fictional provider's name. */}
      <span
        aria-hidden="true"
        className="font-display grid size-14 place-items-center rounded-pill bg-accent text-lg font-bold text-accent-foreground"
      >
        {providerInitials(provider)}
      </span>

      <div>
        <h2 className="font-display text-lg font-bold tracking-tight">{providerName(provider)}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {/* `title` is nullable: a provider the front desk added in a hurry has
              none, and the separator would otherwise dangle. */}
          {provider.title ? `${provider.title} · ` : ''}
          {providerRole(provider)}
        </p>
      </div>

      {provider.bio ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{provider.bio}</p>
      ) : null}
    </article>
  )
}
