import type { Metadata } from "next";
import { Users } from "lucide-react";
import { USER_ROLES } from "@bpa/shared";
import { EmptyState } from "@/components/common/empty-state";
import { TimeAgo } from "@/components/common/misc";
import { Pagination } from "@/components/common/pagination";
import { SearchInput } from "@/components/common/url-filters";
import { PageHeader } from "@/components/layout/page-header";
import { CreateUserDialog, EditUserDialog } from "@/components/users/user-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, parsePageRequest } from "@/lib/pagination";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { requirePageUser } from "@/server/authz";
import { userService } from "@/server/services/user-service";

export const metadata: Metadata = { title: "Users & Permissions" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageUser("users:manage");
  const params = await searchParams;
  const q = firstParam(params.q)?.slice(0, 100);
  const result = await userService.list(q, parsePageRequest(params));

  return (
    <>
      <PageHeader title="Users & Permissions" description="Dashboard accounts and their roles. Station agents use separate credentials." actions={<CreateUserDialog />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-0 py-0 lg:col-span-2">
          <div className="border-b p-4">
            <SearchInput placeholder="Search name or email…" />
          </div>
          {result.items.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Users} title="No users found" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last sign-in</TableHead>
                    <TableHead className="pr-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((u) => (
                    <TableRow key={u.uuid}>
                      <TableCell className="pl-4">
                        <span className="block font-medium">
                          {u.name} {u.uuid === actor.uuid ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role.charAt(0) + u.role.slice(1).toLowerCase()}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.isActive ? "Active" : <span className="text-muted-foreground">Deactivated</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <TimeAgo value={u.lastLoginAt} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <EditUserDialog user={u} isSelf={u.uuid === actor.uuid} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} />
            </>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {USER_ROLES.map((role) => (
              <div key={role} className="space-y-1">
                <p className="text-sm font-medium">{role.charAt(0) + role.slice(1).toLowerCase()}</p>
                <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
