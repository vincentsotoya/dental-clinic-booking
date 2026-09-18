// The hooks a component reaches for. Thin on purpose: every one is an endpoint
// function, a key, and the invalidation that write implies.
//
// Each mutation invalidates availability, including cancel. Cancelling frees a
// slot the instant it happens (the exclusion constraints are partial on
// CONFIRMED), so a slot list rendered a moment earlier is now missing a time
// that is genuinely bookable.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import type {
  AdminAppointmentsResponse,
  AppointmentWindow,
  AvailabilityResponse,
  CreateClosureRequestInput,
  CreateTimeOffRequestInput,
  GetClosuresResponse,
  GetTimeOffResponse,
  GetWorkingHoursResponse,
  HealthResponse,
  BookAppointmentRequest,
  GetProfileResponse,
  MeResponse,
  MyAppointmentsResponse,
  ProvidersResponse,
  RescheduleAppointmentRequest,
  ServicesResponse,
  UpdateProfileRequest,
  UpdateWorkingHoursRequest,
} from '@dental/shared'
import {
  bookAppointment,
  cancelAppointment,
  createClosure,
  createTimeOff,
  deleteClosure,
  deleteTimeOff,
  getAdminAppointments,
  getAvailability,
  getClosures,
  getHealth,
  getMe,
  getMyAppointments,
  getProfile,
  getProviders,
  getServices,
  getTimeOff,
  getWorkingHours,
  rescheduleAppointment,
  updateProfile,
  updateWorkingHours,
  type AdminAppointmentsParams,
  type AvailabilityParams,
} from './endpoints'
import { queryKeys } from './keys'

type QueryTuning<T> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>

/** Whether the API and its database are reachable. */
export const useHealth = (options: QueryTuning<HealthResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => getHealth({ signal }),
    ...options,
  })

/**
 * The current session. Answers for a signed-out visitor too, so a component can
 * render a name or a "Sign in" link from one call.
 *
 * The session hook and protected routes that build on this are the next task;
 * this is only the query.
 */
export const useMe = (options: QueryTuning<MeResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.me(),
    queryFn: ({ signal }) => getMe({ signal }),
    ...options,
  })

// The catalogue is the one thing here that is allowed to be stale. A price list
// that is five minutes old is still a price list; the server says the same with
// `max-age=300`, and these windows agree with it on purpose. Refetching it when
// a tab regains focus would be spending a request to learn nothing.
const CATALOGUE_TUNING = {
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const

/** The clinic's treatments and prices. */
export const useServices = (options: QueryTuning<ServicesResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.services(),
    queryFn: ({ signal }) => getServices({ signal }),
    ...CATALOGUE_TUNING,
    ...options,
  })

/** The provider directory. */
export const useProviders = (options: QueryTuning<ProvidersResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.providers(),
    queryFn: ({ signal }) => getProviders({ signal }),
    ...CATALOGUE_TUNING,
    ...options,
  })

/** Bookable slots. `enabled: false` until the caller has picked a service and a range. */
export const useAvailability = (
  params: AvailabilityParams | null,
  options: QueryTuning<AvailabilityResponse> = {},
) =>
  useQuery({
    queryKey: queryKeys.availabilityFor(params ?? { service: '', from: '', to: '' }),
    queryFn: ({ signal }) => getAvailability(params as AvailabilityParams, { signal }),
    enabled: params !== null,
    ...options,
  })

export const useMyAppointments = (
  when?: AppointmentWindow,
  options: QueryTuning<MyAppointmentsResponse> = {},
) =>
  useQuery({
    queryKey: queryKeys.myAppointments(when),
    queryFn: ({ signal }) => getMyAppointments(when, { signal }),
    ...options,
  })

/** The clinic's own read of the schedule — every patient, over a date range. */
export const useAdminAppointments = (
  params: AdminAppointmentsParams,
  options: QueryTuning<AdminAppointmentsResponse> = {},
) =>
  useQuery({
    queryKey: queryKeys.adminAppointments(params),
    queryFn: ({ signal }) => getAdminAppointments(params, { signal }),
    ...options,
  })

/** A provider's recurring weekly window, as the admin editor reads it. */
export const useWorkingHours = (
  providerId: string,
  options: QueryTuning<GetWorkingHoursResponse> = {},
) =>
  useQuery({
    queryKey: queryKeys.workingHours(providerId),
    queryFn: ({ signal }) => getWorkingHours(providerId, { signal }),
    ...options,
  })

/**
 * Writes the whole week and hands back what Postgres now holds.
 *
 * `setQueryData`, the same reasoning `useUpdateProfile` already carries: the
 * response already is the new week. Availability is invalidated too — a
 * changed window is a changed answer to "when can this be booked", the one
 * thing this mutation can never leave stale underneath it.
 */
