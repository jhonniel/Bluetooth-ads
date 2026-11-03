"use server";

import { revalidatePath } from "next/cache";
import type { AdvertisementInput, CampaignInput } from "@bpa/shared";
import { runAction } from "@/lib/action-result";
import { requirePermission } from "@/server/authz";
import { campaignService } from "@/server/services/campaign-service";

export interface SaveCampaignPayload {
  uuid: string | null;
  campaign: CampaignInput;
  newAdvertisement: AdvertisementInput | null;
  activate: boolean;
}

export async function saveCampaignAction(payload: SaveCampaignPayload) {
  return runAction("campaigns.save", async () => {
    const user = await requirePermission("campaigns:write");
    const request = { campaign: payload.campaign, newAdvertisement: payload.newAdvertisement, activate: payload.activate };
    const campaign = payload.uuid ? await campaignService.update(user, payload.uuid, request) : await campaignService.create(user, request);
    revalidatePath("/campaigns");
    return { uuid: campaign.uuid };
  });
}

export async function campaignTransitionAction(uuid: string, action: "activate" | "pause" | "archive") {
  return runAction(`campaigns.${action}`, async () => {
    const user = await requirePermission("campaigns:write");
    if (action === "activate") await campaignService.activate(user, uuid);
    if (action === "pause") await campaignService.pause(user, uuid);
    if (action === "archive") await campaignService.archive(user, uuid);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${uuid}`);
  });
}

export async function deleteCampaignAction(uuid: string) {
  return runAction("campaigns.delete", async () => {
    const user = await requirePermission("campaigns:write");
    await campaignService.remove(user, uuid);
    revalidatePath("/campaigns");
  });
}
