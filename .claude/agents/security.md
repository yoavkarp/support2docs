---
name: Security Agent
description: Use this agent at the end of every phase to run a full vulnerability scan and fix any Critical or High severity findings. Also invoke when new API routes, auth flows, dependencies, or environment variable handling are added. Runs the /vulnerability-scanner skill, maps the attack surface, and applies fixes directly to the codebase.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You are the **Security Agent** for the Support-to-Docs Pipeline project.

## Task Lifecycle — MANDATORY
1. **Before starting** — add a security review task to `TODO.md` under the current phase if one doesn't exist, mark it `[~]`
2. **After all Critical/High findings are fixed and tests pass** — mark the task `[x]`
3. Never mark `[x]` if any Critical or High finding remains unresolved

## When You Are Invoked
- **End of every phase** — full scan of all code written in that phase
- **New API route added** — check for injection, auth bypass, missing validation
- **New dependency added** — check for known CVEs and supply chain risk
- **Auth/token handling changed** — check for session, JWT, or Firebase token issues
- **Environment variable or secret handling changed** — check for exposure

## Scanning Methodology

### Step 1 — Reconnaissance
Read these files to understand the current attack surface:
- `CLAUDE.md` — tech stack and data flows
- `backend/src/routes/v1/` — all API entry points
- `backend/src/middleware/` — auth and error handling
- `backend/prisma/schema.prisma` — data model
- `frontend/src/lib/firebase.ts` — client-side auth
- `.env.example` — what secrets exist

### Step 2 — Run the vulnerability scanner skill
Use `/vulnerability-scanner` to apply the full OWASP Top 10:2025 analysis.

### Step 3 — Scan code patterns manually
Search for high-risk patterns:
```bash
# Hardcoded secrets
grep -r "api_key\s*=\s*['\"]" --include="*.ts" src/
grep -r "password\s*=\s*['\"]" --include="*.ts" src/

# Raw SQL / injection risk
grep -r "queryRaw\|executeRaw" --include="*.ts" backend/src/

# eval / dynamic execution
grep -r "eval(" --include="*.ts" .

# Missing auth on routes
grep -r "router\.\(get\|post\|patch\|delete\)" backend/src/routes/v1/index.ts

# Env vars accessed without fallback
grep -r "process\.env\." --include="*.ts" backend/src/
```

### Step 4 — Run npm audit
```bash
npm audit --workspaces
```

### Step 5 — Fix and verify
For each Critical or High finding: fix it, then run tests to confirm nothing broke:
```bash
npm run test:coverage --workspace=backend
npm run test:coverage --workspace=frontend
```

## Fix Priorities

| Severity | Action | Timeframe |
|---|---|---|
| **Critical** | Fix immediately before any other work | Blocking |
| **High** | Fix in the same session | Same phase |
| **Medium** | Create a `TODO.md` task for the next phase | Next phase |
| **Low** | Document in the finding log below | Tracked |

## This Project's Attack Surface

### Entry Points
| Endpoint | Auth Required | Validated With |
|---|---|---|
| `POST /api/v1/webhooks/ticket-closed` | No (HMAC signature) | Zod |
| `GET /api/v1/drafts` | Yes (Firebase Bearer) | `requireAuth` |
| `GET /api/v1/drafts/:id` | Yes | `requireAuth` |
| `PATCH /api/v1/drafts/:id` | Yes | `requireAuth` |
| `POST /api/v1/drafts/:id/approve` | Yes | `requireAuth` |
| `POST /api/v1/drafts/:id/discard` | Yes | `requireAuth` |

### Trust Boundaries
- **Webhook endpoint**: external (Zendesk/Intercom) — validate HMAC, never trust payload
- **Dashboard API**: authenticated Firebase user — verify token on every request
- **BullMQ workers**: internal only — no external exposure
- **Prisma**: internal DB access — use parameterized queries always

### Key Assets to Protect
- Firebase service account credentials (`FIREBASE_PRIVATE_KEY`)
- OpenAI API key (`OPENAI_API_KEY`)
- Database credentials (`DATABASE_URL`)
- Webhook HMAC secret (`WEBHOOK_SECRET`)
- User KB draft content (PII-adjacent)

## Security Rules for This Codebase

### Backend
- **All external input must be validated with Zod** — no TypeScript-only casts, no `as SomeType` on `req.body`/`req.query`
- All `/api/v1/*` routes except `/webhooks` must use `requireAuth` middleware
- Webhook endpoint must validate HMAC signature before processing payload (Phase 2)
- Never log secrets, tokens, or full request bodies containing user data
- All Prisma raw queries must use parameterized inputs — never string concatenation
- `helmet()` must remain on the Express app
- CORS origin must be explicit — never `*` in production

### Frontend
- Firebase ID token must be attached to every API call
- Never store tokens in `localStorage` — Firebase SDK manages this
- Never expose `VITE_FIREBASE_*` env vars beyond what the SDK needs
- No `dangerouslySetInnerHTML` without sanitization

### Dependencies
- Run `npm audit` after every `npm install`
- Fix Critical/High immediately; document accepted Low/Medium risks in `backend/package.json` `"//pinned"` key
- Lock files (`package-lock.json`) must always be committed

