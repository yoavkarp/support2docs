# TODO.md — Support-to-Docs Pipeline

> Maintained by the **PM/Architect Agent**. Agents pick up tasks by status; move them to `[~]` when starting and `[x]` when QA passes.

---

## Legend
- `[ ]` — Not started
- `[~]` — In Progress
- `[x]` — Done (QA verified)
- **Owner tags:** `[FE]` Frontend · `[BE]` Backend · `[QA]` QA · `[ORC]` Orchestrator · `[SEC]` Security

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

## Phase 6 — Rebrand & Design Overhaul (P0)

> Goal: Transform the frontend from a prototype into a polished, professional SaaS product. Dark theme by default. Data-rich dashboard that communicates ROI at a glance.

### 6.1 Dark Theme & Design System
- [ ] `[FE]` Set **dark theme as the default** — configure Tailwind CSS v4 with a dark-first color palette (slate/zinc backgrounds, white text, accent color for CTAs)
- [ ] `[FE]` Create a global `theme.css` token file: `--color-bg`, `--color-surface`, `--color-border`, `--color-text-primary`, `--color-text-muted`, `--color-accent`
- [ ] `[FE]` Apply consistent dark theme across all existing pages: `Dashboard`, `DraftDetail`, `Login`, error states
- [ ] `[FE]` Add a theme toggle button (dark/light) in the top-right header — persist preference in `localStorage`
- [ ] `[QA]` Visual smoke test: verify dark theme renders correctly on Dashboard and DraftDetail

### 6.2 Professional Layout & Navigation
- [ ] `[FE]` Replace the minimal header with a proper **sidebar navigation** — logo, nav links (Dashboard, Stats), user avatar + sign-out
- [ ] `[FE]` Add a branded **logo / wordmark** ("Support2Docs") in the sidebar header
- [ ] `[FE]` Add breadcrumb on `DraftDetail` page (Dashboard → Draft title)
- [ ] `[FE]` Polish card grid layout: consistent spacing, hover states, subtle shadows, status badge colors (yellow=pending, green=approved, red=discarded)
- [ ] `[QA]` Component test: sidebar renders nav links and user info correctly

### 6.3 ROI & Analytics Dashboard
- [ ] `[BE]` Add `GET /api/v1/stats` — returns: `totalDrafts`, `totalApproved`, `totalDiscarded`, `totalPending`, `approvedThisWeek`, `avgReviewTimeMinutes`, `estimatedHoursSaved` (approved × 45 min avg doc time), `estimatedTicketsDeflected` (approved × 125 avg deflections)
- [ ] `[BE]` Add `GET /api/v1/stats/by-reviewer` — returns per-user counts: `userId`, `displayName`, `approved`, `discarded`, `edited` (requires `DraftEvent` table — see 6.4)
- [ ] `[FE]` Add **ROI Stats section** at the top of the Dashboard with metric cards: Hours Saved · Tickets Deflected · Drafts Approved · Drafts Discarded
- [ ] `[FE]` Add **Reviewer Leaderboard** table below stats: columns = Reviewer, Approved, Discarded, Edited — sorted by most approved
- [ ] `[QA]` Unit test: `/api/v1/stats` returns correct counts; `/api/v1/stats/by-reviewer` groups correctly

### 6.4 Reviewer Attribution (prerequisite for 6.3)
- [ ] `[BE]` Add `DraftEvent` table to Prisma schema: `id`, `draftId`, `action` (CREATED/APPROVED/DISCARDED/EDITED), `userId`, `userEmail`, `timestamp`
- [ ] `[BE]` Run Prisma migration: `npx prisma migrate dev --name add_draft_events`
- [ ] `[BE]` Record events on every draft mutation — in `/approve`, `/discard`, `PATCH /:id` routes, insert a `DraftEvent` row with the Firebase `uid` + `email` from the verified token
- [ ] `[QA]` Unit test: events are recorded with correct userId and action on each route

### 6.5 Security Gate
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 6 code — fix Critical/High findings

---

## Phase 7 — Dashboard Improvements (P0)

> Goal: Make the dashboard feel like a product, not a prototype. All data is already available — this is pure UI work.

