import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// All tests in this file require the React app to mount, which in turn
// requires a valid VITE_FIREBASE_API_KEY so that the Firebase SDK does not
// throw auth/invalid-api-key at module initialisation.
//
// With the fake test credentials injected by playwright.config.ts the app
// cannot render at all, so every assertion against the page DOM or URL will
// fail.  All tests are therefore marked fixme until either:
//   a) the Firebase emulator is running, or
//   b) a .env.local file provides real Firebase credentials.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Redirect guard — requires Firebase to initialise so React can mount
// ---------------------------------------------------------------------------

test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
  test.fixme(
    true,
    'Requires a valid VITE_FIREBASE_API_KEY so Firebase initialises without ' +
      'throwing auth/invalid-api-key. Without this the React app cannot mount and ' +
      'the ProtectedRoute redirect never fires.',
  )

  await page.goto('/dashboard')
  // Allow up to 8 s for the 5-second auth fallback timer to fire.
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
})

test('unauthenticated user visiting /dashboard/drafts/:id is redirected to /login', async ({
  page,
}) => {
  test.fixme(
    true,
    'Requires a valid VITE_FIREBASE_API_KEY so Firebase initialises without ' +
      'throwing auth/invalid-api-key. Without this the React app cannot mount and ' +
      'the ProtectedRoute redirect never fires.',
  )

  await page.goto('/dashboard/drafts/00000000-0000-0000-0000-000000000001')
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
})

// ---------------------------------------------------------------------------
// Login page static checks
// ---------------------------------------------------------------------------

test.describe('Login page static content', () => {
  test.fixme(
    true,
    'Requires a valid VITE_FIREBASE_API_KEY so Firebase initialises without ' +
      'throwing auth/invalid-api-key, which prevents the React app from mounting.',
  )

  test('login page has the correct document title', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle('Login | Support2Docs')
  })

  test('login page renders the Support2Docs heading', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Support2Docs' })).toBeVisible()
  })

  test('login form has email and password fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('login form has a "Sign in" submit button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('"Continue with Google" button is visible on the login page', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  })

  test('login form shows error message on invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('notauser@example.com')
    await page.getByLabel('Password').fill('wrongpassword123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Invalid email or password.')).toBeVisible()
  })
})
