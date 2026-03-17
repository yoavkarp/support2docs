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
- [~] `[FE]` Set **dark theme as the default** — configure Tailwind CSS v4 with a dark-first color palette (slate/zinc backgrounds, white text, accent color for CTAs)
- [~] `[FE]` Create a global `theme.css` token file: `--color-bg`, `--color-surface`, `--color-border`, `--color-text-primary`, `--color-text-muted`, `--color-accent`
- [~] `[FE]` Apply consistent dark theme across all existing pages: `Dashboard`, `DraftDetail`, `Login`, error states
- [~] `[FE]` Add a theme toggle button (dark/light) in the top-right header — persist preference in `localStorage`
- [ ] `[QA]` Visual smoke test: verify dark theme renders correctly on Dashboard and DraftDetail

### 6.2 Professional Layout & Navigation
- [~] `[FE]` Replace the minimal header with a proper **sidebar navigation** — logo, nav links (Dashboard, Stats), user avatar + sign-out
- [~] `[FE]` Add a branded **logo / wordmark** ("Support2Docs") in the sidebar header
- [~] `[FE]` Add breadcrumb on `DraftDetail` page (Dashboard → Draft title)
- [~] `[FE]` Polish card grid layout: consistent spacing, hover states, subtle shadows, status badge colors (yellow=pending, green=approved, red=discarded)
- [ ] `[QA]` Component test: sidebar renders nav links and user info correctly

### 6.3 ROI & Analytics Dashboard
- [~] `[BE]` Add `GET /api/v1/stats` — returns: `totalDrafts`, `totalApproved`, `totalDiscarded`, `totalPending`, `approvedThisWeek`, `avgReviewTimeMinutes`, `estimatedHoursSaved` (approved × 45 min avg doc time), `estimatedTicketsDeflected` (approved × 125 avg deflections)
- [~] `[BE]` Add `GET /api/v1/stats/by-reviewer` — returns per-user counts: `userId`, `displayName`, `approved`, `discarded`, `edited` (requires `DraftEvent` table — see 6.4)
- [ ] `[FE]` Add **ROI Stats section** at the top of the Dashboard with metric cards: Hours Saved · Tickets Deflected · Drafts Approved · Drafts Discarded
- [ ] `[FE]` Add **Reviewer Leaderboard** table below stats: columns = Reviewer, Approved, Discarded, Edited — sorted by most approved
- [ ] `[QA]` Unit test: `/api/v1/stats` returns correct counts; `/api/v1/stats/by-reviewer` groups correctly

### 6.4 Reviewer Attribution (prerequisite for 6.3)
- [~] `[BE]` Add `DraftEvent` table to Prisma schema: `id`, `draftId`, `action` (CREATED/APPROVED/DISCARDED/EDITED), `userId`, `userEmail`, `timestamp`
- [~] `[BE]` Run Prisma migration: `npx prisma migrate dev --name add_draft_events`
- [~] `[BE]` Record events on every draft mutation — in `/approve`, `/discard`, `PATCH /:id` routes, insert a `DraftEvent` row with the Firebase `uid` + `email` from the verified token
- [ ] `[QA]` Unit test: events are recorded with correct userId and action on each route

### 6.5 Security Gate
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 6 code — fix Critical/High findings

---

## Phase 7 — Dashboard Improvements (P0)

> Goal: Make the dashboard feel like a product, not a prototype. All data is already available — this is pure UI work.

### 7.1 Draft Card Enhancements
- [x] `[FE]` Add 2-line content preview to `DraftCard` — clamp `draft.content` stripped of Markdown syntax
- [x] `[FE]` Replace created date with relative time ("2 days ago") using a `formatRelative` util
- [x] `[QA]` Update `DraftCard` component tests to cover preview text and relative time

