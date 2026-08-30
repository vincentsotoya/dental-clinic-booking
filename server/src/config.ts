// Clinic policy — deliberately not environment configuration.
//
// These are business rules, not deployment knobs: the same values are correct
// on a laptop and in production, and changing one changes which slots patients
// are offered. `.env` is for things that differ per machine (a connection
// string, a port); putting policy there would make the clinic's behaviour
// depend on which host it happens to be running on.
//
// They are constants rather than a settings table because there is no admin UI
// to edit them yet. Phase 7 can move them into one without touching the
// engine: `getAvailableSlots()` takes both as parameters, so the only thing
// that changes is who supplies the number.

/**
 * Minimum notice for an online booking. A slot starting sooner than this is
 * not offered, even though the schedule is genuinely free — the front desk
 * needs the warning, and a patient booking a root canal for twenty minutes'
 * time is almost always a mistake.
 */
export const LEAD_TIME_MINS = 24 * 60

/**
 * The candidate start-time grid, measured from the top of the hour: 09:00,
 * 09:15, 09:30, 09:45. Free-interval starts are offered *in addition* to these
 * so that a buffer ending off-grid still yields a back-to-back slot — see
 * ADR-0005.
 */
export const SLOT_GRID_MINS = 15

/**
 * The longest date range a single availability query may ask for.
 *
 * Both a booking horizon and a guard. The clinic would not take a booking two
 * years out anyway, and without a ceiling `?from=2026-01-01&to=2099-01-01`
 * expands to 26,000 dates and walks every one of them through the engine —
 * a trivially cheap request to send and an expensive one to serve.
 */
export const MAX_AVAILABILITY_DAYS = 90
