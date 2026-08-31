import { describe, expect, it } from 'vitest'
import { availabilityError } from './availability'
import { apiError, apiErrorCode, baseErrorCode, errorBody, guardedErrorCode } from './errors'

describe('errorBody', () => {
  it('accepts every code in the registry', () => {
    for (const code of apiErrorCode.options) {
      expect(apiError.safeParse({ error: { code, message: 'nope' } }).success).toBe(true)
    }
  })

  it('rejects a code nobody declared', () => {
    expect(apiError.safeParse({ error: { code: 'TEAPOT', message: 'x' } }).success).toBe(false)
  })

  it('requires both halves of the envelope', () => {
    expect(apiError.safeParse({ error: { code: 'INTERNAL' } }).success).toBe(false)
    expect(apiError.safeParse({ error: { message: 'x' } }).success).toBe(false)
    expect(apiError.safeParse({ code: 'INTERNAL', message: 'x' }).success).toBe(false)
  })
})

// The reason this module exists. Under a single flat enum every endpoint would
// accept every code, and a client could not tell from the contract which
// failures it actually had to handle.
describe('an endpoint only admits its own codes', () => {
  it('availability rejects the auth codes', () => {
    for (const code of ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND']) {
      expect(availabilityError.safeParse({ error: { code, message: 'x' } }).success).toBe(false)
    }
  })

  it('availability still accepts SERVICE_NOT_FOUND — the specific one it does return', () => {
    expect(
      availabilityError.safeParse({ error: { code: 'SERVICE_NOT_FOUND', message: 'x' } }).success,
    ).toBe(true)
  })

  it('a guarded route rejects the availability codes', () => {
    const guarded = errorBody(guardedErrorCode)

    expect(guarded.safeParse({ error: { code: 'RANGE_TOO_LONG', message: 'x' } }).success).toBe(
      false,
    )
    expect(guarded.safeParse({ error: { code: 'FORBIDDEN', message: 'x' } }).success).toBe(true)
  })
})

describe('the groups', () => {
  // Every set is built on the same floor: any endpoint can fail validation and
  // any endpoint can fall over.
  it.each([
    ['base', baseErrorCode],
    ['guarded', guardedErrorCode],
    ['availability', availabilityError.shape.error.shape.code],
  ])('%s includes INVALID_REQUEST and INTERNAL', (_label, codes) => {
    expect(codes.options).toContain('INVALID_REQUEST')
    expect(codes.options).toContain('INTERNAL')
  })

  it('every group is drawn from the registry', () => {
    for (const codes of [baseErrorCode, guardedErrorCode]) {
      for (const code of codes.options) {
        expect(apiErrorCode.options).toContain(code)
      }
    }
  })
})
