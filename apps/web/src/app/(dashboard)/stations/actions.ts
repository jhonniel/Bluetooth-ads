"use server";

import { revalidatePath } from "next/cache";
import { STATION_COMMAND_TYPES, type StationCommandType } from "@bpa/shared";
import { runAction } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import type { BluetoothConfigInput, CredentialIssueInput, StationCreateInput, StationDetailsInput } from "@/lib/validation/station";
import { requirePermission } from "@/server/authz";
import { stationService } from "@/server/services/station-service";

const refresh = (code?: string) => {
  revalidatePath("/stations");
  if (code) revalidatePath(`/stations/${code}`);
};

export async function createStationAction(input: StationCreateInput, issueCredential: boolean) {
  return runAction("stations.create", async () => {
    // Credential issuance is admin-only; managers can register stations and ask an admin for credentials.
    const user = await requirePermission(issueCredential ? "stations:credentials" : "stations:write");
    const station = await stationService.create(user, input);
    let credential: { token: string; expiresAt: Date | null } | null = null;
    if (issueCredential) {
      credential = await stationService.issueCredential(user, station.stationCode, { expiresInDays: null, revokeExisting: false });
    }
    refresh();
    return { stationCode: station.stationCode, credential };
  });
}

export async function updateStationDetailsAction(code: string, input: StationDetailsInput) {
  return runAction("stations.details", async () => {
    const user = await requirePermission("stations:write");
    await stationService.updateDetails(user, code, input);
    refresh(code);
  });
}

export async function updateBluetoothConfigAction(code: string, input: BluetoothConfigInput) {
  return runAction("stations.bluetooth", async () => {
    const user = await requirePermission("stations:write");
    await stationService.updateBluetoothConfig(user, code, input);
    refresh(code);
  });
}

export async function setStationCampaignsAction(code: string, campaignUuids: string[]) {
  return runAction("stations.campaigns", async () => {
    const user = await requirePermission("campaigns:write");
    await stationService.setCampaigns(user, code, campaignUuids);
    refresh(code);
  });
}

export async function issueCredentialAction(code: string, input: CredentialIssueInput) {
  return runAction("stations.credential.issue", async () => {
    const user = await requirePermission("stations:credentials");
    const result = await stationService.issueCredential(user, code, input);
    refresh(code);
    return { token: result.token, expiresAt: result.expiresAt };
  });
}

export async function revokeCredentialAction(code: string, credentialUuid: string) {
  return runAction("stations.credential.revoke", async () => {
    const user = await requirePermission("stations:credentials");
    await stationService.revokeCredential(user, code, credentialUuid);
    refresh(code);
  });
}

export async function queueStationCommandAction(code: string, type: StationCommandType) {
  return runAction("stations.command", async () => {
    const user = await requirePermission("stations:command");
    if (!STATION_COMMAND_TYPES.includes(type)) throw new ValidationError("Unknown command.");
    await stationService.queueCommand(user, code, type);
    refresh(code);
  });
}

export async function deleteStationAction(code: string) {
  return runAction("stations.delete", async () => {
    const user = await requirePermission("stations:write");
    await stationService.remove(user, code);
    refresh();
  });
}
