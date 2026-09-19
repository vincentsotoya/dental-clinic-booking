// One function per route, each carrying the codes that route can actually
// produce. The `.extract()` subsets in `shared` did the narrowing already; this
// file is where a component finally benefits from it.
//
// No function here knows about React or TanStack Query. They are plain async
// calls, which is what makes the `check:api` script able to run every one of
// them against the real server outside a browser.

import {
  adminAppointmentsResponse,
  availabilityResponse,
  closeAppointmentResponse,
  createClosureResponse,
  createTimeOffResponse,
  deleteClosureResponse,
  deleteTimeOffResponse,
  getClosuresResponse,
  getTimeOffResponse,
  getWorkingHoursResponse,
  healthResponse,
  bookAppointmentResponse,
  cancelAppointmentResponse,
  getProfileResponse,
  meResponse,
  myAppointmentsResponse,
  providersResponse,
  servicesResponse,
  rescheduleAppointmentResponse,
  updateProfileResponse,
  updateWorkingHoursResponse,
  type AdminAppointmentsErrorCode,
  type AdminAppointmentsResponse,
  type AppointmentOutcome,
  type AvailabilityErrorCode,
  type AvailabilityResponse,
  type AppointmentWindow,
  type BookAppointmentErrorCode,
  type BookAppointmentRequest,
  type BookAppointmentResponse,
  type CancelAppointmentErrorCode,
  type CancelAppointmentResponse,
  type CloseAppointmentErrorCode,
  type CloseAppointmentResponse,
  type CreateClosureErrorCode,
  type CreateClosureRequestInput,
  type CreateClosureResponse,
  type CreateTimeOffErrorCode,
  type CreateTimeOffRequestInput,
  type CreateTimeOffResponse,
  type DeleteClosureErrorCode,
  type DeleteClosureResponse,
  type DeleteTimeOffErrorCode,
  type DeleteTimeOffResponse,
  type GetClosuresErrorCode,
  type GetClosuresResponse,
  type GetProfileErrorCode,
  type GetProfileResponse,
  type GetTimeOffErrorCode,
  type GetTimeOffResponse,
  type GetWorkingHoursErrorCode,
  type GetWorkingHoursResponse,
  type HealthResponse,
  type MeResponse,
  type MyAppointmentsErrorCode,
  type MyAppointmentsResponse,
  type ProvidersResponse,
  type ServicesResponse,
  type RescheduleAppointmentErrorCode,
  type RescheduleAppointmentRequest,
  type RescheduleAppointmentResponse,
  type UpdateProfileErrorCode,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
  type UpdateWorkingHoursErrorCode,
  type UpdateWorkingHoursRequest,
  type UpdateWorkingHoursResponse,
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

/**
 * The clinic's price list. Public, and the only response this API lets a shared
 * cache hold, so a page may call it without a session.
 */
export const getServices = (options: Signal = {}): Promise<ServicesResponse> =>
  request({ path: '/services', schema: servicesResponse, ...options })

/** The provider directory. Active providers only — a retired one is not bookable. */
export const getProviders = (options: Signal = {}): Promise<ProvidersResponse> =>
  request({ path: '/providers', schema: providersResponse, ...options })

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

/** Phone, date of birth and insurance — the fields `/api/me` deliberately leaves out. */
export const getProfile = (options: Signal = {}): Promise<GetProfileResponse> =>
  request<GetProfileResponse, GetProfileErrorCode>({
    path: '/me/profile',
    schema: getProfileResponse,
    ...options,
  })

/** Every field, stated: the screen has one save button, so there is no partial update. */
export const updateProfile = (
  body: UpdateProfileRequest,
  options: Signal = {},
): Promise<UpdateProfileResponse> =>
  request<UpdateProfileResponse, UpdateProfileErrorCode>({
    path: '/me/profile',
    schema: updateProfileResponse,
    method: 'PATCH',
    body,
    ...options,
  })

export type AdminAppointmentsParams = {
  /** Civil dates, `YYYY-MM-DD`, in the clinic's zone. `to` may equal `from` for a single day. */
  from: string
  to: string
}

/** The clinic's own read of the schedule — every patient, over a date range. */
export const getAdminAppointments = (
  params: AdminAppointmentsParams,
  options: Signal = {},
): Promise<AdminAppointmentsResponse> => {
  const query = new URLSearchParams(params)
  return request<AdminAppointmentsResponse, AdminAppointmentsErrorCode>({
    path: `/admin/appointments?${query}`,
    schema: adminAppointmentsResponse,
    ...options,
  })
}

/**
 * The clinic's own judgement about a visit that has happened: `COMPLETED` or
 * `NO_SHOW`. Closing one out with the outcome it already has succeeds and
 * changes nothing, so a retried request is safe.
 */
export const closeAppointment = (
  appointmentId: string,
  outcome: AppointmentOutcome,
  options: Signal = {},
): Promise<CloseAppointmentResponse> =>
  request<CloseAppointmentResponse, CloseAppointmentErrorCode>({
    path: `/admin/appointments/${appointmentId}/close`,
    schema: closeAppointmentResponse,
    method: 'PATCH',
    body: { outcome },
    ...options,
  })

/** A provider's recurring weekly window — the admin's own edit of it. */
export const getWorkingHours = (
  providerId: string,
  options: Signal = {},
): Promise<GetWorkingHoursResponse> =>
  request<GetWorkingHoursResponse, GetWorkingHoursErrorCode>({
    path: `/admin/providers/${providerId}/working-hours`,
    schema: getWorkingHoursResponse,
    ...options,
  })

/** Every window, stated: the screen has one save button over one week, so there is no partial update. */
export const updateWorkingHours = (
  providerId: string,
  body: UpdateWorkingHoursRequest,
  options: Signal = {},
): Promise<UpdateWorkingHoursResponse> =>
  request<UpdateWorkingHoursResponse, UpdateWorkingHoursErrorCode>({
    path: `/admin/providers/${providerId}/working-hours`,
    schema: updateWorkingHoursResponse,
    method: 'PATCH',
    body,
    ...options,
  })

/** One provider's dated ranges of unavailability — whole clinic-zone days, never an instant. */
export const getTimeOff = (providerId: string, options: Signal = {}): Promise<GetTimeOffResponse> =>
  request<GetTimeOffResponse, GetTimeOffErrorCode>({
    path: `/admin/providers/${providerId}/time-off`,
    schema: getTimeOffResponse,
    ...options,
  })

/** Add one range. 409s if it would strand a CONFIRMED appointment already on the books. */
export const createTimeOff = (
  providerId: string,
  body: CreateTimeOffRequestInput,
  options: Signal = {},
): Promise<CreateTimeOffResponse> =>
  request<CreateTimeOffResponse, CreateTimeOffErrorCode>({
    path: `/admin/providers/${providerId}/time-off`,
    schema: createTimeOffResponse,
    method: 'POST',
    body,
    ...options,
  })

/** Remove one range, by its own id — never nested under a provider, unlike the two above. */
export const deleteTimeOff = (id: string, options: Signal = {}): Promise<DeleteTimeOffResponse> =>
  request<DeleteTimeOffResponse, DeleteTimeOffErrorCode>({
    path: `/admin/time-off/${id}`,
    schema: deleteTimeOffResponse,
    method: 'DELETE',
    ...options,
  })

/** Every dated range the whole clinic is shut, across every provider. */
export const getClosures = (options: Signal = {}): Promise<GetClosuresResponse> =>
  request<GetClosuresResponse, GetClosuresErrorCode>({
    path: '/admin/closures',
    schema: getClosuresResponse,
    ...options,
  })

/** Add one closure. 409s if it would strand a CONFIRMED appointment, any provider. */
export const createClosure = (
  body: CreateClosureRequestInput,
  options: Signal = {},
): Promise<CreateClosureResponse> =>
  request<CreateClosureResponse, CreateClosureErrorCode>({
    path: '/admin/closures',
    schema: createClosureResponse,
    method: 'POST',
    body,
    ...options,
  })

/** Remove one closure, by its own id. */
export const deleteClosure = (id: string, options: Signal = {}): Promise<DeleteClosureResponse> =>
  request<DeleteClosureResponse, DeleteClosureErrorCode>({
    path: `/admin/closures/${id}`,
    schema: deleteClosureResponse,
    method: 'DELETE',
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
