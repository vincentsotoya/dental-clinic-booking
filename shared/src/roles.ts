// Shared because the client needs it too: /api/me returns a role, and Phase 7
// renders admin navigation from it.

/**
 * Two roles, deliberately. A provider login is a Phase 7 decision with Phase 7
 * requirements in front of it, and adding one later is a single migration.
 */
export const ROLES = ['PATIENT', 'ADMIN'] as const

export type Role = (typeof ROLES)[number]
