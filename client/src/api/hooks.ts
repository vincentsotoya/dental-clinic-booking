// The hooks a component reaches for. Thin on purpose: every one is an endpoint
// function, a key, and the invalidation that write implies.
//
// Each mutation invalidates availability, including cancel. Cancelling frees a
// slot the instant it happens (the exclusion constraints are partial on
// CONFIRMED), so a slot list rendered a moment earlier is now missing a time
// that is genuinely bookable.

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import type {
  AppointmentWindow,
  AvailabilityResponse,
  HealthResponse,
  BookAppointmentRequest,
  MeResponse,
  MyAppointmentsResponse,
  ProvidersResponse,
  RescheduleAppointmentRequest,
  ServicesResponse,
} from '@dental/shared'
import {
  bookAppointment,
  cancelAppointment,
  getAvailability,
  getHealth,
  getMe,
  getMyAppointments,
  getProviders,
  getServices,
  rescheduleAppointment,
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
