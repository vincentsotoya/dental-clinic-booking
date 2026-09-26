// The front desk's patient directory. The search runs on the server
// (`shared/src/admin-patients.ts`): this screen never holds more than one page
// of people, and a longer list is answered by typing, not by scrolling.
//
// Rows are not links yet — the per-patient page they open is Phase 8's task 5.

import { useEffect, useState } from 'react'
import { PATIENT_DIRECTORY_PAGE_SIZE, PATIENT_SEARCH_MAX_LENGTH, type AdminPatient } from '@dental/shared'
import { useAdminPatients } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

/** Long enough to skip the keystrokes of a word, short enough that it still feels live. */
const SEARCH_DELAY_MS = 250

export default function AdminPatients() {
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const patients = useAdminPatients(q)

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Patients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone the clinic keeps a chart for, including people who never made an account.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-1">
        <Label htmlFor="patient-search">Search patients</Label>
        <Input
          id="patient-search"
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Name or email"
          maxLength={PATIENT_SEARCH_MAX_LENGTH}
          autoComplete="off"
        />
      </div>

      {patients.isError && !patients.data && (
        <div className="mt-6">
          <LoadFailed what="the patient directory" onRetry={() => void patients.refetch()} />
        </div>
      )}

      {patients.isPending && (
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      )}

      {patients.data && (
        <div className="mt-6" aria-busy={patients.isPlaceholderData}>
          <p role="status" className="text-sm text-muted-foreground">
            {summary(patients.data.patients.length, patients.data.truncated, q)}
          </p>

          {patients.data.patients.length > 0 && (
            <ul
              className={`mt-3 flex flex-col gap-2 ${patients.isPlaceholderData ? 'opacity-60' : ''}`}
            >
              {patients.data.patients.map((patient) => (
                <PatientRow key={patient.id} patient={patient} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function PatientRow({ patient }: { patient: AdminPatient }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-card border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="font-medium">
          {patient.firstName} {patient.lastName}
        </p>
        <p className="truncate text-sm text-muted-foreground">{patient.email}</p>
      </div>
      {!patient.hasAccount && <Badge variant="outline">No account</Badge>}
    </li>
  )
}

function summary(count: number, truncated: boolean, q: string): string {
  if (count === 0) return q === '' ? 'No patients on file.' : `No patients match “${q}”.`
  if (truncated) {
    return `Showing the first ${PATIENT_DIRECTORY_PAGE_SIZE}. Search by name or email to narrow the list.`
  }
  return count === 1 ? '1 patient' : `${count} patients`
}
