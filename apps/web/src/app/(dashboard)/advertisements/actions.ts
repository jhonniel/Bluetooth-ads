"use server";

import { revalidatePath } from "next/cache";
import type { AdvertisementInput } from "@bpa/shared";
import { runAction } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { requirePermission } from "@/server/authz";
import { advertisementService } from "@/server/services/advertisement-service";
import { storageService } from "@/server/services/storage-service";

export async function saveAdvertisementAction(uuid: string | null, input: AdvertisementInput) {
  return runAction("advertisements.save", async () => {
    const user = await requirePermission("advertisements:write");
    const ad = uuid ? await advertisementService.update(user, uuid, input) : await advertisementService.create(user, input);
    revalidatePath("/advertisements");
    return { uuid: ad.uuid };
  });
}

export async function deleteAdvertisementAction(uuid: string) {
  return runAction("advertisements.delete", async () => {
    const user = await requirePermission("advertisements:write");
    await advertisementService.remove(user, uuid);
    revalidatePath("/advertisements");
  });
}

export async function advertisementPreviewAction(uuid: string) {
  return runAction("advertisements.preview", async () => {
    await requirePermission("dashboard:read");
    const ad = await advertisementService.get(String(uuid));
    return { title: ad.title, message: ad.message, imageUrl: ad.imageUrl, ctaLabel: ad.ctaLabel };
  });
}

export async function uploadImageAction(formData: FormData) {
  return runAction("advertisements.upload", async () => {
    await requirePermission("advertisements:write");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose an image to upload.");
    return storageService.storeImage(file);
  });
}
