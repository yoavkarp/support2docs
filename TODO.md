# TODO.md — Support-to-Docs Pipeline

> Maintained by the **PM/Architect Agent**. Agents pick up tasks by status; move them to `[IN PROGRESS]` when starting and `[DONE]` when QA passes.

---

## Legend
- `[ ]` — Not started
- `[~]` — In Progress
- `[x]` — Done (QA verified)
- **Owner tags:** `[FE]` Frontend · `[BE]` Backend · `[QA]` QA · `[ORC]` Orchestrator

## Agent Definition Files
Each agent **must read its own definition file before starting any task**:
- `[FE]` → `.claude/agents/frontend.md`
- `[BE]` → `.claude/agents/backend.md`
- `[QA]` → `.claude/agents/qa.md`
- `[ORC]` → `.claude/agents/orchestrator.md`
- `[SEC]` → `.claude/agents/security.md`
- PM/Architect → `.claude/agents/pm-architect.md`

## Security Gate (end of every phase)
A `[SEC]` task must be completed before moving to the next phase:
- Security Agent runs `/vulnerability-scanner` on all code written in the phase
- Critical/High findings block phase sign-off
- Medium findings become tasks in the next phase
- Low findings are logged in `.claude/agents/security.md`

---

## Phase 1 — Scaffolding

> Goal: Runnable skeleton with auth, DB, and CI wired up. No business logic yet.

### 1.1 Project Init
- [x] `[FE]` Initialize Vite + React project with TypeScript strict mode
- [x] `[BE]` Configure Tailwind CSS v4 and install shadcn/ui
- [x] `[BE]` Set up `eslint`, `prettier`, and `tsconfig` (strict)
- [x] `[BE]` Create `docker-compose.yml` with PostgreSQL + pgvector + Redis services
- [x] `[BE]` Add `.env.example` with all required env vars documented

### 1.2 Database
- [x] `[BE]` Initialize Prisma ORM, connect to Dockerized PostgreSQL
- [x] `[BE]` Enable `pgvector` extension in migration
- [x] `[BE]` Define initial schema: `Ticket`, `Cluster`, `Draft`, `User` tables (uuid v4 PKs)
- [x] `[BE]` Write seed script with sample tickets
- [ ] `[QA]` Verify migrations run cleanly from scratch (`prisma migrate reset`) — **blocked: requires Docker**

### 1.3 Auth
- [x] `[BE]` Integrate Firebase v11 Authentication (email/password + Google)
- [x] `[BE]` Create Express/Node.js auth middleware to protect `/api/v1/*` routes
- [x] `[FE]` Implement React Router protected route wrapper for `/dashboard`
- [x] `[FE]` Build `LoginPage` and `LogoutButton` using shadcn/ui components
- [x] `[QA]` E2E test: unauthenticated user is redirected to `/login`

### 1.4 CI/CD
- [x] `[BE]` Create GitHub Actions workflow: lint → unit tests → build on every PR
- [x] `[QA]` Add Playwright install step to CI workflow
- [x] `[BE]` Add 80% coverage gate using Vitest `--coverage`

### 1.5 Security Gate
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 1 code — fix Critical/High findings

---

## Phase 2 — Ingestion

> Goal: Receive webhook events, store raw tickets, validate and queue for processing.

### 2.0 Security (Medium findings from Phase 1 gate)
- [x] `[BE]` Add rate limiting to all API endpoints — especially `POST /api/v1/webhooks/ticket-closed` (max 100 req/min per IP via `express-rate-limit`)
- [x] `[BE]` Add explicit body-size limit to `express.json()` for webhook route — currently set to 200kb globally; tune per-route if needed
- [x] `[BE]` Add startup validation: fail-fast if `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` are missing or empty
- [x] `[BE]` Propagate a `X-Request-Id` header through all routes so webhook events can be correlated in logs (A09)

### 2.1 Webhook Receiver
- [ ] `[BE]` Create `POST /api/v1/webhooks/ticket-closed` endpoint
- [ ] `[BE]` Validate HMAC signature for Zendesk/Intercom payloads
- [ ] `[BE]` Normalize incoming payload to internal `Ticket` model (uuid v4 ID assigned here)
- [ ] `[BE]` Persist raw ticket to PostgreSQL with status `PENDING`
- [x] `[QA]` Unit test: payload validation rejects malformed/unsigned requests
- [x] `[QA]` Integration test: valid webhook creates a `Ticket` row in DB

### 2.2 Queue Integration
- [x] `[BE]` Set up BullMQ (Redis-backed) queue: `ticket-processing` queue
- [x] `[BE]` Enqueue ticket ID after successful webhook ingestion
- [x] `[BE]` Create queue worker stub that reads from `ticket-processing`
- [x] `[QA]` Integration test: ticket is enqueued after webhook receipt

### 2.5 Security Gate
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 2 code — fix Critical/High findings

