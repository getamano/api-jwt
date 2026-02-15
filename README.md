# API Key Management System

A Next.js application for managing API keys with user authentication, role-based access control, and per-key usage tracking. Works with **Azure API Management (APIM)** as a gateway in production, and supports direct API key usage for local development.

---

## Table of Contents

- [How It Works (The Big Picture)](#how-it-works-the-big-picture)
- [Project Structure](#project-structure)
- [Setup](#setup)
- [User Authentication](#user-authentication)
- [Roles and Permissions](#roles-and-permissions)
- [API Routes](#api-routes)
- [How API Keys Work](#how-api-keys-work)
- [Usage Tracking](#usage-tracking)
- [How APIM Fits In](#how-apim-fits-in)
- [How the Backend Trusts APIM](#how-the-backend-trusts-apim)
- [APIM Inbound Policy (Step by Step)](#apim-inbound-policy-step-by-step)
- [APIM Outbound Policy](#apim-outbound-policy)
- [Rate Limiting and Quotas](#rate-limiting-and-quotas)
- [Authentication Flow Diagrams](#authentication-flow-diagrams)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)

---

## How It Works (The Big Picture)

Users log in via email/password to manage their API keys through a web UI. An admin account is seeded automatically on first request.

There are **two ways** a request can reach protected API endpoints:

```
Production (through APIM):
  User --> APIM --> validates key --> forwards request --> Backend

Local Development (direct):
  User --> Backend (validates key itself)
```

In **production**, APIM sits in front of the backend. It validates the API key, attaches identity headers, applies rate limits, and then forwards the request. The backend trusts APIM because APIM sends a shared secret.

In **local development**, you skip APIM entirely. You send the API key directly to the backend in the `X-Api-Key` header, and the backend validates it against MongoDB.

---

## Project Structure

```
lib/
  auth.ts        # API key creation, validation, authentication logic
  db.ts          # MongoDB connection (singleton), index creation, admin seeding
  session.ts     # JWT session management (cookie-based)
  usage.ts       # Per-key usage tracking (stored in MongoDB)
  users.ts       # User registration, login, admin seeding

app/
  page.tsx       # Web UI - login/register, key management, usage modals

  api/
    auth/
      register/
        route.ts   # POST: register new user + auto-login
      login/
        route.ts   # POST: login with email/password
      logout/
        route.ts   # POST: clear session cookie
      me/
        route.ts   # GET: current session user

    keys/
      route.ts   # POST: create key | GET: list keys | PATCH: update tier | DELETE: revoke/delete key

    internal/
      validate-key/
        route.ts # POST: validate a key (used by APIM)

    protected/
      route.ts   # GET: example protected endpoint

    usage/
      route.ts        # GET: usage stats via API key auth
      [keyId]/
        route.ts      # GET: usage stats for a specific key (session auth)

policy.xml       # Azure APIM inbound/outbound policy
```

---

## Setup

### Prerequisites

- Node.js 18+
- MongoDB running locally (or a connection string)

### Install and Run

```bash
npm install
npm run dev
```

The app starts at `http://localhost:3000`.

### Environment Variables

Create a `.env.local` file:

```
APIM_SHARED_SECRET=your-shared-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-admin-password
```

### MongoDB

By default, the app connects to `mongodb://localhost:27017/api`. To change this, set the `MONGODB_URI` environment variable.

The app automatically creates these collections and indexes:
- `api_keys` — stores hashed API keys and metadata (index: `userId + status`)
- `users` — stores user accounts (unique index: `email`)
- `usage` — stores per-key usage statistics

### Admin Seeding

The default admin account is created automatically on the **first API request** (not at deploy time). When any route calls `getDb()`, it checks if the admin user exists and creates it if not.

- Uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment variables
- Idempotent — safe to run multiple times, skips if admin already exists
- Silently skips if either env var is missing

---

## User Authentication

Authentication uses **JWT tokens stored in HTTP-only cookies**. No extra dependencies needed — `jsonwebtoken` and `bcryptjs` handle everything.

### Flow

1. User visits the app → sees login/register form
2. On login/register, the server sets an HTTP-only cookie with a signed JWT
3. All subsequent requests include the cookie automatically
4. JWT contains `userId`, `email`, and `role`
5. Sessions expire after 7 days

### Web UI

- **Not logged in** → login/register form with toggle between modes
- **Logged in as user** → see own keys, create keys (starter tier only), delete own keys
- **Logged in as admin** → see all keys, create keys for any email/tier, revoke any key, change tiers

---

## Roles and Permissions

| Action | User | Admin |
|--------|------|-------|
| Create own key | Yes (starter only) | Yes (any tier) |
| Create key for others | No | Yes |
| List own keys | Yes | Yes |
| List all keys | No | Yes |
| Delete own key | Yes (hard delete) | — |
| Revoke any key | — | Yes (soft delete) |
| Change tier | No | Yes |
| View own key usage | Yes | Yes |
| View any key usage | No | Yes |

**Delete vs Revoke:**
- Regular users **delete** their keys (permanently removed from database). A confirmation dialog is shown.
- Admins **revoke** keys (status set to "revoked", key remains visible in admin list).

---

## API Routes

### Auth Routes

#### `POST /api/auth/register` — Register a new user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "mypassword"}'
```

Creates a new user with "user" role and sets a session cookie. Password must be at least 6 characters. Returns 409 if email is already registered.

#### `POST /api/auth/login` — Log in

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "mypassword"}'
```

Validates credentials and sets a session cookie. Returns 401 for invalid credentials.

#### `POST /api/auth/logout` — Log out

Clears the session cookie.

#### `GET /api/auth/me` — Current user

Returns the current session user or `{ user: null }` with 401 if not logged in.

---

### Key Management Routes

All key routes require a valid session cookie.

#### `POST /api/keys` — Create a new API key

```bash
# Users (tier is always "starter", email is from session):
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My App"}'

# Admin (can specify email and tier):
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"email": "other@example.com", "tier": "unlimited", "name": "Their App"}'
```

Response (201):
```json
{
  "apiKey": "k_abc123...",
  "id": "uuid-here",
  "name": "My App",
  "email": "user@example.com",
  "status": "active",
  "tier": "starter",
  "createdAt": "2026-02-16T...",
  "lastUsedAt": null,
  "expiresAt": null
}
```

**Important:** The `apiKey` field is the raw key. It is returned **only once**. It is never stored in the database (only a bcrypt hash is stored).

#### `GET /api/keys` — List keys

- **Users** see only their own keys
- **Admin** sees all keys

#### `PATCH /api/keys` — Update tier (admin only)

```bash
curl -X PATCH http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"id": "uuid-here", "tier": "unlimited"}'
```

Returns 403 for non-admin users.

#### `DELETE /api/keys` — Delete or revoke a key

```bash
curl -X DELETE http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"id": "uuid-here"}'
```

- **Users** — hard deletes the key (removed from database). Only works on their own keys.
- **Admin** — soft deletes (sets status to "revoked"). Works on any key.

---

### Usage Routes

#### `GET /api/usage/[keyId]` — Per-key usage (session auth)

```bash
curl http://localhost:3000/api/usage/uuid-here
```

Requires session cookie. Users can only view usage for their own keys. Admin can view any key's usage.

Response:
```json
{
  "keyId": "uuid-here",
  "limits": { "rateLimit": 10, "quota": 10000 },
  "usage": {
    "totalCalls": 42,
    "callsThisMinute": 2,
    "callsThisMonth": 42,
    "lastCallAt": "2026-02-16T...",
    "history": [{ "date": "2026-02-16", "calls": 42 }]
  }
}
```

The web UI shows this as a modal with meter bars for rate limit and monthly quota.

---

### Internal / Protected Routes

#### `POST /api/internal/validate-key` — Validate a key (used by APIM)

```bash
curl -X POST http://localhost:3000/api/internal/validate-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "k_abc123..."}'
```

This route is called by APIM's inbound policy. It should **not** be exposed to end users.

#### `GET /api/protected` — Example protected endpoint

```bash
curl http://localhost:3000/api/protected \
  -H "X-Api-Key: k_abc123..."
```

Tracks per-key usage on each call.

---

## How API Keys Work

### Key Generation

1. Generate 32 random bytes and encode as base64url
2. Prefix with `k_` so keys are easy to identify (e.g. `k_Yg5eDzq...`)
3. Hash the full key with **bcrypt** (10 salt rounds)
4. Store the **hash** in MongoDB — never the raw key
5. Return the raw key to the user **once**

### Key Validation

When a key needs to be validated:
1. Fetch all active (non-revoked) keys from MongoDB
2. Run `bcrypt.compare(providedKey, storedHash)` against each key
3. If a match is found, check if it's expired
4. Update `lastUsedAt` timestamp
5. Return the key's identity (keyId, email, tier)

---

## Usage Tracking

Usage is tracked **per key** (not per user). Each API key has its own usage record in the `usage` collection, keyed by `keyId`.

Tracked metrics:
- **Total calls** — lifetime count
- **Calls this minute** — resets every 60 seconds
- **Calls this month** — resets every 30 days
- **Daily history** — array of `{ date, calls }` entries

The web UI displays usage in a modal popup with meter bars showing current usage against rate limit and monthly quota. Meters turn red when usage exceeds 80% of the limit.

---

## How APIM Fits In

**Azure API Management (APIM)** acts as a gateway between users and the backend.

```
Without APIM (local dev):
  User ---[X-Api-Key: k_abc]--> Backend (validates key itself)

With APIM (production):
  User ---[X-Api-Key: k_abc]--> APIM ---[X-Apim-Secret + identity headers]--> Backend
```

### What APIM does:

1. **Receives** the user's request with their API key
2. **Validates** the key by calling the backend's `/api/internal/validate-key` endpoint
3. **Rejects** the request if the key is invalid (returns 401)
4. **Extracts** user identity (email, tier) from the validation response
5. **Applies** rate limiting and quotas based on the user's tier
6. **Strips** the original API key from the request (security measure)
7. **Attaches** identity headers (`X-User-Email`, `X-User-Tier`) and a shared secret (`X-Apim-Secret`)
8. **Forwards** the cleaned-up request to the backend

---

## How the Backend Trusts APIM

The backend needs to know: "Did this request really come from APIM, or is someone faking the headers?"

The answer is a **shared secret**:

```
APIM sends:       X-Apim-Secret: my-secret-value-123
Backend checks:   Does this match my APIM_SHARED_SECRET env var?
```

### What happens in the backend (`authenticateRequest` function):

```
Is X-Apim-Secret header present?
  |
  ├── YES: Does it match APIM_SHARED_SECRET env var?
  |    ├── YES: Trust the X-User-Email and X-User-Tier headers. Done!
  |    └── NO:  Reject with "APIM secret mismatch"
  |
  └── NO: Is X-Api-Key header present?
       ├── YES: Validate key against MongoDB (direct access mode)
       └── NO:  Reject with "No API key or APIM secret provided"
```

---

## APIM Inbound Policy (Step by Step)

The file `policy.xml` defines what APIM does with every incoming request. Here's each step explained:

### Step 1: Extract the API key

```xml
<set-variable name="api-key"
  value="@(context.Request.Headers.GetValueOrDefault("X-Api-Key", ""))" />
```

Reads the `X-Api-Key` header from the user's request and stores it in a variable.

### Step 2: Call the backend to validate the key

```xml
<send-request mode="new" response-variable-name="key-validation" timeout="10">
    <set-url>{{backend-url}}/api/internal/validate-key</set-url>
    <set-method>POST</set-method>
    <set-body>@{
        return new JObject(
            new JProperty("apiKey", (string)context.Variables["api-key"])
        ).ToString();
    }</set-body>
</send-request>
```

APIM makes a separate HTTP call to the backend's `/api/internal/validate-key` endpoint. This is a **side call** — the user doesn't see it.

### Step 3: Parse the validation response

```xml
<set-variable name="key-response"
  value="@(((IResponse)context.Variables["key-validation"]).Body.As<JObject>())" />
<set-variable name="key-active"
  value="@((bool)((JObject)context.Variables["key-response"])["active"])" />
```

Reads the JSON response and extracts the `active` boolean.

### Step 4: Reject invalid keys

```xml
<choose>
    <when condition="@(!((bool)context.Variables["key-active"]))">
        <return-response>
            <set-status code="401" reason="Unauthorized" />
            <set-body>{"error": "Invalid or revoked API key"}</set-body>
        </return-response>
    </when>
</choose>
```

If `active` is `false`, APIM immediately returns 401. The request never reaches the backend.

### Step 5: Set identity headers

```xml
<set-header name="X-User-Email" exists-action="override">
    <value>@((string)((JObject)context.Variables["key-response"])["userId"])</value>
</set-header>
<set-header name="X-User-Tier" exists-action="override">
    <value>@((string)((JObject)context.Variables["key-response"])["tier"])</value>
</set-header>
```

### Step 6: Attach the shared secret

```xml
<set-header name="X-Apim-Secret" exists-action="override">
    <value>{{apim-backend-secret}}</value>
</set-header>
```

### Step 7: Strip sensitive headers

```xml
<set-header name="X-Api-Key" exists-action="delete" />
<set-header name="Ocp-Apim-Subscription-Key" exists-action="delete" />
<set-header name="Authorization" exists-action="delete" />
```

### Step 8: Apply rate limits and quotas

```xml
<rate-limit-by-key calls="10" renewal-period="60"
    counter-key="@((string)((JObject)context.Variables["key-response"])["keyId"])" />
<quota-by-key calls="10000" renewal-period="2592000"
    counter-key="@((string)((JObject)context.Variables["key-response"])["keyId"])" />
```

Rate limiting is per `keyId`, so each API key has its own counters.

---

## APIM Outbound Policy

After the backend responds, APIM modifies the response before sending it to the user:

```xml
<!-- Remove the shared secret so users never see it -->
<set-header name="X-Apim-Secret" exists-action="delete" />

<!-- Add useful headers to the response -->
<set-header name="X-User-Tier" .../>         <!-- The user's tier -->
<set-header name="X-Key-Active" .../>         <!-- Whether the key is active -->
<set-header name="X-RateLimit-Remaining" .../> <!-- Calls left this minute -->
<set-header name="X-RateLimit-Reset" .../>     <!-- Seconds until rate limit resets -->
<set-header name="X-Quota-Remaining" .../>     <!-- Calls left this month -->
```

---

## Rate Limiting and Quotas

| Tier | Rate Limit (per minute) | Monthly Quota |
|------|------------------------|---------------|
| Starter | 10 calls | 10,000 calls |
| Unlimited | 10,000 calls | 1,000,000 calls |

Rate limits are enforced by APIM in production. The backend also tracks usage per key in MongoDB for reporting purposes.

When a user exceeds their rate limit, APIM returns `429 Too Many Requests` before the request reaches the backend.

---

## Authentication Flow Diagrams

### Flow 1: Web UI (Session-based)

```
User                         Backend
  |                             |
  |--POST /api/auth/login------>|
  |  { email, password }        |
  |                             |
  |<--Set-Cookie: session=JWT---|
  |                             |
  |--GET /api/keys------------->|
  |  Cookie: session=JWT        |
  |                             |
  |<--{ keys: [...] }-----------|
```

### Flow 2: Through APIM (Production)

```
User                    APIM                        Backend
  |                       |                            |
  |--X-Api-Key: k_abc---->|                            |
  |                       |                            |
  |                       |--POST /internal/validate-->|
  |                       |   { apiKey: "k_abc" }      |
  |                       |                            |
  |                       |<--{ active: true,----------|
  |                       |     keyId: "uuid",         |
  |                       |     userId: "u@x.com",     |
  |                       |     tier: "starter" }      |
  |                       |                            |
  |                       | (check rate limit + quota) |
  |                       |                            |
  |                       |--X-Apim-Secret: secret---->|
  |                       |  X-User-Email: u@x.com     |
  |                       |  X-User-Tier: starter      |
  |                       |  (no X-Api-Key!)           |
  |                       |                            |
  |                       |<--{ message: "success" }---|
  |                       |                            |
  |<--{ message: "success" }                           |
  |   + X-RateLimit-Remaining: 9                       |
  |   + X-Quota-Remaining: 9999                        |
```

### Flow 3: Direct (Local Development)

```
User                              Backend
  |                                  |
  |--X-Api-Key: k_abc-------------->|
  |                                  |
  |                    (bcrypt compare against MongoDB)
  |                                  |
  |<--{ message: "success" }---------|
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | No | `mongodb://localhost:27017/api` | MongoDB connection string |
| `APIM_SHARED_SECRET` | Yes (prod) | — | Must match `{{apim-backend-secret}}` in APIM |
| `ADMIN_EMAIL` | No | — | Email for the auto-seeded admin account |
| `ADMIN_PASSWORD` | No | — | Password for the auto-seeded admin account |
| `JWT_SECRET` | No | Falls back to `APIM_SHARED_SECRET` | Secret used to sign session JWTs |

### APIM Named Values

These are configured in the Azure Portal under your APIM instance > Named Values:

| Named Value | Description |
|-------------|-------------|
| `{{backend-url}}` | Your backend URL (e.g. `https://your-app.azurewebsites.net`) |
| `{{apim-backend-secret}}` | Shared secret — must match backend's `APIM_SHARED_SECRET` |

---

## Local Development

```bash
# 1. Start MongoDB
mongod

# 2. Create .env.local
echo 'APIM_SHARED_SECRET=your-secret' > .env.local
echo 'ADMIN_EMAIL=admin@example.com' >> .env.local
echo 'ADMIN_PASSWORD=your-password' >> .env.local

# 3. Start the app
npm run dev

# 4. Open the app — admin is seeded on first request
open http://localhost:3000

# 5. Log in as admin with the credentials from .env.local

# 6. Create a key via the UI

# 7. Test the key
curl http://localhost:3000/api/protected \
  -H "X-Api-Key: k_your-key-here"

# 8. View usage in the UI — click "Usage" on any key
```
