import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { logger } from './lib/logger.js'
import { v1Router } from './routes/v1/index.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }))
// Capture raw body buffer for webhook HMAC verification (A08) before JSON parsing.
app.use(
  express.json({
    limit: '200kb',
    verify: (req, _res, buf) => {
      // Attach raw body to the request for HMAC signature verification in the webhook route.
      (req as unknown as { rawBody: Buffer }).rawBody = buf
    },
  })
)
app.use(pinoHttp({ logger }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

app.use('/api/v1', v1Router)
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`Backend listening on port ${PORT}`)
})

export default app
