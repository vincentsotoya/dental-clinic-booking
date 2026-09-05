// Sits under PublicLayout, so a wrong URL keeps the nav and the way out.
//
// Only the interface can answer here. A static host serves index.html with a
// 200 for any path it does not recognise, so the status code is already spent
// by the time React sees the URL — see vercel.json.

import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-20 pb-24">
      <p className="font-display text-sm font-bold tracking-[0.12em] text-primary uppercase">
        Page not found
      </p>
      <h1 className="font-display mt-3 max-w-2xl text-4xl leading-[1] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl">
        That page isn&rsquo;t here
      </h1>
      <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
        The link may be out of date, or the address slightly off. Nothing has gone wrong with your
        appointment.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Button asChild size="lg" className="rounded-pill">
          <Link to="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-pill">
          <Link to="/services">See our treatments</Link>
        </Button>
      </div>
    </div>
  )
}
