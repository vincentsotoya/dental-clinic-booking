import { describe, expect, it } from 'vitest'
import {
  adminPatient,
  adminPatientsError,
  adminPatientsQuery,
  PATIENT_SEARCH_MAX_LENGTH,
} from './admin-patients'

describe('adminPatientsQuery', () => {
  it('treats an absent search as the empty one', () => {
    expect(adminPatientsQuery.parse({})).toEqual({ q: '' })
  })

  it('trims, so a blank search is the same as none', () => {
    expect(adminPatientsQuery.parse({ q: '   ' })).toEqual({ q: '' })
    expect(adminPatientsQuery.parse({ q: '  marsh ' })).toEqual({ q: 'marsh' })
  })

  it('refuses a search longer than the cap', () => {
    const tooLong = 'a'.repeat(PATIENT_SEARCH_MAX_LENGTH + 1)
    expect(adminPatientsQuery.safeParse({ q: tooLong }).success).toBe(false)
  })

  it('refuses a repeated parameter, which Express parses as an array', () => {
    expect(adminPatientsQuery.safeParse({ q: ['a', 'b'] }).success).toBe(false)
  })
})

describe('adminPatient', () => {
  const ROW = {
    id: '2c5f3e00-0000-4000-8000-000000000001',
    firstName: 'Elena',
    lastName: 'Marsh',
    email: 'elena.marsh@example.com',
    hasAccount: true,
  }

  it('parses a row', () => {
    expect(adminPatient.parse(ROW)).toEqual(ROW)
  })

  it('strips what it does not name, so a sensitive column cannot ride along', () => {
    const parsed = adminPatient.parse({ ...ROW, phone: '+1-555-0142', insuranceMemberId: 'NDP-1' })
    expect(parsed).not.toHaveProperty('phone')
    expect(parsed).not.toHaveProperty('insuranceMemberId')
  })
})

describe('adminPatientsError', () => {
  it('has no NOT_FOUND: nothing here is addressed by an id', () => {
    expect(adminPatientsError.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(false)
  })
})
