import { describe, expect, it } from 'vitest'
import { authPath, DEFAULT_LANDING, safeNext } from './next-location'

// `safeNext` is the only thing standing between a query parameter anyone can
// write and a redirect. These are the spellings an attacker tries, not a
// paraphrase of the implementation.

describe('safeNext', () => {
  it('keeps a path on this site, query string and all', () => {
    expect(safeNext('/book?service=routine-exam&at=2026-09-10T08%3A30')).toBe(
      '/book?service=routine-exam&at=2026-09-10T08%3A30',
    )
  })

  it('falls back when nothing was asked for', () => {
    expect(safeNext(null)).toBe(DEFAULT_LANDING)
    expect(safeNext('')).toBe(DEFAULT_LANDING)
  })

  describe('refuses to leave the site', () => {
    it('rejects an absolute URL', () => {
      expect(safeNext('https://evil.example/login')).toBe(DEFAULT_LANDING)
    })

    // The one that looks local. A single leading slash is not the test.
    it('rejects a protocol-relative URL', () => {
      expect(safeNext('//evil.example')).toBe(DEFAULT_LANDING)
    })

    it('rejects a backslash the browser may read as a slash', () => {
      expect(safeNext('/\\evil.example')).toBe(DEFAULT_LANDING)
    })

    it('rejects a javascript: URL', () => {
      expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_LANDING)
    })
  })

  // Signing in to arrive at the sign-in screen. Reachable by hand, and by any
  // future guard that redirects one auth screen to the other.
  it('refuses to send someone back to an auth screen', () => {
    expect(safeNext('/sign-in')).toBe(DEFAULT_LANDING)
    expect(safeNext('/sign-up?next=%2Fsign-in')).toBe(DEFAULT_LANDING)
  })
})

describe('authPath', () => {
  it('encodes the destination so its query string survives', () => {
    expect(authPath('/sign-in', '/book?service=exam&at=09%3A00')).toBe(
      '/sign-in?next=%2Fbook%3Fservice%3Dexam%26at%3D09%253A00',
    )
  })

  // Round-tripping is the actual contract: whatever `authPath` writes,
  // `safeNext` must hand back unchanged once the router has decoded it.
  it('round-trips through safeNext', () => {
    const destination = '/book?service=routine-exam&provider=any&at=2026-09-10T08%3A30'
    const url = new URL(authPath('/sign-in', destination), 'https://quillon.example')

    expect(safeNext(url.searchParams.get('next'))).toBe(destination)
  })

  it('leaves the link bare when the destination is the default', () => {
    expect(authPath('/sign-up', DEFAULT_LANDING)).toBe('/sign-up')
  })
})
