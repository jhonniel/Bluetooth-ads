# BLE protocol and mobile integration

Only a compact identifier is broadcast. All campaign content comes from the API.

## Advertisement formats

Legacy BLE advertisements carry at most 31 bytes, and Windows always adds a 3-byte Flags structure.
Both formats fit with room to spare. The reference encoder/decoder is
`packages/shared/src/beacon.ts` (`encodeBeacon` / `decodeBeacon`).

### Manufacturer-specific data, "BPA v1" (default)

AD type `0xFF`, company identifier (little-endian on air, set by Windows) followed by 20 bytes:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 1 | Protocol version `0x01` |
| 1 | 16 | Station beacon UUID |
| 17 | 2 | Campaign beacon key (uint16, big-endian) |
| 19 | 1 | Measured power at 1 m (int8, dBm) |

Total on air: 27 bytes including Flags.

**Company identifier.** Use your organization's Bluetooth SIG-assigned company ID (System Settings,
or per station). `0xFFFF` is reserved by the Bluetooth SIG for testing and must not ship; the server
only falls back to it when `ALLOW_TEST_COMPANY_ID=true`, and the dashboard warns while it is in use.
Another company's identifier (for example Apple's `0x004C`) is rejected for this format.

### iBeacon layout (for future iOS support)

Company `0x004C`, data `02 15 <UUID 16> <major 2> <minor 2> <measured power 1>`, 30 bytes on air.
The station beacon UUID is the proximity UUID, `major` is configurable per station and `minor` is the
campaign beacon key. iOS can only monitor beacons in the background through Core Location iBeacon
regions, so stations that must reach iOS devices should use this format. Production use is subject
to Apple's iBeacon licence terms.

## Android integration (current phase)

1. Request `BLUETOOTH_SCAN` (with `neverForLocation` if you do not derive location),
   `POST_NOTIFICATIONS`, and on Android 11 and earlier `ACCESS_FINE_LOCATION`.
2. Background scanning: use `BluetoothLeScanner.startScan(filters, settings, PendingIntent)` with a
   `ScanFilter` on manufacturer data (your company ID, mask on the version byte), or a foreground
   service for continuous scanning. Android throttles background scans; expect detection latency of
   seconds to minutes.
3. Decode the manufacturer data per the table above. Ignore frames with an unknown version.
4. Call `GET /api/mobile/campaigns/{beaconUuid}?key={campaignKey}&device={installToken}&rssi={rssi}`.
5. Show a local notification for the first campaign with `eligibility.eligible == true` (or apply
   your own policy using `policy` and `proximity.minRssi` when offline). Respect
   `notification.expiresAt`.
6. Report events with `POST /api/mobile/events`: `beacon_detected` (optional),
   `notification_displayed` when the notification is shown, `notification_clicked` on tap. Batch and
   retry offline events with their original `occurredAt` (accepted up to 7 days old).
7. Open `landingUrl` in a browser tab or Custom Tab; never in a WebView with elevated privileges.

The `deviceToken` must be a random value generated per app install (for example a UUID stored in app
storage). Do not send Bluetooth MAC addresses, advertising IDs, phone numbers or account IDs.

## iOS (future phase)

- Switch the relevant stations to the iBeacon format.
- Monitor the station proximity UUIDs as `CLBeaconRegion`s (iOS limits apps to 20 regions; group
  stations under shared UUIDs and distinguish them with `major` if needed).
- On region entry, range briefly to obtain `minor` (campaign key) and RSSI, then call the same mobile
  API and schedule a local notification.
- Note: with iBeacon, `beaconId` in the API is the proximity UUID of the station.

## Why the web dashboard cannot scan

Browsers cannot scan for BLE advertisements continuously or in the background (Web Bluetooth only
connects to user-selected devices in the foreground), so detection belongs in the native mobile app.
