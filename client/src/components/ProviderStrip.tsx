// The horizontal provider strip.
//
// A monogram stands where a portrait would: PRODUCT.md forbids captioning a
// stock photograph with a fictional provider's name, and these five are
// fictional. Swap it for a commissioned illustration, never a stock face.
//
// Native scroll with focusable cards, not a carousel — nothing auto-advances
// and nothing captures the wheel (MOTION_INTENSITY 3).

import { PREVIEW_PROVIDERS, initialsOf, type PreviewProvider } from '../content/preview-data'

export function ProviderStrip() {
  return (
    <ul
      className="scrollbar-none -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2"
      aria-label="Our providers"
    >
      {PREVIEW_PROVIDERS.map((provider) => (
        <li key={provider.id} className="w-[15.5rem] shrink-0 snap-start sm:w-[17rem]">
          <ProviderCard provider={provider} />
        </li>
      ))}
    </ul>
  )
}

function ProviderCard({ provider }: { provider: PreviewProvider }) {
  const isDentist = provider.type === 'DENTIST'

  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="font-display grid size-12 shrink-0 place-items-center rounded-pill bg-accent text-base font-bold text-accent-foreground"
        >
          {initialsOf(provider)}
        </span>
        <div className="min-w-0">
          <h3 className="font-display truncate text-base font-bold tracking-tight">
            {isDentist ? 'Dr ' : ''}
            {provider.firstName} {provider.lastName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {provider.title} · {isDentist ? 'Dentist' : 'Hygienist'}
          </p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{provider.bio}</p>
    </article>
  )
}
