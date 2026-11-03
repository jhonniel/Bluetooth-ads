import { advertisementInputSchema } from "@bpa/shared";

export interface AdvertisementDraft {
  name: string;
  title: string;
  message: string;
  description: string;
  imageUrl: string;
  landingUrl: string;
  ctaLabel: string;
}

export type AdvertisementDraftErrors = Partial<Record<keyof AdvertisementDraft, string>>;

export const emptyAdvertisementDraft: AdvertisementDraft = {
  name: "",
  title: "",
  message: "",
  description: "",
  imageUrl: "",
  landingUrl: "",
  ctaLabel: "",
};

/** Client-side validation with the same schema the server uses. */
export function validateAdvertisementDraft(draft: AdvertisementDraft): AdvertisementDraftErrors {
  const result = advertisementInputSchema.safeParse(draft);
  if (result.success) return {};
  const errors: AdvertisementDraftErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof AdvertisementDraft;
    errors[key] ??= issue.message;
  }
  return errors;
}
