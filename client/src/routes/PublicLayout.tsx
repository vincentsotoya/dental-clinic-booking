// The public shell. Nav and footer live here rather than in each page, so a
// route added below inherits them by where it is written — the same reason
// RequireAuth is a layout route rather than a check each screen performs.

import { Link, Outlet } from 'react-router'
import { SiteNav } from '../components/SiteNav'

export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteNav />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="font-display text-lg font-bold tracking-tight">
            Quillon<span className="text-primary">Dental</span>
          </p>
          {/* PRODUCT.md principle 5: nothing claims to be real. This is the
              disclosure, stated where a visitor could otherwise be misled. */}
          <p className="mt-2 text-sm text-muted-foreground">
            A fictional practice, built as a portfolio project. The providers, services and
            appointments are seeded data — but the availability is really computed, and the database
            really will refuse a double booking.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
          <Link to="/services" className="text-foreground hover:text-primary">
            Services
          </Link>
          <Link to="/dentists" className="text-foreground hover:text-primary">
            Dentists
          </Link>
          <Link to="/sign-in" className="text-foreground hover:text-primary">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
