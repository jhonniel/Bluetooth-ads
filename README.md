# Beacon Ads — Bluetooth Proximity Advertising Platform

Businesses advertise promotions to nearby customers with Bluetooth Low Energy (BLE). A Windows PC
acts as an advertising station and broadcasts a compact beacon identifier. A compatible mobile app
detects the beacon, fetches the active campaign from the API, shows a local notification and reports
impressions and clicks back for analytics.

```
 Admin dashboard (Next.js)  ──►  PostgreSQL  ◄──  Station API  ◄──  Windows agent (Node + C# helper)  ──BLE──►  Mobile app
        campaigns, ads,                              config, heartbeat,     BluetoothLEAdvertisementPublisher           │
        stations, analytics                          commands, campaign                                                 │
                                       ▲                                                                                 │
                                       └───────────────────  Mobile API: campaigns by beacon, event reporting  ◄────────┘
```

What is real and what is not:

- The dashboard manages configuration only. It never touches Bluetooth hardware.
- Only the Windows agent broadcasts, through the native WinRT `BluetoothLEAdvertisementPublisher`.
  A station shows **Advertising** only when Windows reports the publisher as `Started`.
- Remote start/stop/sync is an authenticated command queue that the agent polls; results are
  reported by the agent.
- Impressions are counted only when the mobile app reports `notification_displayed`. Beacon
  broadcasts and detections are never counted as delivered notifications.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/web` | Next.js 15 / React 19 admin dashboard, REST APIs, Prisma schema, migrations, seed |
| `apps/windows-agent` | TypeScript station agent and `native/BpaBleHelper` (C#/.NET 8 BLE + DPAPI helper) |
| `packages/shared` | Shared Zod schemas, API types and the BLE beacon encoder/decoder |
| `apps/mobile-samples` | Sample Android (Kotlin) and iOS (Swift) apps that detect stations and show notifications |
| `docs/` | Architecture, API reference, mobile integration, deployment |

## Requirements

- Node.js 20.11+ and npm 10+
- PostgreSQL 14+
- For the Windows agent: Windows 10 version 2004 (build 19041) or later with a BLE adapter that
  supports the peripheral role, plus the .NET 8 SDK to build the native helper

## Quick start (development)

```powershell
npm install
copy apps\web\.env.example apps\web\.env     # then edit DATABASE_URL and generate secrets
npm run db:migrate                            # applies prisma/migrations
npm run db:seed                               # admin user, settings and sample data
npm run dev                                   # http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` (defaults `admin@example.com` /
`ChangeMe!2026`; change them). Sample users `manager@example.com` and `viewer@example.com` use the
same password.

The seed creates realistic sample campaigns, advertisements, four stations and 30 days of sample
analytics events tagged `appVersion = 'seed-sample'`. Stations are seeded without heartbeats: they
stay offline until a real agent connects. Use `SEED_SAMPLE_DATA=false` for a clean install.
To remove sample analytics later: `DELETE FROM advertising_events WHERE app_version = 'seed-sample';`

## Connecting a station

1. Dashboard → **Bluetooth Stations** → **Register station** (tick *Generate agent credentials now*).
2. Copy the one-time token and enrollment command.
3. On the Windows PC, build and install the agent (see [apps/windows-agent/README.md](apps/windows-agent/README.md)):
   ```powershell
   cd apps\windows-agent
   npm run build; npm run build:native
   node dist\agent.cjs enroll --server https://ads.example.com --station STN-XXXXXX --token bpa_st_...
   powershell -ExecutionPolicy Bypass -File scripts\install-agent.ps1
   ```
4. Assign an active campaign to the station. The station page shows the exact payload being broadcast.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` / `build` / `start` | Web app |
| `npm run typecheck` | Type-check all workspaces |
| `npm test` | Unit tests (shared protocol, domain rules, agent orchestration) |
| `npm run lint` | ESLint for the web app |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Prisma migrate (dev), migrate deploy (prod), seed |
| `npm run test:smoke -w web` | API smoke test against a running server (see `apps/web/scripts/smoke-test.mjs`) |
| `npm run agent:build` | Bundle the Windows agent to `apps/windows-agent/dist/agent.cjs` |

## Documentation

- [Architecture](docs/architecture.md): components, data model, campaign selection, security model
- [API reference](docs/api.md): station, campaign and mobile endpoints
- [BLE protocol and mobile integration](docs/mobile-integration.md): payload format, Android scanning, iOS plan
- [Deployment](docs/deployment.md): production setup and security checklist
- [Windows agent](apps/windows-agent/README.md): build, enrollment, installation, troubleshooting
