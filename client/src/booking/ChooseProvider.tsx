// Step two: who with.
//
// The list comes from the catalogue, not from the availability response.
// Availability names only providers with a free slot in the window, so building
// the picker from it would erase a fully-booked dentist rather than show them
// as busy — the patient would never learn they exist. See `providersWhoPerform`.

import type { CatalogueService } from '@dental/shared'
import { useProviders } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Skeleton } from '@/components/ui/skeleton'
import { providerInitials, providerName, providerRole } from '@/lib/format'
import { providersWhoPerform } from './slots'
import { ANY_PROVIDER } from './use-booking-params'

type Props = {
  service: CatalogueService | undefined
  onChoose: (providerId: string) => void
}

export function ChooseProvider({ service, onChoose }: Props) {
  const { data, isPending, isError, refetch } = useProviders()

  if (isError) return <LoadFailed what="our providers" onRetry={() => void refetch()} />

  const eligible = providersWhoPerform(data?.providers ?? [], service?.providerType)

  return (
    <section aria-labelledby="choose-provider">
      <h2 id="choose-provider" className="font-display text-xl font-bold tracking-tight">
        Who would you like to see?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {/* Not a nudge for the clinic's convenience: with five providers and one
            treatment, insisting on a name is usually what pushes a booking into
            next week. */}
        Leaving it open usually finds you an earlier appointment.
      </p>

      <ul className="mt-6 space-y-3">
        <li>
          <button
            type="button"
            onClick={() => onChoose(ANY_PROVIDER)}
            className="w-full rounded-card border border-border bg-card p-5 text-left transition-colors hover:border-primary"
          >
            <span className="font-display text-base font-bold tracking-tight">
              Anyone available
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              We&rsquo;ll book you with whoever is free at the time you pick.
            </p>
          </button>
        </li>

        {isPending
          ? Array.from({ length: 3 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-24 w-full rounded-card" />
              </li>
            ))
          : eligible.map((provider) => (
              <li key={provider.id}>
                <button
                  type="button"
                  onClick={() => onChoose(provider.id)}
                  className="flex w-full items-start gap-4 rounded-card border border-border bg-card p-5 text-left transition-colors hover:border-primary"
                >
                  <span
                    aria-hidden="true"
                    className="font-display grid size-12 shrink-0 place-items-center rounded-pill bg-accent text-base font-bold text-accent-foreground"
                  >
                    {providerInitials(provider)}
                  </span>

                  <span className="min-w-0">
                    <span className="font-display block text-base font-bold tracking-tight">
                      {providerName(provider)}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {provider.title ? `${provider.title} · ` : ''}
                      {providerRole(provider)}
                    </span>
                    {provider.bio && (
                      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                        {provider.bio}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
      </ul>
    </section>
  )
}
