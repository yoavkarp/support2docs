# User Manual — Support2Docs

Support2Docs automatically monitors your support tickets, detects recurring issues, and generates Knowledge Base (KB) draft articles for your review. Your job is to review, refine, and publish those drafts.

---

## How It Works

```
Support tickets (Zendesk / Intercom)
        ↓  webhook
  Ticket ingestion
        ↓  OpenAI embeddings
  Similarity clustering
        ↓  5+ similar tickets
  GPT-4o draft synthesis
        ↓
  Your dashboard  ←── You are here
        ↓  Approve
  Published to your KB
```

Once 5 or more support tickets about the same topic are received, the system automatically generates a draft KB article. You review it, make edits if needed, and approve or discard it.

---

## Signing In

1. Open `http://localhost:5173` (or your deployed URL)
2. Sign in with **email/password** or **Continue with Google**
3. You will be redirected to the dashboard

> **Note:** Only users with the `admin` Firebase custom claim can approve, edit, or discard drafts. Regular authenticated users can view drafts. Contact your administrator to get the admin role assigned.

---

## The Dashboard

After signing in you land on the **KB Drafts** dashboard.

```
┌─────────────────────────────────────────────┐
│ Support2Docs               user@example.com  │
│                                   Sign out   │
├─────────────────────────────────────────────┤
│ KB Drafts                                    │
│ AI-generated knowledge base drafts           │
│ pending your review                          │
│                                              │
│  ┌──────────────┐ ┌──────────────┐           │
│  │ Draft title  │ │ Draft title  │           │
│  │ Pending      │ │ Pending      │           │
│  │ 6 tickets    │ │ 8 tickets    │           │
│  │ Mar 17, 2026 │ │ Mar 15, 2026 │           │
│  └──────────────┘ └──────────────┘           │
└─────────────────────────────────────────────┘
```

### Draft cards

Each card shows:
- **Title** — AI-generated article title
- **Status badge** — `Pending Review`, `Approved`, or `Discarded`
- **Ticket count** — how many source tickets triggered this draft
- **Date** — when the draft was created

Click any card to open the draft detail page.

### Empty state

If you see **"No drafts pending review"**, it means either:
- No cluster of 5+ similar tickets has been detected yet, or
- All pending drafts have been reviewed

---

## Reviewing a Draft

Click a draft card to open the detail page.

```
┌─────────────────────────────────────────────┐
│ ← Back to drafts              [Live] Saving… │
├─────────────────────────────────────────────┤
│ Title                                        │
│ ┌─────────────────────────────────────────┐ │
│ │ Password Reset Email Not Received       │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Content                                      │
│ ┌─────────────────────────────────────────┐ │
│ │ **Problem Description**                 │ │
│ │ Users are unable to receive password    │ │
│ │ reset emails...                         │ │
│ │                                         │ │
│ │ **Root Cause**                          │ │
│ │ ...                                     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Source tickets (5)                           │
│  • Cannot reset password — Mar 17           │
│  • Password reset link not received — Mar 17│
│                                              │
│  [Approve & Publish]  [Discard]             │
└─────────────────────────────────────────────┘
```

### Editing

- Click into the **Title** field to edit it
- Click into the **Content** field to edit the article body — it supports Markdown
- Changes are **auto-saved** 1 second after you stop typing
- The **Saving…** indicator appears while a save is in progress

### Live badge

The **Live** badge appears when Firestore real-time sync is active. If another reviewer is editing the same draft, you will see their changes reflected automatically.

### Source tickets

The **Source tickets** section lists every support ticket that contributed to this draft. Use them to verify the AI's summary is accurate before approving.

---

## Approving a Draft

1. Review the title and content — edit if needed
2. Click **Approve & Publish**
3. A confirmation dialog appears: *"Are you sure you want to approve and publish this draft?"*
4. Click **Confirm**
5. The draft is marked `Approved` and a publish job is queued
6. You are redirected back to the dashboard
7. If `KB_PUBLISH_URL` is configured, the article is POSTed to your KB system and a **"View published article →"** link will appear on the draft

> **Requires admin role.** If the button is missing or returns an error, ask your administrator to assign you the Firebase `admin` custom claim.

---

## Discarding a Draft

1. Open the draft
2. Click **Discard**
3. A confirmation dialog appears: *"This will permanently discard the draft."*
4. Click **Confirm**
5. The draft is marked `Discarded` and removed from the pending list

Discarded drafts are kept in the database for audit purposes but will not appear in the pending review list.

---

## Status Reference

| Status | Meaning |
|---|---|
| **Pending Review** | AI-generated, awaiting human review |
| **Approved** | Reviewed, approved, and queued for publishing |
| **Discarded** | Reviewed and rejected — will not be published |

---

## Signing Out

Click **Sign out** in the top-right corner of the dashboard.

---

## FAQ

**Why are there no drafts yet?**
The system needs at least **5 similar support tickets** to trigger a draft. Keep ingesting tickets — drafts appear automatically once a cluster forms.

**Can I re-edit an approved draft?**
Not through the UI — approved drafts are read-only. To make changes, update the article directly in your KB system.

**What happens if the KB publish fails?**
The publish job retries automatically up to 3 times with exponential backoff. If all retries fail, the draft stays `Approved` in the database and the error is logged. Check your backend logs and verify `KB_PUBLISH_URL` is reachable.

**How similar do tickets need to be to cluster together?**
By default, tickets need a cosine similarity score of **0.65** or higher (configurable via `CLUSTERING_SIMILARITY_THRESHOLD` in `backend/.env`). Lower this value to cluster more loosely; raise it for stricter grouping.

**How many tickets are needed to trigger a draft?**
**5 tickets** by default (configurable via `CLUSTERING_MIN_TICKETS` in `backend/.env`).

**I edited a draft but my changes weren't saved.**
Check the **Saving…** indicator — if it stays visible for more than a few seconds, there may be a backend connection issue. Refresh the page; your last auto-saved version will load.
