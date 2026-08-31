import { describe, expect, it } from 'vitest'
import { isSlotTaken } from './booking'

// The recording that keeps the 409 honest.
//
// `isSlotTaken` reaches four levels into an object Prisma builds, and nothing
// in the type system says that shape is real — it was read off an actual
// rejected insert. If a Prisma upgrade moves it, the endpoint would quietly
// stop recognising a lost race and start answering 500. This fixture is the
// canary: it is the error verbatim, so the test fails when the shape moves.
const PRISMA_23P01 = Object.assign(new Error('Database error. Code: `23P01`.'), {
  name: 'PrismaClientKnownRequestError',
  code: 'P2039',
  clientVersion: '7.10.0',
  meta: {
    modelName: 'Appointment',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: '23P01',
        originalMessage:
          'conflicting key value violates exclusion constraint "appointments_provider_no_overlap"',
        kind: 'postgres',
        code: '23P01',
        severity: 'ERROR',
      },
    },
  },
})

describe('isSlotTaken', () => {
  it('recognises the exclusion violation Prisma actually throws', () => {
    expect(isSlotTaken(PRISMA_23P01)).toBe(true)
  })

  // Both constraints are the same answer to the patient: the time is gone.
  it('recognises the operatory constraint as well as the provider one', () => {
    const roomConflict = structuredClone(PRISMA_23P01.meta)
    roomConflict.driverAdapterError.cause.originalMessage =
      'conflicting key value violates exclusion constraint "appointments_operatory_no_overlap"'

    expect(isSlotTaken(Object.assign(new Error('x'), { meta: roomConflict }))).toBe(true)
  })

  // P2039 is Prisma's generic "the adapter raised something", not a code for
  // exclusion violations. Matching on it would turn every driver-level failure
  // into a cheerful "try another time".
  it('is not fooled by another driver error wearing the same Prisma code', () => {
    const other = Object.assign(new Error('deadlock detected'), {
      code: 'P2039',
      meta: { driverAdapterError: { cause: { code: '40P01' } } },
    })

    expect(isSlotTaken(other)).toBe(false)
  })

  it('ignores errors with no driver error in them at all', () => {
    expect(isSlotTaken(new Error('socket hang up'))).toBe(false)
    expect(isSlotTaken(Object.assign(new Error('unique'), { code: 'P2002', meta: {} }))).toBe(false)
    expect(isSlotTaken(null)).toBe(false)
    expect(isSlotTaken(undefined)).toBe(false)
    expect(isSlotTaken('23P01')).toBe(false)
  })
})
