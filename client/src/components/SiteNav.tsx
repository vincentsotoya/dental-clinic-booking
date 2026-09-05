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
          'mx-auto flex max-w-6xl items-center gap-2 rounded-pill border border-border py-2 pr-2 pl-4 sm:gap-3 sm:pl-5',
          // Alpha capped where the worst-case composite still clears AA, so the
          // bar stays legible if a photographic hero is ever put behind it.
          'bg-card/80 shadow-sm backdrop-blur-lg',
        )}
      >
        <Link
          to="/"
          className="font-display shrink-0 text-base font-bold tracking-tight sm:text-xl"
        >
          {/* "Dental" is the first thing to go on a narrow screen: the second
              word costs ~55px, which is roughly what the third link needs, and
              a brand that shortens is better than a page you cannot reach. */}
          Quillon<span className="hidden text-primary sm:inline">Dental</span>
        </Link>

        {/* Every link fits at 320px, so scrolling is the fallback and not the
            plan. The scrollbar is deliberately left visible: a link that has
            gone off the edge has to say so, which is exactly what this
            container failed to do when it hid one on a phone. */}
        <ul className="mx-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'block rounded-pill px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4',
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

        {/* Desktop only, and the whole group rather than each button: on a
            phone this would otherwise be an empty flex item still taking a gap.
            Sign-in stays reachable from the footer at every width. */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {/* `loading` renders neither branch: showing "Sign in" first and
              swapping it a moment later is the flash ADR-0008 exists to avoid. */}
          {session.status === 'anonymous' && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/sign-in">Sign in</Link>
            </Button>
          )}
          {session.status === 'authenticated' && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/appointments">My appointments</Link>
            </Button>
          )}
        </div>
      </nav>
    </header>
  )
}