### 7.2 Status Filter Tabs
- [x] `[FE]` Add filter tabs to Dashboard: **All / Pending / Approved / Discarded**
- [x] `[FE]` Persist selected tab in URL query param (`?status=APPROVED`) so links are shareable
- [x] `[BE]` Verify `GET /api/v1/drafts` returns correct results for all status values (already implemented — smoke test)
- [x] `[QA]` Component test: switching tabs updates the draft list

### 7.3 Markdown Preview
- [x] `[FE]` Add **Edit / Preview toggle** to `DraftDetail` content area — Preview renders Markdown as HTML
- [x] `[FE]` Install a lightweight Markdown renderer (`marked` or `react-markdown`)
- [x] `[QA]` Component test: Preview tab renders bold, headings, and lists correctly

### 7.0 Security Carry-forwards from Phase 6
- [x] `[BE]` Migrate `DraftEvent.action` from `String` to a proper Prisma enum (`DraftEventAction`) — add Prisma migration `add_draft_event_action_enum`; until then, Zod validation at all insertion sites enforces the whitelist
- [x] `[QA]` Add unit tests for `GET /api/v1/stats` and `GET /api/v1/stats/by-reviewer` (currently 0% coverage in stats.ts)
- [x] `[QA]` Add unit/component tests for `theme.ts`, `StatsView.tsx`, and `useStats` hooks to meet the 80% coverage threshold

### 7.4 Security Gate
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 7 code — fix Critical/High findings

---

## Phase 8 — Team & Organization Management (P0)

> Goal: Make Support2Docs multi-tenant. Each organization gets its own workspace with configurable integration keys (Zendesk, Intercom, etc.) and a managed team roster. Admins invite members by email; settings are stored per-org in the database instead of env vars.

### 8.1 Data Model
- [x] `[BE]` Add `Organization` model to Prisma schema: `id` (uuid), `name`, `slug` (unique), `createdAt`
- [x] `[BE]` Add `OrganizationMember` model: `id`, `orgId` → `Organization`, `userId` (Firebase uid), `userEmail`, `role` (`ADMIN` | `MEMBER`), `joinedAt`
- [x] `[BE]` Add `OrganizationSettings` model: `id`, `orgId` (unique FK), `zendeskSubdomain`, `zendeskApiKey` (encrypted at rest), `intercomToken` (encrypted), `kbPublishUrl`, `clusterThreshold` (Float, default 0.65), `minClusterSize` (Int, default 5), `updatedAt`
- [x] `[BE]` Add `orgId` foreign key to `Draft` and `DraftEvent` models so all data is org-scoped
- [x] `[BE]` Run Prisma migration: `npx prisma migrate dev --name add_organizations`
- [x] `[QA]` Unit test: migration applies cleanly; relations resolve correctly

### 8.2 Org Settings API
- [x] `[BE]` `GET /api/v1/org/settings` — return current org settings; mask secrets (return last 4 chars of API keys, nulls for unset)
- [x] `[BE]` `PUT /api/v1/org/settings` — upsert integration settings; validate with Zod; admin-only via `requireAdmin` middleware
- [x] `[BE]` Encrypt `zendeskApiKey` and `intercomToken` at rest using `AES-256-GCM` with `ORG_SECRETS_KEY` env var before writing to DB
- [ ] `[QA]` Unit test: settings are saved and returned correctly; secrets are masked in GET response

### 8.3 Team Management API
- [x] `[BE]` `GET /api/v1/org/members` — list all members of the org with `userId`, `userEmail`, `role`, `joinedAt`
- [x] `[BE]` `POST /api/v1/org/members/invite` — accept `{ email }`, create an `OrganizationMember` row with role `MEMBER` and `userId: null` (pending); on first login, link by email to Firebase uid
- [x] `[BE]` `PATCH /api/v1/org/members/:userId` — update member role (`ADMIN` ↔ `MEMBER`); admin-only
- [x] `[BE]` `DELETE /api/v1/org/members/:userId` — remove member from org; admin cannot remove themselves
- [ ] `[QA]` Unit test: invite creates pending member; delete removes correctly; role guard blocks non-admins

