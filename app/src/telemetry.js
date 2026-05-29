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
 *     they can be uploaded to a debug bucket and consulted manually.
 *
 * This file is a thin barrel that re-exports the implementation split across:
 *   - ./telemetry/sanitize.js — secret/PII redaction helpers
 *   - ./telemetry/report.js   — ReportedErrorEvent payload builder
 *   - ./telemetry/init.js     — global handler wiring + event shipping
 */

export { sanitize, sanitizeString } from './telemetry/sanitize.js'
export { buildReportedErrorEvent } from './telemetry/report.js'
export { initTelemetry } from './telemetry/init.js'
