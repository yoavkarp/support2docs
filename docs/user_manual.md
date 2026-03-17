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

## The Sidebar

All navigation lives in the collapsible sidebar on the left.

```
┌──────────────────────────┐
│ Support2Docs           ‹ │  ← collapse/expand toggle
├──────────────────────────┤
│ [Org logo] Acme Corp  ▾  │  ← org switcher (see below)
├──────────────────────────┤
│  ▣  Dashboard            │
│  ▦  Stats                │
│  ⚙  Settings             │
├──────────────────────────┤
│  ☀  Light mode           │
│  [AJ] alice@example.com  │  ← signed-in user
│       [sign out]         │
└──────────────────────────┘
```

### Collapse/Expand

Click the **‹ / ›** chevron button in the top-right corner of the sidebar to collapse it to icon-only mode. Click it again to expand. Collapsing is useful on smaller screens to give more space to the main content area.

### Org Switcher

The top area of the sidebar (below the Support2Docs logo row) shows the **active organization**. Clicking it opens a dropdown with:

- A list of every team you belong to — the currently active one has a check mark
- A **+ New team** button at the bottom that opens an inline text field to create a new organization

Switching teams updates all views (drafts, stats, settings) to reflect the selected org's data.

---

## The Dashboard

After signing in you land on the **KB Drafts** dashboard.

```
┌─────────────────────────────────────────────┐
│ KB Drafts                                    │
│ AI-generated knowledge base drafts           │
│ pending your review                          │
│                                              │
│  [All 14] [Pending 6] [Approved 7] [Discarded 1]  │
│                                              │
│  ┌──────────────┐ ┌──────────────┐           │
│  │ Draft title  │ │ Draft title  │           │
│  │ Pending      │ │ Pending      │           │
│  │ 6 tickets    │ │ 8 tickets    │           │
│  │ 2 days ago   │ │ 5 days ago   │           │
│  └──────────────┘ └──────────────┘           │
└─────────────────────────────────────────────┘
```

### Draft cards

Each card shows:
- **Title** — AI-generated article title
- **Content preview** — a 2-line plain-text excerpt (Markdown stripped)
- **Status badge** — `Pending Review` (yellow), `Approved` (green), or `Discarded` (red)
- **Ticket count** — how many source tickets triggered this draft
- **Relative time** — how long ago the draft was created ("2 days ago", "just now", etc.)

Click any card to open the draft detail page.

### Status filter tabs

Above the card grid there are four tab buttons:

| Tab | Shows |
|---|---|
| **All** | Every draft regardless of status |
| **Pending** | Only `PENDING_REVIEW` drafts |
| **Approved** | Only `APPROVED` drafts |
| **Discarded** | Only `DISCARDED` drafts |

Each tab displays a count badge. Clicking a tab updates the URL query parameter (`?status=APPROVED`) so the filtered view is bookmarkable and shareable.

### Empty state

If you see **"No drafts yet"** or **"No pending drafts"**, it means either:
- No cluster of 5+ similar tickets has been detected yet, or
- All drafts matching the current filter have been reviewed

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

### Edit vs Preview mode

The content area has two modes toggled by the **Edit / Preview** tab buttons:

- **Edit** (default) — a monospaced textarea where you write Markdown
- **Preview** — renders the Markdown as formatted HTML (headings, bold, lists, code blocks, etc.)

Switch to Preview before approving to verify the article looks correct.

### Editing

- Click into the **Title** field to edit it
- Click into the **Content** field to edit the article body — it supports Markdown
- Use the **Edit / Preview** tabs to toggle between raw Markdown and formatted output
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

## Stats & ROI Dashboard

Click **Stats** in the sidebar navigation to view pipeline performance metrics.

### ROI Overview cards

