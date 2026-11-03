import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon, Images, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { SearchInput } from "@/components/common/url-filters";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, parsePageRequest } from "@/lib/pagination";
import { can } from "@/lib/permissions";
import { requirePageUser } from "@/server/authz";
import { advertisementService } from "@/server/services/advertisement-service";

export const metadata: Metadata = { title: "Advertisements" };
export const dynamic = "force-dynamic";

export default async function AdvertisementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("dashboard:read");
  const params = await searchParams;
  const q = firstParam(params.q)?.slice(0, 100);
  const result = await advertisementService.list(q, parsePageRequest(params));
  const canWrite = can(user.role, "advertisements:write");

  return (
    <>
      <PageHeader
        title="Advertisements"
        description="Reusable notification content. One advertisement can be used by many campaigns."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/advertisements/new">
                <Plus /> New advertisement
              </Link>
            </Button>
          ) : null
        }
      />
      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <SearchInput placeholder="Search by name or title…" />
        </div>
        {result.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Images}
              title={q ? "No advertisements match your search" : "No advertisements yet"}
              action={
                canWrite && !q ? (
                  <Button asChild size="sm">
                    <Link href="/advertisements/new">Create advertisement</Link>
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
                  <TableHead className="w-20 pl-4">
                    <span className="sr-only">Image</span>
                  </TableHead>
                  <TableHead>Advertisement</TableHead>
                  <TableHead>Call to action</TableHead>
                  <TableHead className="text-right">Campaigns</TableHead>
                  <TableHead className="pr-4 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((ad) => (
                  <TableRow key={ad.uuid}>
                    <TableCell className="pl-4">
                      <div className="flex aspect-[2/1] w-16 items-center justify-center overflow-hidden rounded border bg-muted/40">
                        {ad.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-provided hosts
                          <img src={ad.imageUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-96">
                      <Link href={`/advertisements/${ad.uuid}`} className="block truncate font-medium hover:underline">
                        {ad.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {ad.title} — {ad.message}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ad.ctaLabel ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{ad._count.campaigns}</TableCell>
                    <TableCell className="pr-4 text-right text-sm text-muted-foreground">
                      <TimeAgo value={ad.updatedAt} />
                    </TableCell>
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
