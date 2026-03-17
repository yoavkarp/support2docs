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
- [ ] `[BE]` Add rate limiting to all API endpoints — especially `POST /api/v1/webhooks/ticket-closed` (max 100 req/min per IP via `express-rate-limit`)
- [ ] `[BE]` Add explicit body-size limit to `express.json()` for webhook route — currently set to 200kb globally; tune per-route if needed
- [ ] `[BE]` Add startup validation: fail-fast if `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` are missing or empty
- [ ] `[BE]` Propagate a `X-Request-Id` header through all routes so webhook events can be correlated in logs (A09)

### 2.1 Webhook Receiver
- [ ] `[BE]` Create `POST /api/v1/webhooks/ticket-closed` endpoint
- [ ] `[BE]` Validate HMAC signature for Zendesk/Intercom payloads
- [ ] `[BE]` Normalize incoming payload to internal `Ticket` model (uuid v4 ID assigned here)
- [ ] `[BE]` Persist raw ticket to PostgreSQL with status `PENDING`
- [ ] `[QA]` Unit test: payload validation rejects malformed/unsigned requests
- [ ] `[QA]` Integration test: valid webhook creates a `Ticket` row in DB

### 2.2 Queue Integration
- [ ] `[BE]` Set up BullMQ (Redis-backed) queue: `ticket-processing` queue
- [ ] `[BE]` Enqueue ticket ID after successful webhook ingestion
- [ ] `[BE]` Create queue worker stub that reads from `ticket-processing`
- [ ] `[QA]` Integration test: ticket is enqueued after webhook receipt

### 2.3 Deduplication
- [ ] `[BE]` Add idempotency key check (source ticket ID) to prevent duplicate ingestion
- [ ] `[QA]` Unit test: duplicate webhook returns `200` but does not create a second row

---

## Phase 3 — AI Logic

> Goal: Vectorize tickets, cluster neighbors, and synthesize KB drafts.

### 3.1 Embedding Generation
- [ ] `[BE]` Integrate OpenAI / Anthropic embedding API (configurable via env)
- [ ] `[BE]` Queue worker: fetch `PENDING` tickets, generate embeddings, store in `pgvector` column
- [ ] `[BE]` Update ticket status to `VECTORIZED` after embedding stored
- [ ] `[QA]` Unit test: embedding worker handles API failure with retry + dead-letter

### 3.2 Clustering
- [ ] `[BE]` Implement cosine similarity search via `pgvector` (`<=>` operator)
- [ ] `[BE]` Clustering job: group tickets with similarity score above threshold (configurable, default `0.85`)
- [ ] `[BE]` Trigger "Draft Request" when a cluster reaches ≥ 5 tickets (configurable threshold)
- [ ] `[BE]` Persist `Cluster` record with member ticket IDs and centroid vector
- [ ] `[QA]` Unit test: clustering logic correctly fires at the 5-ticket threshold
- [ ] `[QA]` Integration test: full pipeline from ticket insert → cluster formation

### 3.3 Draft Synthesis
- [ ] `[BE]` Create LLM synthesis job: extract problem statement + verified solution from cluster tickets
- [ ] `[BE]` Prompt engineering: system prompt stored in `/lib/prompts/kb-draft.ts`
- [ ] `[BE]` Persist result as `Draft` with status `PENDING_REVIEW` and source cluster ID
- [ ] `[ORC]` Wire synthesis job to fire automatically when `Cluster.status` becomes `READY`
- [ ] `[QA]` Unit test: synthesis prompt includes all ticket transcripts from cluster
- [ ] `[QA]` E2E test: 5 seeded tickets → cluster forms → draft created with content

---

## Phase 4 — Dashboard

> Goal: Reviewers can see, edit, approve, or discard AI-generated KB drafts in real time.

### 4.1 Draft List View
- [ ] `[FE]` Create `/dashboard` route — list of `PENDING_REVIEW` drafts (TanStack Query)
- [ ] `[FE]` `DraftCard` component: shows title, source ticket count, created date, status badge
- [ ] `[BE]` `GET /api/v1/drafts` — paginated, filterable by status
- [ ] `[QA]` Component test: `DraftCard` renders all fields; loading/empty states covered

### 4.2 Draft Detail & Edit
- [ ] `[FE]` Create `/dashboard/drafts/:id` route with markdown editor (shadcn/ui `Textarea` or `@uiw/react-md-editor`)
- [ ] `[BE]` `GET /api/v1/drafts/:id` — fetch single draft with cluster + source tickets
- [ ] `[BE]` `PATCH /api/v1/drafts/:id` — save edits; update Firestore doc for real-time sync
- [ ] `[FE]` Subscribe to Firestore draft doc for live collaborative edits indicator
- [ ] `[QA]` E2E test: user edits draft content, navigates away, returns to find changes persisted

### 4.3 Approve / Discard Actions
- [ ] `[BE]` `POST /api/v1/drafts/:id/approve` — sets status `APPROVED`, triggers publish stub
- [ ] `[BE]` `POST /api/v1/drafts/:id/discard` — sets status `DISCARDED`
- [ ] `[FE]` `ApproveButton` and `DiscardButton` with confirmation dialog (shadcn/ui `AlertDialog`)
- [ ] `[FE]` Optimistic update via TanStack Query `useMutation` on status change
- [ ] `[QA]` E2E test: approve → draft disappears from `PENDING_REVIEW` list

### 4.4 Publishing Stub
- [ ] `[BE]` Create `publish` job: POST approved draft to a configurable external KB endpoint (Notion / Confluence / webhook)
- [ ] `[BE]` Persist publish result (URL / ID returned by KB system) back to `Draft.publishedUrl`
- [ ] `[FE]` Show published URL on approved draft detail page
- [ ] `[QA]` Unit test: publish job retries on network failure (max 3 attempts)

---

## Phase 5 — Hardening (post-MVP)

> Address these before any production deployment.

- [ ] `[BE]` Rate-limit webhook endpoint (max 100 req/min per source IP)
- [ ] `[BE]` Add structured logging (Pino) with request IDs propagated through queues
- [ ] `[BE]` Secrets audit — ensure no credentials committed; document rotation procedure
- [ ] `[FE]` Accessibility audit on Dashboard components (WCAG 2.1 AA)
- [ ] `[QA]` Full Playwright E2E suite covering all critical paths
- [ ] `[ORC]` End-to-end smoke test in staging before prod promotion

---

## Decisions & Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | ORM: Prisma vs Drizzle? | **Decided: Prisma** |
| 2 | LLM provider: OpenAI vs Anthropic? | **Decided: OpenAI** (`text-embedding-3-small` for embeddings) |
| 3 | KB publish target: Notion, Confluence, or generic webhook? | **Decided: Generic Webhook** — POST to `KB_PUBLISH_URL` env var; adapters added later |
| 4 | Auth: Firebase client SDK in Vite SPA + token verification in Express? | **Decided: yes** — Firebase v11 per CLAUDE.md |
| 5 | Cluster threshold (5 tickets, 0.85 similarity) — tunable via env? | **Decided: yes** |