export const useUpdateWorkingHours = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (args: { providerId: string; body: UpdateWorkingHoursRequest }) =>
      updateWorkingHours(args.providerId, args.body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.workingHours(variables.providerId), data)
      return queryClient.invalidateQueries({ queryKey: queryKeys.availability() })
    },
  })
}

/** One provider's dated ranges of unavailability, as the admin editor reads them. */
export const useTimeOff = (providerId: string, options: QueryTuning<GetTimeOffResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.timeOff(providerId),
    queryFn: ({ signal }) => getTimeOff(providerId, { signal }),
    ...options,
  })

/**
 * Adds one range and appends it to the cached list, rather than refetching
 * for an answer the response already carries — the same reasoning
 * `useUpdateWorkingHours` gives its own `setQueryData`. Availability is
 * invalidated too: a new range is a changed answer to "when can this be
 * booked" for exactly this provider.
 */
export const useCreateTimeOff = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (args: { providerId: string; body: CreateTimeOffRequestInput }) =>
      createTimeOff(args.providerId, args.body),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.timeOff(variables.providerId), (current?: GetTimeOffResponse) =>
        current ? { ...current, timeOff: [...current.timeOff, data.timeOff] } : current,
      )
      return queryClient.invalidateQueries({ queryKey: queryKeys.availability() })
    },
  })
}

/** Removes one range. `providerId` travels alongside the id only to address the right cache entry. */
export const useDeleteTimeOff = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (args: { id: string; providerId: string }) => deleteTimeOff(args.id),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.timeOff(variables.providerId), (current?: GetTimeOffResponse) =>
        current ? { ...current, timeOff: current.timeOff.filter((row) => row.id !== data.id) } : current,
      )
      return queryClient.invalidateQueries({ queryKey: queryKeys.availability() })
    },
  })
}

/** Every dated range the whole clinic is shut, as the admin editor reads them. */
export const useClosures = (options: QueryTuning<GetClosuresResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.closures(),
    queryFn: ({ signal }) => getClosures({ signal }),
    ...options,
  })

/** Adds one closure and appends it to the cached list, the same reasoning `useCreateTimeOff` gives. */
export const useCreateClosure = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateClosureRequestInput) => createClosure(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.closures(), (current?: GetClosuresResponse) =>
        current ? { ...current, closures: [...current.closures, data.closure] } : current,
      )
      // A new closure is a changed answer to "when can this be booked",
      // across every provider — unlike time off, there is no single
      // provider's cache to narrow this to.
      return queryClient.invalidateQueries({ queryKey: queryKeys.availability() })
    },
  })
}

/** Removes one closure. */
export const useDeleteClosure = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteClosure(id),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.closures(), (current?: GetClosuresResponse) =>
        current ? { ...current, closures: current.closures.filter((row) => row.id !== data.id) } : current,
      )
      return queryClient.invalidateQueries({ queryKey: queryKeys.availability() })
    },
  })
}

/** Phone, date of birth and insurance. Not called on every load, unlike `useMe`. */
export const useProfile = (options: QueryTuning<GetProfileResponse> = {}) =>
  useQuery({
    queryKey: queryKeys.profile(),
    queryFn: ({ signal }) => getProfile({ signal }),
    ...options,
  })

/**
 * Writes the whole form and hands back what Postgres now holds.
 *
 * `setQueryData`, not an invalidation: the response already is the new
 * profile, in the same shape the query caches — refetching to learn what the
 * mutation just told us would be a second request for the same answer.
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => updateProfile(body),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.profile(), data),
  })
}

/**
 * Everything a write invalidates.
 *
 * Both lists, always. The appointment lists obviously changed, and availability
 * changed because a slot was taken or released.
 */
function useInvalidateAfterWrite() {
  const queryClient = useQueryClient()

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.availability() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments() }),
    ])
}

/**
 * Book a slot.
 *
 * A `SLOT_TAKEN` or `SLOT_UNAVAILABLE` rejection also invalidates availability:
 * the failure is itself evidence that the caller's slot list is stale, and the
 * screen that reports it should be showing fresh times underneath the message.
 */
export const useBookAppointment = () => {
  const invalidate = useInvalidateAfterWrite()

  return useMutation({
    mutationFn: (body: BookAppointmentRequest) => bookAppointment(body),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

export const useCancelAppointment = () => {
  const invalidate = useInvalidateAfterWrite()

  return useMutation({
    mutationFn: (appointmentId: string) => cancelAppointment(appointmentId),
    onSuccess: invalidate,
  })
}

export const useRescheduleAppointment = () => {
  const invalidate = useInvalidateAfterWrite()

  return useMutation({
    mutationFn: (args: { appointmentId: string; body: RescheduleAppointmentRequest }) =>
      rescheduleAppointment(args.appointmentId, args.body),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
