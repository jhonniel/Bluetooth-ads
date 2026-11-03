# Windows advertising agent

Runs on each station PC. It authenticates with the platform, registers its Bluetooth capabilities,
sends heartbeats, polls for remote commands and broadcasts the active campaign's beacon through the
native Windows `BluetoothLEAdvertisementPublisher` API.

```
agent.cjs (Node.js)  ── JSON lines over stdio ──  BpaBleHelper.exe (C#/.NET 8, WinRT)
  config, credentials, API client, scheduling,        BLE publisher, capabilities, DPAPI
  reconnect, logging, shutdown
```

The agent never reports `ADVERTISING` unless Windows reports the publisher as `Started`. If the
adapter is missing, lacks the peripheral role, the radio is off or the publisher aborts, the station
shows the real reason in the dashboard. If the agent exits for any reason, the helper sees its stdin
close and stops advertising.

## Requirements

- Windows 10 version 2004 (build 19041) or Windows 11
- Bluetooth LE adapter that supports the peripheral role (check *Bluetooth hardware* on the station page
  after the first registration)
- Node.js 20+ on the station
- .NET 8 SDK on the build machine only (the helper is published self-contained, so stations do not
  need a .NET runtime)

## Build

```powershell
cd apps\windows-agent
npm run build          # dist\agent.cjs
npm run build:native   # dist\native\BpaBleHelper.exe
```

## Enroll

Generate a credential on the station page in the dashboard (Credentials tab), then on the station,
as Administrator:

```powershell
node dist\agent.cjs enroll --server https://ads.example.com --station STN-XXXXXX --token bpa_st_...
```

Enrollment verifies that the token belongs to the station, encrypts it with DPAPI (machine scope plus
application entropy) and writes `%ProgramData%\BpaAgent\config.json` and `credential.bin`.
See `config.example.json` for optional settings (`logLevel`, `helperPath`, `requestTimeoutMs`).

## Install as a background service

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-agent.ps1                # start at boot as SYSTEM
powershell -ExecutionPolicy Bypass -File scripts\install-agent.ps1 -RunAs CurrentUser  # start at sign-in
```

The installer copies the agent to `C:\Program Files\BpaAgent`, restricts the data directory to SYSTEM,
Administrators (and the run-as user), and registers the `BeaconAdsAgent` scheduled task with restart on
failure. Some Bluetooth drivers do not allow advertising from a non-interactive (SYSTEM) session; if
the station reports `WAITING` or a publisher error after installation as SYSTEM, reinstall with
`-RunAs CurrentUser` on an auto-login kiosk account.

## Operate

```powershell
node "C:\Program Files\BpaAgent\agent.cjs" status     # config, server connectivity, Bluetooth capabilities
node "C:\Program Files\BpaAgent\agent.cjs" stop       # graceful stop (stops advertising, final heartbeat)
Start-ScheduledTask -TaskName BeaconAdsAgent           # start again
powershell -File scripts\uninstall-agent.ps1 [-RemoveData]
```

Logs: `%ProgramData%\BpaAgent\logs\agent-YYYY-MM-DD.log` (JSON lines, 14-day retention).

## Behaviour

| Situation | Agent behaviour |
| --- | --- |
| Server unreachable | Keeps the current broadcast until the campaign's end time, retries with exponential backoff (max 60 s), re-registers on reconnect |
| Credential revoked/expired (401) | Stops advertising, retries every 5 minutes |
| Campaign ends | Stops locally at the end time, even without network |
| Config or assignment change | Heartbeat reports a new `configRevision`; agent re-syncs |
| Remote command | Executed on the next poll; the real result is reported back |
| Native helper crash | Status `ERROR`; restarted on the next sync |
| Advertising interval setting | Not exposed by the Windows publisher API; OS default is used and logged |
| Transmit power setting | Applied via `PreferredTransmitPowerLevelInDBm` when the adapter supports it |

## Development

```powershell
npm test                      # unit tests with a fake advertiser and API
$env:BPA_AGENT_HOME = "$env:TEMP\bpa-dev"; $env:BPA_STATION_TOKEN = "bpa_st_..."
npm run dev                   # runs src/cli.ts run with tsx
```

`BPA_STATION_TOKEN` bypasses DPAPI for development only. Without the native helper the agent still
connects and reports a Bluetooth `ERROR` explaining that the helper is missing.
