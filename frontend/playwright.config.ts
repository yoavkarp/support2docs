import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load backend .env so WEBHOOK_SECRET and other vars are available in tests
loadEnv({ path: path.resolve(__dirname, '../backend/.env') })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY ?? 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'test-project.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID ?? 'test-project',
      VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'test-project.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '123456789',
      VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID ?? '1:123456789:web:abcdef',
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
      WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? '',
    },
  },
})
