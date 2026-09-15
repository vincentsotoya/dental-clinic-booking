import { describe, expect, it } from 'vitest'
import {
  INSURANCE_MEMBER_ID_MAX_LENGTH,
  INSURANCE_PROVIDER_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  patientProfile,
  updateProfileError,
} from './profile'

const FULL = {
  phone: '(555) 019-2231',
  dateOfBirth: '1990-04-12',
  insuranceProvider: 'Northeast Dental Alliance',
  insuranceMemberId: 'NDA-88213',
}

const EMPTY = {
  phone: null,
  dateOfBirth: null,
  insuranceProvider: null,
  insuranceMemberId: null,
}

describe('patientProfile', () => {
  it('accepts every field filled in', () => {
    expect(patientProfile.safeParse(FULL).success).toBe(true)
  })

  it('accepts every field null — a chart with nothing on file yet', () => {
    expect(patientProfile.safeParse(EMPTY).success).toBe(true)
  })

  it('rejects a calendar date that does not exist', () => {
    expect(patientProfile.safeParse({ ...FULL, dateOfBirth: '2024-02-30' }).success).toBe(false)
  })

  it('rejects a date of birth in the future', () => {
    const nextYear = String(new Date().getFullYear() + 1)
    expect(
      patientProfile.safeParse({ ...FULL, dateOfBirth: `${nextYear}-01-01` }).success,
    ).toBe(false)
  })

  it('rejects a timestamp where a calendar date belongs', () => {
    expect(
      patientProfile.safeParse({ ...FULL, dateOfBirth: '1990-04-12T00:00:00Z' }).success,
    ).toBe(false)
  })

  it.each([
    ['phone', PHONE_MAX_LENGTH],
    ['insuranceProvider', INSURANCE_PROVIDER_MAX_LENGTH],
    ['insuranceMemberId', INSURANCE_MEMBER_ID_MAX_LENGTH],
  ])('rejects %s past its stored length', (field, max) => {
    expect(patientProfile.safeParse({ ...FULL, [field]: 'x'.repeat(max + 1) }).success).toBe(
      false,
    )
  })

  it('requires every field to be stated — no partial update through this shape', () => {
    expect(patientProfile.safeParse({ phone: '555-0100' }).success).toBe(false)
  })
})

describe('updateProfileError', () => {
  it('admits only the base four — the route is addressed by the session, not an id', () => {
    expect(
      updateProfileError.safeParse({ error: { code: 'INVALID_REQUEST', message: 'x' } }).success,
    ).toBe(true)
    expect(
      updateProfileError.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success,
    ).toBe(false)
  })
})
