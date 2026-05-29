import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createClientConfigRouter } from '../clientConfig.js'

function appWithEnv(env) {
  const logger = { log: vi.fn(), error: vi.fn() }
  const app = express()
  app.use(createClientConfigRouter({ env, logger }))
  return { app, logger }
}

describe('GET /api/client-config', () => {
  it('returns 500 with a clear message when both env vars are missing', async () => {
    const { app, logger } = appWithEnv({})
    const res = await request(app).get('/api/client-config')
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/GOOGLE_CLOUD_PROJECT/)
    expect(res.body.error).toMatch(/ERROR_REPORTING_BROWSER_API_KEY/)
    expect(logger.error).toHaveBeenCalled()
  })

  it('returns 500 when only the API key is missing', async () => {
    const { app } = appWithEnv({ GOOGLE_CLOUD_PROJECT: 'p' })
    const res = await request(app).get('/api/client-config')
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/ERROR_REPORTING_BROWSER_API_KEY/)
    expect(res.body.error).not.toMatch(/GOOGLE_CLOUD_PROJECT/)
  })

  it('returns the runtime config when both env vars are set', async () => {
    const { app } = appWithEnv({
      GOOGLE_CLOUD_PROJECT: 'my-project',
      ERROR_REPORTING_BROWSER_API_KEY: 'browser-key',
      APP_SERVICE: 'web-srv-templ',
      K_REVISION: 'web-srv-templ-00007-abc',
    })
    const res = await request(app).get('/api/client-config')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      projectId: 'my-project',
      apiKey: 'browser-key',
      service: 'web-srv-templ',
      version: 'web-srv-templ-00007-abc',
    })
  })

  it('prefers APP_VERSION over K_REVISION', async () => {
    const { app } = appWithEnv({
      GOOGLE_CLOUD_PROJECT: 'p',
      ERROR_REPORTING_BROWSER_API_KEY: 'k',
      APP_VERSION: 'v1.2.3',
      K_REVISION: 'rev-000',
    })
    const res = await request(app).get('/api/client-config')
    expect(res.body.version).toBe('v1.2.3')
  })

  it('falls back to GCP_PROJECT when GOOGLE_CLOUD_PROJECT is unset', async () => {
    const { app } = appWithEnv({
      GCP_PROJECT: 'legacy-proj',
      ERROR_REPORTING_BROWSER_API_KEY: 'k',
    })
    const res = await request(app).get('/api/client-config')
    expect(res.status).toBe(200)
    expect(res.body.projectId).toBe('legacy-proj')
  })
})
