import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { MemberRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'

import { encrypt, decrypt, mask } from '../../lib/crypto.js'
import { isSafePublishUrl } from '../../lib/url-safety.js'

export const orgRouter = Router()

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// A05 — Masked-value sentinel rejection: the GET endpoint returns secrets as
// "****<last4>" so the frontend knows a value is set.  If that sentinel is
// sent back verbatim to PUT the real secret would be silently overwritten with
// the mask string.  Reject any value that starts with "****" so that only
// genuine updates are accepted.  Empty string means "clear the field".
// Max lengths match what can reasonably be stored in the DB.
const OrgSettingsSchema = z.object({
  zendeskSubdomain: z.string().max(253).optional(),
  zendeskApiKey: z
    .string()
    .max(500)
    .refine((v) => !v.startsWith('****'), {
      message: 'Do not send the masked placeholder — leave empty to keep the existing value',
    })
    .optional(),
  intercomToken: z
    .string()
    .max(500)
    .refine((v) => !v.startsWith('****'), {
      message: 'Do not send the masked placeholder — leave empty to keep the existing value',
    })
    .optional(),
  // A10 — SSRF: validate kbPublishUrl with the same isSafePublishUrl check
  // used by publishWorker so admins cannot store a private/metadata URL.
  kbPublishUrl: z
    .string()
    .url()
    .max(2048)
    .refine((v) => isSafePublishUrl(v), {
      message:
        'kbPublishUrl must use https and must not point to a private, loopback, or cloud-metadata address',
    })
    .optional()
    .or(z.literal('')),
  clusterThreshold: z.number().min(0.1).max(1.0).optional(),
  minClusterSize: z.number().int().min(1).max(50).optional(),
})

const InviteMemberSchema = z.object({ email: z.string().email() })

const UpdateMemberSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) })

const UserIdParamSchema = z.object({ userId: z.string().min(1) })

const OrgIdParamSchema = z.object({ orgId: z.string().min(1) })

const CreateOrgSchema = z.object({ name: z.string().min(1).max(100) })

// A01/A08 — logoUrl domain allowlist.
// Only Firebase Storage download URLs and the explicit null (remove logo) are
// accepted.  This prevents:
//   1. Referrer leakage to arbitrary third-party image hosts.
//   2. javascript:/data:/file: URI injection (though z.string().url() already
//      rejects non-http(s) schemes, belt-and-braces here).
//   3. Future SSRF if a server-side image proxy is ever added.
//
// Firebase Storage download URLs always have one of these hostnames:
//   firebasestorage.googleapis.com
//   storage.googleapis.com  (legacy / direct)
//   *.firebasestorage.app   (newer Firebase Storage custom domains)
function isSafeLogoUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const h = parsed.hostname.toLowerCase()
  return (
    h === 'firebasestorage.googleapis.com' ||
    h === 'storage.googleapis.com' ||
    h.endsWith('.firebasestorage.app') ||
    // Allow localhost in non-production for Firebase emulator
    (process.env.NODE_ENV !== 'production' && (h === 'localhost' || h === '127.0.0.1'))
  )
}

const PatchOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z
    .string()
    .url()
    .max(2048)
    .refine((v) => isSafeLogoUrl(v), {
      message:
        'logoUrl must be a Firebase Storage URL (firebasestorage.googleapis.com or storage.googleapis.com)',
    })
    .nullable()
    .optional(),
})

// ---------------------------------------------------------------------------
// Helper: resolve (or create) the org for a specific user.
//
// 1. Look up OrganizationMember where userId = uid — return the first org.
// 2. If no membership found, create a new org and add the user as ADMIN.
// ---------------------------------------------------------------------------

