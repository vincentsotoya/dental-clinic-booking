import { describe, expect, it } from 'vitest'
import { meError, mePatient, meResponse, meUser } from './me'

const USER = {
  id: 'kR3nQ8vX2mB7',
  email: 'elena.marsh@example.com',
  firstName: 'Elena',
  lastName: 'Marsh',
  role: 'PATIENT',
}

const PATIENT = {
  id: '3d604f00-0000-4000-8000-0000000000a1',
  firstName: 'Elena',
  lastName: 'Marsh',
  email: 'elena.marsh@example.com',
}

describe('meUser', () => {
  // Better Auth mints its own ids and never promises UUIDs (ADR-0006).
  it('accepts an id that is not a UUID', () => {
    expect(meUser.safeParse(USER).success).toBe(true)
  })

  it('rejects a role outside the two we have', () => {
    expect(meUser.safeParse({ ...USER, role: 'DENTIST' }).success).toBe(false)
  })
})

describe('mePatient', () => {
  it('requires a real UUID — this id is ours', () => {
    expect(mePatient.safeParse(PATIENT).success).toBe(true)
    expect(mePatient.safeParse({ ...PATIENT, id: 'kR3nQ8vX2mB7' }).success).toBe(false)
  })
})

describe('meResponse', () => {
  it.each([
    ['a stranger', { user: null, patient: null }],
    ['a patient', { user: USER, patient: PATIENT }],
    ['an admin', { user: { ...USER, role: 'ADMIN' }, patient: null }],
    ['a login whose chart is missing', { user: USER, patient: null }],
  ])('accepts %s', (_label, body) => {
    expect(meResponse.safeParse(body).success).toBe(true)
  })

  // Both halves present even when empty, so the client destructures one shape
  // instead of testing for absent keys.
  it('rejects a body missing a half', () => {
    expect(meResponse.safeParse({ user: USER }).success).toBe(false)
    expect(meResponse.safeParse({ patient: null }).success).toBe(false)
  })
})

describe('meError', () => {
  it('admits only what an unguarded, input-free route can return', () => {
    expect(meError.safeParse({ error: { code: 'INTERNAL', message: 'x' } }).success).toBe(true)
    expect(meError.safeParse({ error: { code: 'FORBIDDEN', message: 'x' } }).success).toBe(false)
    expect(meError.safeParse({ error: { code: 'SERVICE_NOT_FOUND', message: 'x' } }).success).toBe(
      false,
    )
  })
})
