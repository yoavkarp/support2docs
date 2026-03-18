# Support-to-Docs Pipeline

An automated bridge that monitors closed support tickets, identifies recurring pain points using semantic clustering, and drafts Knowledge Base (KB) articles for human approval — with full multi-team support, role-based access, and email notifications.

## How It Works

1. **Ingest** — A webhook receives "ticket closed" events from Zendesk / Intercom
2. **Vectorize** — Each ticket transcript is converted to an embedding via OpenAI
3. **Cluster** — When 5+ tickets land in the same vector space, a Draft Request is triggered
4. **Synthesize** — GPT-4o extracts the core problem and verified solution from the cluster
5. **Review** — A dashboard lets reviewers Approve, Edit, or Discard each draft (with Markdown preview)
6. **Publish** — Approved drafts are POSTed to a configurable KB endpoint

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite, React 18, TypeScript strict, Tailwind CSS v4, shadcn/ui, TanStack Query v5 |
| Backend | Node.js 20 ESM, Express 4, TypeScript strict, Zod |
| Database | PostgreSQL 16 + pgvector (via Prisma 5) |
| Queue | BullMQ + Redis 7 |
| Auth & Storage | Firebase v11 (Authentication, Firestore real-time sync, Storage for org logos) |
| AI | OpenAI `text-embedding-3-small` (embeddings) + GPT-4o (synthesis) |
| Publishing | Generic webhook — POST to `KB_PUBLISH_URL` |

## Features

- **Dark-first UI** — professional dark theme with light mode toggle, persistent in `localStorage`
- **Multi-team** — each organisation gets its own workspace; switch teams from the sidebar; admins can create, rename, and delete teams with a custom logo
- **Role-based access** — Admins invite members by email; roles (Admin / Member) are enforced at the DB layer
- **ROI Dashboard** — metric cards for Hours Saved, Tickets Deflected, Drafts Approved/Discarded, avg review time, and a Reviewer Leaderboard
- **Draft review** — Markdown Edit/Preview toggle, content preview cards, status filter tabs (All / Pending / Approved / Discarded), relative timestamps
- **Integration settings** — per-team Zendesk / Intercom API keys (AES-256-GCM encrypted at rest), configurable cluster thresholds, KB publish URL
- **Audit trail** — every draft mutation records a `DraftEvent` (CREATED / APPROVED / DISCARDED / EDITED) with the reviewer's Firebase UID

## Project Structure

```
support2docs/
├── frontend/                  # Vite + React SPA
│   ├── src/
│   │   ├── components/        # AppLayout, DraftCard, StatsView, UI primitives
│   │   ├── contexts/          # OrgContext (active team state)
│   │   ├── hooks/             # TanStack Query hooks (drafts, org, stats)
│   │   ├── pages/             # Dashboard, DraftDetail, LoginPage, SettingsPage
│   │   │   └── settings/      # IntegrationsTab, TeamTab, ManageTeamsTab
│   │   └── lib/               # apiFetch, firebase, uploadOrgLogo, theme, formatRelative
│   └── e2e/                   # Playwright E2E tests
├── backend/                   # Express API + BullMQ workers
│   ├── src/
│   │   ├── routes/v1/         # drafts, org, stats, webhooks
│   │   ├── middleware/        # requireAuth, requestId, errorHandler
│   │   ├── workers/           # ticket, embedding, clustering, synthesis, publish
│   │   └── lib/               # prisma, firebase-admin, crypto, email, url-safety
│   └── prisma/                # Schema + migrations
├── docs/                      # API.md, USER_MANUAL.md, ENVIRONMENT_SETUP.md, db_structure.md
├── scripts/                   # set-storage-cors.mjs
├── storage.rules              # Firebase Storage security rules
├── firestore.rules            # Firestore security rules
├── .claude/agents/            # AI agent definition files
└── docker-compose.yml         # PostgreSQL + Redis
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop
- Firebase project (Auth + Firestore + Storage enabled)
- Firebase CLI (`npm install -g firebase-tools`)

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in the values — see [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) for detailed instructions.

### 4. Run database migrations

```bash
npm run db:migrate --workspace=backend
```

### 5. Deploy Firebase rules + Storage CORS

```bash
# Deploy Firestore and Storage security rules
firebase deploy --only firestore,storage

