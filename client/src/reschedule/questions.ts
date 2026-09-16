// What the reschedule flow calls its steps — the same shape as
// booking/questions.ts, kept separate because the step sets differ: this flow
// has no `service` question and booking's `Record` would not type-check
// against a step this one never reaches.

import type { RescheduleQuestion, RescheduleStep } from './use-reschedule-params'

export const QUESTION: Record<RescheduleStep, string> = {
  provider: 'Who would you like to see?',
  date: 'Pick a day',
  time: 'Pick a time',
  confirm: 'Does this look right?',
}

export const ANSWER_NOUN: Record<RescheduleQuestion, string> = {
  provider: "who you're seeing",
  date: 'the day',
  time: 'the time',
}