### 2.3 Deduplication
- [x] `[BE]` Add idempotency key check (source ticket ID) to prevent duplicate ingestion
- [ ] `[QA]` Unit test: duplicate webhook returns `200` but does not create a second row

---

## Phase 3 — AI Logic

> Goal: Vectorize tickets, cluster neighbors, and synthesize KB drafts.

### 3.0 Security (Medium findings from Phase 2 gate)
- [ ] `[BE]` Add Redis authentication (`requirepass`) to docker-compose.yml and pass `REDIS_PASSWORD` env var to BullMQ connection options in `queue.ts` and `ticketWorker.ts`; document in `.env.example` (A02 — Redis unauthenticated, exploitable in any multi-tenant or cloud deployment)
- [ ] `[BE]` Add `OPENAI_API_KEY` (and `KB_PUBLISH_URL`) to `StartupEnvSchema` in `index.ts` so the process fails fast at boot rather than at first use (A10 — incomplete startup validation)
- [ ] `[BE]` Add `max()` length constraints to `X-Request-Id` header value in `requestId.ts` (truncate or regenerate if value exceeds 128 chars) to prevent log-forging and header-injection via caller-supplied IDs (A01)
- [ ] `[BE]` Propagate `requestId` from `res.locals` into BullMQ job data when enqueuing in `webhooks.ts` so worker log entries can be correlated back to the originating HTTP request (A09)
- [ ] `[BE]` Switch `express-rate-limit` to a Redis-backed store (`rate-limit-redis`) so rate limits are shared across multiple process instances in production deployments (A04 — in-memory store per instance)
- [ ] `[BE]` Add IDOR / ownership check on all draft mutation routes (`PATCH`, `/approve`, `/discard`) before Phase 4 ships — drafts must be restricted to their author or an admin role (A01 — any authenticated user can mutate any draft)

### 3.1 Embedding Generation
- [x] `[BE]` Integrate OpenAI / Anthropic embedding API (configurable via env)
- [x] `[BE]` Queue worker: fetch `PENDING` tickets, generate embeddings, store in `pgvector` column
- [x] `[BE]` Update ticket status to `VECTORIZED` after embedding stored
- [x] `[QA]` Unit test: embedding worker handles API failure with retry + dead-letter

### 3.2 Clustering
- [x] `[BE]` Implement cosine similarity search via `pgvector` (`<=>` operator)
- [x] `[BE]` Clustering job: group tickets with similarity score above threshold (configurable, default `0.85`)
- [x] `[BE]` Trigger "Draft Request" when a cluster reaches ≥ 5 tickets (configurable threshold)
- [x] `[BE]` Persist `Cluster` record with member ticket IDs and centroid vector
- [x] `[QA]` Unit test: clustering logic correctly fires at the 5-ticket threshold
- [x] `[QA]` Integration test: full pipeline from ticket insert → cluster formation

### 3.3 Draft Synthesis
- [x] `[BE]` Create LLM synthesis job: extract problem statement + verified solution from cluster tickets
- [x] `[BE]` Prompt engineering: system prompt stored in `/lib/prompts/kb-draft.ts`
- [x] `[BE]` Persist result as `Draft` with status `PENDING_REVIEW` and source cluster ID
- [x] `[ORC]` Wire synthesis job to fire automatically when `Cluster.status` becomes `READY`
- [x] `[QA]` Unit test: synthesis prompt includes all ticket transcripts from cluster
- [ ] `[QA]` E2E test: 5 seeded tickets → cluster forms → draft created with content

---

## Phase 4 — Dashboard

> Goal: Reviewers can see, edit, approve, or discard AI-generated KB drafts in real time.

### 4.1 Draft List View
- [x] `[FE]` Create `/dashboard` route — list of `PENDING_REVIEW` drafts (TanStack Query)
- [x] `[FE]` `DraftCard` component: shows title, source ticket count, created date, status badge
- [x] `[BE]` `GET /api/v1/drafts` — paginated, filterable by status
- [x] `[QA]` Component test: `DraftCard` renders all fields; loading/empty states covered

### 4.2 Draft Detail & Edit
- [x] `[FE]` Create `/dashboard/drafts/:id` route with markdown editor (shadcn/ui `Textarea` or `@uiw/react-md-editor`)
- [x] `[BE]` `GET /api/v1/drafts/:id` — fetch single draft with cluster + source tickets
- [x] `[BE]` `PATCH /api/v1/drafts/:id` — save edits; update Firestore doc for real-time sync
- [x] `[FE]` Subscribe to Firestore draft doc for live collaborative edits indicator
- [x] `[QA]` E2E test: user edits draft content, navigates away, returns to find changes persisted

