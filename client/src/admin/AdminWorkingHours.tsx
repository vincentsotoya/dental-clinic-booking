// The clinic's own edit of a provider's recurring weekly window — the input
// the availability engine subtracts from (`shared/src/working-hours.ts`).
//
// One provider at a time, one save button over the whole week: the same
// "states everything, not a merge patch" rule `Profile.tsx` follows for one
// row, extended here to a table with no natural row identity of its own —
// two windows on the same weekday are distinguished only by where they fall.

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { workingHoursWeek, WEEKDAY_ORDER, type Weekday, type WorkingHoursWindow } from '@dental/shared'
import { ApiRequestError } from '@/api/errors'
import { useProviders, useUpdateWorkingHours, useWorkingHours } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { providerName } from '@/lib/format'

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
}

const DEFAULT_WINDOW_LENGTH = 60

/** A window the draft can identify across renders — the wire shape has no id of its own. */
type DraftWindow = WorkingHoursWindow & { key: string }

const withKeys = (windows: WorkingHoursWindow[]): DraftWindow[] =>
  windows.map((window) => ({ ...window, key: crypto.randomUUID() }))

const withoutKeys = (windows: DraftWindow[]): WorkingHoursWindow[] =>
  windows.map(({ key: _key, ...window }) => window)

/** `<input type="time">` reads and writes `"HH:MM"`; the wire format is minutes from midnight. */
function minutesToClock(minutes: number): string {
  const clamped = Math.min(minutes, 1439)
  const hours = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0')
  const mins = (clamped % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

function clockToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export default function AdminWorkingHours() {
  const providers = useProviders()
  // '', not null: Radix's Select is controlled from the first render, and a
  // value that starts `undefined` and later becomes a string trips its own
  // controlled/uncontrolled warning.
  const [providerId, setProviderId] = useState('')

  useEffect(() => {
    const first = providers.data?.providers[0]
    if (providerId === '' && first) setProviderId(first.id)
  }, [providerId, providers.data])

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Working hours</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The recurring weekly window each provider can be booked in.
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

      {providerId && <WeekEditor key={providerId} providerId={providerId} />}
    </div>
  )
}

/**
 * `key={providerId}` on the caller remounts this on every provider switch,
 * which is what resets the draft to the newly selected provider's own rows
 * instead of carrying an old edit sideways.
 */
function WeekEditor({ providerId }: { providerId: string }) {
  const workingHours = useWorkingHours(providerId)
  const updateWorkingHours = useUpdateWorkingHours()
  const [draft, setDraft] = useState<DraftWindow[] | null>(null)

  useEffect(() => {
    if (workingHours.data) setDraft(withKeys(workingHours.data.workingHours))
  }, [workingHours.data])

  if (workingHours.isError) {
    return (
      <div className="mt-6">
        <LoadFailed what="this provider's hours" onRetry={() => void workingHours.refetch()} />
      </div>
    )
  }

  if (workingHours.isPending || draft === null) {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    )
  }

  const validation = workingHoursWeek.safeParse(withoutKeys(draft))
  const dirty = JSON.stringify(withoutKeys(draft)) !== JSON.stringify(workingHours.data.workingHours)

  function addWindow(day: Weekday) {
    const onDay = draft!.filter((window) => window.weekday === day)
    const latestEnd = onDay.reduce((max, window) => Math.max(max, window.endMinute), 0)
    const startMinute = onDay.length === 0 ? 480 : Math.min(latestEnd, 1440)
    const endMinute = Math.min(startMinute + DEFAULT_WINDOW_LENGTH, 1440)

    setDraft([...draft!, { key: crypto.randomUUID(), weekday: day, startMinute, endMinute }])
  }

  function removeWindow(key: string) {
    setDraft(draft!.filter((window) => window.key !== key))
  }

  function updateWindow(key: string, field: 'startMinute' | 'endMinute', value: string) {
    const minutes = clockToMinutes(value)
    if (minutes === null) return

    setDraft(draft!.map((window) => (window.key === key ? { ...window, [field]: minutes } : window)))
  }

  function onSave() {
    if (!validation.success) return
    updateWorkingHours.mutate({ providerId, body: { workingHours: validation.data } })
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      {updateWorkingHours.isSuccess && !dirty && (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      )}

      {updateWorkingHours.isError && (
        <Alert variant="destructive">
          <AlertDescription>{saveFailureMessage(updateWorkingHours.error)}</AlertDescription>
        </Alert>
      )}

      {!validation.success && (
        <Alert variant="destructive">
          <AlertDescription>{validation.error.issues[0]?.message}</AlertDescription>
        </Alert>
      )}

      {WEEKDAY_ORDER.map((day) => (
        <DayRow
          key={day}
          day={day}
          windows={draft
            .filter((window) => window.weekday === day)
            .sort((a, b) => a.startMinute - b.startMinute)}
          onAdd={() => addWindow(day)}
          onRemove={removeWindow}
          onChange={updateWindow}
        />
      ))}

      <Button
        size="lg"
        className="rounded-pill self-start"
        disabled={!dirty || !validation.success || updateWorkingHours.isPending}
        onClick={onSave}
      >
        {updateWorkingHours.isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

function DayRow({
  day,
  windows,
  onAdd,
  onRemove,
  onChange,
}: {
  day: Weekday
  windows: DraftWindow[]
  onAdd: () => void
  onRemove: (key: string) => void
  onChange: (key: string, field: 'startMinute' | 'endMinute', value: string) => void
}) {
  return (
    <section aria-labelledby={`day-${day}`} className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 id={`day-${day}`} className="font-display font-bold tracking-tight">
          {WEEKDAY_LABEL[day]}
        </h2>
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Add window
        </Button>
      </div>

      {windows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Not working.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {windows.map((window) => (
            <li key={window.key} className="flex items-center gap-2">
              <Input
                type="time"
                aria-label={`${WEEKDAY_LABEL[day]} window start`}
                value={minutesToClock(window.startMinute)}
                onChange={(event) => onChange(window.key, 'startMinute', event.target.value)}
                className="w-auto"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="time"
                aria-label={`${WEEKDAY_LABEL[day]} window end`}
                value={minutesToClock(window.endMinute)}
                onChange={(event) => onChange(window.key, 'endMinute', event.target.value)}
                className="w-auto"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove this ${WEEKDAY_LABEL[day]} window`}
                onClick={() => onRemove(window.key)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * `INVALID_REQUEST`'s message is written for an admin, and the client-side
 * `workingHoursWeek` parse should have caught it first — reaching this means
 * the two rules drifted, the same reasoning `Profile.tsx`'s own message
 * carries.
 */
function saveFailureMessage(error: Error): string {
  if (error instanceof ApiRequestError && error.code === 'INVALID_REQUEST') return error.message
  if (error instanceof ApiRequestError && error.code === 'NOT_FOUND') {
    return 'This provider no longer exists.'
  }
  return 'Something went wrong at our end. Nothing was saved.'
}
