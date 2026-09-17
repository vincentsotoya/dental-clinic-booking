import { describe, expect, it } from 'vitest'
import { getWorkingHoursResponse, updateWorkingHoursRequest, workingHoursWeek } from './working-hours'

const PROVIDER_ID = '1b4e2d00-0000-4000-8000-000000000004'

const MORNING = { weekday: 'MONDAY', startMinute: 480, endMinute: 720 } as const
const AFTERNOON = { weekday: 'MONDAY', startMinute: 780, endMinute: 1020 } as const

describe('workingHoursWindow', () => {
  it('accepts a window within the day', () => {
    expect(() => workingHoursWeek.parse([MORNING])).not.toThrow()
  })

  it('rejects a window that ends before it starts', () => {
    const result = workingHoursWeek.safeParse([{ weekday: 'MONDAY', startMinute: 720, endMinute: 480 }])
    expect(result.success).toBe(false)
  })

  it('rejects a window that ends exactly where it starts', () => {
    const result = workingHoursWeek.safeParse([{ weekday: 'MONDAY', startMinute: 480, endMinute: 480 }])
    expect(result.success).toBe(false)
  })

  it('rejects a start before midnight or an end past it', () => {
    expect(workingHoursWeek.safeParse([{ ...MORNING, startMinute: -1 }]).success).toBe(false)
    expect(workingHoursWeek.safeParse([{ ...MORNING, endMinute: 1441 }]).success).toBe(false)
  })

  it('accepts a window that runs the full day, 0 to 1440', () => {
    const result = workingHoursWeek.safeParse([{ weekday: 'SATURDAY', startMinute: 0, endMinute: 1440 }])
    expect(result.success).toBe(true)
  })
})

describe('workingHoursWeek overlap', () => {
  it('accepts two non-overlapping windows on the same day — the lunch break shape', () => {
    const result = workingHoursWeek.safeParse([MORNING, AFTERNOON])
    expect(result.success).toBe(true)
  })

  it('accepts back-to-back windows that share an endpoint', () => {
    const result = workingHoursWeek.safeParse([
      { weekday: 'MONDAY', startMinute: 480, endMinute: 720 },
      { weekday: 'MONDAY', startMinute: 720, endMinute: 900 },
    ])
    expect(result.success).toBe(true)
  })

  it('rejects two windows on the same day that overlap', () => {
    const result = workingHoursWeek.safeParse([
      { weekday: 'MONDAY', startMinute: 480, endMinute: 720 },
      { weekday: 'MONDAY', startMinute: 700, endMinute: 900 },
    ])
    expect(result.success).toBe(false)
  })

  it('does not compare windows across different weekdays', () => {
    const result = workingHoursWeek.safeParse([
      { weekday: 'MONDAY', startMinute: 480, endMinute: 720 },
      { weekday: 'TUESDAY', startMinute: 480, endMinute: 720 },
    ])
    expect(result.success).toBe(true)
  })

  it('catches the overlap regardless of input order', () => {
    const result = workingHoursWeek.safeParse([
      { weekday: 'MONDAY', startMinute: 700, endMinute: 900 },
      { weekday: 'MONDAY', startMinute: 480, endMinute: 720 },
    ])
    expect(result.success).toBe(false)
  })

  it('accepts an empty week — a provider with no hours set yet', () => {
    expect(workingHoursWeek.safeParse([]).success).toBe(true)
  })
})

describe('getWorkingHoursResponse / updateWorkingHoursRequest', () => {
  it('parses a real response shape', () => {
    const result = getWorkingHoursResponse.safeParse({
      providerId: PROVIDER_ID,
      workingHours: [MORNING, AFTERNOON],
    })
    expect(result.success).toBe(true)
  })

  it('the PATCH request is the week alone, wrapped', () => {
    const result = updateWorkingHoursRequest.safeParse({ workingHours: [MORNING] })
    expect(result.success).toBe(true)
  })
})
