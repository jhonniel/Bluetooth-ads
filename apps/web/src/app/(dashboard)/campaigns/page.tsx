import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { CAMPAIGN_STATUSES, type CampaignStatus } from "@bpa/shared";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { CampaignStatusBadge } from "@/components/common/status-badge";
import { SearchInput, SelectFilter } from "@/components/common/url-filters";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { CAMPAIGN_STATUS_META } from "@/lib/labels";
import { firstParam, parsePageRequest } from "@/lib/pagination";
import { can } from "@/lib/permissions";
import { effectiveCampaignStatus } from "@/server/domain/campaign-rules";
import { requirePageUser } from "@/server/authz";
import { campaignService } from "@/server/services/campaign-service";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CampaignsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("dashboard:read");
  const params = await searchParams;
  const q = firstParam(params.q)?.slice(0, 100);
  const statusParam = firstParam(params.status);
  const status = CAMPAIGN_STATUSES.includes(statusParam as CampaignStatus) ? (statusParam as CampaignStatus) : undefined;
  const page = parsePageRequest(params);
  const result = await campaignService.list({ q, status }, page);
  const canWrite = can(user.role, "campaigns:write");
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Schedule promotions, choose their content and assign them to Bluetooth stations."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/campaigns/new">
                <Plus /> New campaign
              </Link>
            </Button>
          ) : null
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row">
          <SearchInput placeholder="Search campaigns…" />
          <SelectFilter param="status" allLabel="All statuses" options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: CAMPAIGN_STATUS_META[s].label }))} />
        </div>
        {result.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Megaphone}
              title={q || status ? "No campaigns match your filters" : "No campaigns yet"}
              description={q || status ? "Try a different search or status." : "Create a campaign to start advertising to nearby customers."}
              action={
                canWrite && !q && !status ? (
                  <Button asChild size="sm">
                    <Link href="/campaigns/new">Create campaign</Link>
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                  <TableHead className="text-right">Stations</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((c) => {
                  const effective = effectiveCampaignStatus(c, now);
                  return (
                    <TableRow key={c.uuid}>
                      <TableCell className="max-w-72 pl-4">
                        <Link href={`/campaigns/${c.uuid}`} className="block truncate font-medium hover:underline">
                          {c.name}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">{c.advertisement?.title ?? "No advertisement attached"}</span>
                      </TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={effective} />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {c.startAt || c.endAt ? `${formatDate(c.startAt)} – ${c.endAt ? formatDate(c.endAt) : "No end"}` : "Not scheduled"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.priority}</TableCell>
                      <TableCell className="text-right tabular-nums">{c._count.stations}</TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                        <TimeAgo value={c.updatedAt} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campaigns/${c.uuid}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} />
          </>
        )}
      </Card>
    </>
  );
}
