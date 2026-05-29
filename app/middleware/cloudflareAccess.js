import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Creates an Express middleware that validates the Cloudflare Access JWT
 * carried in the `Cf-Access-Jwt-Assertion` header.
 *
 * The middleware:
 *   1. Returns HTTP 403 if the header is missing.
 *   2. Fetches and caches the public JWKS from
 *      `${CLOUDFLARE_TEAM_DOMAIN}/cdn-cgi/access/certs`.
 *   3. Verifies the JWT signature and expiration.
 *   4. Ensures the `aud` claim matches `CLOUDFLARE_AUDIENCE_TAG`.
 *
 * @param {{ audience?: string, teamDomain?: string }} [opts]
 */
export function verifyAccessJwt(opts = {}) {
  const audience = opts.audience ?? process.env.CLOUDFLARE_AUDIENCE_TAG
  const teamDomain = opts.teamDomain ?? process.env.CLOUDFLARE_TEAM_DOMAIN

  if (!audience) {
    throw new Error('CLOUDFLARE_AUDIENCE_TAG is required')
  }
  if (!teamDomain) {
    throw new Error('CLOUDFLARE_TEAM_DOMAIN is required')
  }

  const certsUrl = new URL('/cdn-cgi/access/certs', teamDomain)
  // `createRemoteJWKSet` caches keys in memory and refreshes them as needed.
  const jwks = createRemoteJWKSet(certsUrl)

  return async function cloudflareAccessMiddleware(req, res, next) {
    const token = req.headers['cf-access-jwt-assertion']
    if (!token || typeof token !== 'string') {
      res.status(403).send('Forbidden: missing Cf-Access-Jwt-Assertion header')
      return
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        audience,
        issuer: teamDomain.replace(/\/$/, ''),
      })
      req.cloudflareAccess = payload
      next()
    } catch (_err) {
      res.status(403).send('Forbidden: invalid Cloudflare Access JWT')
    }
  }
}
