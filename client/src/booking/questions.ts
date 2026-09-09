// What the flow calls its steps, in one place: the question each one asks, and
// the short noun the controls use to name an answer inside a sentence.

import type { BookingStep, Question } from './use-booking-params'

/** The question a step asks. Named in the document title and announced on arrival. */
export const QUESTION: Record<BookingStep, string> = {
  service: 'What do you need?',
  provider: 'Who would you like to see?',
  date: 'Pick a day',
  time: 'Pick a time',
  confirm: 'Does this look right?',
}

/** An answer as a noun, for sentences about going back to it or clearing it. */
export const ANSWER_NOUN: Record<Question, string> = {
  service: 'the treatment',
  provider: "who you're seeing",
  date: 'the day',
  time: 'the time',
}
