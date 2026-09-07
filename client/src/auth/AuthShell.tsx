// The frame both auth screens sit in.
//
// Deliberately not `PublicLayout`: the nav offers four ways to leave a screen
// whose whole job is one short form, and the footer's disclosure is three
// paragraphs below a password field. The wordmark stays, because it is the only
// thing on the page that says whose sign-in form this is.

import { Link } from 'react-router'
import type { ReactNode } from 'react'

type Props = {
  title: string
  /** Sits under the title. One sentence, or the form starts too far down. */
  intro: string
  /** Where the patient was going, so the screen can say so when it is not obvious. */
  next: string
  children: ReactNode
  /** The link to the other screen. Always carries `next` — see next-location.ts. */
  footer: ReactNode
}

export function AuthShell({ title, intro, next, children, footer }: Props) {
  const returningToBooking = next.startsWith('/book')

  return (
    <div className="flex min-h-dvh flex-col bg-background px-6 py-10 text-foreground">
      <Link
        to="/"
        className="font-display self-start text-lg font-bold tracking-tight hover:text-primary"
      >
        Quillon<span className="text-primary">Dental</span>
      </Link>

      <main className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-balance sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-muted-foreground">{intro}</p>

          {returningToBooking && (
            // Said plainly because the opposite is what a patient assumes. The
            // slot is not reserved while they are on this screen and can go —
            // the confirm step handles that, and promising otherwise here would
            // make it a broken promise rather than a race.
            <p className="mt-4 rounded-card border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
              We&rsquo;ll take you straight back to the time you picked. Nothing is held until you
              confirm, so it can still go to someone else.
            </p>
          )}

          <div className="mt-8">{children}</div>

          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  )
}
