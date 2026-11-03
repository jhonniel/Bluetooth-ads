import type { Metadata } from "next";
import Link from "next/link";
import { RadioTower } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { BluetoothStatusBadge, StationStatusBadge } from "@/components/common/status-badge";
import { SearchInput } from "@/components/common/url-filters";
import { PageHeader } from "@/components/layout/page-header";
import { StationCreateDialog } from "@/components/stations/station-create-dialog";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { env } from "@/lib/env";
import { firstParam, parsePageRequest } from "@/lib/pagination";
import { can } from "@/lib/permissions";
import { requirePageUser } from "@/server/authz";
import { stationService } from "@/server/services/station-service";

export const metadata: Metadata = { title: "Bluetooth Stations" };
export const dynamic = "force-dynamic";

export default async function StationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("dashboard:read");
  const params = await searchParams;
  const q = firstParam(params.q)?.slice(0, 100);
  const result = await stationService.list(q, parsePageRequest(params));

  return (
    <>
      <PageHeader
        title="Bluetooth Stations"
        description="Windows PCs running the advertising agent. Status and Bluetooth state are reported by each agent's heartbeat."
        actions={
          can(user.role, "stations:write") ? (
            <StationCreateDialog canIssueCredentials={can(user.role, "stations:credentials")} serverUrl={env().APP_URL} />
          ) : null
        }
      />
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <SearchInput placeholder="Search by name, ID or location…" />
        </div>
        {result.items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={RadioTower} title={q ? "No stations match your search" : "No stations registered"} description="Register a station, then enroll the Windows agent with its credential." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Station</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bluetooth</TableHead>
                  <TableHead>Current campaign</TableHead>
                  <TableHead>Last heartbeat</TableHead>
                  <TableHead className="pr-4 text-right">Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((s) => (
                  <TableRow key={s.stationCode}>
                    <TableCell className="pl-4">
                      <Link href={`/stations/${s.stationCode}`} className="block font-medium hover:underline">
                        {s.name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{s.stationCode}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.location ?? "—"}</TableCell>
                    <TableCell>
                      <StationStatusBadge status={s.effectiveStatus} />
                    </TableCell>
                    <TableCell>
                      {s.lastHeartbeat ? <BluetoothStatusBadge status={s.bluetoothStatus} stale={s.effectiveStatus === "OFFLINE"} /> : <span className="text-sm text-muted-foreground">Never reported</span>}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm">
                      {s.currentCampaign && s.effectiveStatus !== "OFFLINE" ? (
                        <Link href={`/campaigns/${s.currentCampaign.uuid}`} className="hover:underline">
                          {s.currentCampaign.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <TimeAgo value={s.lastHeartbeat} />
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono text-xs text-muted-foreground">{s.softwareVersion ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} />
          </>
        )}
      </Card>
    </>
  );
}