### 8.4 Settings Page — Frontend
- [x] `[FE]` Add `/settings` protected route in `App.tsx` and a **Settings** nav link in the `AppLayout` sidebar (gear icon, below Stats)
- [x] `[FE]` Create `SettingsPage` with two tabs using shadcn/ui `Tabs`: **Integrations** and **Team**
- [x] `[FE]` **Integrations tab**: form fields for Zendesk Subdomain, Zendesk API Key (password input + show/hide toggle), Intercom Token (password), KB Publish URL, Cluster Threshold (number), Min Cluster Size (number). Show current masked values. Save button calls `PUT /api/v1/org/settings`
- [x] `[FE]` **Team tab**: table of current members (Avatar, Email, Role badge, joined date, Remove button for admins). Below table: invite form — email input + **Invite** button → calls `POST /api/v1/org/members/invite`, shows success toast
- [x] `[FE]` Create `useOrgSettings()` and `useOrgMembers()` TanStack Query hooks in `frontend/src/hooks/`
- [x] `[FE]` Show role badge (Admin = accent, Member = muted) next to each member's email
- [ ] `[QA]` Component test: Settings tabs render; invite form shows success on mock 200; integrations form pre-fills masked values

### 8.5 Wire Pipeline to Org Settings
- [x] `[ORC]` Update webhook ingestion (`POST /api/v1/ingest`) to resolve `orgId` from an `X-Org-Id` header or API key lookup
- [x] `[BE]` Update `synthesisWorker` to read `zendeskApiKey`, `clusterThreshold`, and `minClusterSize` from `OrganizationSettings` instead of env vars
- [x] `[QA]` Integration test: ingest route resolves correct org; worker reads org-specific thresholds

### 8.6 Security Gate
- [x] `[SEC]` Run `/vulnerability-scanner` on all Phase 8 code — fix Critical/High findings (pay special attention to secret encryption, role authorization, and org-isolation boundaries)

### 8.7 Multi-Org Frontend Support
- [x] `[FE]` Add `useOrgs` and `useCreateOrg` hooks to `useOrg.ts`
- [x] `[FE]` Update `apiFetch` in `api.ts` to include `X-Org-Id` header from localStorage
- [x] `[FE]` Add org switcher to `AppLayout.tsx` sidebar (active org name, dropdown, + New team form)

### 8.8 Org-Scoped Query Caching & Manage Teams UI
- [~] `[FE]` Create `OrgContext` — org-scoped `activeOrgId` with `localStorage` persistence; wrap `<App />` with `<OrgProvider>`
- [~] `[FE]` Update `useOrg.ts` hooks to use `activeOrgId` in query keys; add `useDeleteOrg` hook
- [~] `[FE]` Update `AppLayout.tsx` `OrgSwitcher` to use `OrgContext` instead of direct `localStorage` reads
- [~] `[FE]` Update `OrgSummary` interface to include `memberCount`
- [~] `[FE]` Add "Manage Teams" tab to `SettingsPage.tsx` and create `ManageTeamsTab.tsx`
- [~] `[FE]` Update tests for `useOrgSettings`, `useOrgMembers`, and `SettingsPage` to mock `OrgContext`
- [~] `[QA]` All 210 tests pass; TypeScript strict mode — zero errors

---

## Phase 9 — Add team name and logo editing to Settings (P0)

### 9.x Team Name & Logo Editing
- [~] `[FE]` Replace emoji logo input with real image upload using Firebase Storage: `logoUrl` in `OrgSummary`, `uploadOrgLogo` util, image upload in `ManageTeamsTab` EditForm, `AppLayout` OrgSwitcher updated, tests updated
- [~] `[BE]` Add `logoUrl` field to `Organization`, add `PATCH /api/v1/org/:orgId` endpoint, include `logoUrl` in `GET /api/v1/org` response

