# Secrets Rotation Guide

This document lists every secret used by the Support-to-Docs Pipeline, where it is stored,
and the exact steps required to rotate it safely.

---

## Secrets Inventory

| Secret | Purpose | Storage location |
|---|---|---|
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK — service account authentication | `backend/.env` (not committed) |
| `WEBHOOK_SECRET` | HMAC-SHA256 verification of incoming Zendesk/Intercom webhook payloads | `backend/.env` (not committed) |
| `OPENAI_API_KEY` | OpenAI embeddings (`text-embedding-3-small`) and synthesis (`gpt-4o`) | `backend/.env` (not committed) |
| `DATABASE_URL` | PostgreSQL connection string (includes password) | `backend/.env` (not committed) |

All secrets are loaded from `backend/.env` at process startup and validated by `StartupEnvSchema`
in `backend/src/index.ts`. The process exits immediately with a non-zero code if any required
variable is absent or empty.

---

## Gitignore Verification

The repository `.gitignore` contains the following entries that prevent secrets from being committed:

```
.env
*.env
.env.local
.env.*.local
```

Running `git ls-files | grep -E '\.env|private'` in this repository returns:

```
backend/.env.example
frontend/.env.example
```

Only the two `.example` template files are tracked. No live secrets are present in git history.

---

## Rotation Procedures

### WEBHOOK_SECRET

**When to rotate:** Immediately on suspected compromise, or on a quarterly schedule.

**Steps:**
1. Generate a new secret:
   ```sh
   openssl rand -hex 32
   ```
2. Update the webhook platform (Zendesk / Intercom) to use the new secret value
   **before** updating `.env`. This ensures no gap where the new secret is active
   on the server but the platform is still sending the old signature.
3. Update `WEBHOOK_SECRET` in `backend/.env` on all server instances simultaneously.
4. Restart the backend process.
5. Send a test webhook from the platform and verify `201 Created` is returned.

---

### OPENAI_API_KEY

**When to rotate:** Immediately on suspected compromise, or on a quarterly schedule.

**Steps:**
1. Log in to [platform.openai.com](https://platform.openai.com/api-keys).
2. Click **Create new secret key** and copy the value.
3. Update `OPENAI_API_KEY` in `backend/.env` on all server instances.
4. Restart the backend process and confirm the embedding and synthesis workers start without errors.
5. Return to the OpenAI dashboard and **Delete** the old key to revoke it.
   Deleting before updating `.env` would cause downtime; always add the new key first.

---

### FIREBASE_PRIVATE_KEY

**When to rotate:** Immediately on suspected compromise, when a team member with access departs,
or at least once per year.

**Steps:**
1. Open the [Firebase console](https://console.firebase.google.com) for your project.
2. Navigate to **Project Settings → Service accounts**.
3. Click **Generate new private key** and download the JSON file.
4. Extract the `private_key`, `client_email`, and `project_id` fields from the JSON.
5. Update the corresponding variables in `backend/.env`:
   - `FIREBASE_PRIVATE_KEY` — the `private_key` value (include the full PEM string with `\n` escapes)
   - `FIREBASE_CLIENT_EMAIL` — the `client_email` value
   - `FIREBASE_PROJECT_ID` — the `project_id` value
6. Restart the backend process and verify auth middleware accepts tokens.
7. Return to the Firebase console and **Delete** the old service account key.

---

### DATABASE_URL

**When to rotate:** Immediately on suspected compromise, or when the password policy requires renewal.

**Steps:**
1. Connect to PostgreSQL as a superuser or the database owner:
   ```sh
   psql -U postgres -d support2docs
   ```
2. Change the password for the application user:
   ```sql
   ALTER USER support2docs PASSWORD 'new-password-here';
   ```
3. Update `DATABASE_URL` in `backend/.env` with the new password:
   ```
   DATABASE_URL=postgresql://support2docs:new-password-here@localhost:5432/support2docs
   ```
4. Restart the backend process. Prisma will immediately use the new connection string.
5. Confirm database connectivity by checking process startup logs for successful Prisma initialization.

---

## Local Development Notes

- Copy `backend/.env.example` to `backend/.env` and fill in values before running the server.
- Never commit `backend/.env`. The `.gitignore` entries above enforce this.
- For CI/CD pipelines (GitHub Actions), inject secrets as encrypted environment variables
  in the repository settings — never hardcode them in workflow YAML files.
