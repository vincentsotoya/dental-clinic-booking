// The horizontal provider strip, read from `GET /api/providers`.
//
// A monogram stands where a portrait would: PRODUCT.md forbids captioning a
// stock photograph with a fictional provider's name, and these five are
// fictional. Swap it for a commissioned illustration, never a stock face.
//
// Native scroll with focusable cards, not a carousel — nothing auto-advances
// and nothing captures the wheel (MOTION_INTENSITY 3).
//
// It fetches its own providers rather than taking them as a prop. The query is
// cached under one key, so Home rendering this beside nothing else costs one
// request, and the Dentists page reuses the same cached answer.

import type { CatalogueProvider } from '@dental/shared'
import { useProviders } from '@/api/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { providerInitials, providerName, providerRole } from '@/lib/format'

export function ProviderStrip() {
  const { data, isPending, isError } = useProviders()

  // Home's strip is a preview, not the page's purpose. If it cannot load, the
  // section disappears rather than putting an error where a flourish was —
  // /dentists is the page that owes the visitor an explanation.
  if (isError) return null

  return (
    <ul
      className="scrollbar-none -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2"
      aria-label="Our providers"
    >
      {isPending
        ? Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="w-[15.5rem] shrink-0 snap-start sm:w-[17rem]">
              <div className="flex h-full flex-col gap-3 rounded-card border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 shrink-0 rounded-pill" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-8 w-full" />
              </div>
            </li>
          ))
        : (data?.providers ?? []).map((provider) => (
            <li key={provider.id} className="w-[15.5rem] shrink-0 snap-start sm:w-[17rem]">
              <ProviderCard provider={provider} />
            </li>
          ))}
    </ul>
  )
}

function ProviderCard({ provider }: { provider: CatalogueProvider }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="font-display grid size-12 shrink-0 place-items-center rounded-pill bg-accent text-base font-bold text-accent-foreground"
        >
          {providerInitials(provider)}
        </span>
        <div className="min-w-0">
          <h3 className="font-display truncate text-base font-bold tracking-tight">
            {providerName(provider)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {provider.title ? `${provider.title} · ` : ''}
            {providerRole(provider)}
          </p>
        </div>
      </div>
      {provider.bio ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{provider.bio}</p>
      ) : null}
    </article>
  )
}