### 9.x Security Gate — Logo Upload Feature
- [x] `[SEC]` Run vulnerability scan on logo upload feature (org.ts PATCH, uploadOrgLogo.ts, ManageTeamsTab.tsx, AppLayout.tsx) — fix Critical/High findings
- [ ] `[SEC]` A02 — Deploy `storage.rules` via `firebase deploy --only storage` before production release; add CI step to enforce deployment (Medium — infrastructure)
- [ ] `[SEC]` A05 — Firebase Storage rules allow any authenticated user to overwrite any org's logo (no per-org write restriction); backend admin-membership check in PATCH prevents the URL persisting to DB but Storage object itself is unprotected (Medium — infrastructure)
- [ ] `[QA]` Add unit tests for `uploadOrgLogo.ts` MIME-type rejection (non-image file.type → throws) and for `PatchOrgSchema` logoUrl allowlist validation

---

## Phase 9 — Dashboard Improvements (P1)

> Goal: Power-user features that make daily review work faster.

### 9.0 Security Carry-forwards from Phase 8
- [~] `[BE]` A05 — Add `max()` length validation to `OrgSettingsSchema.zendeskSubdomain` (done: 253), and audit any remaining unconstrained string fields written to DB via org routes.
- [x] `[BE]` A01 — Add UUID format validation (z.string().uuid()) to the `X-Org-Id` header in `webhooks.ts` before passing to `prisma.organization.findUnique`; currently a malformed value causes a Prisma-level 500 instead of a clean 400.
- [x] `[BE]` A04 — `mask()` in `crypto.ts` returns the full value for strings shorter than 4 characters (e.g. `mask("ab")` → `"****ab"`); add a minimum-length check and return `"****"` (no suffix) for values of length < 4.
- [x] `[BE]` A01 — `GET /org/settings` returns `kbPublishUrl` in plaintext to any authenticated non-admin user; consider returning it only for admin-claim holders as it exposes internal infrastructure endpoints.
- [x] `[BE]` Multi-org bootstrap — replace global `getOrCreateOrg()` with user-scoped `getOrCreateUserOrg(uid, email)`; add `POST /api/v1/org` and `GET /api/v1/org` endpoints; fix 403-for-everyone admin bug
- [x] `[BE]` Add `DELETE /api/v1/org/:orgId` endpoint with admin guard, last-org protection, and cascade deletion; update `GET /api/v1/org` to include `memberCount`

### 9.1 Search & Filter
- [ ] `[FE]` Add keyword search input to Dashboard — client-side filter on title + content preview
- [ ] `[BE]` Add `GET /api/v1/drafts?q=keyword` full-text search using PostgreSQL `ILIKE` or `to_tsvector`
- [ ] `[QA]` Unit test: search endpoint returns correct matches

### 9.2 Regenerate Draft
- [ ] `[BE]` Add `POST /api/v1/drafts/:id/regenerate` — re-runs synthesis on the same cluster, replaces content
- [ ] `[FE]` Add **Regenerate** button on `DraftDetail` (only for `PENDING_REVIEW` drafts)
- [ ] `[FE]` Show loading state while regeneration is in progress
- [ ] `[QA]` Unit test: regenerate endpoint re-runs synthesis and updates draft content

### 9.3 Reviewer Notes
- [ ] `[BE]` Add `notes` field to `Draft` schema (Prisma migration)
- [ ] `[BE]` Accept `notes` in `PATCH /api/v1/drafts/:id`
- [ ] `[FE]` Add **Notes** textarea to `DraftDetail` — shown below source tickets
- [ ] `[QA]` Unit test: notes are persisted and returned in GET response

### 9.4 Keyboard Shortcuts
- [ ] `[FE]` Add keyboard shortcuts on `DraftDetail`: `Ctrl+Enter` → Approve, `Escape` → Back, `Ctrl+Shift+D` → Discard
- [ ] `[FE]` Show shortcut hints near the action buttons
- [ ] `[QA]` Component test: keyboard events trigger correct actions

### 9.5 Security Gate
- [x] `[SEC]` Resolve all open "Tracked" findings from Phases 1–8; rewrite finding log to current-state-only — fix Critical/High findings
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 9 code — fix Critical/High findings

