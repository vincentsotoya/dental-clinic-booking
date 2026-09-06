// What a page shows when the catalogue could not be read.
//
// No error text and no invented contact detail: `ApiRequestError` carries a
// message written for a developer, `INTERNAL` deliberately carries none, and
// the clinic has no phone number recorded anywhere in this repo. A retry is the
// one thing this component can honestly offer.

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Alert>
      <AlertTitle className="font-display font-bold">We couldn&rsquo;t load {what}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>That is our side, not yours.</span>
        <Button variant="outline" size="sm" className="rounded-pill" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}