# Set Storage CORS (allows browser uploads from localhost)
node scripts/set-storage-cors.mjs
```

### 6. Start dev servers

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

## Available Scripts

### Root

| Command | Description |
|---|---|
| `npm run dev` | Start both frontend and backend in watch mode |
| `npm run build` | Build both workspaces |
| `npm run test` | Run all unit tests |

### Backend (`--workspace=backend`)

| Command | Description |
|---|---|
| `npm run dev` | Start Express server with hot reload |
| `npm run test` | Run Vitest unit tests |
| `npm run test:coverage` | Run tests with 80% coverage gate |
| `npm run db:migrate` | Apply pending Prisma migrations |
| `npm run db:reset` | Reset DB and re-run all migrations |
| `npm run db:generate` | Re-generate Prisma client |

### Frontend (`--workspace=frontend`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run test` | Run Vitest unit/component tests |
| `npm run test:coverage` | Run tests with 80% coverage gate |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run build` | Production build |

## API Overview

Full reference: [docs/API.md](docs/API.md)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/api/v1/webhooks/ticket-closed` | HMAC | Ingest a closed ticket |
| `GET` | `/api/v1/drafts` | Bearer | List drafts (paginated, status filter) |
| `PATCH` | `/api/v1/drafts/:id` | Bearer | Update title/content |
| `POST` | `/api/v1/drafts/:id/approve` | Bearer + Org Admin | Approve and publish |
| `POST` | `/api/v1/drafts/:id/discard` | Bearer + Org Admin | Discard a draft |
| `GET` | `/api/v1/stats` | None | Aggregate ROI metrics |
| `GET` | `/api/v1/stats/by-reviewer` | Bearer | Per-reviewer breakdown |
| `GET/POST` | `/api/v1/org` | Bearer | List / create organisations |
| `PATCH` | `/api/v1/org/:orgId` | Bearer + Org Admin | Rename org / set logo |
| `DELETE` | `/api/v1/org/:orgId` | Bearer + Org Admin | Delete org (cascades members/settings) |
| `GET/PUT` | `/api/v1/org/settings` | Bearer | Integration settings (Zendesk, Intercom, etc.) |
| `GET` | `/api/v1/org/members` | Bearer | List team members |
| `POST` | `/api/v1/org/members/invite` | Bearer + Org Admin | Invite by email |
| `PATCH` | `/api/v1/org/members/:userId` | Bearer + Org Admin | Change member role |
| `DELETE` | `/api/v1/org/members/:userId` | Bearer + Org Admin | Remove member |

## Security

- **HMAC-SHA256** signature verification on all incoming webhooks
- **Firebase ID token** verification on all authenticated routes
- **DB-level role checks** — org admin actions verified against `OrganizationMember.role`, not Firebase custom claims
- **AES-256-GCM** encryption for Zendesk/Intercom API keys at rest
- **Zod** validation on all request bodies, query params, and env vars
- **Firebase Storage rules** — org logos restricted to authenticated writes, 2 MB limit, image MIME types only
- **SSRF protection** — `kbPublishUrl` and `logoUrl` validated against private/loopback IP ranges
- **Helmet** + explicit CORS + 200 KB body size limit
- OWASP Top 10:2025 scan run at the end of every development phase

## Documentation

| Doc | Description |
|---|---|
| [docs/API.md](docs/API.md) | Full API endpoint reference |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | End-user guide (dashboard, teams, settings) |
| [docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md) | Environment variables and infrastructure setup |
| [docs/db_structure.md](docs/db_structure.md) | Database schema, models, enums, migrations |
| [TODO.md](TODO.md) | Phased task breakdown and progress |
| [CLAUDE.md](CLAUDE.md) | Coding standards and AI agent architecture |