---

## Phase 10 — Email Notifications & Member Onboarding (P0)

> Goal: Close the loop on team collaboration. Invited members receive a real email with an accept link. Admins are notified when drafts are created, approved, or discarded. Users control which notifications they receive. Every touchpoint is branded and actionable.

### 10.1 Email Infrastructure

- [ ] `[BE]` Add email provider abstraction — create `backend/src/lib/email.ts` with `sendEmail({ to, subject, html, text })`. Primary provider: **Resend** (`resend` npm package, `RESEND_API_KEY` env var). Fallback: Nodemailer SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). If neither is configured, log a warning and skip silently (dev mode).
- [ ] `[BE]` Create HTML email templates in `backend/src/lib/email-templates/` — one file per type, using template-literal functions (no third-party templating lib needed). All templates: branded header ("Support2Docs"), dark background (`#0f1117`), accent CTA button (`#6366f1`), unsubscribe footer link. Templates needed: `inviteMember`, `newDraft`, `draftApproved`, `draftDiscarded`, `newMemberJoined`
- [ ] `[BE]` Add `APP_URL` and `FROM_EMAIL` to `StartupEnvSchema` with `.default()` values (`http://localhost:5173` and `noreply@support2docs.app`)
- [ ] `[QA]` Unit test: `sendEmail` calls the provider SDK with correct `to`, `subject`, `html`; mock the provider — never send real emails in tests

### 10.2 Invitation Email Flow

- [ ] `[BE]` Add `inviteToken String? @unique` and `inviteExpiresAt DateTime?` to `OrganizationMember` Prisma schema — run migration `add_invite_token`
- [ ] `[BE]` On `POST /org/members/invite`: generate a cryptographically random token (`crypto.randomBytes(32).toString('hex')`), store it + expiry (`now + 7 days`) on the member row, send `inviteMember` email — subject: "You've been invited to join [Org Name] on Support2Docs", CTA button links to `{APP_URL}/invite/accept?token=xxx`, includes inviter's email and org name
- [ ] `[BE]` Add `POST /api/v1/invitations/accept` — **no auth required** (user may not be logged in yet): validate `{ token }` body, find member by token, check expiry (400 if expired), return `{ orgId, orgName, userEmail }`. Front-end then signs the user in and links the account.
- [ ] `[BE]` Add `POST /api/v1/invitations/link` — **requireAuth**: called after the user signs in post-accept. Finds the member row by `userEmail === claims.email` where `userId IS NULL`, sets `userId = uid`, clears the invite token. Returns the org summary.
- [ ] `[BE]` Add `POST /api/v1/org/members/:memberId/resend-invite` — requireAuth + org admin: resend the invitation email for a pending member (regenerates token + expiry). Returns 400 if member already has a `userId` (not pending).
- [ ] `[FE]` Create `/invite/accept` route and `InviteAcceptPage`: reads `?token=` from URL, calls `POST /api/v1/invitations/accept` to get org info, prompts user to sign in or sign up via Firebase, then calls `POST /api/v1/invitations/link`, switches active org to the joined org, redirects to `/dashboard`
- [ ] `[FE]` Add **Resend invite** button in Team tab next to "Invited" badge — calls `POST /api/v1/org/members/:memberId/resend-invite`, shows success/error inline
- [ ] `[QA]` Unit test: token generated and stored on invite; accept validates expiry; link sets userId; expired token returns 400; resend regenerates token

### 10.3 Draft Notifications

