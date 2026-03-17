# Support-to-Docs Pipeline

An automated bridge that monitors closed support tickets, identifies recurring pain points using semantic clustering, and drafts Knowledge Base (KB) articles for human approval.

## How It Works

1. **Ingest** — A webhook receives "ticket closed" events from Zendesk / Intercom
2. **Vectorize** — Each ticket transcript is converted to an embedding via OpenAI
3. **Cluster** — When 5+ tickets land in the same vector space, a Draft Request is triggered
4. **Synthesize** — GPT-4o extracts the core problem and verified solution from the cluster
5. **Review** — A dashboard lets reviewers Approve, Refine, or Discard each draft
6. **Publish** — Approved drafts are POSTed to a configurable KB endpoint

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite 8, React 18, TypeScript strict, Tailwind CSS v4, shadcn/ui, TanStack Query v5 |
| Backend | Node.js 20 ESM, Express 4, TypeScript strict, Zod |
| Database | PostgreSQL 17 + pgvector (via Prisma 5) |
| Queue | BullMQ + Redis 7 |
| Auth | Firebase v11 (client SDK + Admin SDK) |
| AI | OpenAI `text-embedding-3-small` (embeddings) + GPT-4o (synthesis) |
| Publishing | Generic webhook — POST to `KB_PUBLISH_URL` |

## Project Structure

```
support2docs/
├── frontend/          # Vite + React SPA
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── lib/
│   └── e2e/           # Playwright tests
├── backend/           # Express API + BullMQ workers
│   ├── src/
│   │   ├── routes/v1/
│   │   ├── middleware/
│   │   └── lib/
│   └── prisma/        # Schema + migrations
├── docs/              # Project documentation
├── .claude/agents/    # AI agent definition files
└── docker-compose.yml # PostgreSQL + Redis
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop

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

Fill in the values — see [docs/environment_setup.md](docs/environment_setup.md) for detailed instructions (Firebase setup, OpenAI key, webhook secret, etc.).

### 4. Run database migrations

```bash
cd backend && npm run db:migrate
```

### 5. Start dev servers

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

## Available Scripts

### Root

| Command | Description |
|---|---|
| `npm run dev` | Start both frontend and backend in watch mode |
| `npm run build` | Build both workspaces |
| `npm run lint` | Lint both workspaces |
| `npm run test` | Run all unit tests |

### Backend (`cd backend`)

| Command | Description |
|---|---|
| `npm run dev` | Start Express server with hot reload |
| `npm run test` | Run Vitest unit tests |
| `npm run test:coverage` | Run tests with 80% coverage gate |
| `npm run db:migrate` | Apply pending Prisma migrations |
| `npm run db:reset` | Reset DB and re-run all migrations |
| `npm run db:seed` | Seed sample tickets |

### Frontend (`cd frontend`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run test` | Run Vitest unit/component tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run build` | Production build |

## API Overview

All endpoints are prefixed with `/api/v1/` and require a Firebase Bearer token except where noted.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/api/v1/webhooks/ticket-closed` | Ingest a closed ticket (HMAC-signed) |
| `GET` | `/api/v1/drafts` | List drafts (paginated, filterable by status) |
| `GET` | `/api/v1/drafts/:id` | Get a single draft |
| `PATCH` | `/api/v1/drafts/:id` | Update draft title/content |
| `POST` | `/api/v1/drafts/:id/approve` | Approve and publish a draft |
| `POST` | `/api/v1/drafts/:id/discard` | Discard a draft |

## Security

- **HMAC-SHA256** signature verification on all incoming webhooks
- **Firebase ID token** verification on all `/api/v1/*` routes
- **Zod** validation on all request bodies, query params, and env vars
- **Helmet** + explicit CORS + 200kb body size limit
- OWASP Top 10:2025 scan run at the end of every phase

## Documentation

- [Environment Setup](docs/environment_setup.md) — `.env` configuration guide
- [TODO.md](TODO.md) — Phased task breakdown and progress
- [CLAUDE.md](CLAUDE.md) — Coding standards and agent architecture
