// The reschedule flow's state, in the URL — the same reasoning as the booking
// flow's (see booking/use-booking-params.ts): a step derived from the choices
// present, back and refresh working for free, and a half-picked move being a
// link rather than lost state.
//
// It asks only the two questions a move actually is: who, and when. The
// service and the appointment being moved are fixed by the route's own `:id`
// and never become a question here — changing the treatment is booking a
// different appointment, not moving this one (see the contract's reasoning in
// shared/src/appointments.ts).

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

const QUESTIONS = ['provider', 'date', 'time'] as const

export type RescheduleQuestion = (typeof QUESTIONS)[number]
export type RescheduleStep = RescheduleQuestion | 'confirm'

export type RescheduleChoices = {
  /** A provider id, or ANY_PROVIDER (booking/use-booking-params), or null for "not asked yet". */
  provider: string | null
  /** A clinic civil date, `YYYY-MM-DD`. */
  date: string | null
  /** The chosen slot's `startsAt`, an instant. */
  at: string | null
}

const ORDER: RescheduleStep[] = [...QUESTIONS, 'confirm']

const ANSWER: Record<RescheduleQuestion, keyof RescheduleChoices> = {
  provider: 'provider',
  date: 'date',
  time: 'at',
}

function downstreamOf(target: RescheduleQuestion): RescheduleQuestion[] {
  return QUESTIONS.slice(QUESTIONS.indexOf(target) + 1)
}

export function useRescheduleParams() {
  const [params, setParams] = useSearchParams()

  const choices: RescheduleChoices = useMemo(
    () => ({
      provider: params.get('provider'),
      date: params.get('date'),
      at: params.get('at'),
    }),
    [params],
  )

  const step: RescheduleStep = !choices.provider
    ? 'provider'
    : !choices.date
      ? 'date'
      : !choices.at
        ? 'time'
        : 'confirm'

  const stepIndex = ORDER.indexOf(step)

  /** Answer one question and discard everything downstream of it — a new
   * provider or day may not still be free at a time chosen for the old one. */
  const choose = useCallback(
    (key: RescheduleQuestion, value: string) => {
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

  // Derived from the step rather than from history: the step is the first
  // unanswered question, so this is always the one just before it.
  const previous = QUESTIONS[stepIndex - 1] ?? null

  /** Back one question, by forgetting its answer and nothing before it. */
  const back = useCallback(() => {
    if (!previous) return
    setParams((prior) => {
      const next = new URLSearchParams(prior)
      next.delete(ANSWER[previous])
      for (const later of downstreamOf(previous)) next.delete(ANSWER[later])
      return next
    })
  }, [previous, setParams])

  /** Drop just the chosen instant, keeping the rest — what a lost race needs. */
  const releaseSlot = useCallback(() => {
    setParams((prior) => {
      const next = new URLSearchParams(prior)
      next.delete('at')
      return next
    })
  }, [setParams])

  return { choices, step, stepIndex, previous, choose, back, releaseSlot, ORDER }
}
