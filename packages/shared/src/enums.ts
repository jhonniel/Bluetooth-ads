export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STATION_STATUSES = ["ONLINE", "OFFLINE", "CONNECTING", "ERROR"] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];

/** Station status values an agent is allowed to report about itself. OFFLINE is derived server-side. */
export const AGENT_REPORTED_STATUSES = ["ONLINE", "ERROR"] as const;
export type AgentReportedStatus = (typeof AGENT_REPORTED_STATUSES)[number];

/** Actual Bluetooth state as observed by the native Windows advertiser. */
export const BLUETOOTH_STATUSES = [
  "UNKNOWN",
  "ADVERTISING",
  "WAITING",
  "STOPPED",
  "NO_ADAPTER",
  "UNSUPPORTED",
  "RADIO_OFF",
  "ERROR",
] as const;
export type BluetoothStatus = (typeof BLUETOOTH_STATUSES)[number];

export const ADVERTISEMENT_FORMATS = ["MANUFACTURER_DATA", "IBEACON"] as const;
export type AdvertisementFormat = (typeof ADVERTISEMENT_FORMATS)[number];

export const ADVERTISING_EVENT_TYPES = ["beacon_detected", "notification_displayed", "notification_clicked"] as const;
export type AdvertisingEventType = (typeof ADVERTISING_EVENT_TYPES)[number];

export const STATION_COMMAND_TYPES = ["START_ADVERTISING", "STOP_ADVERTISING", "SYNC_CAMPAIGNS"] as const;
export type StationCommandType = (typeof STATION_COMMAND_TYPES)[number];

export const STATION_COMMAND_STATUSES = ["PENDING", "DELIVERED", "SUCCEEDED", "FAILED", "EXPIRED"] as const;
export type StationCommandStatus = (typeof STATION_COMMAND_STATUSES)[number];

export const USER_ROLES = ["ADMIN", "MANAGER", "VIEWER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MOBILE_PLATFORMS = ["android", "ios"] as const;
export type MobilePlatform = (typeof MOBILE_PLATFORMS)[number];
