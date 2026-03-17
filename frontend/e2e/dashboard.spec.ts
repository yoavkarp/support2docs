import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// All tests in this file require the React app to mount, which requires a
// valid VITE_FIREBASE_API_KEY.  With the placeholder test credentials injected
// by playwright.config.ts, Firebase throws auth/invalid-api-key at module
// initialisation and the app cannot render.
//
// All tests are therefore marked fixme until the Firebase emulator is running
// or real credentials are provided.
// ---------------------------------------------------------------------------

test.describe('Redirect guard', () => {
  test.fixme(
    true,
    'Requires a valid VITE_FIREBASE_API_KEY so Firebase initialises without ' +
      'throwing auth/invalid-api-key. Without this the React app cannot mount and ' +
      'the ProtectedRoute redirect never fires.',
  )

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    // Allow up to 8 s for the 5-second auth fallback timer to fire.
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

// ---------------------------------------------------------------------------
// Authenticated dashboard checks — require Firebase emulator + sign-in
// ---------------------------------------------------------------------------

test.describe('Dashboard (authenticated)', () => {
  test.fixme(
    true,
    'These tests require a signed-in Firebase session. ' +
      'Run against the Firebase emulator or supply real credentials via storageState.',
  )

  test('dashboard page has the correct document title', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveTitle('Dashboard | Support2Docs')
  })

  test('dashboard heading "KB Drafts" is visible when authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'KB Drafts' })).toBeVisible()
  })

  test('dashboard shows loading skeleton while fetching drafts', async ({ page }) => {
    // Delay the API response so the skeleton is visible long enough to assert.
    await page.route('**/api/v1/drafts*', async (route) => {
      await new Promise<void>((r) => setTimeout(r, 2000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], page: 1, limit: 20 }),
      })
    })

    await page.goto('/dashboard')
    // The skeleton container has aria-label="Loading drafts" and aria-busy="true"
    await expect(page.getByLabel('Loading drafts')).toBeVisible()
  })

  test('dashboard shows "No drafts pending review" empty state', async ({ page }) => {
    await page.route('**/api/v1/drafts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], page: 1, limit: 20 }),
      })
    })

    await page.goto('/dashboard')
    await expect(page.getByText('No drafts pending review')).toBeVisible()
  })

  test('sign out button is visible on the dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('user email is displayed in the header', async ({ page }) => {
    await page.goto('/dashboard')
    const header = page.locator('header')
    await expect(header.locator('span').filter({ hasText: /@/ })).toBeVisible()
  })
})
