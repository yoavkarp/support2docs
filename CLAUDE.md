# CLAUDE.md

## Project Overview
**Support-to-Docs Pipeline**: An automated bridge that monitors closed support tickets, identifies recurring pain points using semantic clustering, and drafts Knowledge Base (KB) articles for human approval.

## Tech Stack
* **Frontend:** Vite, Tailwind CSS v4, shadcn/ui, TanStack React Query.
* **Backend:** Node.js / Next.js API Routes.
* **Database:** PostgreSQL (with `pgvector` for similarity search) via Prisma.
* **Auth & Storage:** Firebase v11 (Authentication & Firestore for real-time draft updates).
* **AI:** OpenAI (embeddings: `text-embedding-3-small`; summarization: GPT-4o).
* **Publishing:** Generic webhook — POST approved drafts to `KB_PUBLISH_URL` env var.
* **Identifiers:** Always use `uuid` v4 for all primary keys and job IDs.

## Agent Architecture
This project is built and maintained by a multi-agent team. Each agent has a specific scope and a definition file it must read before starting any task:

| Agent | Definition File | Scope |
|---|---|---|
| **PM/Architect Agent** | `.claude/agents/pm-architect.md` | Requirements, `TODO.md`, `ARCHITECT.md`, architectural decisions |
| **Frontend Agent** | `.claude/agents/frontend.md` | `frontend/src/` — components, hooks, routes, Firebase client |
| **Backend Agent** | `.claude/agents/backend.md` | `backend/src/` — Express routes, workers, Prisma schema, OpenAI |
| **QA Agent** | `.claude/agents/qa.md` | All test files — Vitest, RTL, Supertest, Playwright |
| **Orchestrator Agent** | `.claude/agents/orchestrator.md` | Pipeline wiring, worker chaining, agent handoffs, API contract sync |
| **Security Agent** | `.claude/agents/security.md` | Vulnerability scanning (OWASP 2025), dependency audits, Critical/High fix |

**Every agent must read its own `.claude/agents/<agent>.md` file as the first step of every task.**

## Security Policy
- The **Security Agent** runs a full `/vulnerability-scanner` sweep at the end of every phase before work on the next phase begins.
- **Critical and High** findings must be resolved before the phase is marked complete.
- **Medium** findings are tracked as tasks in the next phase.
- **Low** findings are documented in the Security Agent's finding log (`.claude/agents/security.md`).
- `npm audit` runs on every dependency change; accepted risks are documented in `package.json` under `"//pinned"`.

**Task Protocol:** 1. PM Agent drafts the task.
2. User/Orchestrator approves the task.
3. Specialist Agent executes and passes to QA Agent for verification.

## Testing Standards
* **Unit Testing:** Vitest for logic and utility functions.
* **Component Testing:** React Testing Library for frontend UI validation.
* **E2E Testing:** Playwright for critical paths (e.g., Ticket -> Draft -> Approve -> Publish).
* **Coverage:** Minimum 80% code coverage required for all backend logic.
* **CI/CD:** Tests must pass in GitHub Actions before any merge to `main`.

## Core Workflows
1. **Ingestion:** Webhook listener for "Ticket Closed" events from Zendesk/Intercom.
2. **Vectorization:** Convert ticket transcripts into embeddings to find "neighbors."
3. **Clustering Logic:** If 5+ tickets land in the same vector space, trigger a "Draft Request."
4. **Synthesis:** LLM extracts the core problem and verified solution from history.
5. **Human-in-the-Loop:** Dashboard to "Approve," "Refine," or "Discard" drafts.

## Coding Standards & Patterns
* **TypeScript:** Strict mode enabled. Define explicit interfaces for all data models.
* **Validation:** Use **Zod** for all runtime validation of external input — request bodies, query params, webhook payloads, and env vars. Never rely on TypeScript types alone at runtime.
* **Components:** Use shadcn/ui primitives. Keep components modular in `@/components/ui`.
* **State Management:** Use TanStack Query for all server-side data fetching.
* **ID Generation:** Use `uuidv4()` for database primary keys.
* **API Design:** RESTful endpoints in `app/api/v1/` with standardized JSON error responses.

## Infrastructure
* **Docker:** Use `docker-compose` for local PostgreSQL and Redis (queue management).
* **Deployment:** Cloud-native (AWS Lambda or Vercel).