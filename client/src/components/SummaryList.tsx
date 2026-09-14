// A labelled list of facts about one appointment — what the confirm step of
// the booking flow shows and what its confirmation screen shows next, so the
// two read as one continuous moment rather than two different UIs describing
// the same booking.

import { cn } from '@/lib/utils'

export function SummaryList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <dl className={cn('divide-y divide-border overflow-hidden rounded-card border border-border bg-card', className)}>
      {children}
    </dl>
  )
}

export function SummaryRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-col items-end text-right">
        <span className="font-display font-bold tracking-tight">{value}</span>
        {note && <span className="mt-0.5 text-sm text-muted-foreground">{note}</span>}
      </dd>
    </div>
  )
}
