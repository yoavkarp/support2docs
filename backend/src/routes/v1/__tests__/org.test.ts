import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must appear before any imports that trigger module resolution
// ---------------------------------------------------------------------------

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    organization: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    organizationSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    organizationMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    draft: {
      updateMany: vi.fn(),
    },
    draftEvent: {
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

// Mock crypto so tests are deterministic (no ORG_SECRETS_KEY needed in CI)
vi.mock('../../../lib/crypto.js', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
  mask: vi.fn((v: string | null) => {
    if (v == null || v === '') return null
    if (v.length <= 4) return '****'
    return `****${v.slice(-4)}`
  }),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import { orgRouter } from '../org.js'
import { prisma } from '../../../lib/prisma.js'
import { requireAuth } from '../../../middleware/auth.js'

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json())

// Inject a fake uid + claims so route handlers can read res.locals
app.use((_req, res, next) => {
  res.locals['uid'] = 'user-abc'
  res.locals['claims'] = { email: 'user@example.com', admin: true }
  next()
})

app.use('/org', orgRouter)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message })
})

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee'
const MEMBER_ID = '11111111-2222-4333-4444-555555555555'
const USER_ID = 'firebase-uid-123'

const mockOrg = { id: ORG_ID, name: 'My Team', slug: 'user-abc-1234', logoUrl: null, createdAt: new Date() }

const mockSettings = {
  id: '99999999-0000-4111-2222-333333333333',
  orgId: ORG_ID,
  zendeskSubdomain: 'mycompany',
  zendeskApiKey: 'enc:secretkey5678',
  intercomToken: null,
  kbPublishUrl: 'https://example.com/publish',
  clusterThreshold: 0.65,
  minClusterSize: 5,
  updatedAt: new Date(),
}

const mockMember = {
  id: MEMBER_ID,
  userId: USER_ID,
  userEmail: 'alice@co.com',
  role: 'ADMIN' as const,
  joinedAt: new Date(),
}

// ---------------------------------------------------------------------------
// Helpers: stub org + admin lookups
// ---------------------------------------------------------------------------

const adminMembership = { ...mockMember, userId: 'user-abc', orgId: ORG_ID }

// Stubs both getOrCreateUserOrg (call 1) and isOrgAdmin (call 2) as ADMIN.
// Use this for routes that need org resolution + admin check to pass.
function stubUserOrgLookup() {
  vi.mocked(prisma.organizationMember.findFirst).mockResolvedValue(
    adminMembership as never,
  )
}

// Stubs org resolution as ADMIN then isOrgAdmin as non-admin (403 path).
function stubNonAdminUser() {
  vi.mocked(prisma.organizationMember.findFirst)
    .mockResolvedValueOnce(adminMembership as never) // getOrCreateUserOrg
    .mockResolvedValueOnce(null)                      // isOrgAdmin → not admin
}

