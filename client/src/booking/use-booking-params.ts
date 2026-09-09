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

/** The four questions, in the order they are asked. */
const QUESTIONS = ['service', 'provider', 'date', 'time'] as const

/** A question the patient answers. `confirm` reviews the answers; it is not one. */
export type Question = (typeof QUESTIONS)[number]

/** Which question the patient is being asked. Derived, never stored. */
export type BookingStep = Question | 'confirm'

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

const ORDER: BookingStep[] = [...QUESTIONS, 'confirm']

/** Which parameter carries each question's answer. Only `time` differs. */
const ANSWER: Record<Question, keyof BookingChoices> = {
  service: 'service',
  provider: 'provider',
  date: 'date',
  time: 'at',
}

// Dependency is position: every later question is asked in terms of this one's
// answer. Deriving it from `QUESTIONS` rather than tabling it keeps the order
// stated once — a table and a list that disagree is a class of bug, not a typo.
function downstreamOf(target: Question): Question[] {
  return QUESTIONS.slice(QUESTIONS.indexOf(target) + 1)
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

  const stepIndex = ORDER.indexOf(step)

  /**
   * Answer one question and discard everything downstream of it.
   *
   * Changing the service must forget the slot: a 9:00 that was free for a
   * thirty-minute exam is not necessarily free for a two-hour root canal, and
   * carrying it forward would send a stale instant to the confirm step.
   */
  const choose = useCallback(
    (key: Question, value: string) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set(ANSWER[key], value)
          for (const later of downstreamOf(key)) next.delete(ANSWER[later])
          return next
        },
        { replace: false },
      )
    },
    [setParams],
  )

  /** Go back to a question, forgetting the answers that depended on it. */
  const revise = useCallback(
    (target: Question) => {
      setParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete(ANSWER[target])
        for (const later of downstreamOf(target)) next.delete(ANSWER[later])
        return next
      })
    },
    [setParams],
  )

  // The question before this one, or null at the first — index -1 reads
  // undefined. Derived from the step rather than from history, because the
  // sign-in round trip leaves entries that are not the flow's own: `back()` at
  // the confirm step would return to the sign-in screen.
  const previous = QUESTIONS[stepIndex - 1] ?? null

  /**
   * Back one question, by forgetting its answer.
   *
   * Clears exactly one answer, never a cascade: the step is the first
   * unanswered question, so everything after `previous` is already blank by the
   * time this can be pressed.
   */
  const back = useCallback(() => {
    if (previous) revise(previous)
  }, [previous, revise])

  /**
   * The answers `revise(target)` would discard besides the target's own.
   *
   * Empty for the most recent answer, which is what lets the trail jump
   * straight to it instead of asking.
   */
  const discards = useCallback(
    (target: Question) => downstreamOf(target).filter((later) => choices[ANSWER[later]] !== null),
    [choices],
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

  return {
    choices,
    step,
    stepIndex,
    previous,
    choose,
    revise,
    back,
    discards,
    releaseSlot,
    ORDER,
  }
}
