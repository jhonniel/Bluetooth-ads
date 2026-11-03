-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('ONLINE', 'OFFLINE', 'CONNECTING', 'ERROR');

-- CreateEnum
CREATE TYPE "BluetoothStatus" AS ENUM ('UNKNOWN', 'ADVERTISING', 'WAITING', 'STOPPED', 'NO_ADAPTER', 'UNSUPPORTED', 'RADIO_OFF', 'ERROR');

-- CreateEnum
CREATE TYPE "AdvertisementFormat" AS ENUM ('MANUFACTURER_DATA', 'IBEACON');

-- CreateEnum
CREATE TYPE "AdvertisingEventType" AS ENUM ('beacon_detected', 'notification_displayed', 'notification_clicked');

-- CreateEnum
CREATE TYPE "StationCommandType" AS ENUM ('START_ADVERTISING', 'STOP_ADVERTISING', 'SYNC_CAMPAIGNS');

-- CreateEnum
CREATE TYPE "StationCommandStatus" AS ENUM ('PENDING', 'DELIVERED', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StationLogType" AS ENUM ('REGISTERED', 'CONNECTED', 'DISCONNECTED', 'STATUS_CHANGED', 'ADVERTISING_STARTED', 'ADVERTISING_STOPPED', 'ADVERTISING_ERROR', 'COMMAND_QUEUED', 'COMMAND_COMPLETED', 'CREDENTIAL_ISSUED', 'CREDENTIAL_REVOKED', 'CONFIG_UPDATED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisements" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "title" VARCHAR(65) NOT NULL,
    "message" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(2048),
    "landing_url" VARCHAR(2048),
    "cta_label" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "beacon_key" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "advertisement_id" INTEGER,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 50,
    "cooldown_minutes" INTEGER,
    "max_notifications_per_day" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bluetooth_stations" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "station_code" VARCHAR(32) NOT NULL,
    "location" VARCHAR(255),
    "beacon_identifier" VARCHAR(36) NOT NULL,
    "status" "StationStatus" NOT NULL DEFAULT 'OFFLINE',
    "bluetooth_status" "BluetoothStatus" NOT NULL DEFAULT 'UNKNOWN',
    "bluetooth_error" VARCHAR(500),
    "last_heartbeat" TIMESTAMP(3),
    "last_connected_at" TIMESTAMP(3),
    "software_version" VARCHAR(32),
    "hostname" VARCHAR(255),
    "os_version" VARCHAR(255),
    "capabilities" JSONB,
    "advertising_started_at" TIMESTAMP(3),
    "advertising_enabled" BOOLEAN NOT NULL DEFAULT true,
    "advertisement_format" "AdvertisementFormat" NOT NULL DEFAULT 'MANUFACTURER_DATA',
    "manufacturer_id" INTEGER,
    "ibeacon_major" INTEGER NOT NULL DEFAULT 1,
    "measured_power" INTEGER NOT NULL DEFAULT -59,
    "tx_power_dbm" INTEGER,
    "advertising_interval_ms" INTEGER,
    "min_rssi" INTEGER,
    "target_campaign_id" INTEGER,
    "current_campaign_id" INTEGER,
    "config_revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bluetooth_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_stations" (
    "id" SERIAL NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "station_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertising_events" (
    "id" SERIAL NOT NULL,
    "campaign_id" INTEGER NOT NULL,
    "station_id" INTEGER,
    "event_type" "AdvertisingEventType" NOT NULL,
    "anonymous_device_token" VARCHAR(64) NOT NULL,
    "rssi" INTEGER,
    "platform" VARCHAR(16),
    "app_version" VARCHAR(32),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertising_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_commands" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "station_id" INTEGER NOT NULL,
    "command_type" "StationCommandType" NOT NULL,
    "payload" JSONB,
    "status" "StationCommandStatus" NOT NULL DEFAULT 'PENDING',
    "result" VARCHAR(1000),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "station_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_credentials" (
    "id" SERIAL NOT NULL,
    "uuid" UUID NOT NULL,
    "station_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_prefix" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "station_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_logs" (
    "id" SERIAL NOT NULL,
    "station_id" INTEGER NOT NULL,
    "type" "StationLogType" NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "summary" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_cooldown_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_notifications_per_day" INTEGER NOT NULL DEFAULT 3,
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" VARCHAR(5) NOT NULL DEFAULT '22:00',
    "quiet_hours_end" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "duplicate_prevention_enabled" BOOLEAN NOT NULL DEFAULT true,
    "duplicate_window_seconds" INTEGER NOT NULL DEFAULT 60,
    "min_rssi" INTEGER NOT NULL DEFAULT -75,
    "notification_expiration_minutes" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "organization_name" VARCHAR(120) NOT NULL DEFAULT 'My Organization',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "default_manufacturer_id" INTEGER,
    "default_advertisement_format" "AdvertisementFormat" NOT NULL DEFAULT 'MANUFACTURER_DATA',
    "heartbeat_interval_seconds" INTEGER NOT NULL DEFAULT 30,
    "command_poll_interval_seconds" INTEGER NOT NULL DEFAULT 15,
    "campaign_sync_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "offline_threshold_seconds" INTEGER NOT NULL DEFAULT 120,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_uuid_key" ON "users"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "advertisements_uuid_key" ON "advertisements"("uuid");

-- CreateIndex
CREATE INDEX "advertisements_deleted_at_idx" ON "advertisements"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_uuid_key" ON "campaigns"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_beacon_key_key" ON "campaigns"("beacon_key");

-- CreateIndex
CREATE INDEX "campaigns_status_start_at_end_at_idx" ON "campaigns"("status", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "campaigns_advertisement_id_idx" ON "campaigns"("advertisement_id");

-- CreateIndex
CREATE INDEX "campaigns_deleted_at_idx" ON "campaigns"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "bluetooth_stations_station_code_key" ON "bluetooth_stations"("station_code");

-- CreateIndex
CREATE UNIQUE INDEX "bluetooth_stations_beacon_identifier_key" ON "bluetooth_stations"("beacon_identifier");

-- CreateIndex
CREATE INDEX "bluetooth_stations_deleted_at_idx" ON "bluetooth_stations"("deleted_at");

-- CreateIndex
CREATE INDEX "bluetooth_stations_last_heartbeat_idx" ON "bluetooth_stations"("last_heartbeat");

-- CreateIndex
CREATE INDEX "campaign_stations_station_id_idx" ON "campaign_stations"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_stations_campaign_id_station_id_key" ON "campaign_stations"("campaign_id", "station_id");

-- CreateIndex
CREATE INDEX "advertising_events_occurred_at_idx" ON "advertising_events"("occurred_at");

-- CreateIndex
CREATE INDEX "advertising_events_campaign_id_occurred_at_idx" ON "advertising_events"("campaign_id", "occurred_at");

-- CreateIndex
CREATE INDEX "advertising_events_station_id_occurred_at_idx" ON "advertising_events"("station_id", "occurred_at");

-- CreateIndex
CREATE INDEX "advertising_events_event_type_occurred_at_idx" ON "advertising_events"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "advertising_events_anonymous_device_token_campaign_id_event_idx" ON "advertising_events"("anonymous_device_token", "campaign_id", "event_type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "station_commands_uuid_key" ON "station_commands"("uuid");

-- CreateIndex
CREATE INDEX "station_commands_station_id_status_created_at_idx" ON "station_commands"("station_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "station_credentials_uuid_key" ON "station_credentials"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "station_credentials_token_hash_key" ON "station_credentials"("token_hash");

-- CreateIndex
CREATE INDEX "station_credentials_station_id_idx" ON "station_credentials"("station_id");

-- CreateIndex
CREATE INDEX "station_logs_station_id_created_at_idx" ON "station_logs"("station_id", "created_at");

-- CreateIndex
CREATE INDEX "station_logs_type_created_at_idx" ON "station_logs"("type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertisement_id_fkey" FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bluetooth_stations" ADD CONSTRAINT "bluetooth_stations_target_campaign_id_fkey" FOREIGN KEY ("target_campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bluetooth_stations" ADD CONSTRAINT "bluetooth_stations_current_campaign_id_fkey" FOREIGN KEY ("current_campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_stations" ADD CONSTRAINT "campaign_stations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_stations" ADD CONSTRAINT "campaign_stations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "bluetooth_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertising_events" ADD CONSTRAINT "advertising_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertising_events" ADD CONSTRAINT "advertising_events_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "bluetooth_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_commands" ADD CONSTRAINT "station_commands_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "bluetooth_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_commands" ADD CONSTRAINT "station_commands_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_credentials" ADD CONSTRAINT "station_credentials_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "bluetooth_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_logs" ADD CONSTRAINT "station_logs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "bluetooth_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
