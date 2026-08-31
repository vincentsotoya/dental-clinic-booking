import { meResponse } from '@dental/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import {
  ADMIN_USER,
  PATIENT_CHART,
  PATIENT_USER,
  stubAuth,
  stubPatientDb,
  type StubUser,
} from '../test-support/stubs'

function get(user: StubUser | null, chart = PATIENT_CHART) {
  const app = createApp({
    db: {
      ...stubPatientDb(user?.role === 'PATIENT' ? chart : null),
      // Availability's slice of Prisma, unused here but part of AppDeps.
      service: { findUnique: async () => null },
    },
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
  } as unknown as Parameters<typeof createApp>[0])

  return request(app).get('/api/me')
}

describe('GET /api/me', () => {
  // Why this route is not behind requireAuth: a 401 here would make every cold
  // page load look like an error.
  it('answers 200 with nulls for a stranger, not 401', async () => {
    const res = await get(null)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ user: null, patient: null })
    expect(() => meResponse.parse(res.body)).not.toThrow()
  })

  it('answers with the user and their chart for a patient', async () => {
    const res = await get(PATIENT_USER)

    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({
      id: PATIENT_USER.id,
      email: PATIENT_USER.email,
      firstName: PATIENT_USER.firstName,
      lastName: PATIENT_USER.lastName,
      role: 'PATIENT',
    })
    expect(res.body.patient.id).toBe(PATIENT_CHART.id)
    expect(() => meResponse.parse(res.body)).not.toThrow()
  })

  // A front-desk chart carries the name the clinic has on file, which signup never
  // wrote. Echoing the login's name would look right until the two diverge.
  it('sends the chart\u2019s own name, not the login\u2019s', async () => {
    const res = await get(PATIENT_USER, {
      ...PATIENT_CHART,
      firstName: 'Elena Beatriz',
      lastName: 'Marsh-Okonkwo',
    })

    expect(res.body.user.firstName).toBe('Elena')
    expect(res.body.patient.firstName).toBe('Elena Beatriz')
    expect(res.body.patient.lastName).toBe('Marsh-Okonkwo')
  })

  // Not an error state: an admin administers the schedule and receives no care.
  it('answers with a null patient for an admin', async () => {
    const res = await get(ADMIN_USER)

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('ADMIN')
    expect(res.body.patient).toBeNull()
    expect(() => meResponse.parse(res.body)).not.toThrow()
  })

  it('never lets an identity be cached', async () => {
    const res = await get(PATIENT_USER)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  // The schema's most sensitive fields belong to Phase 6's profile endpoint, not
  // to a route the client calls on every load.
  it('does not ship date of birth, phone or insurance', async () => {
    const res = await get(PATIENT_USER)

    expect(Object.keys(res.body.patient).sort()).toEqual(['email', 'firstName', 'id', 'lastName'])
  })
})
