import express from 'express'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GCP_PROJECT, log } from './logger.js'
import { verifyAccessJwt } from './middleware/cloudflareAccess.js'
import { createChatRouter } from './routes/chat.js'
import { createClientConfigRouter } from './routes/clientConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT) || 80
const distDir = path.join(__dirname, 'dist')

const app = express()

// Trust the Cloudflare/Cloud Run proxy so rate limiting keys on the real client IP.
app.set('trust proxy', 1)

// Request logging middleware using @google-cloud/logging directly.
app.use((req, res, next) => {
  const start = Date.now()
  const traceHeader = req.headers['x-cloud-trace-context']

  if (traceHeader) {
    const match = traceHeader.match(/^([a-f0-9]{32})\/(\d+)/)
    if (match) {
      req.traceContext = {
        trace: GCP_PROJECT ? `projects/${GCP_PROJECT}/traces/${match[1]}` : match[1],
        spanId: match[2],
      }
    }
  }

  res.on('finish', () => {
    const duration = Date.now() - start
    const status = res.statusCode
    const severity = status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO'
    const metadata = { severity, ...(req.traceContext || {}) }
    const data = {
      message: `${req.method} ${req.originalUrl} ${status} ${duration}ms`,
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        status,
        latency: `${duration}ms`,
        remoteIp: req.ip,
        userAgent: req.headers['user-agent'] || '',
      },
    }
    const entry = log.entry(metadata, data)
    log[severity.toLowerCase()](entry)
  })

  next()
})

// Global rate limiting to mitigate abuse of the JWT validation and static asset routes.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

// Global Cloudflare Access JWT validation (defense-in-depth behind Cloudflare Access).
app.use(verifyAccessJwt())

// JSON body parsing is only needed for the chat API. Cap payload size to bound
// the impact of large history arrays even though the sliding window further
// trims what we forward to Gemini.
app.use('/api/chat', express.json({ limit: '256kb' }))
app.use(createChatRouter())

// Runtime config endpoint consumed by the SPA's telemetry module. Exposes the
// GCP project id + the referrer-restricted browser API key for direct
// Browser → clouderrorreporting.googleapis.com posting. Fails loudly (HTTP
// 500) when configuration is missing.
app.use(
  createClientConfigRouter({
    logger: {
      log: (m, ctx) => log.info(log.entry({ severity: 'INFO' }, { message: m, ...(ctx || {}) })),
      error: (m) => log.error(log.entry({ severity: 'ERROR' }, { message: m })),
    },
  }),
)

app.use(express.static(distDir))

// SPA fallback: serve index.html for any non-asset GET so client-side routing works.
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next()
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  log.info(log.entry({ severity: 'INFO' }, { message: `Server listening on port ${port}` }))
})
