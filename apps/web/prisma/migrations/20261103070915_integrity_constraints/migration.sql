-- Database-level guards for values that end up in BLE packets or drive notification limits.

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_beacon_key_range" CHECK ("beacon_key" BETWEEN 1 AND 65535),
  ADD CONSTRAINT "campaigns_priority_range" CHECK ("priority" BETWEEN 1 AND 100),
  ADD CONSTRAINT "campaigns_schedule_order" CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "end_at" > "start_at"),
  ADD CONSTRAINT "campaigns_cooldown_range" CHECK ("cooldown_minutes" IS NULL OR "cooldown_minutes" BETWEEN 0 AND 10080),
  ADD CONSTRAINT "campaigns_max_per_day_range" CHECK ("max_notifications_per_day" IS NULL OR "max_notifications_per_day" BETWEEN 1 AND 100);

ALTER TABLE "bluetooth_stations"
  ADD CONSTRAINT "stations_manufacturer_id_range" CHECK ("manufacturer_id" IS NULL OR "manufacturer_id" BETWEEN 0 AND 65535),
  ADD CONSTRAINT "stations_ibeacon_major_range" CHECK ("ibeacon_major" BETWEEN 0 AND 65535),
  ADD CONSTRAINT "stations_measured_power_range" CHECK ("measured_power" BETWEEN -127 AND 20),
  ADD CONSTRAINT "stations_tx_power_range" CHECK ("tx_power_dbm" IS NULL OR "tx_power_dbm" BETWEEN -127 AND 20),
  ADD CONSTRAINT "stations_min_rssi_range" CHECK ("min_rssi" IS NULL OR "min_rssi" BETWEEN -127 AND 0);

ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "system_settings_manufacturer_id_range" CHECK ("default_manufacturer_id" IS NULL OR "default_manufacturer_id" BETWEEN 0 AND 65535);

ALTER TABLE "notification_settings"
  ADD CONSTRAINT "notification_settings_singleton" CHECK ("id" = 1);

-- Only one live (non-deleted) station may use a given beacon identifier; identifiers are case-insensitive.
CREATE UNIQUE INDEX "bluetooth_stations_beacon_identifier_lower_key" ON "bluetooth_stations" (LOWER("beacon_identifier"));