// ---------------------------------------------------------------------------
// POST /org — create a named org
// ---------------------------------------------------------------------------
describe('POST /org', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 for missing name', async () => {
    const res = await request(app).post('/org').send({})
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 for name that is too long', async () => {
    const res = await request(app).post('/org').send({ name: 'a'.repeat(101) })
    expect(res.status).toBe(400)
  })

  it('creates org and adds caller as ADMIN, returns 201', async () => {
    vi.mocked(prisma.organization.create).mockResolvedValue({
      id: ORG_ID,
      name: 'Acme Corp',
      slug: 'acme-corp-ab12',
      createdAt: new Date(),
    } as never)
    vi.mocked(prisma.organizationMember.create).mockResolvedValue({} as never)

    const res = await request(app).post('/org').send({ name: 'Acme Corp' })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Acme Corp')
    expect(res.body.role).toBe('ADMIN')
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('slug')

    // Member should be created with ADMIN role
    expect(prisma.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-abc',
          userEmail: 'user@example.com',
          role: 'ADMIN',
        }),
      }),
    )
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organization.create).mockRejectedValue(new Error('DB error'))
    const res = await request(app).post('/org').send({ name: 'Fail Org' })
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// GET /org — list user's orgs
// ---------------------------------------------------------------------------
describe('GET /org', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns array of orgs for the user with memberCount', async () => {
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([
      {
        id: MEMBER_ID,
        orgId: ORG_ID,
        userId: 'user-abc',
        userEmail: 'user@example.com',
        role: 'ADMIN',
        joinedAt: new Date(),
        org: { ...mockOrg, _count: { members: 3 } },
      },
    ] as never)

    const res = await request(app).get('/org')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0].id).toBe(ORG_ID)
    expect(res.body[0].name).toBe('My Team')
    expect(res.body[0].role).toBe('ADMIN')
    expect(res.body[0].memberCount).toBe(3)
  })

  it('returns empty array when user belongs to no orgs', async () => {
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([])

    const res = await request(app).get('/org')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findMany).mockRejectedValue(new Error('fail'))
    const res = await request(app).get('/org')
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// GET /org/settings
// ---------------------------------------------------------------------------
describe('GET /org/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without auth — requireAuth blocks unauthenticated requests', async () => {
    // Build a secondary app that wraps orgRouter with requireAuth (mirrors index.ts).
    // This verifies the middleware is wired correctly to block unauthenticated callers.
    vi.mocked(requireAuth).mockImplementationOnce((_req, res: Response, _next) => {
      res.status(401).json({ error: 'Missing or invalid Authorization header' })
      return Promise.resolve()
    })
    const authApp = express()
    authApp.use(express.json())
    // Mount with requireAuth guard — mirrors v1Router behaviour
    authApp.use('/org', (_req, res, next) => {
      // delegate to the mocked requireAuth
      void requireAuth(_req, res, next)
    }, orgRouter)
    authApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ error: err.message })
    })

    const res = await request(authApp).get('/org/settings')
    expect(res.status).toBe(401)
  })

  it('resolves org by caller uid (user-scoped), not globally', async () => {
    // Stub membership lookup for user-abc
    stubUserOrgLookup()
    vi.mocked(prisma.organizationSettings.findUnique).mockResolvedValue(mockSettings as never)

    const res = await request(app).get('/org/settings')

    expect(res.status).toBe(200)
    // Membership was queried by uid, not global findFirst
    expect(prisma.organization.findFirst).not.toHaveBeenCalled()
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-abc' } }),
    )
  })

  it('returns 200 with masked fields when settings exist', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationSettings.findUnique).mockResolvedValue(mockSettings as never)

    const res = await request(app).get('/org/settings')

    expect(res.status).toBe(200)
    // zendeskApiKey should be masked — ends with last 4 chars of decrypted value
    expect(res.body.zendeskApiKey).toMatch(/^\*{4}/)
    expect(res.body.zendeskSubdomain).toBe('mycompany')
    expect(res.body.intercomToken).toBeNull()
    expect(res.body.kbPublishUrl).toBe('https://example.com/publish')
    expect(res.body.clusterThreshold).toBe(0.65)
    expect(res.body.minClusterSize).toBe(5)
  })

  it('returns defaults when no settings row exists', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationSettings.findUnique).mockResolvedValue(null)

    const res = await request(app).get('/org/settings')

    expect(res.status).toBe(200)
    expect(res.body.zendeskApiKey).toBeNull()
    expect(res.body.clusterThreshold).toBe(0.65)
    expect(res.body.minClusterSize).toBe(5)
  })

  it('bootstraps a new org when user has no membership', async () => {
    // findFirst returns null (no membership) → triggers org creation
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.organization.create).mockResolvedValue(mockOrg as never)
    vi.mocked(prisma.organizationMember.create).mockResolvedValue({} as never)
    vi.mocked(prisma.organizationSettings.findUnique).mockResolvedValue(null)

    const res = await request(app).get('/org/settings')

    expect(res.status).toBe(200)
    expect(prisma.organization.create).toHaveBeenCalledOnce()
    // Member row added as ADMIN
    expect(prisma.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-abc', role: 'ADMIN' }),
      }),
    )
  })

  it('returns kbPublishUrl as null for non-admin authenticated users (A01)', async () => {
    // Build a secondary app with admin: false in claims
    const nonAdminApp = express()
    nonAdminApp.use(express.json())
    nonAdminApp.use((_req, res, next) => {
      res.locals['uid'] = 'user-abc'
      res.locals['claims'] = { email: 'user@example.com', admin: false }
      next()
    })
    nonAdminApp.use('/org', orgRouter)
    nonAdminApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ error: err.message })
    })

    stubUserOrgLookup()
    vi.mocked(prisma.organizationSettings.findUnique).mockResolvedValue(mockSettings as never)

    const res = await request(nonAdminApp).get('/org/settings')

    expect(res.status).toBe(200)
    // Non-admin must NOT receive kbPublishUrl
    expect(res.body.kbPublishUrl).toBeNull()
    // Other fields are still returned
    expect(res.body.zendeskSubdomain).toBe('mycompany')
    expect(res.body.clusterThreshold).toBe(0.65)
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockRejectedValue(new Error('DB error'))
    const res = await request(app).get('/org/settings')
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// PUT /org/settings
// ---------------------------------------------------------------------------
describe('PUT /org/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 for invalid body (bad URL)', async () => {
    stubUserOrgLookup()
    const res = await request(app)
      .put('/org/settings')
      .send({ kbPublishUrl: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 403 when caller is not an org admin', async () => {
    stubNonAdminUser()
    const res = await request(app).put('/org/settings').send({})
    expect(res.status).toBe(403)
  })

  it('upserts settings and returns masked values', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationSettings.upsert).mockResolvedValue({
      ...mockSettings,
      zendeskApiKey: 'enc:newkey9999',
    } as never)

    const res = await request(app)
      .put('/org/settings')
      .send({ zendeskSubdomain: 'mycompany', zendeskApiKey: 'newkey9999' })

    expect(res.status).toBe(200)
    // Returned key should be masked
    expect(res.body.zendeskApiKey).toMatch(/^\*{4}/)
    // Upsert called with encrypted value
    expect(prisma.organizationSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ zendeskApiKey: 'enc:newkey9999' }),
      }),
    )
  })

  it('accepts empty string for kbPublishUrl (clears the field)', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationSettings.upsert).mockResolvedValue({
      ...mockSettings,
      kbPublishUrl: null,
    } as never)

    const res = await request(app).put('/org/settings').send({ kbPublishUrl: '' })
    expect(res.status).toBe(200)
  })

  it('validates clusterThreshold is between 0.1 and 1.0', async () => {
    const res = await request(app).put('/org/settings').send({ clusterThreshold: 1.5 })
    expect(res.status).toBe(400)
  })

  it('validates minClusterSize is between 1 and 50', async () => {
    const res = await request(app).put('/org/settings').send({ minClusterSize: 0 })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// GET /org/members
// ---------------------------------------------------------------------------
describe('GET /org/members', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 with sorted member list', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([mockMember] as never)

    const res = await request(app).get('/org/members')

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0].userEmail).toBe('alice@co.com')
    expect(res.body[0].role).toBe('ADMIN')
  })

  it('queries with orderBy joinedAt asc', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([])

    await request(app).get('/org/members')

    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { joinedAt: 'asc' } }),
    )
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockRejectedValue(new Error('fail'))
    const res = await request(app).get('/org/members')
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// POST /org/members/invite
// ---------------------------------------------------------------------------
describe('POST /org/members/invite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/org/members/invite')
      .send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 409 when email is already a member', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(mockMember as never)

    const res = await request(app)
      .post('/org/members/invite')
      .send({ email: 'alice@co.com' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Already a member')
  })

  it('returns 201 and creates a pending member', async () => {
    stubUserOrgLookup()
    vi.mocked(prisma.organizationMember.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.organizationMember.create).mockResolvedValue({
      userEmail: 'newuser@co.com',
      role: 'MEMBER',
      joinedAt: new Date('2026-01-01'),
    } as never)

    const res = await request(app)
      .post('/org/members/invite')
      .send({ email: 'newuser@co.com' })

    expect(res.status).toBe(201)
    expect(res.body.userEmail).toBe('newuser@co.com')
    expect(res.body.role).toBe('MEMBER')
    // userId should NOT be set (pending invite)
    expect(prisma.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null, role: 'MEMBER' }),
      }),
    )
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockRejectedValue(new Error('fail'))
    const res = await request(app)
      .post('/org/members/invite')
      .send({ email: 'a@b.com' })
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// PATCH /org/members/:userId
// ---------------------------------------------------------------------------
describe('PATCH /org/members/:userId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when caller is not an org admin', async () => {
    stubNonAdminUser()
    const res = await request(app)
      .patch(`/org/members/${USER_ID}`)
      .send({ role: 'MEMBER' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid role value', async () => {
    const res = await request(app)
      .patch(`/org/members/${USER_ID}`)
      .send({ role: 'SUPERUSER' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when member not found', async () => {
    vi.mocked(prisma.organizationMember.findFirst)
      .mockResolvedValueOnce(adminMembership as never) // getOrCreateUserOrg
      .mockResolvedValueOnce(adminMembership as never) // isOrgAdmin → admin
      .mockResolvedValueOnce(null)                      // target member lookup

    const res = await request(app)
      .patch(`/org/members/${USER_ID}`)
      .send({ role: 'MEMBER' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Member not found')
  })

  it('returns 200 with updated role', async () => {
    vi.mocked(prisma.organizationMember.findFirst)
      .mockResolvedValueOnce(adminMembership as never) // getOrCreateUserOrg
      .mockResolvedValueOnce(adminMembership as never) // isOrgAdmin → admin
      .mockResolvedValueOnce(mockMember as never)       // target member
    vi.mocked(prisma.organizationMember.update).mockResolvedValue({
      ...mockMember,
      role: 'MEMBER',
    } as never)

    const res = await request(app)
      .patch(`/org/members/${USER_ID}`)
      .send({ role: 'MEMBER' })

    expect(res.status).toBe(200)
    expect(res.body.role).toBe('MEMBER')
  })
})

// ---------------------------------------------------------------------------
// DELETE /org/members/:userId
// ---------------------------------------------------------------------------
describe('DELETE /org/members/:userId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when trying to remove yourself', async () => {
    // The app middleware sets res.locals.uid = 'user-abc'
    const res = await request(app).delete('/org/members/user-abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot remove yourself')
  })

  it('returns 404 when member not found', async () => {
    vi.mocked(prisma.organizationMember.findFirst)
      .mockResolvedValueOnce(adminMembership as never) // getOrCreateUserOrg
      .mockResolvedValueOnce(adminMembership as never) // isOrgAdmin → admin
      .mockResolvedValueOnce(null)                      // target member lookup

    const res = await request(app).delete(`/org/members/${USER_ID}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Member not found')
  })

  it('returns 204 on successful deletion', async () => {
    vi.mocked(prisma.organizationMember.findFirst)
      .mockResolvedValueOnce(adminMembership as never) // getOrCreateUserOrg
      .mockResolvedValueOnce(adminMembership as never) // isOrgAdmin → admin
      .mockResolvedValueOnce(mockMember as never)       // target member
    vi.mocked(prisma.organizationMember.delete).mockResolvedValue(mockMember as never)

    const res = await request(app).delete(`/org/members/${USER_ID}`)

    expect(res.status).toBe(204)
    expect(prisma.organizationMember.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEMBER_ID } }),
    )
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockRejectedValue(new Error('fail'))
    const res = await request(app).delete(`/org/members/${USER_ID}`)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// DELETE /org/:orgId
// ---------------------------------------------------------------------------
describe('DELETE /org/:orgId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when caller is not an admin of the org', async () => {
    // findFirst returns null — caller is not an ADMIN member
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null)

    const res = await request(app).delete(`/org/${ORG_ID}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/admin/)
  })

  it('returns 400 when the org is the caller\'s only org', async () => {
    // findFirst finds admin membership
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(mockMember as never)
    // count of other orgs = 0
    vi.mocked(prisma.organizationMember.count).mockResolvedValueOnce(0)

    const res = await request(app).delete(`/org/${ORG_ID}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot delete your only team')
  })

  it('returns 204 on successful deletion and detaches drafts instead of deleting them', async () => {
    // findFirst finds admin membership
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(mockMember as never)
    // count of other orgs = 2
    vi.mocked(prisma.organizationMember.count).mockResolvedValueOnce(2)
    vi.mocked(prisma.organizationSettings.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.draft.updateMany).mockResolvedValue({ count: 3 } as never)
    vi.mocked(prisma.draftEvent.updateMany).mockResolvedValue({ count: 5 } as never)
    vi.mocked(prisma.organizationMember.deleteMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.organization.delete).mockResolvedValue(mockOrg as never)

    const res = await request(app).delete(`/org/${ORG_ID}`)

    expect(res.status).toBe(204)

    // Verify drafts were detached (orgId set to null), not deleted
    expect(prisma.draft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_ID },
        data: { orgId: null },
      }),
    )

    // Verify draft events were also detached
    expect(prisma.draftEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: ORG_ID },
        data: { orgId: null },
      }),
    )

    // Verify org was deleted
    expect(prisma.organization.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORG_ID } }),
    )
  })

  it('deletes settings before members and org (FK-safe order)', async () => {
    const callOrder: string[] = []
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(mockMember as never)
    vi.mocked(prisma.organizationMember.count).mockResolvedValueOnce(1)
    vi.mocked(prisma.organizationSettings.deleteMany).mockImplementation((async () => {
      callOrder.push('settings')
      return { count: 0 }
    }) as never)
    vi.mocked(prisma.draft.updateMany).mockImplementation((async () => {
      callOrder.push('drafts')
      return { count: 0 }
    }) as never)
    vi.mocked(prisma.draftEvent.updateMany).mockImplementation((async () => {
      callOrder.push('draftEvents')
      return { count: 0 }
    }) as never)
    vi.mocked(prisma.organizationMember.deleteMany).mockImplementation((async () => {
      callOrder.push('members')
      return { count: 0 }
    }) as never)
    vi.mocked(prisma.organization.delete).mockImplementation((async () => {
      callOrder.push('org')
      return mockOrg
    }) as never)

    await request(app).delete(`/org/${ORG_ID}`)

    expect(callOrder).toEqual(['settings', 'drafts', 'draftEvents', 'members', 'org'])
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockRejectedValue(new Error('DB error'))
    const res = await request(app).delete(`/org/${ORG_ID}`)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// PATCH /org/:orgId
// ---------------------------------------------------------------------------
describe('PATCH /org/:orgId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when caller is not an admin of the org', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(null)

    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ name: 'New Name' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/admin/)
  })

  it('returns 400 for invalid body (name too long)', async () => {
    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ name: 'a'.repeat(101) })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 for invalid body (logoUrl not a valid URL)', async () => {
    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ logoUrl: 'not-a-url' })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 for logoUrl pointing to a non-Firebase-Storage domain (domain allowlist)', async () => {
    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ logoUrl: 'https://example.com/logo.png' })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 200 with updated name and logoUrl (Firebase Storage URL)', async () => {
    const firebaseLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/org-logos%2Ftest%2Flogo.png?alt=media'
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(mockMember as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({
      ...mockOrg,
      name: 'Updated Name',
      logoUrl: firebaseLogoUrl,
    } as never)
    vi.mocked(prisma.organizationMember.count).mockResolvedValueOnce(4)

    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ name: 'Updated Name', logoUrl: firebaseLogoUrl })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Name')
    expect(res.body.logoUrl).toBe(firebaseLogoUrl)
    expect(res.body.memberCount).toBe(4)
    expect(res.body.role).toBe('ADMIN')
    expect(res.body.id).toBe(ORG_ID)
  })

  it('returns 200 with logoUrl null when cleared', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(mockMember as never)
    vi.mocked(prisma.organization.update).mockResolvedValue({
      ...mockOrg,
      name: 'My Team',
      logoUrl: null,
    } as never)
    vi.mocked(prisma.organizationMember.count).mockResolvedValueOnce(1)

    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ logoUrl: null })

    expect(res.status).toBe(200)
    expect(res.body.logoUrl).toBeNull()
  })

  it('calls next on DB error', async () => {
    vi.mocked(prisma.organizationMember.findFirst).mockResolvedValueOnce(mockMember as never)
    vi.mocked(prisma.organization.update).mockRejectedValue(new Error('DB error'))
    vi.mocked(prisma.organizationMember.count).mockResolvedValueOnce(1)

    const res = await request(app)
      .patch(`/org/${ORG_ID}`)
      .send({ name: 'Fail' })

    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// GET /org — logoUrl included in response
// ---------------------------------------------------------------------------
describe('GET /org — logoUrl field', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes logoUrl in each org entry', async () => {
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([
      {
        id: MEMBER_ID,
        orgId: ORG_ID,
        userId: 'user-abc',
        userEmail: 'user@example.com',
        role: 'ADMIN',
        joinedAt: new Date(),
        org: { ...mockOrg, logoUrl: 'https://example.com/logo.png', _count: { members: 2 } },
      },
    ] as never)

    const res = await request(app).get('/org')

    expect(res.status).toBe(200)
    expect(res.body[0].logoUrl).toBe('https://example.com/logo.png')
  })

  it('returns logoUrl as null when not set', async () => {
    vi.mocked(prisma.organizationMember.findMany).mockResolvedValue([
      {
        id: MEMBER_ID,
        orgId: ORG_ID,
        userId: 'user-abc',
        userEmail: 'user@example.com',
        role: 'ADMIN',
        joinedAt: new Date(),
        org: { ...mockOrg, logoUrl: null, _count: { members: 1 } },
      },
    ] as never)

    const res = await request(app).get('/org')

    expect(res.status).toBe(200)
    expect(res.body[0].logoUrl).toBeNull()
  })
})
