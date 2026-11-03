"use server";

import type { Option } from "@/components/common/async-select";
import { CAMPAIGN_STATUS_META } from "@/lib/labels";
import { requirePermission } from "@/server/authz";
import { advertisementService } from "@/server/services/advertisement-service";
import { campaignService } from "@/server/services/campaign-service";
import { stationService } from "@/server/services/station-service";

/** Autocomplete endpoints for pickers. Results are capped server-side; full lists are never sent. */
export async function searchStationsAction(q: string): Promise<Option[]> {
  await requirePermission("dashboard:read");
  const stations = await stationService.search(String(q ?? ""));
  return stations.map((s) => ({ value: s.stationCode, label: s.name, description: [s.stationCode, s.location].filter(Boolean).join(" · ") }));
}

export async function searchAdvertisementsAction(q: string): Promise<Option[]> {
  await requirePermission("dashboard:read");
  const ads = await advertisementService.search(String(q ?? ""));
  return ads.map((a) => ({ value: a.uuid, label: a.name, description: a.title }));
}

export async function searchCampaignsAction(q: string): Promise<Option[]> {
  await requirePermission("dashboard:read");
  const campaigns = await campaignService.search(String(q ?? ""));
  return campaigns.map((c) => ({ value: c.uuid, label: c.name, description: CAMPAIGN_STATUS_META[c.status].label }));
}
