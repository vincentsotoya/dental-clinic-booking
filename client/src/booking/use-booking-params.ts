// The booking flow's state, which lives in the URL and nowhere else.
//
// WHY THE URL AND NOT A REDUCER
//
// Four reasons, and the last is the one that decided it:
//
//   1. A step cannot disagree with the data. `step` is derived from which
//      choices are present, so "pick a time" with no service chosen is not a
//      state that can be reached — it is not representable.
//   2. Back and refresh work without being implemented. The browser already
//      knows how to undo a URL change.
//   3. A half-finished booking is a link. "Here is the Thursday 9am with Dr
//      Osei" is something a patient can send someone.
//   4. Booking needs a session and browsing does not. The guard sends an
//      anonymous patient to sign in with `from` set to the current URL — and
//      because the URL *is* the state, they come back to their chosen slot
//      rather than to an empty form. A reducer's state would not survive that
//      round trip.
//
// `provider=any` is spelled out rather than left absent: "I have not chosen"
// and "I do not mind who" are different answers, and only one of them means the
// flow should stop and ask.

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

/** Which question the patient is being asked. Derived, never stored. */
export type BookingStep = 'service' | 'provider' | 'date' | 'time' | 'confirm'

export const ANY_PROVIDER = 'any'

export type BookingChoices = {
  /** A service slug. */
  service: string | null
  /** A provider id, or `ANY_PROVIDER`, or null for "not asked yet". */
  provider: string | null
  /** A clinic civil date, `YYYY-MM-DD`. */
  date: string | null
  /** The chosen slot's `startsAt`, an instant. */
  at: string | null
}

const ORDER: BookingStep[] = ['service', 'provider', 'date', 'time', 'confirm']

/** Everything a later step depends on, cleared when an earlier answer changes. */
const DOWNSTREAM: Record<Exclude<BookingStep, 'confirm'>, (keyof BookingChoices)[]> = {
  service: ['provider', 'date', 'at'],
  provider: ['date', 'at'],
  date: ['at'],
  time: [],
}

export function useBookingParams() {
  const [params, setParams] = useSearchParams()

  const choices: BookingChoices = useMemo(
    () => ({
      service: params.get('service'),
      provider: params.get('provider'),
      date: params.get('date'),
      at: params.get('at'),
    }),
    [params],
  )

  // The first unanswered question. Reading the choices in order means a URL
  // that has been edited by hand — `?at=…` with no service — lands on the step
  // that actually needs answering rather than on a screen with nothing to show.
  const step: BookingStep = !choices.service
    ? 'service'
    : !choices.provider
      ? 'provider'
      : !choices.date
        ? 'date'
        : !choices.at
          ? 'time'
          : 'confirm'

  /**
   * Answer one question and discard everything downstream of it.
   *
   * Changing the service must forget the slot: a 9:00 that was free for a
   * thirty-minute exam is not necessarily free for a two-hour root canal, and
   * carrying it forward would send a stale instant to the confirm step.
   */
  const choose = useCallback(
    (key: Exclude<BookingStep, 'confirm'>, value: string) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set(key === 'time' ? 'at' : key, value)
          for (const stale of DOWNSTREAM[key]) next.delete(stale)
          return next
        },
        { replace: false },
      )
    },
    [setParams],
  )

  /** Go back to a question, forgetting the answers that depended on it. */
  const revise = useCallback(
    (target: Exclude<BookingStep, 'confirm'>) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete(target === 'time' ? 'at' : target)
        for (const stale of DOWNSTREAM[target]) next.delete(stale)
        return next
      })
    },
    [setParams],
  )

  /**
   * Drop just the chosen instant, keeping the rest.
   *
   * What a lost race needs: the slot is gone, everything else about the booking
   * is still true, and the patient should land back on the times for that day
   * rather than at the start.
   */
  const releaseSlot = useCallback(() => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('at')
      return next
    })
  }, [setParams])

  return { choices, step, choose, revise, releaseSlot, stepIndex: ORDER.indexOf(step), ORDER }
}
