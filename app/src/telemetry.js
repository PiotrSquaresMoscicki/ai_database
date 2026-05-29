/**
 * Client-side telemetry: ships uncaught exceptions and unhandled promise
 * rejections directly to Google Cloud Error Reporting via the public REST API
 *   POST https://clouderrorreporting.googleapis.com/v1beta1/projects/{p}/events:report?key={k}
 *
 * Architectural notes:
 *   - There is no Firebase Crashlytics web SDK (it's mobile-only). This module
 *     is the equivalent for browsers: errors land directly in GCP Error
 *     Reporting, the same database that @google-cloud/observability-mcp reads.
 *   - The API key is a browser-exposed, HTTP-referrer + API-target restricted
 *     GCP API key created in infra/. It is not a secret in the usual sense —
 *     the referrer restriction prevents abuse from other origins.
 *   - GCP Error Reporting does NOT natively symbolicate web source maps.
 *     We emit hidden source maps as a build artifact (see vite.config.js) so
 *     they can be uploaded to a debug bucket and consulted manually. The
 *     issue's claim that `gcloud beta error-reporting` uploads web source maps
 *     is not a real feature.
 *
 * Error payload schema: see
 *   https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.events/report
 */

const REPORT_ENDPOINT = 'https://clouderrorreporting.googleapis.com/v1beta1/projects'

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

/**
 * Build a ReportedErrorEvent body. `error` may be an Error, a string, or any
 * value caught by window.onerror / unhandledrejection.
 */
export function buildReportedErrorEvent({ error, source, lineno, colno, service, version }) {
  let message
  if (error instanceof Error) {
    // GCP Error Reporting expects a JS-style stack with `Error: <msg>\n at ...` to symbolicate.
    message = error.stack && /\n\s*at\s/.test(error.stack)
      ? error.stack
      : `${error.name || 'Error'}: ${error.message || String(error)}`
  } else if (typeof error === 'string') {
    message = error
  } else {
    try { message = JSON.stringify(error) } catch { message = String(error) }
  }
  if (source && typeof lineno === 'number') {
    message += `\n    at <anonymous> (${source}:${lineno}:${colno ?? 0})`
  }
  return {
    serviceContext: {
      service: service || 'web-frontend',
      version: version || 'unknown',
    },
    message: sanitizeString(message),
    context: {
      httpRequest: {
        userAgent: sanitizeString(navigator.userAgent || ''),
        url: sanitizeString(location.href.split('?')[0]), // drop query string entirely
      },
      reportLocation: source && typeof lineno === 'number'
        ? { filePath: source, lineNumber: lineno, functionName: 'unknown' }
        : undefined,
    },
  }
}

/**
 * Initialize global error handlers and start shipping events to GCP Error
 * Reporting. Idempotent. Returns a small object exposing `report(err)` for
 * manual reporting and `flush()` for tests.
 *
 * Configuration is fetched at runtime from `/api/client-config` so the API
 * key never needs to be baked into the build. Errors that fire before the
 * config arrives are queued.
 */
export function initTelemetry({ configUrl = '/api/client-config', fetchImpl = fetch.bind(globalThis) } = {}) {
  if (globalThis.__telemetryInitialized) return globalThis.__telemetryInitialized
  console.log('[telemetry] initializing client error reporting')

  /** @type {Array<object>} */
  const pending = []
  /** @type {null | { projectId: string, apiKey: string, service: string, version: string }} */
  let config = null

  const ship = (event) => {
    if (!config) {
      pending.push(event)
      console.debug('[telemetry] queued event (config not yet loaded)', event)
      return
    }
    const url = `${REPORT_ENDPOINT}/${encodeURIComponent(config.projectId)}/events:report?key=${encodeURIComponent(config.apiKey)}`
    const body = JSON.stringify(event)
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
        if (ok) { console.debug('[telemetry] event shipped via sendBeacon'); return }
      }
      fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        mode: 'cors',
      }).then((r) => {
        console.debug('[telemetry] event shipped via fetch, status', r.status)
      }).catch((err) => {
        // Never throw from the reporter itself — that would re-enter the handler.
        console.warn('[telemetry] failed to ship event', err)
      })
    } catch (err) {
      console.warn('[telemetry] sendBeacon/fetch threw', err)
    }
  }

  const report = (error, extra = {}) => {
    try {
      const event = buildReportedErrorEvent({
        error,
        service: config?.service,
        version: config?.version,
        ...extra,
      })
      ship(sanitize(event))
    } catch (innerErr) {
      console.warn('[telemetry] failed to build error event', innerErr)
    }
  }

  const onError = (event) => {
    console.log('[telemetry] window.onerror caught', event.message)
    report(event.error || event.message, {
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  }
  const onRejection = (event) => {
    console.log('[telemetry] unhandledrejection caught', event.reason)
    report(event.reason ?? 'Unhandled promise rejection')
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  // Fetch runtime config and drain the queue.
  fetchImpl(configUrl, { credentials: 'same-origin' })
    .then(async (r) => {
      if (!r.ok) throw new Error(`client-config HTTP ${r.status}`)
      const cfg = await r.json()
      if (!cfg.projectId || !cfg.apiKey) {
        throw new Error('client-config missing projectId or apiKey')
      }
      config = {
        projectId: String(cfg.projectId),
        apiKey: String(cfg.apiKey),
        service: String(cfg.service || 'web-frontend'),
        version: String(cfg.version || 'unknown'),
      }
      console.log('[telemetry] config loaded, draining', pending.length, 'queued events')
      while (pending.length) ship(pending.shift())
    })
    .catch((err) => {
      console.warn('[telemetry] failed to load client-config; client error reporting is DISABLED until this is fixed', err)
    })

  const handle = { report, _pending: pending, _setConfig: (c) => { config = c; while (pending.length) ship(pending.shift()) } }
  globalThis.__telemetryInitialized = handle
  return handle
}
