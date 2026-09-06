// Turning catalogue values into the words a patient reads.
//
// These moved out of `content/preview-data.ts` when the endpoints replaced it.
// They take structural shapes rather than the wire types so a component can
// pass a provider from either `/api/providers` or an availability response.

import type { CatalogueProvider } from '@dental/shared'

/** A list price before insurance — ADR-0003: the system records a plan, it cannot compute a share. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

type NamedProvider = Pick<CatalogueProvider, 'firstName' | 'lastName'>

export function providerInitials(provider: NamedProvider): string {
  // charAt, not [0]: an empty name would interpolate the string "undefined".
  return `${provider.firstName.charAt(0)}${provider.lastName.charAt(0)}`
}

/** "Dr Amara Osei" for a dentist, "Naomi Clarke" for a hygienist — how each is addressed. */
export function providerName(provider: NamedProvider & Pick<CatalogueProvider, 'type'>): string {
  const prefix = provider.type === 'DENTIST' ? 'Dr ' : ''
  return `${prefix}${provider.firstName} ${provider.lastName}`
}

export function providerRole(provider: Pick<CatalogueProvider, 'type'>): string {
  return provider.type === 'DENTIST' ? 'Dentist' : 'Hygienist'
}

const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]

/**
 * "three", "ten", "23".
 *
 * Headings count what the API actually returned rather than stating a number
 * the page was written with — a clinic that retires a treatment should not be
 * left advertising ten of them. Past ten it falls back to digits, where prose
 * would stop spelling them out anyway.
 */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n)
}
