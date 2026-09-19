// Is this appointment still the patient's to change?
//
// One predicate, two callers. Cancel and reschedule refuse the same three
// things — a visit that has happened, one the clinic has closed out, one that
// has already started — and they answer with different codes because the rules
// are free to diverge later, not because they differ now.

import type { AppointmentStatus } from '@dental/shared'

/** Only the two columns the answer depends on, so any row shape can be asked. */
export type ChangeableAppointment = {
  status: AppointmentStatus
  startsAt: Date
}

/**
 * Why this appointment can no longer be changed, or null if it can.
 *
 * There is deliberately no notice window. A clinic would far rather hear at 7am
 * that nobody is coming at 9 than have the chair sit empty, and refusing a late
 * change does not keep the patient — it converts them into a no-show. Charging
 * for one is Phase 9's problem, not a route's.
 */
export function refusalToChange(row: ChangeableAppointment, now: Date): string | null {
  if (row.status === 'COMPLETED') return 'That appointment has already taken place.'
  // Changing this one would erase the record of not turning up, which is the
  // only thing that status exists to remember.
  if (row.status === 'NO_SHOW') return 'That appointment is closed. Please call the clinic.'
  if (row.startsAt <= now) return 'That appointment has already started. Please call the clinic.'

  return null
}

/**
 * Why the clinic cannot close this appointment out yet, or null if it can.
 *
 * The mirror image of `refusalToChange`'s clock check: a patient is refused
 * once a visit has started, the front desk is refused until it has. Terminal
 * once closed either way — flipping a settled outcome would erase whichever
 * judgement it overwrote, the same reasoning `refusalToChange` already gives
 * for `NO_SHOW`. The caller checks for a same-outcome retry before this runs,
 * so `COMPLETED`/`NO_SHOW` reaching here always means the *other* outcome.
 */
export function refusalToClose(row: ChangeableAppointment, now: Date): string | null {
  if (row.status === 'CANCELLED') return 'That appointment was cancelled.'
  if (row.status === 'COMPLETED') return 'That appointment is already marked complete.'
  if (row.status === 'NO_SHOW') return 'That appointment is already marked as a no-show.'
  if (row.startsAt > now) return "That appointment hasn't happened yet."

  return null
}
