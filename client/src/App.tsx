// Still the scaffold check, now going through the typed client rather than its
// own fetch. Home, Services and Dentists replace this.

import { useHealth } from './api/hooks'
import { NetworkError } from './api/errors'

export default function App() {
  const health = useHealth()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-card border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Quillon Dental</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scaffold check: client &rarr; typed API client &rarr; Vite proxy &rarr; Express &rarr;
          shared schema.
        </p>

        <div className="mt-5 text-sm">
          {health.isPending && <p className="text-muted-foreground">Checking API&hellip;</p>}

          {health.isError && (
            <p className="text-destructive">
              {health.error instanceof NetworkError
                ? health.error.message
                : `The API answered with a problem: ${health.error.message}`}
            </p>
          )}

          {health.data && (
            <dl className="space-y-2">
              <Row label="Status" value={health.data.status} />
              <Row label="Database" value={health.data.database} />
              <Row label="Clinic timezone" value={health.data.clinicTimezone} mono />
              <Row label="Server time" value={health.data.serverTime} mono />
            </dl>
          )}
        </div>
      </div>
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : 'font-medium'}>{value}</dd>
    </div>
  )
}
