import { test, expect } from '@playwright/test'

test.describe('Dashboard (authenticated)', () => {
  test.fixme(
    true,
    // requires Firebase emulator or real credentials
    'These tests require a signed-in Firebase session. ' +
      'Run against the Firebase emulator or supply real credentials via storageState.',
  )

  test('dashboard heading "KB Drafts" is visible when authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'KB Drafts' })).toBeVisible()
  })

  test('user email is displayed in the header', async ({ page }) => {
    await page.goto('/dashboard')
    // The header renders user?.email as plain text inside a <span>
    // Verify that some non-empty email address is shown in the header region.
    const header = page.locator('header')
    await expect(header.locator('span').filter({ hasText: /@/ })).toBeVisible()
  })

  test('sign out button is visible', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
