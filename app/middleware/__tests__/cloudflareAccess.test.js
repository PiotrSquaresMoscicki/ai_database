import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { createServer } from 'node:http'
import { verifyAccessJwt } from '../cloudflareAccess.js'

const AUDIENCE = 'test-audience-tag'

/** Starts a minimal JWKS endpoint serving the given public key. */
function createJwksServer(publicJwk) {
  const app = express()
  app.get('/cdn-cgi/access/certs', (_req, res) => {
    res.json({ keys: [publicJwk] })
  })
  return app
}

/** Creates an Express app using the middleware under test. */
function createTestApp(opts) {
  const app = express()
  app.use(verifyAccessJwt(opts))
  app.get('/', (_req, res) => res.status(200).json({ ok: true }))
  return app
}

describe('verifyAccessJwt middleware', () => {
  let privateKey
  let publicJwk
  let jwksServerUrl
  let jwksHttpServer

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256')
    privateKey = keyPair.privateKey
    publicJwk = await exportJWK(keyPair.publicKey)
    publicJwk.alg = 'RS256'
    publicJwk.use = 'sig'

    // Start mock JWKS server
    const jwksApp = createJwksServer(publicJwk)
    jwksHttpServer = createServer(jwksApp)
    await new Promise((resolve) => jwksHttpServer.listen(0, resolve))
    const port = jwksHttpServer.address().port
    jwksServerUrl = `http://127.0.0.1:${port}`

    return () => {
      jwksHttpServer.close()
    }
  })

  it('returns 403 when Cf-Access-Jwt-Assertion header is missing', async () => {
    const app = createTestApp({ audience: AUDIENCE, teamDomain: jwksServerUrl })
    const res = await request(app).get('/')
    expect(res.status).toBe(403)
    expect(res.text).toMatch(/missing/i)
  })

  it('returns 403 for a malformed (non-JWT) token', async () => {
    const app = createTestApp({ audience: AUDIENCE, teamDomain: jwksServerUrl })
    const res = await request(app)
      .get('/')
      .set('Cf-Access-Jwt-Assertion', 'not.a.valid.jwt')
    expect(res.status).toBe(403)
  })

  it('returns 403 for a token signed by a different key', async () => {
    const otherKeyPair = await generateKeyPair('RS256')
    const token = await new SignJWT({ aud: AUDIENCE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(jwksServerUrl)
      .setExpirationTime('1h')
      .sign(otherKeyPair.privateKey)

    const app = createTestApp({ audience: AUDIENCE, teamDomain: jwksServerUrl })
    const res = await request(app)
      .get('/')
      .set('Cf-Access-Jwt-Assertion', token)
    expect(res.status).toBe(403)
  })

  it('returns 200 for a valid token signed by the mocked key', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setAudience(AUDIENCE)
      .setIssuer(jwksServerUrl)
      .setExpirationTime('1h')
      .sign(privateKey)

    const app = createTestApp({ audience: AUDIENCE, teamDomain: jwksServerUrl })
    const res = await request(app)
      .get('/')
      .set('Cf-Access-Jwt-Assertion', token)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