- [ ] `[BE]` After `prisma.draft.create` in `synthesisWorker.ts` — fetch org admin emails, send `newDraft` email to each: subject "New KB draft ready: [title]", CTA "Review Draft" → `{APP_URL}/dashboard/drafts/{id}`, includes ticket count and cluster summary
- [ ] `[BE]` After `POST /api/v1/drafts/:id/approve` — send `draftApproved` email to org admins: subject "[reviewer email] approved: [title]", includes link to published URL if available
- [ ] `[BE]` After `POST /api/v1/drafts/:id/discard` — send `draftDiscarded` email to org admins: subject "[reviewer email] discarded: [title]"
- [ ] `[BE]` After `POST /api/v1/invitations/link` (new member joins) — send `newMemberJoined` email to org admins: "[email] has accepted the invitation and joined [org name]"
- [ ] `[BE]` All notification sends are **fire-and-forget** — wrap in `void sendEmail(...).catch(err => logger.warn(...))` so a failed email never blocks the API response
- [ ] `[QA]` Unit test: `sendEmail` called with correct recipient and subject after each mutation; send skipped when `sendEmail` is not configured

### 10.4 Notification Preferences

- [ ] `[BE]` Add `NotificationPreference` Prisma model: `id` (uuid), `userId` (Firebase uid), `orgId` FK, `type` (enum `NotificationType`: `NEW_DRAFT | DRAFT_APPROVED | DRAFT_DISCARDED | NEW_MEMBER`), `enabled Boolean @default(true)` — unique on `(userId, orgId, type)`. Run migration `add_notification_preferences`
- [ ] `[BE]` `GET /api/v1/notifications/preferences` — requireAuth: return all preferences for the current user + org (default all-enabled if no rows exist)
- [ ] `[BE]` `PUT /api/v1/notifications/preferences` — requireAuth: upsert `{ type, enabled }[]` for current user + org. Validate with Zod.
- [ ] `[BE]` Before sending any notification email, check `NotificationPreference` for each recipient — skip send if `enabled: false` for that type
- [ ] `[FE]` Add a **Notifications** section to `SettingsPage` (new tab or sub-section of Team tab): four toggle switches (one per `NotificationType`) with labels and descriptions. Use `useNotificationPreferences()` TanStack Query hook. Save on toggle change (debounced `PUT`).
- [ ] `[QA]` Unit test: preferences API returns defaults when no rows exist; PUT upserts correctly; notification skipped when preference is disabled

### 10.5 Security Gate
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 10 code — pay special attention to: invitation token entropy and expiry enforcement, unauthenticated `POST /invitations/accept` endpoint (token-only auth), email header injection via `to`/`subject` fields, notification preference IDOR

---

## Phase 11 — Insights & Operations (P2)

> Goal: Give teams visibility into the pipeline and KB health.

### 11.1 Pipeline Health Monitor
- [ ] `[BE]` Add `GET /api/v1/health/pipeline` — returns queue depths (waiting/failed jobs per queue)
- [ ] `[FE]` Add a simple pipeline status indicator in the Dashboard header (green/yellow/red dot)
- [ ] `[QA]` Unit test: health endpoint reflects actual queue state

### 11.2 Security Gate
- [ ] `[SEC]` Run `/vulnerability-scanner` on all Phase 11 code — fix Critical/High findings

---

## Decisions & Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | ORM: Prisma vs Drizzle? | **Decided: Prisma** |
| 2 | LLM provider: OpenAI vs Anthropic? | **Decided: OpenAI** (`text-embedding-3-small` for embeddings) |
| 3 | KB publish target: Notion, Confluence, or generic webhook? | **Decided: Generic Webhook** — POST to `KB_PUBLISH_URL` env var; adapters added later |
| 4 | Auth: Firebase client SDK in Vite SPA + token verification in Express? | **Decided: yes** — Firebase v11 per CLAUDE.md |
| 5 | Cluster threshold (5 tickets, 0.65 similarity) — tunable via env? | **Decided: yes** |
| 6 | Markdown renderer: `marked` vs `react-markdown`? | **Decided: react-markdown** |
| 8 | Email provider: Resend vs SendGrid vs Nodemailer SMTP? | **Open** — defaulting to Resend with SMTP fallback |
| 7 | Full-text search: PostgreSQL `ILIKE` vs `tsvector` vs dedicated search? | **Open** |
