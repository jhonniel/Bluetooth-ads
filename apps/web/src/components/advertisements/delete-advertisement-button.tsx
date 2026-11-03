"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteAdvertisementAction } from "@/app/(dashboard)/advertisements/actions";

export function DeleteAdvertisementButton({ uuid, name }: { uuid: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive">
          <Trash2 /> Delete
        </Button>
      }
      title={`Delete "${name}"?`}
      description="The advertisement is removed from the library. This is blocked while draft, scheduled, active or paused campaigns still use it."
      confirmLabel="Delete advertisement"
      destructive
      successMessage="Advertisement deleted."
      onConfirm={async () => {
        const result = await deleteAdvertisementAction(uuid);
        if (result.ok) router.push("/advertisements");
        return result;
      }}
    />
  );
}
