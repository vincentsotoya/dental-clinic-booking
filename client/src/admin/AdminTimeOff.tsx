// The clinic's own record of when a provider is unavailable — dated ranges
// only, never an instant; `shared/src/time-off.ts` carries the reasoning.
//
// One provider at a time, the same picker `AdminWorkingHours.tsx` uses. Unlike
// that screen, a row here has its own id: adding one is a POST, removing one
// is its own DELETE, not a whole-set replace behind one save button.

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createTimeOffRequest, type TimeOffRange } from '@dental/shared'
import { ApiRequestError } from '@/api/errors'
import { useCreateTimeOff, useDeleteTimeOff, useProviders, useTimeOff } from '@/api/hooks'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCivilDate } from '@/lib/clinic-time'
import { providerName } from '@/lib/format'

export default function AdminTimeOff() {
  const providers = useProviders()
  // '', not null — the same Radix controlled/uncontrolled reasoning
  // `AdminWorkingHours.tsx` already documents.
  const [providerId, setProviderId] = useState('')

  useEffect(() => {
    const first = providers.data?.providers[0]
    if (providerId === '' && first) setProviderId(first.id)
  }, [providerId, providers.data])

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Time off</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dated ranges during which one provider cannot be booked.
        </p>
      </header>

      <div className="mt-6">
        {providers.isError && (
          <LoadFailed what="the provider list" onRetry={() => void providers.refetch()} />
        )}

        {providers.isPending && <Skeleton className="h-9 w-48" />}

        {providers.data && providers.data.providers.length === 0 && (
          <p className="text-sm text-muted-foreground">No providers on file.</p>
        )}

        {providers.data && providers.data.providers.length > 0 && (
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="w-64" aria-label="Provider">
              <SelectValue placeholder="Choose a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.data.providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {providerName(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {providerId && <TimeOffList key={providerId} providerId={providerId} />}
    </div>
  )
}

/** `key={providerId}` on the caller remounts this on a provider switch, closing any open add form. */
function TimeOffList({ providerId }: { providerId: string }) {
  const timeOff = useTimeOff(providerId)

  if (timeOff.isError) {
    return (
      <div className="mt-6">
        <LoadFailed what="this provider's time off" onRetry={() => void timeOff.refetch()} />
      </div>
    )
  }

  if (timeOff.isPending) {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-16 w-full rounded-card" />
      </div>
    )
  }

  const sorted = [...timeOff.data.timeOff].sort((a, b) => a.fromDate.localeCompare(b.fromDate))

  return (
    <div className="mt-8 flex flex-col gap-6">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time off on file for this provider.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((row) => (
            <TimeOffRow key={row.id} providerId={providerId} row={row} />
          ))}
        </ul>
      )}

      <AddTimeOffForm providerId={providerId} />
    </div>
  )
}

function TimeOffRow({ providerId, row }: { providerId: string; row: TimeOffRange }) {
  const [open, setOpen] = useState(false)
  const deleteTimeOff = useDeleteTimeOff()

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
          if (next) deleteTimeOff.reset()
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove time off: ${range}`}>
            <Trash2 aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this time off?</DialogTitle>
            <DialogDescription>
              {range}. The provider becomes bookable again for this range the moment it is removed.
            </DialogDescription>
          </DialogHeader>

          {deleteTimeOff.isError && (
            <p role="alert" className="text-sm text-destructive">
              Something went wrong at our end. Nothing was removed.
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleteTimeOff.isPending}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTimeOff.isPending}
              onClick={() =>
                deleteTimeOff.mutate({ id: row.id, providerId }, { onSuccess: () => setOpen(false) })
              }
            >
              {deleteTimeOff.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

function AddTimeOffForm({ providerId }: { providerId: string }) {
  const createTimeOff = useCreateTimeOff()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [reason, setReason] = useState('')

  const draft = { fromDate, toDate, reason: reason.trim() === '' ? undefined : reason }
  const validation = createTimeOffRequest.safeParse(draft)

  function onAdd() {
    if (!validation.success) return
    // The raw strings, not `validation.data` — the parse transforms `fromDate`/
    // `toDate` into `ClinicDate` objects for its own refine, and the wire
    // contract wants the ISO dates the server will run that same transform on.
    createTimeOff.mutate(
      { providerId, body: draft },
      {
        onSuccess: () => {
          setFromDate('')
          setToDate('')
          setReason('')
        },
      },
    )
  }

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <h2 className="font-display font-bold tracking-tight">Add time off</h2>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="time-off-from">From</Label>
          <Input
            id="time-off-from"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="time-off-to">To</Label>
          <Input
            id="time-off-to"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-1 min-w-48 flex-col gap-1">
          <Label htmlFor="time-off-reason">Reason (optional)</Label>
          <Input
            id="time-off-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
          />
        </div>
        <Button
          className="rounded-pill"
          disabled={!validation.success || createTimeOff.isPending}
          onClick={onAdd}
        >
          {createTimeOff.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {fromDate !== '' && toDate !== '' && !validation.success && (
        <p className="mt-2 text-sm text-destructive">{validation.error.issues[0]?.message}</p>
      )}

      {createTimeOff.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{addFailureMessage(createTimeOff.error)}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}

/**
 * `TIME_OFF_CONFLICT`'s message names how many appointments are in the way —
 * written for an admin, so it is shown as-is, the same reasoning
 * `AdminWorkingHours.tsx`'s own `saveFailureMessage` gives `INVALID_REQUEST`.
 */
function addFailureMessage(error: Error): string {
  if (error instanceof ApiRequestError && error.code === 'TIME_OFF_CONFLICT') return error.message
  if (error instanceof ApiRequestError && error.code === 'INVALID_REQUEST') return error.message
  if (error instanceof ApiRequestError && error.code === 'NOT_FOUND') {
    return 'This provider no longer exists.'
  }
  return 'Something went wrong at our end. Nothing was added.'
}