async function getOrCreateUserOrg(
  uid: string,
  email: string,
  requestedOrgId?: string,
): Promise<{ id: string }> {
  // If caller specified an org via X-Org-Id, honour it — but only if the user
  // is actually a member of that org (prevents IDOR).
  if (requestedOrgId) {
    const membership = await prisma.organizationMember.findFirst({
      where: { orgId: requestedOrgId, userId: uid },
      select: { orgId: true },
    })
    if (membership) return { id: requestedOrgId }
  }

  // Find the first org this user belongs to
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: uid },
    select: { orgId: true },
  })
  if (membership) {
    return { id: membership.orgId }
  }

  // Bootstrap: create a personal org and add the user as ADMIN
  const org = await prisma.organization.create({
    data: {
      id: uuidv4(),
      name: 'My Team',
      slug: `${uid.slice(0, 8)}-${uuidv4().slice(0, 4)}`,
    },
  })

  await prisma.organizationMember.create({
    data: {
      id: uuidv4(),
      orgId: org.id,
      userId: uid,
      userEmail: email,
      role: MemberRole.ADMIN,
    },
  })

  return { id: org.id }
}

// ---------------------------------------------------------------------------
// Helper: check if a user is an ADMIN of a given org (DB role — NOT Firebase claim)
// ---------------------------------------------------------------------------

async function isOrgAdmin(orgId: string, userId: string): Promise<boolean> {
  const membership = await prisma.organizationMember.findFirst({
    where: { orgId, userId, role: MemberRole.ADMIN },
    select: { id: true },
  })
  return membership !== null
}

// ---------------------------------------------------------------------------
// Helper: build masked settings response from a DB settings row (or defaults)
// ---------------------------------------------------------------------------

interface MaskedSettings {
  zendeskSubdomain: string | null
  zendeskApiKey: string | null
  intercomToken: string | null
  kbPublishUrl: string | null
  clusterThreshold: number
  minClusterSize: number
}

function buildMaskedSettings(
  settings: {
    zendeskSubdomain: string | null
    zendeskApiKey: string | null
    intercomToken: string | null
    kbPublishUrl: string | null
    clusterThreshold: number
    minClusterSize: number
  } | null,
  isAdmin = false,
): MaskedSettings {
  if (!settings) {
    return {
      zendeskSubdomain: null,
      zendeskApiKey: null,
      intercomToken: null,
      // A01 — kbPublishUrl exposes internal infrastructure; restrict to admins.
      kbPublishUrl: null,
      clusterThreshold: 0.65,
      minClusterSize: 5,
    }
  }

  // Decrypt raw stored values, then mask.
  // A10 — Guard against decrypt() throwing when a value was stored as
  // plaintext (dev mode, no ORG_SECRETS_KEY) and the server restarts with
  // ORG_SECRETS_KEY set.  We return null rather than crashing the request.
  let decryptedApiKey: string | null = null
  if (settings.zendeskApiKey) {
    try {
      decryptedApiKey = decrypt(settings.zendeskApiKey)
    } catch {
      // Leave as null — operator must re-save the setting to re-encrypt
    }
  }
  let decryptedToken: string | null = null
  if (settings.intercomToken) {
    try {
      decryptedToken = decrypt(settings.intercomToken)
    } catch {
      // Leave as null — operator must re-save the setting to re-encrypt
    }
  }

  return {
    zendeskSubdomain: settings.zendeskSubdomain ?? null,
    zendeskApiKey: mask(decryptedApiKey),
    intercomToken: mask(decryptedToken),
    // A01 — kbPublishUrl can expose internal infrastructure URLs; only return
    // it to admin-claim holders.  Non-admin members receive null.
    kbPublishUrl: isAdmin ? (settings.kbPublishUrl ?? null) : null,
    clusterThreshold: settings.clusterThreshold,
    minClusterSize: settings.minClusterSize,
  }
}

