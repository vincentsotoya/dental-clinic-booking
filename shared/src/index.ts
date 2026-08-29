import { z } from 'zod'

/**
 * Shape of `GET /api/health`.
 *
 * Lives here rather than in either app so the server and the client agree by
 * construction instead of by convention. This is the pattern every future
 * endpoint follows: one schema, imported by both sides.
 */
export const healthResponse = z.object({
  status: z.literal('ok'),
  clinicTimezone: z.string(),
  serverTime: z.iso.datetime(),
})

export type HealthResponse = z.infer<typeof healthResponse>
