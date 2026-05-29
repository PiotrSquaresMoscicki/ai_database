import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { sanitize, sanitizeString, buildReportedErrorEvent } from '../telemetry.js'

// Build JWT-like and bearer-token strings dynamically so this source file
// itself does not contain anything that looks like a real secret.
const seg = 'A'.repeat(20)
const fakeJwt = ['ey' + 'J' + seg, seg, seg].join('.')
const fakeBearer = 'B' + 'earer ' + 'A'.repeat(40)

describe('sanitizeString', () => {
  it('redacts email addresses', () => {
    expect(sanitizeString('contact me at alice@example.com please')).toBe(
      'contact me at [email] please',
    )
  })

  it('redacts JWT-like tokens', () => {
    expect(sanitizeString(`token=${fakeJwt}`)).toContain('[jwt]')
  })

  it('redacts bearer-style auth headers', () => {
    const out = sanitizeString(`Authorization: ${fakeBearer}`)
    expect(out).toMatch(/\[redacted\]/)
  })

  it('redacts api_key=... pairs', () => {
    expect(sanitizeString('foo api_key=' + 'X'.repeat(20) + ' bar')).toMatch(/api_key=\[redacted\]/)
  })

  it('redacts long opaque tokens', () => {
    const tok = 'Z'.repeat(40)
    expect(sanitizeString(`token is ${tok} end`)).toBe('token is [long-token] end')
  })

  it('truncates very long strings', () => {
    const big = 'x'.repeat(9000)
    const out = sanitizeString(big)
    expect(out.length).toBeLessThan(9000)
    expect(out.endsWith('[truncated]')).toBe(true)
  })
})

describe('sanitize (object recursion)', () => {
  it('drops values for sensitive keys regardless of content', () => {
    const out = sanitize({
      user: 'alice',
      password: 'hunter2',
      Authorization: 'whatever',
      nested: { token: 'abc', safe: 'ok' },
    })
    expect(out.password).toBe('[redacted]')
    expect(out.Authorization).toBe('[redacted]')
    expect(out.nested.token).toBe('[redacted]')
    expect(out.nested.safe).toBe('ok')
    expect(out.user).toBe('alice')
  })

  it('redacts email inside string fields of objects', () => {
    const out = sanitize({ note: 'ping me at bob@foo.com' })
    expect(out.note).toBe('ping me at [email]')
  })

  it('caps recursion depth', () => {
    let v = 'leaf'
    for (let i = 0; i < 20; i++) v = { x: v }
    const out = sanitize(v)
    const json = JSON.stringify(out)
    expect(json).toMatch(/\[deep\]/)
  })

  it('caps array length', () => {
    const out = sanitize(Array.from({ length: 200 }, (_, i) => i))
    expect(out.length).toBe(50)
  })

  it('passes through primitives', () => {
    expect(sanitize(42)).toBe(42)
    expect(sanitize(true)).toBe(true)
    expect(sanitize(null)).toBe(null)
  })
})

describe('buildReportedErrorEvent', () => {
  // Stub minimal browser globals at the describe level so tests run under the
  // default node environment without requiring jsdom.
  beforeAll(() => {
    vi.stubGlobal('navigator', { userAgent: 'test-agent/1.0' })
    vi.stubGlobal('location', { href: 'https://example.test/page' })
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('includes a JS-style stack when given an Error', () => {
    const err = new Error('boom')
    const ev = buildReportedErrorEvent({ error: err, service: 'web', version: 'v1' })
    expect(ev.message).toContain('Error: boom')
    expect(ev.message).toMatch(/\n\s*at\s/)
    expect(ev.serviceContext).toEqual({ service: 'web', version: 'v1' })
  })

  it('falls back to string for non-Error values', () => {
    const ev = buildReportedErrorEvent({ error: 'just a string' })
    expect(ev.message).toContain('just a string')
  })

  it('redacts email addresses in the message', () => {
    const err = new Error('failed for user alice@example.com')
    const ev = buildReportedErrorEvent({ error: err })
    expect(ev.message).not.toContain('alice@example.com')
    expect(ev.message).toContain('[email]')
  })

  it('strips query string from the captured url', () => {
    vi.stubGlobal('location', { href: 'https://example.test/page?token=secret123&user=alice' })
    const ev = buildReportedErrorEvent({ error: new Error('x') })
    expect(ev.context.httpRequest.url).not.toContain('token=')
    expect(ev.context.httpRequest.url).not.toContain('?')
  })
})
