// Dentists. Reads from `preview-data` until `GET /api/providers` exists.
//
// A grid, not the horizontal strip Home uses: on the page that exists to show
// everyone, putting three of five off-screen behind a scroll hides the answer.
// The strip is a preview device, and its real second home is the booking flow's
// provider step.

import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { PREVIEW_PROVIDERS, initialsOf, type PreviewProvider } from '../content/preview-data'

export default function Dentists() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16 pb-20">
      <h1 className="font-display max-w-3xl text-4xl leading-[1] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">
        Three dentists, <span className="text-primary">two hygienists</span>
      </h1>
      <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
        You can book with whoever you like. If you don&rsquo;t mind, leaving it open usually finds
        you an earlier appointment.
      </p>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PREVIEW_PROVIDERS.map((provider) => (
          <li key={provider.id}>
            <ProviderProfile provider={provider} />
          </li>
        ))}
      </ul>

      <div className="mt-14 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-6">
        <p className="flex-1 text-sm text-muted-foreground">
          Booking starts with the treatment, so we only offer you providers who perform it.
        </p>
        <Button asChild className="rounded-pill">
          <Link to="/services">Start with a treatment</Link>
        </Button>
      </div>
    </div>
  )
}

function ProviderProfile({ provider }: { provider: PreviewProvider }) {
  const isDentist = provider.type === 'DENTIST'

  return (
    <article className="flex h-full flex-col gap-4 rounded-card border border-border bg-card p-6">
      {/* Monogram, not a portrait — PRODUCT.md forbids a stock face under a
          fictional provider's name. */}
      <span
        aria-hidden="true"
        className="font-display grid size-14 place-items-center rounded-pill bg-accent text-lg font-bold text-accent-foreground"
      >
        {initialsOf(provider)}
      </span>

      <div>
        <h2 className="font-display text-lg font-bold tracking-tight">
          {isDentist ? 'Dr ' : ''}
          {provider.firstName} {provider.lastName}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {provider.title} · {isDentist ? 'Dentist' : 'Hygienist'}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{provider.bio}</p>
    </article>
  )
}