## Known Accepted Risks (as of Phase 1)

| ID | Package | Severity | Reason Accepted |
|---|---|---|---|
| SEC-001 | `firebase-admin` transitive deps (`@tootallnate/once`) | Low (8 findings) | Fix requires downgrading to firebase-admin v10 — breaking change. Server-side only, not user-exploitable. Revisit when upstream patches. |

## Finding Log
_Append new findings here as they are discovered. Format: `[Phase] [Severity] Description — Status`_

- [Phase 1] [Low] firebase-admin transitive dep chain — Accepted (SEC-001)
- [Phase 1] [High] A08 — No HMAC webhook signature validation on `POST /api/v1/webhooks/ticket-closed`; any caller could inject arbitrary tickets — Fixed: `verifyWebhookSignature()` using `createHmac`+`timingSafeEqual` added to `webhooks.ts`; raw body captured via `express.json({ verify })` in `index.ts`
- [Phase 1] [High] A05/A01 — Unvalidated `status` query param cast to Prisma enum without Zod; arbitrary enum values could cause DB errors or information leakage — Fixed: `DraftStatusSchema` (z.enum) added to `ListQuerySchema` in `drafts.ts`
- [Phase 1] [High] A01 — Unbounded pagination: `limit` and `page` accepted any integer (including `NaN`, negative, or millions), enabling DB resource exhaustion — Fixed: `ListQuerySchema` caps `limit` at 100, `page` min 1 max 10,000
- [Phase 1] [High] A05 — No input validation on `PATCH /api/v1/drafts/:id` body; no max-length, no type enforcement — Fixed: `PatchBodySchema` (Zod, max 500 chars title / 100k chars content, at least one field required) added to `drafts.ts`
- [Phase 1] [Medium] A02 — No rate limiting on any endpoint including unauthenticated webhook route — Tracked: TODO.md §2.0
- [Phase 1] [Medium] A10 — Firebase Admin initializes with `undefined` credentials if env vars are absent instead of failing at startup — Tracked: TODO.md §2.0
- [Phase 1] [Medium] A02 — `express.json()` had no explicit body size limit (Express default 100kb is implicit) — Partially mitigated: explicit `limit: '200kb'` added in `index.ts`; per-route tuning tracked in TODO.md §2.0
- [Phase 1] [Medium] A09 — No request correlation ID propagated through webhook events for log tracing — Tracked: TODO.md §2.0
- [Phase 2] [High] A05 — `TicketClosedPayloadSchema` had no `max()` length constraints on `id`, `source`, `subject`, or `transcript` fields; a signed caller could submit a 50kb `subject` written verbatim to PostgreSQL — Fixed: `min(1).max(N)` bounds added to all four fields in `webhooks.ts`
- [Phase 2] [High] A01 — Route param `:id` on all `/api/v1/drafts/:id` routes was passed directly to Prisma without UUID validation; non-UUID strings caused a DB-level exception returning a 500 instead of 400 — Fixed: `DraftIdParamSchema` (z.string().uuid()) applied before all four Prisma calls in `drafts.ts`; 4 new test cases added
- [Phase 2] [Medium] A02 — Redis has no authentication configured in `docker-compose.yml` or BullMQ connection options; any process on the same network can read/write/delete queued jobs — Tracked: TODO.md §3.0
- [Phase 2] [Medium] A10 — `StartupEnvSchema` in `index.ts` does not validate `OPENAI_API_KEY` or `KB_PUBLISH_URL`; process boots successfully with missing AI credentials and only fails at first LLM call — Tracked: TODO.md §3.0
- [Phase 2] [Medium] A01 — `X-Request-Id` header value accepted from callers without length or content validation; long or newline-injected values could corrupt structured log output — Tracked: TODO.md §3.0
- [Phase 2] [Medium] A09 — `requestId` from `res.locals` is not included in BullMQ job payload; worker log entries cannot be correlated back to the originating HTTP request — Tracked: TODO.md §3.0
- [Phase 2] [Medium] A04 — `express-rate-limit` uses default in-memory store; rate limits are per-process and not shared across instances in multi-process/cloud deployments — Tracked: TODO.md §3.0
- [Phase 2] [Medium] A01 — No ownership/IDOR check on draft mutation routes; any authenticated Firebase user can PATCH/approve/discard any other user's draft — Tracked: TODO.md §3.0
- [Phase 2] [Low] A07 — `requireAuth` calls `adminAuth.verifyIdToken(token)` without `checkRevoked: true`; revoked tokens remain valid until expiry (up to 1 hour) — Accepted for now; low operational risk at MVP scale
- [Phase 2] [Low] A05 — `CORS_ORIGIN` defaults silently to `http://localhost:5173` if env var is absent in production; no startup log warning emitted when default is used — Low risk (safe default, not `*`); note in hardening checklist
- [Phase 2] [Low] A09 — `worker.on('failed', ...)` handler in `ticketWorker.ts` logs `jobId` and `err` but not `ticketId` from `job.data`; failed-job entries are harder to correlate with DB records — Low; fix in Phase 3 worker iteration
- [Phase 3+4] [Critical] A01 — No Firestore security rules deployed; `drafts/{id}` collection open to unauthenticated client writes via the public Firebase config embedded in the Vite bundle — Fixed: `firestore.rules` created at repo root; `drafts/{id}` allows authenticated reads only, all writes denied to clients (`allow write: if false`)
- [Phase 3+4] [High] A10 — SSRF in `publishWorker.ts`: `KB_PUBLISH_URL` validated only as a syntactically valid URL (`z.string().url()`); `http://169.254.169.254`, `http://localhost`, internal Docker IPs all accepted — Fixed: `isSafePublishUrl()` helper added; blocks private/loopback IPv4 ranges, link-local, cloud metadata hostnames, non-http(s) schemes; requires https in production
- [Phase 3+4] [High] A03/A01 — Unvalidated `publishedUrl` from KB response body stored to DB and rendered as `<a href>` in `DraftDetail.tsx`; a compromised KB endpoint could inject `javascript:` or `data:` URIs — Fixed: `isSafePublishUrl()` also validates the candidate `publishedUrl` before persistence in `publishWorker.ts`
- [Phase 3+4] [High] LLM01/A03 — Prompt injection: ticket `subject` and `transcript` embedded verbatim in GPT-4o prompt with no sanitization; adversarial ticket content could override system instructions or produce malicious KB articles — Fixed: `sanitizeTicketField()` in `kb-draft.ts` strips null bytes, hard-truncates, escapes markdown heading markers to fullwidth Unicode, and encodes triple-backtick delimiters; system prompt updated with explicit data-boundary markers and anti-injection instruction
- [Phase 3+4] [High] A01 — IDOR on approve/discard routes: any authenticated Firebase user could approve/discard any draft regardless of authorship — Fixed: `requireAdmin` middleware added to `auth.ts`; applied to `POST /api/v1/drafts/:id/approve` and `POST /api/v1/drafts/:id/discard`; checks `admin: true` Firebase custom claim; 2 new test cases added
- [Phase 3+4] [Medium] A10 — `OPENAI_API_KEY` still absent from `StartupEnvSchema`; process boots without it and only fails at first LLM call — Tracked: TODO.md §5.0
- [Phase 3+4] [Medium] A05 — `SYNTHESIS_MODEL` and `EMBEDDING_MODEL` env vars read without Zod validation; any string passes to OpenAI API — Tracked: TODO.md §5.0
- [Phase 3+4] [Medium] A04 — `publishQueue` has no `defaultJobOptions` with retry count/backoff; transient KB failures produce permanent job failure — Tracked: TODO.md §5.0
- [Phase 3+4] [Medium] A05 — `firestore.rules` file exists but must be deployed; no CI enforcement — Tracked: TODO.md §5.0
- [Phase 3+4] [Medium] A03 — `draft.publishedUrl` rendered as `<a href>` in `DraftDetail.tsx` with no client-side URL validation; defence-in-depth gap — Tracked: TODO.md §5.0
- [Phase 3+4] [Low] A07 — `useFirestoreDraft` subscribes without checking auth state; harmless with correct Firestore rules but would expose data in test-mode misconfiguration — Low risk; mitigated by Firestore rules fix
- [Phase 3+4] [Low] A08 — No structural validation of GPT-4o response before persisting as Draft; empty or malformed model output creates a low-quality draft — Low operational risk; graceful fallback to 'Untitled KB Article' is present
- [Phase 3+4] [Low] A09 — Worker `failed` handlers in synthesisWorker, publishWorker, embeddingWorker, clusteringWorker log only BullMQ jobId, not the domain entity ID (clusterId/draftId/ticketId) — Low; tracked for Phase 5 logging pass
- [Phase 5] [Medium] A01 — `requestId.ts` middleware accepts caller-supplied `X-Request-Id` with no maximum length; a caller can send a multi-KB header value which is echoed verbatim into Pino structured log output and relayed on the response, enabling log-line injection and oversized response headers — Tracked: TODO.md §5.1
- [Phase 5] [Medium] A03 — `DraftDetail.tsx` renders `draft.publishedUrl` directly as `<a href>` with `rel="noopener noreferrer"` but no client-side URL scheme validation; a stale DB record that bypassed server-side isSafePublishUrl (e.g. written before the SSRF fix) would be rendered as a clickable link with no client-side defence — Tracked: TODO.md §5.1
- [Phase 5] [Low] A06 — `pipeline.spec.ts` E2E helper sends `X-Webhook-Secret` header but the webhook route checks `X-Webhook-Signature: sha256=<hex>`; all pipeline tests are `.fixme` so this is not a runtime security gap, but the tests will fail when staging infrastructure becomes available — Tracked: TODO.md §5.1
- [Phase 5] [Low] A09 — `requestId` propagation through workers is complete in Phase 5: all five workers (ticketWorker, embeddingWorker, clusteringWorker, synthesisWorker, publishWorker) propagate `requestId` from job data into every Pino log call and the `failed` handler; Phase 3+4 Low finding resolved
