"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Pause, Pencil, Play, Trash2 } from "lucide-react";
import type { CampaignStatus } from "@bpa/shared";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { campaignTransitionAction, deleteCampaignAction } from "@/app/(dashboard)/campaigns/actions";

export function CampaignActions({ uuid, name, status }: { uuid: string; name: string; status: CampaignStatus }) {
  const router = useRouter();
  const running = status === "ACTIVE" || status === "SCHEDULED";

  return (
    <>
      {status !== "ARCHIVED" ? (
        <Button variant="outline" asChild>
          <Link href={`/campaigns/${uuid}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      ) : null}
      {running ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Pause /> Pause
            </Button>
          }
          title="Pause this campaign?"
          description="Stations stop broadcasting this campaign on their next sync and the mobile API stops serving it."
          confirmLabel="Pause campaign"
          successMessage="Campaign paused."
          onConfirm={() => campaignTransitionAction(uuid, "pause")}
        />
      ) : status !== "ARCHIVED" ? (
        <ConfirmDialog
          trigger={
            <Button>
              <Play /> Activate
            </Button>
          }
          title="Activate this campaign?"
          description="The campaign becomes active immediately, or scheduled if its start date is in the future. Assigned stations pick it up on their next sync."
          confirmLabel="Activate"
          successMessage="Campaign activated."
          onConfirm={() => campaignTransitionAction(uuid, "activate")}
        />
      ) : null}
      {status !== "ARCHIVED" ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Archive /> Archive
            </Button>
          }
          title="Archive this campaign?"
          description="Archived campaigns stop serving and can no longer be edited or reactivated. Analytics are kept."
          confirmLabel="Archive"
          successMessage="Campaign archived."
          onConfirm={() => campaignTransitionAction(uuid, "archive")}
        />
      ) : null}
      <ConfirmDialog
        trigger={
          <Button variant="destructive">
            <Trash2 /> Delete
          </Button>
        }
        title={`Delete "${name}"?`}
        description="The campaign is removed from the dashboard and stops serving immediately. Reported analytics events are preserved for reporting and audit."
        confirmLabel="Delete campaign"
        destructive
        successMessage="Campaign deleted."
        onConfirm={async () => {
          const result = await deleteCampaignAction(uuid);
          if (result.ok) router.push("/campaigns");
          return result;
        }}
      />
    </>
  );
}
