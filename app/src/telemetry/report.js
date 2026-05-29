import { sanitizeString } from './sanitize.js'

/**
 * Build a ReportedErrorEvent body. `error` may be an Error, a string, or any
 * value caught by window.onerror / unhandledrejection.
 *
 * Schema: https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.events/report
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
