// The public nav: a floating bar that marks the page you are on.
//
// Two measured constraints shape it, both in docs/design-system.md:
// the fill alone is 1.04:1 against the page, so the border and shadow are what
// make it read; and links stay at full ink because `muted` over a photographic
// backdrop measures 2.95:1.

import { NavLink, Link } from 'react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSession } from '../auth/use-session'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/services', label: 'Services', end: false },
  { to: '/dentists', label: 'Dentists', end: false },
]

export function SiteNav() {
  const session = useSession()

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <nav
        aria-label="Main"
        className={cn(
          'mx-auto flex max-w-6xl items-center gap-3 rounded-pill border border-border py-2 pr-2 pl-4 sm:pl-5',
          // Alpha capped where the worst-case composite still clears AA, so the
          // bar stays legible if a photographic hero is ever put behind it.
          'bg-card/80 shadow-sm backdrop-blur-lg',
        )}
      >
        <Link
          to="/"
          className="font-display shrink-0 text-lg font-bold tracking-tight sm:text-xl"
        >
          Quillon<span className="text-primary">Dental</span>
        </Link>

        {/* Scrolls rather than wraps on narrow screens: a nav that changes
            height moves the page under it. */}
        <ul className="scrollbar-none mx-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'block rounded-pill px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4',
                    // NavLink also sets aria-current, so the fill and the
                    // announcement cannot disagree.
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  )
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          {/* `loading` renders neither branch: showing "Sign in" first and
              swapping it a moment later is the flash ADR-0008 exists to avoid. */}
          {session.status === 'anonymous' && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/sign-in">Sign in</Link>
            </Button>
          )}
          {session.status === 'authenticated' && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/appointments">My appointments</Link>
            </Button>
          )}
          <Button asChild size="sm" className="rounded-pill">
            <Link to="/services">Treatments</Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
