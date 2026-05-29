/**
 * Redaction helpers for telemetry payloads. Everything we ship to GCP Error
 * Reporting passes through here first to strip secrets/PII. The pattern list is
 * intentionally conservative and additive.
 */

/** Patterns we strip from anything we send. Conservative, additive list. */
const PII_PATTERNS = [
  // Email addresses
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, repl: '[email]' },
  // JWT-like tokens (three base64url segments)
  { re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, repl: '[jwt]' },
  // ****** Basic / Token / api[_-]?key style header values
  { re: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, repl: '$1 [redacted]' },
  { re: /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization)\b\s*[:=]\s*"?[^"\s,&}]{4,}"?/gi, repl: '$1=[redacted]' },
  // Long hex / base64-ish secrets (>= 32 chars)
  { re: /\b[A-Za-z0-9_-]{32,}\b/g, repl: '[long-token]' },
  // Credit-card-like 13–19 digit runs
  { re: /\b\d[ -]?(?:\d[ -]?){11,17}\d\b/g, repl: '[ccn]' },
]

/** Keys whose values we always drop when we encounter them in objects. */
const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key',
  'authorization', 'auth', 'cookie', 'set-cookie', 'session', 'jwt',
  'access_token', 'refresh_token', 'id_token', 'localstorage', 'sessionstorage',
])

/**
 * Recursively sanitize a value. Strings have PII patterns redacted; objects
 * have sensitive keys dropped and their values redacted; everything else is
 * returned as-is. Bounded depth + length to avoid pathological payloads.
 */
export function sanitize(value, depth = 0) {
  if (depth > 6) return '[deep]'
  if (value == null) return value
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitize(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]'
        continue
      }
      out[k] = sanitize(v, depth + 1)
    }
    return out
  }
  return undefined
}

/** Apply PII regex redactions to a string, with a hard length cap. */
export function sanitizeString(s) {
  let out = String(s)
  if (out.length > 8192) out = out.slice(0, 8192) + '…[truncated]'
  for (const { re, repl } of PII_PATTERNS) {
    out = out.replace(re, repl)
  }
  return out
}
