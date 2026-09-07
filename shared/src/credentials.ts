// What a signup and a sign-in must contain, written once for both sides.
//
// The password rule is the reason this module exists. It is enforced by Better
// Auth inside its own routes (ADR-0006), so the form has no say in it — but a
// form that does not know the rule can only discover it by being rejected, and
// asks a patient to type a password twice to be told it was too short the first
// time. The constants below are the server's configuration and the form's
// validation, and they cannot drift because there is only one of them.
//
// These are not wire contracts. `/api/auth/*` speaks Better Auth's dialect and
// this file does not describe it — it describes the input the two screens
// collect before handing it over.

import { z } from 'zod'

/**
 * Above the library's default of 8. A portfolio app holding fictional medical
 * records can afford the stricter rule; the cost is one line.
 */
export const PASSWORD_MIN_LENGTH = 12

/**
 * Passed to the server explicitly rather than left to the library's default, so
 * the ceiling the form enforces is the ceiling the server enforces.
 */
export const PASSWORD_MAX_LENGTH = 128

const email = z.email('Enter an email address we can reach you at')

/** Trimmed before length is checked, so a space is not a first name. */
const personName = (field: string) =>
  z
    .string()
    .trim()
    .min(1, `We need your ${field}`)
    .max(100, `That ${field} is longer than we can store`)

export const signUpInput = z
  .object({
    // Two fields, not one, for the reason `server/src/auth.ts` gives: a name is
    // not recoverable from one string, and the mangling is silent.
    firstName: personName('first name'),
    lastName: personName('last name'),
    email,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `At most ${PASSWORD_MAX_LENGTH} characters`),
    // Asked for because there is no way back. Email verification is off until
    // Phase 10 (`requireEmailVerification: false`), so there is no password
    // reset either: a typo here is an account nobody can ever sign in to.
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'This does not match the password above',
    path: ['confirmPassword'],
  })

export const signInInput = z.object({
  email,
  // `min(1)`, deliberately not the strength rule. Sign-in checks a password
  // that already exists against a rule that may since have been raised, and the
  // rejection would read as "you typed it wrong" for a password that is right.
  password: z.string().min(1, 'Enter your password'),
})

export type SignUpInput = z.infer<typeof signUpInput>
export type SignInInput = z.infer<typeof signInInput>
