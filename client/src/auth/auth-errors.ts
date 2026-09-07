// Better Auth's error codes, said in the clinic's voice.
//
// `/api/auth/*` is outside the shared error registry by design: it speaks the
// library's dialect and the seam is the URL prefix (ADR-0006). This module is
// that seam on the client — the one place the dialect is read, so the two
// screens render sentences rather than each carrying its own translation of
// the same handful of codes.
//
// Anything unrecognised falls through to a fixed sentence. The library's own
// `message` is written for a developer and can name a table.

/** The shape Better Auth's client hands back on `result.error`. */
type AuthErrorLike = { code?: string; message?: string } | null | undefined

const SIGN_IN_MESSAGES: Record<string, string> = {
  // Deliberately the same sentence for "no such account" and "wrong password",
  // because the library deliberately returns one code for both. Telling a
  // stranger which of the two it was confirms whether an address is registered
  // here — at a clinic, that a person is a patient.
  INVALID_EMAIL_OR_PASSWORD: 'That email and password do not match an account.',
  EMAIL_NOT_VERIFIED: 'This account still needs to be verified before you can sign in.',
}

const SIGN_UP_MESSAGES: Record<string, string> = {
  // Signup cannot keep the secret sign-in keeps: an address that is taken has
  // to be refused, and the refusal is the disclosure. Not an oversight — the
  // alternative is accepting a signup that silently does nothing.
  USER_ALREADY_EXISTS: 'There is already an account with that email. Try signing in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'There is already an account with that email. Try signing in instead.',
  // Reachable only if the form's rule and the server's have come apart, which
  // is what `PASSWORD_MIN_LENGTH` in `shared` exists to prevent. Kept because
  // "prevented" and "impossible" are different words.
  PASSWORD_TOO_SHORT: 'That password is shorter than we allow.',
  PASSWORD_TOO_LONG: 'That password is longer than we can store.',
  INVALID_EMAIL: 'That does not look like an email address we can reach you at.',
}

function translate(error: AuthErrorLike, table: Record<string, string>, fallback: string): string {
  const code = error?.code
  return (code && table[code]) || fallback
}

export function signInErrorMessage(error: AuthErrorLike): string {
  return translate(error, SIGN_IN_MESSAGES, 'We could not sign you in. Please try again.')
}

export function signUpErrorMessage(error: AuthErrorLike): string {
  return translate(error, SIGN_UP_MESSAGES, 'We could not create your account. Please try again.')
}
