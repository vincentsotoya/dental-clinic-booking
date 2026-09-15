import { getProfileResponse, updateProfileResponse } from '@dental/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import {
  ADMIN_USER,
  PATIENT_CHART,
  PATIENT_USER,
  stubAuth,
  stubProfileDb,
  type StubChart,
  type StubUser,
} from '../test-support/stubs'

function appFor(user: StubUser | null, chart: StubChart | null = PATIENT_CHART) {
  return createApp({
    db: {
      ...stubProfileDb(user?.role === 'PATIENT' ? chart : null),
      // Availability's slice of Prisma, unused here but part of AppDeps.
      service: { findUnique: async () => null },
    },
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
  } as unknown as Parameters<typeof createApp>[0])
}

const FILLED = {
  ...PATIENT_CHART,
  phone: '555-0182',
  dateOfBirth: new Date('1988-04-17'),
  insuranceProvider: 'Northeast Dental Alliance',
  insuranceMemberId: 'NDA-88213',
}

describe('GET /api/me/profile', () => {
  it('refuses a stranger, unlike /api/me', async () => {
    const res = await request(appFor(null)).get('/api/me/profile')
    expect(res.status).toBe(401)
  })

  // An admin's login has no chart at all — "not this kind of account", not
  // "nothing on file".
  it('refuses an admin', async () => {
    const res = await request(appFor(ADMIN_USER)).get('/api/me/profile')
    expect(res.status).toBe(403)
  })

  it('answers with nulls for a chart with nothing on file yet', async () => {
    const res = await request(appFor(PATIENT_USER)).get('/api/me/profile')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      profile: { phone: null, dateOfBirth: null, insuranceProvider: null, insuranceMemberId: null },
    })
    expect(() => getProfileResponse.parse(res.body)).not.toThrow()
  })

  // The column is a UTC-midnight Date; the wire contract is the civil date it
  // holds, not a timestamp that could roll to the wrong day off by one.
  it('sends the date of birth as a plain calendar date', async () => {
    const res = await request(appFor(PATIENT_USER, FILLED)).get('/api/me/profile')

    expect(res.body.profile).toEqual({
      phone: '555-0182',
      dateOfBirth: '1988-04-17',
      insuranceProvider: 'Northeast Dental Alliance',
      insuranceMemberId: 'NDA-88213',
    })
  })

  it('never lets these fields be cached', async () => {
    const res = await request(appFor(PATIENT_USER)).get('/api/me/profile')
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('PATCH /api/me/profile', () => {
  it('refuses a stranger', async () => {
    const res = await request(appFor(null)).patch('/api/me/profile').send({
      phone: null,
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceMemberId: null,
    })
    expect(res.status).toBe(401)
  })

  it('refuses an admin', async () => {
    const res = await request(appFor(ADMIN_USER)).patch('/api/me/profile').send({
      phone: null,
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceMemberId: null,
    })
    expect(res.status).toBe(403)
  })

  it('writes every field and echoes them back', async () => {
    const app = appFor(PATIENT_USER)

    const res = await request(app).patch('/api/me/profile').send({
      phone: '(555) 019-2231',
      dateOfBirth: '1990-04-12',
      insuranceProvider: 'Coastal Dental Plus',
      insuranceMemberId: 'CDP-1200',
    })

    expect(res.status).toBe(200)
    expect(res.body.profile).toEqual({
      phone: '(555) 019-2231',
      dateOfBirth: '1990-04-12',
      insuranceProvider: 'Coastal Dental Plus',
      insuranceMemberId: 'CDP-1200',
    })
    expect(() => updateProfileResponse.parse(res.body)).not.toThrow()

    // The same session's GET now reads what the PATCH wrote, through the same
    // stub row — the round trip a real save-then-reload does.
    const after = await request(app).get('/api/me/profile')
    expect(after.body.profile.insuranceMemberId).toBe('CDP-1200')
  })

  // Clearing a field is a real edit, not a value the shape has to omit.
  it('clears a field that was previously set', async () => {
    const res = await request(appFor(PATIENT_USER, FILLED)).patch('/api/me/profile').send({
      phone: null,
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceMemberId: null,
    })

    expect(res.status).toBe(200)
    expect(res.body.profile).toEqual({
      phone: null,
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceMemberId: null,
    })
  })

  it('rejects a date of birth in the future as INVALID_REQUEST', async () => {
    const res = await request(appFor(PATIENT_USER)).patch('/api/me/profile').send({
      phone: null,
      dateOfBirth: '2099-01-01',
      insuranceProvider: null,
      insuranceMemberId: null,
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('rejects a field longer than what is stored', async () => {
    const res = await request(appFor(PATIENT_USER)).patch('/api/me/profile').send({
      phone: 'x'.repeat(31),
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceMemberId: null,
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('rejects a body missing a field rather than treating it as unchanged', async () => {
    const res = await request(appFor(PATIENT_USER))
      .patch('/api/me/profile')
      .send({ phone: '555-0100' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('never lets the response be cached', async () => {
    const res = await request(appFor(PATIENT_USER)).patch('/api/me/profile').send({
      phone: null,
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceMemberId: null,
    })
    expect(res.headers['cache-control']).toBe('no-store')
  })
})
