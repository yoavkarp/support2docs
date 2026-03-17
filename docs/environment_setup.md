# Environment Setup

## Prerequisites

- **Node.js 18+** (20+ recommended) — `node --version` should show `v18.x` or higher
- **Docker Desktop** — required for PostgreSQL and Redis
- **Firebase project** — see [Firebase Setup](#firebase-setup) below
- **OpenAI account** — API key from [platform.openai.com](https://platform.openai.com)

---

## Clone & Install

```bash
git clone <repo-url>
cd support2docs
npm install        # installs all workspace dependencies (frontend + backend)
```

---

## 1. Start Infrastructure (Docker)

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** with pgvector on port `5432`
- **Redis 7** on port `6379`

Verify both are healthy:
```bash
docker compose ps
```

---

## 2. Backend — `backend/.env`

Create the file `backend/.env` (never commit it):

```env
# ── Database ───────────────────────────────────────────────────────────────────
# PostgreSQL connection string. Matches docker-compose.yml defaults.
DATABASE_URL="postgresql://support2docs:support2docs@localhost:5432/support2docs"

# ── Redis (BullMQ) ─────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ── Server ─────────────────────────────────────────────────────────────────────
PORT=3001
# Comma-separated allowed origins for CORS. Use the Vite dev server URL in dev.
CORS_ORIGIN=http://localhost:5173

# ── Firebase Admin SDK ─────────────────────────────────────────────────────────
# Paste values from your Firebase service account JSON (see Firebase Setup below)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
# Keep the key on one line — literal \n characters, NOT real newlines
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBAD...\n-----END PRIVATE KEY-----\n"

# ── Webhook Security ───────────────────────────────────────────────────────────
# A random secret shared with Zendesk / Intercom to sign webhook payloads.
# Generate with: openssl rand -hex 32
WEBHOOK_SECRET=replace_with_a_random_32_byte_hex_string

# ── OpenAI ─────────────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── AI Model Config ────────────────────────────────────────────────────────────
EMBEDDING_MODEL=text-embedding-3-small
SYNTHESIS_MODEL=gpt-4o

# ── Clustering Thresholds ──────────────────────────────────────────────────────
CLUSTERING_SIMILARITY_THRESHOLD=0.85
CLUSTERING_MIN_TICKETS=5

# ── Publishing ─────────────────────────────────────────────────────────────────
# URL that receives approved drafts (POST with JSON body)
KB_PUBLISH_URL=https://your-kb-system.example.com/api/articles

# ── Secret Encryption ──────────────────────────────────────────────────────────
# 32-byte hex key used for AES-256-GCM encryption of integration secrets
# (Zendesk API key, Intercom token) stored in OrganizationSettings.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# If not set, secrets are stored in plaintext and a console warning is emitted.
ORG_SECRETS_KEY=replace_with_64_hex_chars
```

### Run database migrations

```bash
cd backend
npm run db:migrate    # applies all pending Prisma migrations
npm run db:seed       # optional: loads sample tickets
```

---

## 3. Frontend — `frontend/.env`

Create the file `frontend/.env` (never commit it):

```env
# ── Firebase Client SDK ────────────────────────────────────────────────────────
# Paste values from Firebase Console → Project Settings → Your apps → Web app
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456

# ── Backend API ────────────────────────────────────────────────────────────────
VITE_API_BASE_URL=http://localhost:3001
```

> **Note:** All `VITE_*` vars are bundled into the browser. Never put secrets here.

---

## Firebase Setup

### Step 1 — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → follow the wizard (disable Google Analytics if not needed)

### Step 2 — Enable Authentication

1. In the sidebar: **Build → Authentication → Get started**
2. Enable **Email/Password** and **Google** sign-in providers

### Step 3 — Get client-side config (frontend)

1. Go to **Project Settings** (gear icon) → **General** tab
2. Under **Your apps**, click **Add app → Web**
3. Register the app — copy the `firebaseConfig` object
4. Map each field to your `frontend/.env`:

| `firebaseConfig` field | `.env` variable |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

### Step 4 — Get server-side credentials (backend)

1. Go to **Project Settings → Service accounts**
2. Click **Generate new private key** → download the JSON file
3. Copy values from the JSON into `backend/.env`:

| JSON field | `.env` variable |
|---|---|
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

> **Important:** The `private_key` contains real newlines. When pasting into `.env`,
> replace each real newline with the literal characters `\n` and wrap the whole value
> in double quotes. Example:
> ```env
> FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
> ```

> **Security:** Delete the downloaded JSON file after copying the values. Never commit it.

### Step 5 — Enable Firestore

1. In the sidebar: **Build → Firestore Database → Create database**
2. Start in **test mode** for local dev (tighten rules before production)

### Step 6 — Enable Firebase Storage

The organization logo upload feature requires Firebase Storage.

1. In the sidebar: **Build → Storage → Get started**
2. Start in **test mode** for local dev, then deploy the production rules (see below)
3. Confirm the `storageBucket` value is populated in `frontend/.env` as `VITE_FIREBASE_STORAGE_BUCKET`

### Step 7 — Deploy Storage Security Rules

After cloning, deploy Storage rules before going to production:

```bash
firebase deploy --only storage
```

The rules file is at `storage.rules` in the project root. Without deployed rules the project falls back to Firebase Storage defaults, which may allow unauthenticated access depending on the project creation date.

---

## Webhook Secret

The `WEBHOOK_SECRET` is shared with your ticket system (Zendesk / Intercom). It signs webhook payloads with HMAC-SHA256 so the backend can verify requests are genuine.

**Generate a random secret:**
```bash
openssl rand -hex 32
```

Configure the same value in your ticket platform's webhook settings as the signing secret.

---

## Firebase Security Rules

After cloning, deploy Firestore and Storage rules before going to production:

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```

Rule files:
- `firestore.rules` — Firestore access rules
- `storage.rules` — Firebase Storage rules (restricts uploads to `org-logos/{orgId}/` paths; enforces 2 MB size limit and image-only MIME types)

---

## Quick-Start Checklist

```
[ ] Docker Desktop running
[ ] docker compose up -d  (postgres + redis healthy)
[ ] backend/.env created with all required values
[ ] frontend/.env created with all VITE_* values
[ ] Firebase project created with Auth, Firestore, and Storage enabled
[ ] firebase deploy --only firestore:rules
[ ] firebase deploy --only storage
[ ] cd backend && npm run db:migrate
[ ] cd backend && npm run dev          (port 3001)
[ ] cd frontend && npm run dev         (port 5173)
[ ] Open http://localhost:5173 — login page should appear
```

---

## Running Tests

### Backend unit tests + coverage

```bash
npm run test:coverage --workspace=backend
```

### Frontend unit/component tests + coverage

```bash
npm run test:coverage --workspace=frontend
```

### E2E tests (Playwright)

Requires the dev server running (`npm run dev` in both workspaces first):

```bash
npm run test:e2e --workspace=frontend

# Run a single spec:
npx playwright test e2e/auth.spec.ts --project=chromium
```

### Verify DB migrations are idempotent

```bash
npm run db:reset --workspace=backend
```

---

## Variable Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | Yes | Redis hostname (default: `localhost`) |
| `REDIS_PORT` | Yes | Redis port (default: `6379`) |
| `PORT` | No | HTTP server port (default: `3001`) |
| `CORS_ORIGIN` | No | Allowed origin (default: `http://localhost:5173`) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key (escaped `\n`) |
| `WEBHOOK_SECRET` | Yes | HMAC secret for webhook signature verification |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `EMBEDDING_MODEL` | No | Embedding model (default: `text-embedding-3-small`) |
| `SYNTHESIS_MODEL` | No | Synthesis model (default: `gpt-4o`) |
| `CLUSTERING_SIMILARITY_THRESHOLD` | No | Cosine similarity threshold (default: `0.85`) |
| `CLUSTERING_MIN_TICKETS` | No | Tickets needed to trigger draft (default: `5`) |
| `KB_PUBLISH_URL` | Phase 4+ | Endpoint to POST approved KB articles |
| `ORG_SECRETS_KEY` | Phase 8+ | 32-byte hex string for AES-256-GCM encryption of integration secrets (Zendesk API key, Intercom token). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. If not set, secrets are stored in plaintext with a console warning. |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket — required for org logo uploads |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase web app ID |
| `VITE_API_BASE_URL` | No | Backend URL (default: `http://localhost:3001`) |
