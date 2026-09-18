// The clinic's own record of when the whole practice is shut — dated ranges
// only, never an instant; `shared/src/clinic-closures.ts` carries the
// reasoning. The same shape `AdminTimeOff.tsx` already uses, minus the
// provider picker: a closure has no provider to choose.

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { type ClosureRange, createClosureRequest } from '@dental/shared'
import { ApiRequestError } from '@/api/errors'
import { useClosures, useCreateClosure, useDeleteClosure } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCivilDate } from '@/lib/clinic-time'

export default function AdminClosures() {
  const closures = useClosures()

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Closures</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dated ranges during which the whole clinic is shut and nobody can be booked.
        </p>
      </header>

      {closures.isError && (
        <div className="mt-6">
          <LoadFailed what="the clinic's closures" onRetry={() => void closures.refetch()} />
        </div>
      )}

      {closures.isPending && (
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      )}

      {closures.data && <ClosureList closures={closures.data.closures} />}
    </div>
  )
}

function ClosureList({ closures }: { closures: ClosureRange[] }) {
  const sorted = [...closures].sort((a, b) => a.fromDate.localeCompare(b.fromDate))

  return (
    <div className="mt-8 flex flex-col gap-6">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No closures on file.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((row) => (
            <ClosureRow key={row.id} row={row} />
          ))}
        </ul>
      )}

      <AddClosureForm />
    </div>
  )
}

function ClosureRow({ row }: { row: ClosureRange }) {
  const [open, setOpen] = useState(false)
  const deleteClosure = useDeleteClosure()

  const range =
    row.fromDate === row.toDate
      ? formatCivilDate(row.fromDate)
      : `${formatCivilDate(row.fromDate)} – ${formatCivilDate(row.toDate)}`

  return (
    <li className="flex items-center justify-between gap-4 rounded-card border border-border bg-card p-4">
      <div>
        <p className="font-medium">{range}</p>
        {row.reason && <p className="text-sm text-muted-foreground">{row.reason}</p>}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) deleteClosure.reset()
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove closure: ${range}`}>
            <Trash2 aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this closure?</DialogTitle>
            <DialogDescription>
              {range}. The clinic becomes bookable again for this range the moment it is removed.
            </DialogDescription>
          </DialogHeader>

          {deleteClosure.isError && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong at our end. Nothing was removed.
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleteClosure.isPending}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={deleteClosure.isPending}
              onClick={() => deleteClosure.mutate(row.id, { onSuccess: () => setOpen(false) })}
            >
              {deleteClosure.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

function AddClosureForm() {
  const createClosure = useCreateClosure()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [reason, setReason] = useState('')

  const draft = { fromDate, toDate, reason: reason.trim() === '' ? undefined : reason }
  const validation = createClosureRequest.safeParse(draft)

  function onAdd() {
    if (!validation.success) return
    // The raw strings, not `validation.data` — the parse transforms `fromDate`/
    // `toDate` into `ClinicDate` objects for its own refine, and the wire
    // contract wants the ISO dates the server will run that same transform on.
    createClosure.mutate(draft, {
      onSuccess: () => {
        setFromDate('')
        setToDate('')
        setReason('')
      },
    })
  }

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <h2 className="font-display font-bold tracking-tight">Add closure</h2>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="closure-from">From</Label>
          <Input
            id="closure-from"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="closure-to">To</Label>
          <Input
            id="closure-to"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-1 min-w-48 flex-col gap-1">
          <Label htmlFor="closure-reason">Reason (optional)</Label>
          <Input
            id="closure-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
          />
        </div>
        <Button
          className="rounded-pill"
          disabled={!validation.success || createClosure.isPending}
          onClick={onAdd}
        >
          {createClosure.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {fromDate !== '' && toDate !== '' && !validation.success && (
        <p className="mt-2 text-sm text-destructive">{validation.error.issues[0]?.message}</p>
      )}

      {createClosure.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{addFailureMessage(createClosure.error)}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}

/**
 * `CLOSURE_CONFLICT`'s message names how many appointments are in the way —
 * written for an admin, so it is shown as-is, the same reasoning
 * `AdminTimeOff.tsx`'s own `addFailureMessage` gives `TIME_OFF_CONFLICT`.
 */
function addFailureMessage(error: Error): string {
  if (error instanceof ApiRequestError && error.code === 'CLOSURE_CONFLICT') return error.message
  if (error instanceof ApiRequestError && error.code === 'INVALID_REQUEST') return error.message
  return 'Something went wrong at our end. Nothing was added.'
}
