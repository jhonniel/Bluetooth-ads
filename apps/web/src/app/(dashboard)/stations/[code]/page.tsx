import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Megaphone, XCircle } from "lucide-react";
import { stationCodeSchema, type BluetoothCapabilities } from "@bpa/shared";
import { CopyButton, LocalDateTime, TimeAgo } from "@/components/common/misc";
import { EmptyState } from "@/components/common/empty-state";
import { BluetoothStatusBadge, CampaignStatusBadge, CommandStatusBadge, StationStatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { BluetoothConfigForm } from "@/components/stations/bluetooth-config-form";
import {
  DeleteStationButton,
  EditStationDetailsDialog,
  IssueCredentialDialog,
  RevokeCredentialButton,
  StationCampaignsDialog,
  StationCommandButtons,
} from "@/components/stations/station-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { env } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";
import { formatCompanyId } from "@/lib/format";
import { BLUETOOTH_STATUS_META, COMMAND_TYPE_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { effectiveCampaignStatus } from "@/server/domain/campaign-rules";
import { requirePageUser } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";
import { stationService } from "@/server/services/station-service";

export const metadata: Metadata = { title: "Station" };
export const dynamic = "force-dynamic";

const TABS = ["overview", "bluetooth", "campaigns", "credentials", "activity"] as const;

function Detail({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm font-medium break-all", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}

function Capability({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
      {label}
    </li>
  );
}

function LogList({ logs }: { logs: { id: number; level: string; message: string; createdAt: Date; type: string }[] }) {
  if (logs.length === 0) return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  return (
    <ol className="space-y-3">
      {logs.map((log) => (
        <li key={log.id} className="flex items-start gap-3 text-sm">
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", log.level === "ERROR" ? "bg-destructive" : log.level === "WARN" ? "bg-warning" : "bg-info")} />
          <div className="min-w-0">
            <p>{log.message}</p>
            <p className="text-xs text-muted-foreground">
              {log.type.replaceAll("_", " ").toLowerCase()} · <TimeAgo value={log.createdAt} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function StationPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser("dashboard:read");
  const parsed = stationCodeSchema.safeParse(decodeURIComponent((await params).code));
  if (!parsed.success) notFound();
  const { tab } = await searchParams;
  const activeTab = TABS.includes(tab as (typeof TABS)[number]) ? tab! : "overview";

  const station = await stationService.get(parsed.data).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [preview, credentials, commands, advertisingLogs, connectionLogs, allLogs, system, notification] = await Promise.all([
    stationService.beaconPreview(station),
    stationService.listCredentials(station.id),
    stationService.recentCommands(station.id),
    stationService.logs(station.id, "advertising"),
    stationService.logs(station.id, "connection"),
    stationService.logs(station.id, "all"),
    settingsService.getSystemSettings(),
    settingsService.getNotificationSettings(),
  ]);

  const now = new Date();
  const offline = station.effectiveStatus === "OFFLINE";
  const capabilities = station.capabilities as BluetoothCapabilities | null;
  const activeCredentials = credentials.filter((c) => !c.revokedAt && (!c.expiresAt || c.expiresAt > now));
  const assigned = station.campaigns.map((c) => c.campaign);
  const canWrite = can(user.role, "stations:write");

  return (
    <>
      <PageHeader
        back={{ href: "/stations", label: "Bluetooth Stations" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {station.name}
            <StationStatusBadge status={station.effectiveStatus} />
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {station.stationCode}
            {station.location ? <span className="font-sans"> · {station.location}</span> : null}
          </span>
        }
        actions={
          <>
            <StationCommandButtons code={station.stationCode} advertisingEnabled={station.advertisingEnabled} canCommand={can(user.role, "stations:command")} />
            {canWrite ? <DeleteStationButton code={station.stationCode} name={station.name} /> : null}
          </>
        }
      />

      {activeCredentials.length === 0 ? (
        <Alert className="mb-6">
          <AlertTriangle />
          <AlertTitle>No active credential</AlertTitle>
          <AlertDescription>The Windows agent cannot connect until an administrator generates a credential on the Credentials tab.</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue={activeTab} className="gap-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bluetooth">Bluetooth configuration</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns ({assigned.length})</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Health</CardTitle>
                <CardDescription>Reported by the agent. A station is offline when no heartbeat arrives within {system.offlineThresholdSeconds}s.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-5 sm:grid-cols-3">
                  <Detail label="Device status">
                    <StationStatusBadge status={station.effectiveStatus} />
                  </Detail>
                  <Detail label="Bluetooth status">
                    {station.lastHeartbeat ? <BluetoothStatusBadge status={station.bluetoothStatus} stale={offline} /> : "Never reported"}
                  </Detail>
                  <Detail label="Desired state">{station.advertisingEnabled ? "Advertising enabled" : "Advertising disabled"}</Detail>
                  <Detail label="Last heartbeat">
                    <TimeAgo value={station.lastHeartbeat} />
                  </Detail>
                  <Detail label="Last connection">
                    <LocalDateTime value={station.lastConnectedAt} />
                  </Detail>
                  <Detail label="Advertising since">{station.advertisingStartedAt && !offline ? <TimeAgo value={station.advertisingStartedAt} /> : "—"}</Detail>
                  <Detail label="Current campaign">
                    {station.currentCampaign && !offline ? (
                      <Link href={`/campaigns/${station.currentCampaign.uuid}`} className="hover:underline">
                        {station.currentCampaign.name}
                      </Link>
                    ) : (
                      "None"
                    )}
                  </Detail>
                  <Detail label="Software version" mono>
                    {station.softwareVersion ?? "—"}
                  </Detail>
                  <Detail label="Config revision" mono>
                    {station.configRevision}
                  </Detail>
                </dl>
                {station.bluetoothError ? (
                  <Alert variant="destructive" className="mt-5">
                    <AlertTriangle />
                    <AlertTitle>{BLUETOOTH_STATUS_META[station.bluetoothStatus].label}</AlertTitle>
                    <AlertDescription>{station.bluetoothError}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Broadcast payload</CardTitle>
                <CardDescription>What the agent should publish right now, computed from configuration and live campaigns.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {preview.company.error ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertDescription>{preview.company.error}</AlertDescription>
                  </Alert>
                ) : null}
                {preview.company.usingTestId ? (
                  <Alert>
                    <AlertTriangle />
                    <AlertDescription>Using the Bluetooth SIG test company identifier 0xFFFF (development only).</AlertDescription>
                  </Alert>
                ) : null}
                <dl className="grid gap-5 sm:grid-cols-3">
                  <Detail label="Format">{station.advertisementFormat === "IBEACON" ? "iBeacon" : "Manufacturer data (BPA v1)"}</Detail>
                  <Detail label="Company identifier" mono>
                    {formatCompanyId(preview.company.companyId)}
                  </Detail>
                  <Detail label="Selected campaign">
                    {preview.selectedCampaign ? `${preview.selectedCampaign.name} (key ${preview.selectedCampaign.beaconKey})` : station.advertisingEnabled ? "No live campaign" : "Advertising disabled"}
                  </Detail>
                </dl>
                {preview.encoded ? (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Manufacturer data (after company ID)</span>
                      <span>{preview.encoded.totalAdvertisingBytes} / 31 bytes incl. flags</span>
                    </div>
                    <code className="font-mono text-xs break-all">{preview.encoded.dataHex.match(/.{2}/g)?.join(" ")}</code>
                  </div>
                ) : preview.encodeError ? (
                  <p className="text-sm text-destructive">{preview.encodeError}</p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Station information</CardTitle>
                {canWrite ? (
                  <CardAction>
                    <EditStationDetailsDialog code={station.stationCode} name={station.name} location={station.location} />
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <Detail label="Station ID" mono>
                    <span className="flex items-center gap-1">
                      {station.stationCode} <CopyButton value={station.stationCode} label="Copy station ID" />
                    </span>
                  </Detail>
                  <Detail label="Beacon UUID" mono>
                    <span className="flex items-center gap-1">
                      {station.beaconIdentifier} <CopyButton value={station.beaconIdentifier} label="Copy beacon UUID" />
                    </span>
                  </Detail>
                  <Detail label="Location">{station.location ?? "—"}</Detail>
                  <Detail label="Hostname">{station.hostname ?? "—"}</Detail>
                  <Detail label="Operating system">{station.osVersion ?? "—"}</Detail>
                  <Detail label="Registered">
                    <LocalDateTime value={station.createdAt} />
                  </Detail>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bluetooth hardware</CardTitle>
                <CardDescription>{capabilities?.adapterName ?? "Reported when the agent registers"}</CardDescription>
              </CardHeader>
              <CardContent>
                {capabilities ? (
                  <ul className="space-y-2">
                    <Capability ok={capabilities.adapterPresent} label="Bluetooth adapter present" />
                    <Capability ok={capabilities.lowEnergySupported} label="Bluetooth Low Energy" />
                    <Capability ok={capabilities.peripheralRoleSupported} label="Peripheral role (advertising)" />
                    <Capability ok={capabilities.extendedAdvertisingSupported} label="Extended advertising" />
                    <Capability ok={capabilities.radioState === "on"} label={`Radio ${capabilities.radioState}`} />
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">The agent has not registered yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bluetooth">
          <Card>
            <CardHeader>
              <CardTitle>Bluetooth configuration</CardTitle>
              <CardDescription>Delivered to the agent through the authenticated configuration API. Changes increase the config revision so the agent re-syncs.</CardDescription>
            </CardHeader>
            <CardContent>
              <BluetoothConfigForm
                code={station.stationCode}
                readOnly={!canWrite}
                assignedCampaigns={assigned.map((c) => ({ uuid: c.uuid, name: c.name }))}
                defaults={{ manufacturerId: formatCompanyId(system.defaultManufacturerId), minRssi: notification.minRssi }}
                initial={{
                  advertisingEnabled: station.advertisingEnabled,
                  advertisementFormat: station.advertisementFormat,
                  manufacturerId: station.manufacturerId === null ? "" : formatCompanyId(station.manufacturerId),
                  iBeaconMajor: station.iBeaconMajor,
                  measuredPower: station.measuredPower,
                  txPowerDbm: station.txPowerDbm,
                  advertisingIntervalMs: station.advertisingIntervalMs,
                  minRssi: station.minRssi,
                  targetCampaignId: station.targetCampaign?.uuid ?? null,
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card>
            <CardHeader>
              <CardTitle>Assigned campaigns</CardTitle>
              <CardDescription>Only one campaign is broadcast at a time: the pinned target if live, otherwise the highest priority live campaign.</CardDescription>
              {can(user.role, "campaigns:write") ? (
                <CardAction>
                  <StationCampaignsDialog code={station.stationCode} initial={assigned.map((c) => ({ value: c.uuid, label: c.name }))} />
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="px-0">
              {assigned.length === 0 ? (
                <div className="px-6">
                  <EmptyState icon={Megaphone} title="No campaigns assigned" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Priority</TableHead>
                      <TableHead className="text-right">Campaign key</TableHead>
                      <TableHead className="pr-6 text-right">Broadcast</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...assigned]
                      .sort((a, b) => b.priority - a.priority)
                      .map((c) => (
                        <TableRow key={c.uuid}>
                          <TableCell className="pl-6">
                            <Link href={`/campaigns/${c.uuid}`} className="font-medium hover:underline">
                              {c.name}
                            </Link>
                            {station.targetCampaign?.uuid === c.uuid ? (
                              <Badge variant="outline" className="ml-2">
                                Pinned
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <CampaignStatusBadge status={effectiveCampaignStatus(c, now)} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.priority}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{c.beaconKey}</TableCell>
                          <TableCell className="pr-6 text-right text-sm">
                            {preview.selectedCampaign?.uuid === c.uuid ? <span className="font-medium text-success">Selected</span> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credentials">
          <Card>
            <CardHeader>
              <CardTitle>Agent credentials</CardTitle>
              <CardDescription>Tokens authenticate the Windows agent. Only hashes are stored; tokens are shown once when issued.</CardDescription>
              {can(user.role, "stations:credentials") ? (
                <CardAction>
                  <IssueCredentialDialog code={station.stationCode} serverUrl={env().APP_URL} hasActive={activeCredentials.length > 0} />
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="px-0">
              {credentials.length === 0 ? (
                <p className="px-6 text-sm text-muted-foreground">No credentials issued.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Token prefix</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead className="pr-6 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credentials.map((c) => {
                      const state = c.revokedAt ? "Revoked" : c.expiresAt && c.expiresAt <= now ? "Expired" : "Active";
                      return (
                        <TableRow key={c.uuid}>
                          <TableCell className="pl-6 font-mono text-xs">{c.tokenPrefix}…</TableCell>
                          <TableCell>
                            <Badge variant={state === "Active" ? "default" : "secondary"}>{state}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <LocalDateTime value={c.createdAt} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.expiresAt ? <LocalDateTime value={c.expiresAt} /> : "Never"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <TimeAgo value={c.lastUsedAt} />
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            {state === "Active" && can(user.role, "stations:credentials") ? (
                              <RevokeCredentialButton code={station.stationCode} credentialId={c.uuid} prefix={c.tokenPrefix} />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Command history</CardTitle>
              <CardDescription>Commands are delivered when the agent polls and are marked succeeded or failed by the agent itself.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {commands.length === 0 ? (
                <p className="px-6 text-sm text-muted-foreground">No commands queued yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Command</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Queued</TableHead>
                      <TableHead>Executed</TableHead>
                      <TableHead className="pr-6">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commands.map((c) => (
                      <TableRow key={c.uuid}>
                        <TableCell className="pl-6 text-sm font-medium">
                          {COMMAND_TYPE_LABELS[c.commandType]}
                          <span className="block text-xs font-normal text-muted-foreground">{c.createdBy?.name ?? "System"}</span>
                        </TableCell>
                        <TableCell>
                          <CommandStatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <TimeAgo value={c.createdAt} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.executedAt ? <TimeAgo value={c.executedAt} /> : "—"}</TableCell>
                        <TableCell className="max-w-72 pr-6 text-sm whitespace-normal text-muted-foreground">{c.result ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Advertising history</CardTitle>
              </CardHeader>
              <CardContent>
                <LogList logs={advertisingLogs} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Connection log</CardTitle>
              </CardHeader>
              <CardContent>
                <LogList logs={connectionLogs} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>All recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                <LogList logs={allLogs.slice(0, 20)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
