import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SystemSettingsForm } from "@/components/settings/system-settings-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { formatCompanyId } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePageUser } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "System Settings" };
export const dynamic = "force-dynamic";

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium">
        {warn ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}
        {value}
      </span>
    </div>
  );
}

export default async function SystemSettingsPage() {
  const user = await requirePageUser("dashboard:read");
  const settings = await settingsService.getSystemSettings();
  const config = env();
  const production = config.NODE_ENV === "production";

  return (
    <>
      <PageHeader title="System Settings" description="Organization, Bluetooth defaults and agent timing. Only administrators can change these settings." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SystemSettingsForm
            readOnly={!can(user.role, "settings:write")}
            initial={{
              organizationName: settings.organizationName,
              timezone: settings.timezone,
              defaultManufacturerId: settings.defaultManufacturerId === null ? "" : formatCompanyId(settings.defaultManufacturerId),
              defaultAdvertisementFormat: settings.defaultAdvertisementFormat,
              heartbeatIntervalSeconds: settings.heartbeatIntervalSeconds,
              commandPollIntervalSeconds: settings.commandPollIntervalSeconds,
              campaignSyncIntervalSeconds: settings.campaignSyncIntervalSeconds,
              offlineThresholdSeconds: settings.offlineThresholdSeconds,
            }}
          />
        </div>
        <div className="space-y-6">
          {production && config.ALLOW_TEST_COMPANY_ID ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Test company identifier allowed in production</AlertTitle>
              <AlertDescription>Set ALLOW_TEST_COMPANY_ID=false. 0xFFFF must not be used in shipping products.</AlertDescription>
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Runtime configuration</CardTitle>
              <CardDescription>From environment variables. Secrets are never displayed.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              <Row label="Environment" value={config.NODE_ENV} />
              <Row label="Public URL" value={config.APP_URL} />
              <Row label="Media storage" value={config.STORAGE_DRIVER === "s3" ? "S3-compatible (Spaces)" : "Local disk"} warn={production && config.STORAGE_DRIVER === "local"} />
              <Row label="Test company ID (0xFFFF)" value={config.ALLOW_TEST_COMPANY_ID ? "Allowed" : "Blocked"} warn={config.ALLOW_TEST_COMPANY_ID} />
              <Row label="Trust proxy headers" value={config.TRUST_PROXY ? "Yes" : "No"} warn={production && !config.TRUST_PROXY} />
              <Row label="Mobile event rate limit" value={`${config.MOBILE_EVENTS_RATE_LIMIT_PER_MINUTE}/min per IP`} />
              <Row label="Mobile API key" value="Configured" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
