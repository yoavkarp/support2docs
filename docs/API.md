# API Reference

All endpoints are served under the base path `/api/v1`.

## Authentication

Most endpoints require a **Firebase ID token** passed as a Bearer token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

Endpoints marked **Admin only** additionally require the `admin: true` custom claim on the Firebase token.

### Multi-tenant header

Authenticated endpoints accept an optional `X-Org-Id` header (UUID) to target a specific organization. If omitted the backend resolves the caller's default org (the first org they belong to, creating one automatically on first use).

```
X-Org-Id: <org-uuid>
```

---

## Webhooks

### `POST /api/v1/webhooks/ticket-closed`

Ingest a closed support ticket from Zendesk or Intercom.

**Auth:** None (HMAC-SHA256 signature verification via `X-Webhook-Signature` header)

**Headers:**
| Header | Required | Description |
|---|---|---|
| `X-Webhook-Signature` | Yes | `sha256=<hex-digest>` — HMAC-SHA256 of the raw request body using `WEBHOOK_SECRET` |
| `X-Org-Id` | No | Route the ticket to a specific org (must be a valid UUID of an existing org). Defaults to the first org in the system. |

**Request body:**
```json
{
  "id": "zendesk-123",
  "source": "zendesk",
  "subject": "Cannot reset password",
  "transcript": "User: I never received the reset email..."
}
```

**Responses:**
| Status | Body | Meaning |
|---|---|---|
| `201 Created` | `{ "id": "<ticket-uuid>" }` | Ticket ingested and queued for processing |
| `200 OK` | `{ "message": "Duplicate — already ingested", "id": "..." }` | Ticket with this `id` was already ingested |
| `400 Bad Request` | `{ "error": "..." }` | Invalid payload or malformed `X-Org-Id` |
| `401 Unauthorized` | `{ "error": "Invalid or missing webhook signature" }` | HMAC verification failed |
| `503 Service Unavailable` | `{ "error": "No organization configured..." }` | No org exists yet |

---

## Drafts

All draft endpoints require authentication.

### `GET /api/v1/drafts`

List drafts with optional status filter and pagination.

**Auth:** Required

**Query parameters:**
| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | `PENDING_REVIEW` \| `APPROVED` \| `DISCARDED` | (all) | Filter by draft status |
| `page` | integer (1–10000) | `1` | Page number |
| `limit` | integer (1–100) | `20` | Results per page |

**Response:** `200 OK` — array of draft objects, each including a nested `cluster` with `_count.tickets`.

---

### `GET /api/v1/drafts/:id`

Fetch a single draft with its cluster and source tickets.

**Auth:** Required

**Path parameter:** `:id` — UUID of the draft

**Response:**
| Status | Meaning |
|---|---|
| `200 OK` | Draft object including `cluster.tickets[]` (id, subject, source, createdAt) |
| `400 Bad Request` | `:id` is not a valid UUID |
| `404 Not Found` | Draft does not exist |

---

### `PATCH /api/v1/drafts/:id`

Save edits to a draft's title and/or content. Syncs the change to Firestore for real-time collaborative editing. Records a `EDITED` `DraftEvent`.

**Auth:** Admin only

**Request body (at least one field required):**
```json
{
  "title": "Updated title",
  "content": "Updated Markdown content"
}
```

**Response:**
| Status | Meaning |
|---|---|
| `200 OK` | Updated draft object |
| `400 Bad Request` | Invalid `:id` or missing both fields |
| `403 Forbidden` | Caller lacks admin claim |

---

### `POST /api/v1/drafts/:id/approve`

Approve a pending draft for publishing. Enqueues a publish job and records an `APPROVED` `DraftEvent`.

**Auth:** Admin only

**Response:**
| Status | Meaning |
|---|---|
| `200 OK` | Updated draft with `status: "APPROVED"` |
| `400 Bad Request` | Invalid `:id` |
| `403 Forbidden` | Caller lacks admin claim |
| `404 Not Found` | Draft does not exist |
| `409 Conflict` | Draft is already `APPROVED` or `DISCARDED` |

---

### `POST /api/v1/drafts/:id/discard`

Discard a pending draft. Records a `DISCARDED` `DraftEvent`.

**Auth:** Admin only

**Response:**
| Status | Meaning |
|---|---|
| `200 OK` | Updated draft with `status: "DISCARDED"` |
| `400 Bad Request` | Invalid `:id` |
| `403 Forbidden` | Caller lacks admin claim |
| `404 Not Found` | Draft does not exist |
| `409 Conflict` | Draft is already `APPROVED` or `DISCARDED` |

---

## Stats

### `GET /api/v1/stats`

Aggregate pipeline metrics. No auth required.

**Response:** `200 OK`
```json
{
  "totalDrafts": 42,
  "totalApproved": 30,
  "totalDiscarded": 5,
  "totalPending": 7,
  "approvedThisWeek": 3,
  "avgReviewTimeMinutes": 4.2,
  "estimatedHoursSaved": 22.5,
  "estimatedTicketsDeflected": 3750
}
```

| Field | How it is calculated |
|---|---|
| `estimatedHoursSaved` | `totalApproved × 0.75` (hours) |
| `estimatedTicketsDeflected` | `totalApproved × 125` |
| `avgReviewTimeMinutes` | Average time between `CREATED` and `APPROVED` events per draft |

---

### `GET /api/v1/stats/by-reviewer`

Per-reviewer breakdown of approved, discarded, and edited counts. Returns reviewer email addresses (PII) so authentication is required.

**Auth:** Required

