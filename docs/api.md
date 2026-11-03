# API reference

All JSON responses use `{ "data": … }` on success and `{ "error": { "code", "message", "details?" } }`
on failure. Validation errors return `422` with field-level `details`. Rate limits return `429` with
`Retry-After`.

Request and response schemas are defined in `packages/shared/src/schemas` and validated on both sides.

## Station API (Windows agent)

Authentication: `Authorization: Bearer bpa_st_<token>` issued from the station page. Invalid,
expired or revoked tokens and removed stations return `401`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/stations/register` | Report agent version, host and Bluetooth capabilities; returns config |
| GET | `/api/stations/config` | Station identity, Bluetooth configuration, polling intervals, `configRevision` |
| POST | `/api/stations/heartbeat` | Report health and actual advertising state; returns `configRevision`, `pendingCommands` |
| GET | `/api/stations/commands` | Pending/undelivered commands (marks them delivered) |
| POST | `/api/stations/commands/execute` | Report command result (`SUCCEEDED` / `FAILED`) |
| GET | `/api/stations/campaigns/active` | Campaign to broadcast and the exact manufacturer data |

Heartbeat body:

```json
{
  "status": "ONLINE",
  "bluetoothStatus": "ADVERTISING",
  "bluetoothError": null,
  "advertising": { "active": true, "campaignId": "a71a827b-…", "beaconKey": 2, "startedAt": "2026-11-03T08:00:00Z" },
  "softwareVersion": "1.0.0",
  "uptimeSeconds": 3600,
  "shuttingDown": false
}
```

Active campaign response:

```json
{
  "advertisingEnabled": true,
  "campaign": { "id": "a71a827b-…", "name": "Coffee Bar Happy Hour", "beaconKey": 2, "priority": 70, "startAt": "…", "endAt": "…" },
  "beacon": { "format": "MANUFACTURER_DATA", "companyId": 65535, "dataHex": "01d632a9b3…0002c5", "totalAdvertisingBytes": 27, "txPowerDbm": null },
  "reason": null,
  "nextChangeAt": "2026-11-06T07:23:26.405Z",
  "configRevision": 3,
  "serverTime": "…"
}
```

When nothing should be broadcast, `campaign` and/or `beacon` are `null` and `reason` explains why
(advertising disabled, no live campaign, or no valid company identifier configured).

Commands: `START_ADVERTISING`, `STOP_ADVERTISING`, `SYNC_CAMPAIGNS`. Commands expire after 10 minutes.
Start/stop also change the station's desired `advertisingEnabled` state.

## Campaign API (dashboard session)

Authentication: Auth.js session cookie. Reads need any role; writes need `ADMIN` or `MANAGER`.
`[id]` is the campaign's public UUID.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/campaigns?q=&status=&page=&pageSize=` | Paginated list |
| POST | `/api/campaigns` | Body `{ campaign, newAdvertisement?, activate? }` |
| GET | `/api/campaigns/[id]` | Campaign with advertisement and stations |
| PATCH | `/api/campaigns/[id]` | Partial update and/or `"action": "activate" \| "pause" \| "archive"` |
| DELETE | `/api/campaigns/[id]` | Soft delete; analytics are retained |

`campaign` fields: `name`, `description`, `advertisementId` (UUID), `startAt`, `endAt` (ISO 8601),
`priority` (1–100), `cooldownMinutes`, `maxNotificationsPerDay` (null = global default),
`stationCodes` (array of station IDs).

`GET /api/analytics/export?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month&campaign=&station=`
returns a CSV report.

## Mobile API

Authentication: `x-api-key: <MOBILE_API_KEY>`. Rate limited per client IP (configure `TRUST_PROXY`
behind a reverse proxy) and per device.

### `GET /api/mobile/campaigns/{beaconId}?key=&device=&rssi=`

- `beaconId`: station beacon UUID from the advertisement
- `key` (optional): campaign beacon key decoded from the advertisement (iBeacon minor / BPA key)
- `device` (optional): anonymous per-install token (16–128 chars, `[A-Za-z0-9._-]`); enables eligibility
- `rssi` (optional): measured RSSI in dBm

Returns only live campaigns assigned to the beacon's station, ordered by priority:

```json
{
  "beaconId": "d632a9b3-…",
  "station": { "name": "Makati Flagship - Main Entrance", "location": "Makati Flagship Store" },
  "proximity": { "minRssi": -75 },
  "quietHours": { "active": false },
  "campaigns": [
    {
      "id": "a71a827b-…",
      "beaconKey": 2,
      "priority": 70,
      "endAt": "2026-11-28T07:23:26.405Z",
      "notification": {
        "title": "Happy Hour at the Coffee Bar",
        "message": "Buy one, get one free on all iced drinks from 2-5 PM.",
        "imageUrl": null,
        "description": "…",
        "landingUrl": "https://example.com/promotions/happy-hour",
        "ctaLabel": "See Menu",
        "expiresAt": "2026-11-03T08:30:28.255Z"
      },
      "policy": { "cooldownMinutes": 120, "maxNotificationsPerDay": 1 },
      "eligibility": { "eligible": true, "reason": "ok" }
    }
  ],
  "serverTime": "…"
}
```

`eligibility.reason`: `ok`, `too_far`, `quiet_hours`, `cooldown`, `daily_limit`, `campaign_limit`,
or `not_evaluated` when no device token was sent. Unknown beacons return `404`.

### `POST /api/mobile/events`

```json
{
  "events": [
    {
      "type": "notification_displayed",
      "campaignId": "a71a827b-…",
      "beaconId": "d632a9b3-…",
      "deviceToken": "3f0c9a52-6f5e-4b1e-9a4d-2b1f0c7e8d11",
      "rssi": -61,
      "occurredAt": "2026-11-03T08:00:00+08:00",
      "platform": "android",
      "appVersion": "1.4.0"
    }
  ]
}
```

Up to 50 events per request. Response `202`: `{ "accepted": 1, "duplicates": 0, "rejected": [{ "index": 3, "reason": "campaign_not_assigned_to_beacon" }] }`.
Rejection reasons: `occurred_in_future`, `too_old` (> 7 days), `unknown_beacon`, `unknown_campaign`,
`campaign_not_assigned_to_beacon`, `outside_campaign_schedule`, `device_rate_limited`.

Event types:

- `beacon_detected`: the app saw the beacon (informational; never counted as an impression)
- `notification_displayed`: the app actually showed the notification (counted as an impression)
- `notification_clicked`: the customer tapped the notification or call to action
