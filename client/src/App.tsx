import { useEffect, useState } from 'react'
import { healthResponse, type HealthResponse } from '@dental/shared'

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health', { signal: controller.signal })
      .then((res) => res.json())
      // Parsed, not cast: if the API drifts from the shared schema the client
      // finds out here instead of rendering undefined.
      .then((json) => setState({ kind: 'ok', data: healthResponse.parse(json) }))
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Dental Clinic Booking</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scaffold check: client &rarr; Vite proxy &rarr; Express &rarr; shared schema.
        </p>

        <div className="mt-5 text-sm">
          {state.kind === 'loading' && <p className="text-slate-500">Checking API&hellip;</p>}

          {state.kind === 'error' && (
            <p className="text-red-600">
              API unreachable &mdash; {state.message}. Is the server running?
            </p>
          )}

          {state.kind === 'ok' && (
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium text-emerald-600">{state.data.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Clinic timezone</dt>
                <dd className="font-mono">{state.data.clinicTimezone}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Server time</dt>
                <dd className="font-mono text-xs">{state.data.serverTime}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </main>
  )
}
