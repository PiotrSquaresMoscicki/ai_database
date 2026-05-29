import express from 'express'

/**
 * Returns runtime configuration the SPA's telemetry module needs to POST
 * directly to GCP Error Reporting. The API key is a referrer-restricted GCP
 * browser key (see infra/main.tf) — it is meant to be browser-visible. The
 * referrer + API-target restrictions on the key are what protect it.
 *
 * Fails loudly (HTTP 500) when env config is missing rather than returning a
 * half-empty payload that would silently disable client error reporting.
 *
 * @param {{ env?: NodeJS.ProcessEnv, logger?: Console }} [opts]
 */
export function createClientConfigRouter({ env = process.env, logger = console } = {}) {
  const router = express.Router()

  router.get('/api/client-config', (req, res) => {
    const projectId = env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT
    const apiKey = env.ERROR_REPORTING_BROWSER_API_KEY
    const missing = []
    if (!projectId) missing.push('GOOGLE_CLOUD_PROJECT')
    if (!apiKey) missing.push('ERROR_REPORTING_BROWSER_API_KEY')
    if (missing.length) {
      const message = `client-config: missing required env vars: ${missing.join(', ')}`
      logger.error?.(message)
      return res.status(500).json({ error: message })
    }
    const payload = {
      projectId,
      apiKey,
      service: env.APP_SERVICE || 'web-frontend',
      version: env.APP_VERSION || env.K_REVISION || 'unknown',
    }
    logger.log?.('client-config: served runtime config to SPA', {
      projectId: payload.projectId,
      service: payload.service,
      version: payload.version,
    })
    res.json(payload)
  })

  return router
}
