# Architecture

## Components

### Web application (`apps/web`)

Next.js 15 App Router with React 19, Tailwind CSS 4, shadcn/ui (Radix), Recharts, React Hook Form and Zod.
Auth.js v5 (credentials provider, JWT sessions) protects the dashboard; the middleware redirects
signed-out users to `/login`.

Request flow follows a layered structure:

```
Route handler / Server action / Page   (thin: authenticate, validate, delegate)
        │
        ▼
src/server/services/*        business logic, transactions, audit logging
        │                    src/server/domain/*  pure rules (scheduling, eligibility, health) - unit tested
        ▼
src/server/repositories/*    all Prisma access
        │
        ▼
PostgreSQL (prisma/schema.prisma + migrations)
```

- Validation uses Zod everywhere. Schemas shared with the agent and mobile clients live in
  `packages/shared`; dashboard-only form schemas live in `src/lib/validation`.
- Server actions return `{ ok, data } | { ok: false, error, fieldErrors }` so forms keep user input on
  recoverable errors.
- Authorization: `requirePermission()` re-loads the user from the database on every request, so role
  changes and deactivation apply immediately. Roles: `ADMIN`, `MANAGER`, `VIEWER`
  (see `src/lib/permissions.ts`).

### Windows agent (`apps/windows-agent`)

- **TypeScript agent** (`src/`): configuration, DPAPI-backed credential store, typed API client
  validated with the shared schemas, the scheduling loop (sync / heartbeat / command poll), reconnect
  with exponential backoff, structured JSON logging and graceful shutdown.
- **Native helper** (`native/BpaBleHelper`, C#/.NET 8, `net8.0-windows10.0.19041.0`): wraps
  `BluetoothLEAdvertisementPublisher`, reports adapter capabilities and publisher status events, and
  provides DPAPI protect/unprotect. It speaks JSON lines over stdio and stops advertising and exits
  when its stdin closes, so a crashed agent never leaves an unsupervised broadcast.

### Shared package (`packages/shared`)

Enums, Zod request/response schemas for the station and mobile APIs, campaign/advertisement input
schemas, URL safety checks and the beacon encoder/decoder (`beacon.ts`).

## Campaign lifecycle and selection

Statuses: `DRAFT → SCHEDULED/ACTIVE → PAUSED | EXPIRED → ARCHIVED`.

- Activation requires an advertisement and at least one station; it yields `SCHEDULED` when the start
  is in the future, otherwise `ACTIVE`. Past end dates cannot be activated.
- Schedule transitions are persisted lazily (`syncScheduledStatuses`) and also derived at read time
  (`effectiveCampaignStatus`), so a campaign is never served outside its window.
- A station broadcasts exactly one campaign: its pinned **target campaign** while that is live,
  otherwise the live campaign with the highest priority (ties: most recent start, then oldest record).
- The active-campaign API returns `nextChangeAt` (next start or end among assigned campaigns); the agent
  re-syncs at that moment and also stops locally when the broadcast campaign's end time passes, even
  if the server is unreachable.
- Every change that can affect a broadcast increments the station's `configRevision`. Heartbeat
  responses carry the revision, so agents re-sync within one heartbeat interval.

## Station health

`OFFLINE` is derived: a station with no heartbeat for `offlineThresholdSeconds` is offline regardless
of its stored status. Agents report `ONLINE` or `ERROR` (hardware problems) and Bluetooth state
(`ADVERTISING`, `WAITING`, `STOPPED`, `NO_ADAPTER`, `UNSUPPORTED`, `RADIO_OFF`, `ERROR`). A graceful
shutdown sends a final heartbeat that marks the station offline immediately. Connection, advertising,
command and credential events are written to `station_logs`.

## Notification policy

The mobile campaigns endpoint evaluates eligibility per device (when a device token is supplied):

1. RSSI below the minimum (station override or global) → `too_far`
2. Quiet hours (system time zone, may span midnight) → `quiet_hours`
3. Campaign cooldown (campaign override or default) since the last display → `cooldown`
4. Global daily cap across all campaigns → `daily_limit`
5. Campaign-specific daily cap → `campaign_limit`

Duplicate prevention drops identical event reports (device, campaign, event type) within a window.

## Data model

| Table | Purpose |
| --- | --- |
| `users` | Dashboard accounts (bcrypt hashes, role, active flag) |
| `advertisements` | Reusable notification content (soft delete) |
| `campaigns` | Schedule, priority, limits, 16-bit `beacon_key` (soft delete) |
| `bluetooth_stations` | Station identity, beacon UUID, desired Bluetooth config, reported health (soft delete) |
| `campaign_stations` | Campaign ↔ station assignments |
| `advertising_events` | Reported `beacon_detected` / `notification_displayed` / `notification_clicked` |
| `station_commands` | Remote command queue with delivery and execution status |
| `station_credentials` | SHA-256 token hashes, prefix, expiry, revocation, last use |
| `station_logs` | Per-station connection, advertising and command history |
| `audit_logs` | Administrative changes |
| `notification_settings`, `system_settings` | Singleton configuration rows |

Integer primary keys are internal only. URLs, APIs and agents use `uuid` (campaigns, advertisements,
commands, credentials, users) or `station_code` (stations). Database CHECK constraints guard values
that end up in BLE packets (beacon key, company ID, measured power) and the settings singletons.

Deleting campaigns, advertisements or stations is a soft delete so analytics and audit history are
preserved. Advertisements in use by non-archived campaigns cannot be deleted.

## Security model

- **Station credentials**: 256-bit random tokens (`bpa_st_…`), shown once, stored as SHA-256 hashes,
  with optional expiry, rotation (issue new + revoke old) and revocation. Failed authentication is
  rate-limited per IP. Tokens never reach the browser after issuance.
- **Agent storage**: token encrypted with DPAPI (machine scope + entropy) in
  `%ProgramData%\BpaAgent\credential.bin`; the installer restricts the folder ACL.
- **Mobile API**: shared `x-api-key` (abuse deterrent, not a secret), per-IP and per-device rate limits,
  strict Zod validation, events must reference a campaign assigned to the reported beacon and fall
  within its schedule.
- **Privacy**: the app sends a random per-install token; the server stores only an HMAC of it. No MAC
  addresses, advertising IDs or other personal data are collected.
- **Content**: landing and image URLs must be `https://` (http only for localhost) without embedded
  credentials; uploads are type-checked by content (PNG/JPEG/WebP only; SVG rejected).
- **Headers**: `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, permissions policy.
