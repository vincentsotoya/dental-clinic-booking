// The band above the step: how far along the patient is, and one step back.
//
// Position and revision used to be the same control — the trail said what had
// been chosen and was also the only way backwards, and a press discarded every
// answer downstream in silence. See `docs/booking-composition.md`.

import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ANSWER_NOUN } from './questions'
import type { useBookingParams } from './use-booking-params'

type Props = {
  booking: ReturnType<typeof useBookingParams>
}

export function StepHeader({ booking }: Props) {
  const { previous, back, stepIndex, ORDER } = booking
  const position = stepIndex + 1

  return (
    <div className="mt-6">
      <div className="flex items-center gap-4">
        {previous && (
          // "Back" alone does not say back to what, and the name is what has to
          // carry it: a screen reader reads the button, not the trail below it.
          <Button
            variant="ghost"
            onClick={back}
            aria-label={`Back to ${ANSWER_NOUN[previous]}`}
            className="-ml-3 h-11 px-3"
          >
            <ChevronLeft aria-hidden="true" />
            Back
          </Button>
        )}

        {/* Drawn, not announced: `Book.tsx` already says the position in a live
            region, and two of them would say it twice. */}
        <p
          aria-hidden="true"
          className="ml-auto text-sm font-medium tracking-tight text-muted-foreground tabular-nums"
        >
          Step {position} of {ORDER.length}
        </p>
      </div>

      <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-pill bg-accent">
        {/* Scaled, not resized — and unrounded, because the track's own clip
            shapes the ends without a radius squashing under the scale. */}
        <div
          className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${position / ORDER.length})` }}
        />
      </div>
    </div>
  )
}
