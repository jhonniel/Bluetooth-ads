import type {
  BluetoothStatus,
  CampaignStatus,
  StationCommandStatus,
  StationCommandType,
  StationStatus,
} from "@bpa/shared";

export type Tone = "neutral" | "success" | "info" | "warning" | "danger" | "muted";

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "muted" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "muted" },
};

export const STATION_STATUS_META: Record<StationStatus, { label: string; tone: Tone }> = {
  ONLINE: { label: "Online", tone: "success" },
  OFFLINE: { label: "Offline", tone: "muted" },
  CONNECTING: { label: "Connecting", tone: "info" },
  ERROR: { label: "Error", tone: "danger" },
};

export const BLUETOOTH_STATUS_META: Record<BluetoothStatus, { label: string; tone: Tone; description: string }> = {
  UNKNOWN: { label: "Unknown", tone: "muted", description: "The agent has not reported Bluetooth state yet." },
  ADVERTISING: { label: "Advertising", tone: "success", description: "Windows reports the BLE publisher as started." },
  WAITING: { label: "Waiting", tone: "info", description: "Windows accepted the advertisement and is waiting for radio resources." },
  STOPPED: { label: "Stopped", tone: "neutral", description: "The agent is not advertising." },
  NO_ADAPTER: { label: "No adapter", tone: "danger", description: "No Bluetooth adapter was found on the station." },
  UNSUPPORTED: { label: "Unsupported", tone: "danger", description: "The adapter does not support BLE peripheral (advertising) mode." },
  RADIO_OFF: { label: "Radio off", tone: "warning", description: "Bluetooth is turned off on the station." },
  ERROR: { label: "Error", tone: "danger", description: "The BLE publisher reported an error." },
};

export const COMMAND_STATUS_META: Record<StationCommandStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "info" },
  SUCCEEDED: { label: "Succeeded", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "muted" },
};

export const COMMAND_TYPE_LABELS: Record<StationCommandType, string> = {
  START_ADVERTISING: "Start advertising",
  STOP_ADVERTISING: "Stop advertising",
  SYNC_CAMPAIGNS: "Sync campaigns",
};

export const ELIGIBILITY_LABELS: Record<string, string> = {
  ok: "Eligible",
  too_far: "Too far (below RSSI threshold)",
  quiet_hours: "Quiet hours",
  cooldown: "Cooldown active",
  daily_limit: "Daily limit reached",
  campaign_limit: "Campaign limit reached",
};