| Card | What it measures |
|---|---|
| **Hours Saved** | Total approved drafts × 45 min average documentation time |
| **Tickets Deflected** | Total approved articles × 125 average deflections per article |
| **Drafts Approved** | Lifetime approved drafts (with "X this week" sub-label) |
| **Drafts Discarded** | Lifetime discarded drafts (with pending count sub-label) |

Below the cards the **average review time** is shown (time from draft creation to approval).

### Reviewer Leaderboard

A table listing every reviewer who has approved, discarded, or edited drafts, sorted by most approved. Columns: Reviewer email, Approved, Discarded, Edited.

---

## Settings

Click **Settings** (gear icon) in the sidebar navigation to open the Settings page. The page has three tabs: **Integrations**, **Team**, and **Manage Teams**.

### Integrations tab

The Integrations tab lets you configure how Support2Docs connects to your ticket platform and KB system. These values are stored per-organization in the database and override the corresponding environment variables.

| Field | What it controls |
|---|---|
| **Zendesk Subdomain** | The subdomain of your Zendesk account (e.g. `acme` for `acme.zendesk.com`) |
| **Zendesk API Key** | Your Zendesk API token — stored encrypted at rest. The form shows the last 4 characters of the saved value as a placeholder when a key is already set. |
| **Intercom Token** | Your Intercom access token — stored encrypted at rest. Same masking behaviour as above. |
| **KB Publish URL** | The endpoint that receives approved KB articles (HTTP POST). Overrides the `KB_PUBLISH_URL` env var for this org. |
| **Cluster Threshold** | Cosine similarity score (0.1–1.0, default 0.65) — tickets must score at or above this value to be grouped into the same cluster. Lower values produce larger, looser clusters. |
| **Min Cluster Size** | Minimum number of tickets (1–50, default 5) required before a draft is synthesized. |

**Show / hide toggle:** The Zendesk API Key and Intercom Token fields each have a show/hide eye icon. Click it to reveal or conceal the value you are typing.

**Saving:** Click **Save settings** to apply changes. A green "Settings saved" confirmation appears on success. If the request fails, a red error message is shown and the previous values remain active.

> **Admin only.** Only users with the Admin role can view or edit integration settings.

### Team tab

The Team tab shows all members of your organization and lets admins manage the roster.

#### Member table

Each row in the table shows:
- **Avatar** — initials derived from the email address
- **Email** — the member's email address
- **Invited badge** — a grey "Invited" label shown when a member has been invited but has not yet signed in for the first time. Their Firebase account is not yet linked.
- **Role badge** — `Admin` (accent colour) or `Member` (muted colour)
- **Joined** — relative time since the member joined (e.g. "3 days ago")
- **Role toggle button** (Admin only) — shows "Make Admin" or "Make Member" to switch the role of any other member
- **Remove button** (red trash icon) — removes the member from the organization. Admins cannot remove themselves.

#### Role reference

| Role | What they can do |
|---|---|
| **Admin** | View and edit integration settings; invite members; change member roles; remove members; approve, edit, and discard drafts |
| **Member** | View drafts and stats; cannot access Settings or perform admin actions |

#### Inviting a team member

1. Click the **Team** tab
2. In the **Invite team member** panel at the bottom, type the colleague's email address
3. Click **Invite**
4. A green confirmation toast appears: "Invitation sent to colleague@example.com"
5. The invited member appears in the table with an **Invited** badge until they sign in

If the email address is already a member, an "Already a member" error is shown instead.

#### Removing a member

1. Click the red trash icon in the member's row
2. A confirmation dialog asks: *"Remove colleague@example.com from the team?"*
3. Click **OK** to confirm — the member is removed immediately
4. Click **Cancel** to abort with no change

> Admins cannot remove themselves. The remove button is hidden on the current user's own row.

### Manage Teams tab

The Manage Teams tab lists all organizations you belong to and lets admins create, edit, and delete teams.

#### Team list

