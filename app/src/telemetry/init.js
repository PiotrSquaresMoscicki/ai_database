import { sanitize } from './sanitize.js'
import { buildReportedErrorEvent } from './report.js'

const REPORT_ENDPOINT = 'https://clouderrorreporting.googleapis.com/v1beta1/projects'

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