**Response:** `200 OK` — array sorted by `approved` descending:
```json
[
  {
    "userId": "firebase-uid",
    "userEmail": "alice@example.com",
    "approved": 12,
    "discarded": 2,
    "edited": 7
  }
]
```

---

## Organization

All org endpoints require authentication.

### `POST /api/v1/org`

Create a new organization. The caller is automatically added as `ADMIN`.

**Auth:** Required

**Request body:**
```json
{ "name": "Acme Corp" }
```

**Response:** `201 Created`
```json
{ "id": "...", "name": "Acme Corp", "slug": "acme-corp-a1b2", "role": "ADMIN" }
```

---

### `GET /api/v1/org`

List all organizations the authenticated user belongs to.

**Auth:** Required

**Response:** `200 OK` — array of org summaries:
```json
[
  {
    "id": "...",
    "name": "Acme Corp",
    "slug": "acme-corp-a1b2",
    "role": "ADMIN",
    "memberCount": 5,
    "logoUrl": "https://firebasestorage.googleapis.com/..."
  }
]
```

---

### `PATCH /api/v1/org/:orgId`

Update an organization's name and/or logo URL. Caller must be an Admin of the target org.

**Auth:** Required (Admin of target org)

**Request body (at least one field):**
```json
{
  "name": "New Name",
  "logoUrl": "https://firebasestorage.googleapis.com/..."
}
```

Set `logoUrl` to `null` to remove the logo.

**Constraints:**
- `logoUrl` must be a Firebase Storage URL (`firebasestorage.googleapis.com`, `storage.googleapis.com`, or `*.firebasestorage.app`). Arbitrary third-party image URLs are rejected.

**Response:** `200 OK` — updated org summary with `memberCount` and `logoUrl`.

**Error responses:**
| Status | Meaning |
|---|---|
| `400 Bad Request` | Invalid `:orgId` or body validation failure |
| `403 Forbidden` | Caller is not an Admin of the org |

---

### `DELETE /api/v1/org/:orgId`

Delete an organization and cascade-remove all its settings and members. Existing drafts are detached (their `orgId` is set to `null`) rather than deleted.

**Auth:** Required (Admin of target org)

**Constraints:** You cannot delete your last remaining org.

**Response:**
| Status | Meaning |
|---|---|
| `204 No Content` | Org deleted successfully |
| `400 Bad Request` | Invalid `:orgId`, or attempting to delete your only org |
| `403 Forbidden` | Caller is not an Admin of the org |

---

### `GET /api/v1/org/settings`

Get the current organization's integration settings. Secrets (Zendesk API Key, Intercom Token) are returned masked as `"****<last4>"`. `kbPublishUrl` is only returned to Admin callers.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "zendeskSubdomain": "acme",
  "zendeskApiKey": "****ab12",
  "intercomToken": null,
  "kbPublishUrl": "https://kb.example.com/api/articles",
  "clusterThreshold": 0.65,
  "minClusterSize": 5
}
```

---

### `PUT /api/v1/org/settings`

Upsert organization integration settings. Secrets are encrypted with AES-256-GCM before being stored. Sending an empty string (`""`) for a secret field clears it. Do not send the masked placeholder (e.g. `"****ab12"`) — empty string means "clear".

**Auth:** Admin only

**Request body (all fields optional):**
```json
{
  "zendeskSubdomain": "acme",
  "zendeskApiKey": "new-api-key",
  "intercomToken": "",
  "kbPublishUrl": "https://kb.example.com/api/articles",
  "clusterThreshold": 0.7,
  "minClusterSize": 3
}
```

**Constraints:**
- `kbPublishUrl` must use `https` and must not point to a private/loopback/cloud-metadata address
- `clusterThreshold`: 0.1–1.0
- `minClusterSize`: 1–50

**Response:** `200 OK` — masked settings object (same shape as GET)

---

### `GET /api/v1/org/members`

List all members of the current organization.

**Auth:** Required

**Response:** `200 OK`
```json
[
  {
    "id": "...",
    "userId": "firebase-uid-or-null",
    "userEmail": "alice@example.com",
    "role": "ADMIN",
    "joinedAt": "2026-03-17T21:46:00.000Z"
  }
]
```

Members with `userId: null` have been invited but have not yet signed in.

---

### `POST /api/v1/org/members/invite`

Invite a user by email. Creates an `OrganizationMember` row with `userId: null` and role `MEMBER`. When the user signs in for the first time, the backend links their Firebase UID to the pending invite by matching email.

**Auth:** Admin only

**Request body:**
```json
{ "email": "colleague@example.com" }
```

**Response:**
| Status | Meaning |
|---|---|
| `201 Created` | Invite created — returns `{ userEmail, role, joinedAt }` |
| `409 Conflict` | Email is already a member |

---

### `PATCH /api/v1/org/members/:userId`

Change a member's role.

**Auth:** Admin only

**Path parameter:** `:userId` — Firebase UID of the member

**Request body:**
```json
{ "role": "ADMIN" }
```

**Response:**
| Status | Meaning |
|---|---|
| `200 OK` | Updated member object |
| `404 Not Found` | Member not found in this org |

---

### `DELETE /api/v1/org/members/:userId`

Remove a member from the organization. Admins cannot remove themselves.

**Auth:** Admin only

**Path parameter:** `:userId` — Firebase UID of the member to remove

**Response:**
| Status | Meaning |
|---|---|
| `204 No Content` | Member removed |
| `400 Bad Request` | Attempting to remove yourself |
| `404 Not Found` | Member not found in this org |

---

## Error Response Format

All error responses use a consistent JSON shape:

```json
{
  "error": "Human-readable message",
  "details": { ... }
}
```

`details` is present when Zod validation fails and contains the flattened Zod error object.