Each row shows:
- **Circular logo / initials avatar** — displays the team logo if one has been uploaded; otherwise shows the first two letters of the team name
- **Team name** with an **active** badge on the currently selected team
- **Member count** — how many users belong to the team
- **Role badge** — your role in that team (`Admin` or `Member`)
- **Edit button** (pencil icon, admin only) — opens an inline edit form
- **Delete button** (red trash icon, admin only) — deletes the team after confirmation

#### Creating a new team

1. Click the **+ New team** button below the team list
2. Type a team name in the text field that appears
3. Click **Create** — you are automatically added as Admin of the new team
4. Click **Cancel** to dismiss without creating

You can also create a team from the org switcher in the sidebar by clicking **+ New team** in the dropdown.

#### Editing a team

1. Click the **pencil** icon on the team row (Admin only)
2. An inline form appears with:
   - A **circular logo avatar** — click it to upload a new logo image (PNG, JPEG, WebP, or GIF; max 2 MB). The image is uploaded to Firebase Storage and stored as a URL. On hover a camera icon appears. If a logo is already set, a **Remove** link appears below the avatar to clear it.
   - A **Team name** text field
3. Make your changes and click **Save** — or click **Cancel** to discard
4. If the logo file exceeds 2 MB an error is shown: "Image must be under 2 MB"

#### Deleting a team

1. Click the **trash** icon on the team row (Admin only)
2. A confirmation dialog appears: *"Delete [team name]? This cannot be undone. Drafts created by this team will be detached but not deleted."*
3. Click **OK** to confirm — the team and all its settings and members are removed; existing drafts are retained but detached from the org
4. You cannot delete your last remaining team — a "Cannot delete your only team" error will appear

---

## Theme Toggle

Click the **sun / moon** icon in the sidebar footer to switch between **dark** (default) and **light** mode. Your preference is saved to `localStorage` and persists across sessions.

---

## Signing Out

Click **Sign out** (the arrow icon) in the sidebar footer next to your email address. When the sidebar is collapsed, click the arrow icon that replaces the user section.

---

## Multi-Team Behaviour

Each team has its own isolated workspace:
- **Drafts** — only drafts belonging to the active team appear on the dashboard
- **Stats** — metrics reflect only the active team's data
- **Settings → Integrations** — integration keys (Zendesk, Intercom, KB Publish URL, thresholds) are stored per team
- **Settings → Team** — member list is scoped to the active team

Switching teams (via the org switcher in the sidebar) immediately updates all views.

---

## FAQ

**Why are there no drafts yet?**
The system needs at least **5 similar support tickets** to trigger a draft. Keep ingesting tickets — drafts appear automatically once a cluster forms.

**Can I re-edit an approved draft?**
Not through the UI — approved drafts are read-only. To make changes, update the article directly in your KB system.

**What happens if the KB publish fails?**
The publish job retries automatically up to 3 times with exponential backoff. If all retries fail, the draft stays `Approved` in the database and the error is logged. Check your backend logs and verify `KB_PUBLISH_URL` is reachable.

**How similar do tickets need to be to cluster together?**
By default, tickets need a cosine similarity score of **0.65** or higher (configurable via the **Cluster Threshold** field in Settings → Integrations, or `CLUSTERING_SIMILARITY_THRESHOLD` in `backend/.env`). Lower this value to cluster more loosely; raise it for stricter grouping.

**How many tickets are needed to trigger a draft?**
**5 tickets** by default (configurable via **Min Cluster Size** in Settings → Integrations, or `CLUSTERING_MIN_TICKETS` in `backend/.env`).

**I edited a draft but my changes weren't saved.**
Check the **Saving…** indicator — if it stays visible for more than a few seconds, there may be a backend connection issue. Refresh the page; your last auto-saved version will load.

**I uploaded a logo but it is not showing in the sidebar.**
Check that the image file is PNG, JPEG, WebP, or GIF and is under 2 MB. Also verify that Firebase Storage is enabled for your project and that `storage.rules` have been deployed (`firebase deploy --only storage`).
