/**
 * Sets CORS configuration on the Firebase Storage bucket.
 * Run once from the project root:
 *
 *   node scripts/set-storage-cors.mjs
 *
 * Requires backend/.env to be present (reads Firebase credentials from it).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load backend .env manually (no dotenv dependency needed) ─────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../backend/.env')

try {
  const envFile = readFileSync(envPath, 'utf8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    process.env[key] ??= val
  }
} catch {
  console.error('Could not read backend/.env — make sure it exists.')
  process.exit(1)
}

// ── Init Firebase Admin ───────────────────────────────────────────────────────
import { initializeApp, cert } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY in backend/.env')
  process.exit(1)
}

// Newer Firebase projects (created after ~2023) use .firebasestorage.app
// Older projects use .firebasestorage.com — we try both.
const frontendEnvPath = resolve(__dirname, '../frontend/.env')
let storageBucket = `${projectId}.firebasestorage.app.com`
try {
  const fe = readFileSync(frontendEnvPath, 'utf8')
  const match = fe.match(/VITE_FIREBASE_STORAGE_BUCKET=(.+)/)
  if (match) storageBucket = match[1].trim().replace(/^["']|["']$/g, '')
} catch { /* no frontend .env — use default */ }

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey }),
  storageBucket,
})

// ── CORS configuration ────────────────────────────────────────────────────────
const corsConfig = [
  {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
    ],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
    responseHeader: ['Content-Type', 'Authorization', 'x-goog-resumable'],
    maxAgeSeconds: 3600,
  },
]

// ── Apply ─────────────────────────────────────────────────────────────────────
const bucket = getStorage().bucket()
console.log(`Setting CORS on bucket: ${bucket.name}`)

try {
  await bucket.setCorsConfiguration(corsConfig)
  console.log('✓ CORS configuration applied successfully.')
  console.log('  Allowed origins:', corsConfig[0].origin.join(', '))
  console.log()
  console.log('Next step — deploy storage.rules:')
  console.log('  firebase deploy --only storage')
} catch (err) {
  if (err.message?.includes('does not exist')) {
    console.error(`\nBucket "${bucket.name}" does not exist.`)
    console.error('\nPossible fixes:')
    console.error('  1. Enable Firebase Storage in the Firebase console:')
    console.error('     https://console.firebase.google.com/project/' + projectId + '/storage')
    console.error('     (click "Get started" if Storage is not yet enabled)')
    console.error()
    console.error('  2. If the bucket name is wrong, set VITE_FIREBASE_STORAGE_BUCKET')
    console.error('     in frontend/.env to the exact bucket name shown in the Firebase console')
    console.error('     under Storage → Files (the name after "gs://")')
  } else {
    console.error('Failed to set CORS:', err.message)
  }
  process.exit(1)
}