### 4.3 Approve / Discard Actions
- [x] `[BE]` `POST /api/v1/drafts/:id/approve` — sets status `APPROVED`, triggers publish stub
- [x] `[BE]` `POST /api/v1/drafts/:id/discard` — sets status `DISCARDED`
- [x] `[FE]` `ApproveButton` and `DiscardButton` with confirmation dialog (shadcn/ui `AlertDialog`)
- [x] `[FE]` Optimistic update via TanStack Query `useMutation` on status change
- [x] `[QA]` E2E test: approve → draft disappears from `PENDING_REVIEW` list

### 4.4 Publishing Stub
- [x] `[BE]` Create `publish` job: POST approved draft to a configurable external KB endpoint (Notion / Confluence / webhook)
- [x] `[BE]` Persist publish result (URL / ID returned by KB system) back to `Draft.publishedUrl`
- [x] `[FE]` Show published URL on approved draft detail page
- [x] `[QA]` Unit test: publish job retries on network failure (max 3 attempts)

### 3.5 Security Gate (covers Phases 3+4)
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 3+4 code — fix Critical/High findings

---

## Phase 5 — Hardening (post-MVP)

> Address these before any production deployment.

- [x] `[BE]` Rate-limit webhook endpoint (max 100 req/min per source IP)
- [x] `[BE]` Add structured logging (Pino) with request IDs propagated through queues
- [x] `[BE]` Secrets audit — ensure no credentials committed; document rotation procedure
- [x] `[FE]` Accessibility audit on Dashboard components (WCAG 2.1 AA)
- [x] `[QA]` Full Playwright E2E suite covering all critical paths
- [x] `[ORC]` End-to-end smoke test in staging before prod promotion

### 5.0 Security (Medium findings from Phase 3+4 gate)
- [ ] `[BE]` Add `OPENAI_API_KEY` to `StartupEnvSchema` in `index.ts` — currently the process boots with no key and only fails at first embedding/synthesis call; fail-fast at startup instead (A10 — incomplete startup validation; tracked from Phase 2 §3.0, still unresolved)
- [ ] `[BE]` Validate `SYNTHESIS_MODEL` and `EMBEDDING_MODEL` env vars with Zod in their respective workers (whitelist allowed OpenAI model identifiers) — currently any string, including typos or injected values, is passed directly to the OpenAI API (A05 — security misconfiguration)
- [x] `[BE]` Add BullMQ `defaultJobOptions` with `attempts: 3` and `backoff: { type: 'exponential', delay: 5000 }` to the `publishQueue` in `queue.ts` so publish jobs retry on transient KB endpoint failures (A04 — insecure design; tests reference 3 retries but the option is not wired)
- [ ] `[BE]` Deploy `firestore.rules` to Firebase project (`firebase deploy --only firestore:rules`) and add a CI step that fails if rules have not been deployed — the rules file now exists at `firestore.rules` but must be applied to the live project (A05 — misconfiguration risk if deployment step is skipped)
- [ ] `[FE]` Add a `rel="noopener noreferrer"` audit and validate that `draft.publishedUrl` rendered in `DraftDetail.tsx` is a safe https URL client-side before rendering the link (defence-in-depth; server already validates on write, but belt-and-suspenders for XSS/open-redirect) (A03)

### 5.1 Security (Phase 5 findings)
- [ ] `[BE]` Enforce max-length on `X-Request-Id` header in `requestId.ts` — truncate or regenerate if caller-supplied value exceeds 128 characters to prevent log-line injection and oversized header relay (A01; carry-over from Phase 2 §3.0, still unresolved in Phase 5)
- [ ] `[FE]` Add client-side URL validation for `draft.publishedUrl` before rendering the `<a href>` in `DraftDetail.tsx` — verify the value starts with `https://` and passes a `URL` constructor parse before rendering; server validates on write but client-side defence-in-depth closes the gap if a stale DB record bypasses the worker validation (A03)
- [ ] `[QA]` Fix `pipeline.spec.ts` test helper `makeTicketPayload` — uses `X-Webhook-Secret` header but webhook route expects `X-Webhook-Signature: sha256=<hex>`; tests are `.fixme` so not currently run, but will fail when staging infrastructure is available (test correctness, not a runtime vulnerability)

### 5.5 Security Gate
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 5 code — no Critical or High findings; one carry-over Medium (X-Request-Id length) and two new Mediums tracked in §5.1 above

---

## Decisions & Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | ORM: Prisma vs Drizzle? | **Decided: Prisma** |
| 2 | LLM provider: OpenAI vs Anthropic? | **Decided: OpenAI** (`text-embedding-3-small` for embeddings) |
| 3 | KB publish target: Notion, Confluence, or generic webhook? | **Decided: Generic Webhook** — POST to `KB_PUBLISH_URL` env var; adapters added later |
| 4 | Auth: Firebase client SDK in Vite SPA + token verification in Express? | **Decided: yes** — Firebase v11 per CLAUDE.md |
| 5 | Cluster threshold (5 tickets, 0.85 similarity) — tunable via env? | **Decided: yes** |
