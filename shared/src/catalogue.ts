// The wire contracts for `GET /api/services` and `GET /api/providers` — the
// clinic's public catalogue.
//
// These are a different projection of rows availability already sends, not a
// reuse of them. Availability answers "when can this be booked", so it carries
// `bufferMins` and omits price; the catalogue answers "what does the clinic
// offer and who works here", so it carries price and biography and withholds
// the buffer. One schema serving both would be the union of two audiences.

import { z } from 'zod'
import { providerType, serviceSlug } from './availability'
import { baseErrorCode, errorBody } from './errors'

/**
 * One treatment, as a patient reading the price list sees it.
 *
 * No `bufferMins`: turnover and sterilisation are time the clinic schedules
 * around the appointment, and a page that showed it would be quoting a longer
 * visit than the patient is actually in the chair for.
 */
export const catalogueService = z.object({
  id: z.uuid(),
  slug: serviceSlug,
  name: z.string(),
  description: z.string().nullable(),
  /** Treatment time only — the number the patient is quoted. */
  durationMins: z.int().positive(),
  /** Integer cents, and a list price before insurance — ADR-0003. */
  priceCents: z.int().nonnegative(),
  /** Which kind of provider performs it, and so who can be booked for it (ADR-0002). */
  providerType,
})

/**
 * One provider, as the directory shows them.
 *
 * `title` and `bio` are nullable in the schema and stay nullable here: a
 * provider the front desk added in a hurry has neither, and the page renders
 * what it has rather than the string "null".
 */
export const catalogueProvider = z.object({
  id: z.uuid(),
  type: providerType,
  firstName: z.string(),
  lastName: z.string(),
  /** "DDS", "RDH". */
  title: z.string().nullable(),
  bio: z.string().nullable(),
})

// Both responses wrap their list in an object rather than sending a bare array.
// An array has nowhere to put the next field — a count, a currency, a "prices
// effective from" — and adding one later would be a breaking change to a
// contract two apps import.

export const servicesResponse = z.object({
  /** Grouped by provider type, then alphabetical. The order is the server's, not the client's. */
  services: z.array(catalogueService),
})

export const providersResponse = z.object({
  /** Dentists before hygienists, then alphabetical by surname. */
  providers: z.array(catalogueProvider),
})

/**
 * No input, no guard, nothing addressed by a caller-supplied id — so these two
 * codes are all either route can honestly produce. Saying so stops a client
 * writing a `NOT_FOUND` branch that can never run.
 */
export const catalogueError = errorBody(baseErrorCode)

export type CatalogueService = z.infer<typeof catalogueService>
export type CatalogueProvider = z.infer<typeof catalogueProvider>
export type ServicesResponse = z.infer<typeof servicesResponse>
export type ProvidersResponse = z.infer<typeof providersResponse>
export type CatalogueError = z.infer<typeof catalogueError>