### 7.1 Draft Card Enhancements
- [ ] `[FE]` Add 2-line content preview to `DraftCard` — clamp `draft.content` stripped of Markdown syntax
- [ ] `[FE]` Replace created date with relative time ("2 days ago") using a `formatRelative` util
- [ ] `[QA]` Update `DraftCard` component tests to cover preview text and relative time

### 7.2 Status Filter Tabs
- [ ] `[FE]` Add filter tabs to Dashboard: **All / Pending / Approved / Discarded**
- [ ] `[FE]` Persist selected tab in URL query param (`?status=APPROVED`) so links are shareable
- [ ] `[BE]` Verify `GET /api/v1/drafts` returns correct results for all status values (already implemented — smoke test)
- [ ] `[QA]` Component test: switching tabs updates the draft list

### 7.3 Markdown Preview
- [ ] `[FE]` Add **Edit / Preview toggle** to `DraftDetail` content area — Preview renders Markdown as HTML
- [ ] `[FE]` Install a lightweight Markdown renderer (`marked` or `react-markdown`)
- [ ] `[QA]` Component test: Preview tab renders bold, headings, and lists correctly

### 7.4 Security Gate
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 7 code — fix Critical/High findings

---

## Phase 8 — Dashboard Improvements (P1)

> Goal: Power-user features that make daily review work faster.

### 8.1 Search & Filter
- [ ] `[FE]` Add keyword search input to Dashboard — client-side filter on title + content preview
- [ ] `[BE]` Add `GET /api/v1/drafts?q=keyword` full-text search using PostgreSQL `ILIKE` or `to_tsvector`
- [ ] `[QA]` Unit test: search endpoint returns correct matches

### 8.2 Regenerate Draft
- [ ] `[BE]` Add `POST /api/v1/drafts/:id/regenerate` — re-runs synthesis on the same cluster, replaces content
- [ ] `[FE]` Add **Regenerate** button on `DraftDetail` (only for `PENDING_REVIEW` drafts)
- [ ] `[FE]` Show loading state while regeneration is in progress
- [ ] `[QA]` Unit test: regenerate endpoint re-runs synthesis and updates draft content

### 8.3 Reviewer Notes
- [ ] `[BE]` Add `notes` field to `Draft` schema (Prisma migration)
- [ ] `[BE]` Accept `notes` in `PATCH /api/v1/drafts/:id`
- [ ] `[FE]` Add **Notes** textarea to `DraftDetail` — shown below source tickets
- [ ] `[QA]` Unit test: notes are persisted and returned in GET response

### 8.4 Keyboard Shortcuts
- [ ] `[FE]` Add keyboard shortcuts on `DraftDetail`: `Ctrl+Enter` → Approve, `Escape` → Back, `Ctrl+Shift+D` → Discard
- [ ] `[FE]` Show shortcut hints near the action buttons
- [ ] `[QA]` Component test: keyboard events trigger correct actions

### 8.5 Security Gate
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 8 code — fix Critical/High findings

---

## Phase 9 — Insights & Operations (P2)

> Goal: Give teams visibility into the pipeline and KB health.

### 9.1 Pipeline Health Monitor
- [ ] `[BE]` Add `GET /api/v1/health/pipeline` — returns queue depths (waiting/failed jobs per queue)
- [ ] `[FE]` Add a simple pipeline status indicator in the Dashboard header (green/yellow/red dot)
- [ ] `[QA]` Unit test: health endpoint reflects actual queue state

### 9.2 Security Gate
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 9 code — fix Critical/High findings

---

## Decisions & Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | ORM: Prisma vs Drizzle? | **Decided: Prisma** |
| 2 | LLM provider: OpenAI vs Anthropic? | **Decided: OpenAI** (`text-embedding-3-small` for embeddings) |
| 3 | KB publish target: Notion, Confluence, or generic webhook? | **Decided: Generic Webhook** — POST to `KB_PUBLISH_URL` env var; adapters added later |
| 4 | Auth: Firebase client SDK in Vite SPA + token verification in Express? | **Decided: yes** — Firebase v11 per CLAUDE.md |
| 5 | Cluster threshold (5 tickets, 0.65 similarity) — tunable via env? | **Decided: yes** |
| 6 | Markdown renderer: `marked` vs `react-markdown`? | **Open** |
| 7 | Full-text search: PostgreSQL `ILIKE` vs `tsvector` vs dedicated search? | **Open** |