// ---------------------------------------------------------------------------
// POST /org — create a named org for the authenticated user
// ---------------------------------------------------------------------------
orgRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateOrgSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
      return
    }

    const { name } = parsed.data
    const uid = res.locals['uid'] as string
    const email = (res.locals['claims'] as Record<string, unknown>)['email'] as string

    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 50) +
      '-' +
      uuidv4().slice(0, 4)

    const org = await prisma.organization.create({
      data: {
        id: uuidv4(),
        name,
        slug,
      },
    })

    await prisma.organizationMember.create({
      data: {
        id: uuidv4(),
        orgId: org.id,
        userId: uid,
        userEmail: email,
        role: MemberRole.ADMIN,
      },
    })

    res.status(201).json({ id: org.id, name: org.name, slug: org.slug, role: 'ADMIN' })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /org — list all orgs the authenticated user belongs to
// ---------------------------------------------------------------------------
orgRouter.get('/', async (_req, res, next) => {
  try {
    const uid = res.locals['uid'] as string

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: uid },
      include: {
        org: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
    })

    const orgs = memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      role: m.role,
      memberCount: m.org._count.members,
      logoUrl: m.org.logoUrl ?? null,
    }))

    res.json(orgs)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /org/settings
// ---------------------------------------------------------------------------
orgRouter.get('/settings', async (req, res, next) => {
  try {
    const uid = res.locals['uid'] as string
    const email = (res.locals['claims'] as Record<string, unknown>)['email'] as string
    const requestedOrgId = req.headers['x-org-id'] as string | undefined
    const org = await getOrCreateUserOrg(uid, email, requestedOrgId)
    const settings = await prisma.organizationSettings.findUnique({
      where: { orgId: org.id },
    })
    // A01 — Pass admin flag so buildMaskedSettings can gate kbPublishUrl.
    const isAdmin = (res.locals['claims'] as Record<string, unknown>)?.['admin'] === true
    res.json(buildMaskedSettings(settings, isAdmin))
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PUT /org/settings — org admin (DB role) required
// ---------------------------------------------------------------------------
orgRouter.put('/settings', async (req, res, next) => {
  try {
    const parsed = OrgSettingsSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
      return
    }

    const {
      zendeskSubdomain,
      zendeskApiKey,
      intercomToken,
      kbPublishUrl,
      clusterThreshold,
      minClusterSize,
    } = parsed.data

    const uid = res.locals['uid'] as string
    const email = (res.locals['claims'] as Record<string, unknown>)['email'] as string
    const requestedOrgId = req.headers['x-org-id'] as string | undefined
    const org = await getOrCreateUserOrg(uid, email, requestedOrgId)
    if (!await isOrgAdmin(org.id, uid)) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
      return
    }

    // Encrypt secrets before persisting
    const encryptedApiKey =
      zendeskApiKey !== undefined
        ? zendeskApiKey === ''
          ? null
          : encrypt(zendeskApiKey)
        : undefined

    const encryptedToken =
      intercomToken !== undefined
        ? intercomToken === ''
          ? null
          : encrypt(intercomToken)
        : undefined

    const upserted = await prisma.organizationSettings.upsert({
      where: { orgId: org.id },
      create: {
        id: uuidv4(),
        orgId: org.id,
        ...(zendeskSubdomain !== undefined && { zendeskSubdomain }),
        ...(encryptedApiKey !== undefined && { zendeskApiKey: encryptedApiKey }),
        ...(encryptedToken !== undefined && { intercomToken: encryptedToken }),
        ...(kbPublishUrl !== undefined && { kbPublishUrl: kbPublishUrl === '' ? null : kbPublishUrl }),
        ...(clusterThreshold !== undefined && { clusterThreshold }),
        ...(minClusterSize !== undefined && { minClusterSize }),
      },
      update: {
        ...(zendeskSubdomain !== undefined && { zendeskSubdomain }),
        ...(encryptedApiKey !== undefined && { zendeskApiKey: encryptedApiKey }),
        ...(encryptedToken !== undefined && { intercomToken: encryptedToken }),
        ...(kbPublishUrl !== undefined && { kbPublishUrl: kbPublishUrl === '' ? null : kbPublishUrl }),
        ...(clusterThreshold !== undefined && { clusterThreshold }),
        ...(minClusterSize !== undefined && { minClusterSize }),
      },
    })

    res.json(buildMaskedSettings(upserted, true))
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /org/members
// ---------------------------------------------------------------------------
orgRouter.get('/members', async (req, res, next) => {
  try {
    const uid = res.locals['uid'] as string
    const email = (res.locals['claims'] as Record<string, unknown>)['email'] as string
    const requestedOrgId = req.headers['x-org-id'] as string | undefined
    const org = await getOrCreateUserOrg(uid, email, requestedOrgId)
    const members = await prisma.organizationMember.findMany({
      where: { orgId: org.id },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        userId: true,
        userEmail: true,
        role: true,
        joinedAt: true,
      },
    })
    res.json(members)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// POST /org/members/invite — org admin (DB role) required
// ---------------------------------------------------------------------------
orgRouter.post('/members/invite', async (req, res, next) => {
  try {
    const parsed = InviteMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
      return
    }

    const { email } = parsed.data
    const uid = res.locals['uid'] as string
    const callerEmail = (res.locals['claims'] as Record<string, unknown>)['email'] as string
    const requestedOrgId = req.headers['x-org-id'] as string | undefined
    const org = await getOrCreateUserOrg(uid, callerEmail, requestedOrgId)
    if (!await isOrgAdmin(org.id, uid)) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
      return
    }

    // Check for duplicate
    const existing = await prisma.organizationMember.findUnique({
      where: { orgId_userEmail: { orgId: org.id, userEmail: email } },
    })
    if (existing) {
      res.status(409).json({ error: 'Already a member' })
      return
    }

    const member = await prisma.organizationMember.create({
      data: {
        id: uuidv4(),
        orgId: org.id,
        userId: null,
        userEmail: email,
        role: MemberRole.MEMBER,
      },
      select: {
        userEmail: true,
        role: true,
        joinedAt: true,
      },
    })

    res.status(201).json(member)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /org/members/:userId — org admin (DB role) required
// ---------------------------------------------------------------------------
orgRouter.patch('/members/:userId', async (req, res, next) => {
  try {
    const paramParsed = UserIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid userId', details: paramParsed.error.flatten() })
      return
    }

    const bodyParsed = UpdateMemberSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      res.status(400).json({ error: 'Invalid input', details: bodyParsed.error.flatten() })
      return
    }

    const { userId } = paramParsed.data
    const { role } = bodyParsed.data
    const uid = res.locals['uid'] as string
    const email = (res.locals['claims'] as Record<string, unknown>)['email'] as string
    const requestedOrgId = req.headers['x-org-id'] as string | undefined
    const org = await getOrCreateUserOrg(uid, email, requestedOrgId)
    if (!await isOrgAdmin(org.id, uid)) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
      return
    }

    const member = await prisma.organizationMember.findFirst({
      where: { orgId: org.id, userId },
    })
    if (!member) {
      res.status(404).json({ error: 'Member not found' })
      return
    }

    const updated = await prisma.organizationMember.update({
      where: { id: member.id },
      data: { role: role as MemberRole },
      select: {
        id: true,
        userId: true,
        userEmail: true,
        role: true,
        joinedAt: true,
      },
    })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// DELETE /org/members/:userId — org admin (DB role) required
// ---------------------------------------------------------------------------
orgRouter.delete('/members/:userId', async (req, res, next) => {
  try {
    const paramParsed = UserIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid userId', details: paramParsed.error.flatten() })
      return
    }

    const { userId } = paramParsed.data
    const callerUid = res.locals['uid'] as string | undefined

    if (callerUid && callerUid === userId) {
      res.status(400).json({ error: 'Cannot remove yourself' })
      return
    }

    const email = (res.locals['claims'] as Record<string, unknown>)['email'] as string
    const requestedOrgId = req.headers['x-org-id'] as string | undefined
    const org = await getOrCreateUserOrg(callerUid ?? '', email, requestedOrgId)
    if (!await isOrgAdmin(org.id, callerUid ?? '')) {
      res.status(403).json({ error: 'Forbidden — org admin role required' })
      return
    }

    const member = await prisma.organizationMember.findFirst({
      where: { orgId: org.id, userId },
    })
    if (!member) {
      res.status(404).json({ error: 'Member not found' })
      return
    }

    await prisma.organizationMember.delete({ where: { id: member.id } })

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// PATCH /org/:orgId — update org name and/or logoUrl (admin only)
// NOTE: Must be declared BEFORE DELETE /:orgId so the same wildcard segment
// doesn't cause any ambiguity — both target /:orgId but different methods.
// ---------------------------------------------------------------------------
orgRouter.patch('/:orgId', async (req, res, next) => {
  try {
    const paramParsed = OrgIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid orgId', details: paramParsed.error.flatten() })
      return
    }

    const bodyParsed = PatchOrgSchema.safeParse(req.body)
    if (!bodyParsed.success) {
      res.status(400).json({ error: 'Invalid input', details: bodyParsed.error.flatten() })
      return
    }

    const { orgId } = paramParsed.data
    const { name, logoUrl } = bodyParsed.data
    const uid = res.locals['uid'] as string

    // Caller must be an ADMIN of this org
    const adminMembership = await prisma.organizationMember.findFirst({
      where: { orgId, userId: uid, role: 'ADMIN' },
    })
    if (!adminMembership) {
      res.status(403).json({ error: 'Forbidden — you must be an admin of this organization' })
      return
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(name !== undefined && { name }),
        ...(logoUrl !== undefined && { logoUrl }),
      },
    })

    const memberCount = await prisma.organizationMember.count({ where: { orgId } })

    res.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      role: 'ADMIN',
      memberCount,
      logoUrl: updated.logoUrl ?? null,
    })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// DELETE /org/:orgId — delete an entire org (admin only)
// NOTE: This route must be declared AFTER all /members/* routes so that
// Express does not shadow them with the /:orgId wildcard segment.
// ---------------------------------------------------------------------------
orgRouter.delete('/:orgId', async (req, res, next) => {
  try {
    const paramParsed = OrgIdParamSchema.safeParse(req.params)
    if (!paramParsed.success) {
      res.status(400).json({ error: 'Invalid orgId', details: paramParsed.error.flatten() })
      return
    }

    const { orgId } = paramParsed.data
    const uid = res.locals['uid'] as string

    // Guard: caller must be an ADMIN of this org
    const adminMembership = await prisma.organizationMember.findFirst({
      where: { orgId, userId: uid, role: 'ADMIN' },
    })
    if (!adminMembership) {
      res.status(403).json({ error: 'Forbidden — you must be an admin of this organization' })
      return
    }

    // Guard: caller must have at least one other org after deletion
    const otherOrgCount = await prisma.organizationMember.count({
      where: { userId: uid, orgId: { not: orgId } },
    })
    if (otherOrgCount === 0) {
      res.status(400).json({ error: 'Cannot delete your only team' })
      return
    }

    // Delete in FK-safe order:
    // 1. Organization settings
    await prisma.organizationSettings.deleteMany({ where: { orgId } })
    // 2. Detach drafts (set orgId to null — preserves content for audit trail)
    await prisma.draft.updateMany({ where: { orgId }, data: { orgId: null } })
    // 3. Detach draft events
    await prisma.draftEvent.updateMany({ where: { orgId }, data: { orgId: null } })
    // 4. Remove all members
    await prisma.organizationMember.deleteMany({ where: { orgId } })
    // 5. Delete the org itself
    await prisma.organization.delete({ where: { id: orgId } })

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
