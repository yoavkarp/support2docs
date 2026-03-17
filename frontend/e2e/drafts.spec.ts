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

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const DRAFT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const MOCK_DRAFT = {
  id: DRAFT_ID,
  title: 'How to Fix Login Timeout',
  content: 'Problem Description: Users experience login timeouts...',
  status: 'PENDING_REVIEW',
  publishedUrl: null,
  createdAt: new Date('2026-01-15T10:00:00Z').toISOString(),
  updatedAt: new Date('2026-01-15T10:00:00Z').toISOString(),
  clusterId: 'cluster-uuid-1234',
  cluster: { _count: { tickets: 7 } },
}

const MOCK_DRAFT_DETAIL = {
  ...MOCK_DRAFT,
  cluster: {
    id: 'cluster-uuid-1234',
    tickets: [
      {
        id: 'ticket-1',
        subject: 'Login timeout on mobile',
        source: 'zendesk',
        createdAt: '2026-01-10T08:00:00Z',
      },
      {
        id: 'ticket-2',
        subject: 'Session expires too fast',
        source: 'intercom',
        createdAt: '2026-01-11T09:00:00Z',
      },
    ],
  },
}

const MOCK_DRAFT_PUBLISHED = {
  ...MOCK_DRAFT_DETAIL,
  status: 'APPROVED',
  publishedUrl: 'https://kb.example.com/articles/login-timeout',
}

// ---------------------------------------------------------------------------
// Redirect guard — requires Firebase to initialise so React can mount
// ---------------------------------------------------------------------------

test.describe('Redirect guard', () => {
  test.fixme(
    true,
    'Requires a valid VITE_FIREBASE_API_KEY so Firebase initialises without ' +
      'throwing auth/invalid-api-key. Without this the React app cannot mount and ' +
      'the ProtectedRoute redirect never fires.',
  )

  test('unauthenticated user visiting /dashboard/drafts/:id is redirected to /login', async ({
    page,
  }) => {
    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)
    // Allow up to 8 s for the 5-second auth fallback timer to fire.
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

// ---------------------------------------------------------------------------
// Dashboard draft list — requires Firebase emulator + sign-in
// ---------------------------------------------------------------------------

test.describe('Dashboard draft list', () => {
  test.fixme(
    true,
    'These tests require a signed-in Firebase session. ' +
      'Run against the Firebase emulator or supply real credentials via storageState.',
  )

  test('shows "No drafts pending review" when the API returns an empty list', async ({ page }) => {
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

  test('DraftCard renders title, status badge, and ticket count', async ({ page }) => {
    await page.route('**/api/v1/drafts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [MOCK_DRAFT], page: 1, limit: 20 }),
      })
    })

    await page.goto('/dashboard')

    await expect(page.getByText('How to Fix Login Timeout')).toBeVisible()
    await expect(page.getByText('Pending Review')).toBeVisible()
    await expect(page.getByText('7 tickets')).toBeVisible()
  })

  test('clicking a DraftCard navigates to /dashboard/drafts/:id', async ({ page }) => {
    await page.route('**/api/v1/drafts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [MOCK_DRAFT], page: 1, limit: 20 }),
      })
    })

    await page.goto('/dashboard')
    await page.getByRole('button', { name: /open draft/i }).first().click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/drafts/${DRAFT_ID}`))
  })
})

// ---------------------------------------------------------------------------
// Draft detail page — requires Firebase emulator + sign-in
// ---------------------------------------------------------------------------

test.describe('Draft detail page', () => {
  test.fixme(
    true,
    'These tests require a signed-in Firebase session. ' +
      'Run against the Firebase emulator or supply real credentials via storageState.',
  )

  test('draft detail page shows draft title and content', async ({ page }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DRAFT_DETAIL),
      })
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)

    await expect(page.getByLabel('Draft content')).toHaveValue(
      'Problem Description: Users experience login timeouts...',
    )
  })

  test('approve button opens a confirmation dialog', async ({ page }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DRAFT_DETAIL),
      })
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)
    await page.getByRole('button', { name: /approve/i }).click()

    // The AlertDialog should be open — look for the confirm button
    await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible()
  })

  test('discard button opens a confirmation dialog with destructive styling', async ({ page }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DRAFT_DETAIL),
      })
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)
    await page.getByRole('button', { name: /discard/i }).click()

    // The AlertDialog confirm button should carry destructive styling
    const confirmBtn = page.getByRole('button', { name: /confirm/i })
    await expect(confirmBtn).toBeVisible()
    // shadcn/ui destructive variant adds "destructive" class tokens
    await expect(confirmBtn).toHaveClass(/destructive/)
  })

  test('editing title and content shows the changes in the form fields', async ({ page }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DRAFT_DETAIL),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)

    const titleInput = page.getByLabel(/title/i)
    await titleInput.fill('Updated Title Text')
    await expect(titleInput).toHaveValue('Updated Title Text')

    const contentArea = page.getByLabel('Draft content')
    await contentArea.fill('Updated content body.')
    await expect(contentArea).toHaveValue('Updated content body.')
  })

  test('user edits draft content, navigates away, returns to find changes persisted', async ({
    page,
  }) => {
    const updatedContent = 'Updated: Clear browser cache and retry login.'

    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DRAFT_DETAIL),
        })
      } else if (request.method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...MOCK_DRAFT_DETAIL, content: updatedContent }),
        })
      } else {
        await route.continue()
      }
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)

    const contentEditor = page.getByLabel('Draft content')
    await contentEditor.fill(updatedContent)

    await page.getByRole('link', { name: /back to drafts/i }).click()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)
    await expect(contentEditor).toHaveValue(updatedContent)
  })

  test('approved draft shows "View published article" link when publishedUrl is set', async ({
    page,
  }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DRAFT_PUBLISHED),
      })
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)

    const publishedLink = page.getByRole('link', { name: /view published article/i })
    await expect(publishedLink).toBeVisible()
    await expect(publishedLink).toHaveAttribute(
      'href',
      'https://kb.example.com/articles/login-timeout',
    )
  })
})

// ---------------------------------------------------------------------------
// Draft actions — approve and discard — requires Firebase emulator + sign-in
// ---------------------------------------------------------------------------

test.describe('Draft actions', () => {
  test.fixme(
    true,
    'These tests require a signed-in Firebase session. ' +
      'Run against the Firebase emulator or supply real credentials via storageState.',
  )

  test('approving a draft navigates back to dashboard', async ({ page }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DRAFT_DETAIL),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(`**/api/v1/drafts/${DRAFT_ID}/approve`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_DRAFT_DETAIL, status: 'APPROVED' }),
      })
    })

    await page.route('**/api/v1/drafts?status=PENDING_REVIEW*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], page: 1, limit: 20 }),
      })
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)
    await page.getByRole('button', { name: /approve/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('discarding a draft navigates back to dashboard', async ({ page }) => {
    await page.route(`**/api/v1/drafts/${DRAFT_ID}`, async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_DRAFT_DETAIL),
        })
      } else {
        await route.continue()
      }
    })

    await page.route(`**/api/v1/drafts/${DRAFT_ID}/discard`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_DRAFT_DETAIL, status: 'DISCARDED' }),
      })
    })

    await page.route('**/api/v1/drafts?status=PENDING_REVIEW*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], page: 1, limit: 20 }),
      })
    })

    await page.goto(`/dashboard/drafts/${DRAFT_ID}`)
    await page.getByRole('button', { name: /discard/i }).click()
    await page.getByRole('button', { name: /confirm/i }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
