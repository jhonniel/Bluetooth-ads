import type { Metadata } from "next";
import { AdvertisementForm } from "@/components/advertisements/advertisement-form";
import { emptyAdvertisementDraft } from "@/components/advertisements/advertisement-draft";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageUser } from "@/server/authz";
import { settingsService } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "New advertisement" };

export default async function NewAdvertisementPage() {
  await requirePageUser("advertisements:write");
  const system = await settingsService.getSystemSettings();
  return (
    <>
      <PageHeader title="New advertisement" back={{ href: "/advertisements", label: "Advertisements" }} />
      <AdvertisementForm uuid={null} initial={emptyAdvertisementDraft} readOnly={false} organizationName={system.organizationName} />
    </>
  );
}
