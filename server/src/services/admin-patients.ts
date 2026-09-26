// The patient directory's search. Contains-match on first name, last name or
// email, every word of the query having to match somewhere, so "elena marsh"
// narrows rather than widens.

import { PATIENT_DIRECTORY_PAGE_SIZE, type AdminPatient, type AdminPatientsQuery } from '@dental/shared'
import type { PrismaClient } from '../../generated/prisma/client'

export type AdminPatientsDb = Pick<PrismaClient, 'patient'>

export type PatientDirectoryPage = { patients: AdminPatient[]; truncated: boolean }

/** Prisma's `contains` becomes a LIKE without escaping, so a bare `%` or `_` matches every row. */
const escapeLike = (word: string) => word.replace(/[\\%_]/g, '\\$&')

const matches = (word: string) => {
  const contains = escapeLike(word)
  return {
    OR: [
      { firstName: { contains, mode: 'insensitive' as const } },
      { lastName: { contains, mode: 'insensitive' as const } },
      { email: { contains, mode: 'insensitive' as const } },
    ],
  }
}

export async function findPatients(
  db: AdminPatientsDb,
  { q }: AdminPatientsQuery,
): Promise<PatientDirectoryPage> {
  const words = q.split(/\s+/).filter(Boolean)

  // One past the page, so "there is more" is known without a second COUNT.
  const rows = await db.patient.findMany({
    where: { AND: words.map(matches) },
    select: { id: true, firstName: true, lastName: true, email: true, userId: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    take: PATIENT_DIRECTORY_PAGE_SIZE + 1,
  })

  return {
    patients: rows.slice(0, PATIENT_DIRECTORY_PAGE_SIZE).map(({ userId, ...patient }) => ({
      ...patient,
      hasAccount: userId !== null,
    })),
    truncated: rows.length > PATIENT_DIRECTORY_PAGE_SIZE,
  }
}
