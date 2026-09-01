// One function per route, each carrying the codes that route can actually
// produce. The `.extract()` subsets in `shared` did the narrowing already; this
// file is where a component finally benefits from it.
//
// No function here knows about React or TanStack Query. They are plain async
// calls, which is what makes the `check:api` script able to run every one of
// them against the real server outside a browser.

import {
  availabilityResponse,
  healthResponse,
  bookAppointmentResponse,
  cancelAppointmentResponse,
  meResponse,
  myAppointmentsResponse,
  rescheduleAppointmentResponse,
  type AvailabilityErrorCode,
  type AvailabilityResponse,
  type AppointmentWindow,
  type BookAppointmentErrorCode,
  type BookAppointmentRequest,
  type BookAppointmentResponse,
  type CancelAppointmentErrorCode,
  type CancelAppointmentResponse,
  type HealthResponse,
  type MeResponse,
  type MyAppointmentsErrorCode,
  type MyAppointmentsResponse,
  type RescheduleAppointmentErrorCode,
  type RescheduleAppointmentRequest,
  type RescheduleAppointmentResponse,
} from '@dental/shared'
import { request } from './client'

type Signal = { signal?: AbortSignal }

/** Is the API up, and can it reach Postgres. The only unguarded endpoint. */
export const getHealth = (options: Signal = {}): Promise<HealthResponse> =>
  request({ path: '/health', schema: healthResponse, ...options })

/**
 * Who the caller is. Answers a stranger with `user: null` rather than refusing
 * them, so this is safe to call on a cold load before anyone has signed in.
 */
export const getMe = (options: Signal = {}): Promise<MeResponse> =>
  request({ path: '/me', schema: meResponse, ...options })

export type AvailabilityParams = {
  /** A service slug, not an id — `?service=routine-exam` reads in a log. */
  service: string
  /** Civil dates, `YYYY-MM-DD`, in the clinic's zone. Never a Date. */
  from: string
  to: string
}

/**
 * The bookable slots for one service over one date range.
 *
 * A slot is a candidate, not a reservation: two people can be looking at the
 * same one, and nothing is held until a booking is written.
 */
export const getAvailability = (
  params: AvailabilityParams,
  options: Signal = {},
): Promise<AvailabilityResponse> => {
  const query = new URLSearchParams(params)
  return request<AvailabilityResponse, AvailabilityErrorCode>({
    path: `/availability?${query}`,
    schema: availabilityResponse,
    ...options,
  })
}

/** The caller's own appointments. `when` defaults server-side to `upcoming`. */
export const getMyAppointments = (
  when?: AppointmentWindow,
  options: Signal = {},
): Promise<MyAppointmentsResponse> =>
  request<MyAppointmentsResponse, MyAppointmentsErrorCode>({
    path: when === undefined ? '/appointments/me' : `/appointments/me?when=${when}`,
    schema: myAppointmentsResponse,
    ...options,
  })

/**
 * Book one offered slot.
 *
 * Throws `SLOT_TAKEN` when somebody won the race for it, and `SLOT_UNAVAILABLE`
 * when the time is no longer on offer at all. Both are 409s, and both mean the
 * caller's slot list is stale.
 */
export const bookAppointment = (
  body: BookAppointmentRequest,
  options: Signal = {},
): Promise<BookAppointmentResponse> =>
  request<BookAppointmentResponse, BookAppointmentErrorCode>({
    path: '/appointments',
    schema: bookAppointmentResponse,
    method: 'POST',
    body,
    ...options,
  })

/**
 * Cancel an appointment. No body: the id is in the path and the actor is in the
 * cookie.
 *
 * Cancelling one that is already cancelled succeeds and changes nothing, so a
 * retried request is safe.
 */
export const cancelAppointment = (
  appointmentId: string,
  options: Signal = {},
): Promise<CancelAppointmentResponse> =>
  request<CancelAppointmentResponse, CancelAppointmentErrorCode>({
    path: `/appointments/${appointmentId}/cancel`,
    schema: cancelAppointmentResponse,
    method: 'PATCH',
    ...options,
  })

/** Move an appointment. Same id comes back, at its new time. */
export const rescheduleAppointment = (
  appointmentId: string,
  body: RescheduleAppointmentRequest,
  options: Signal = {},
): Promise<RescheduleAppointmentResponse> =>
  request<RescheduleAppointmentResponse, RescheduleAppointmentErrorCode>({
    path: `/appointments/${appointmentId}/reschedule`,
    schema: rescheduleAppointmentResponse,
    method: 'PATCH',
    body,
    ...options,
  })
