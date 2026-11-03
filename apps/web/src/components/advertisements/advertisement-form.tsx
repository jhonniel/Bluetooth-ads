"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type FieldErrors, type Resolver, type ResolverResult } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveAdvertisementAction } from "@/app/(dashboard)/advertisements/actions";
import { validateAdvertisementDraft, type AdvertisementDraft, type AdvertisementDraftErrors } from "./advertisement-draft";
import { AdvertisementFields } from "./advertisement-fields";
import { NotificationPreview } from "./notification-preview";

interface Values {
  ad: AdvertisementDraft;
}

const resolver: Resolver<Values> = async (values) => {
  const errors = validateAdvertisementDraft(values.ad);
  if (Object.keys(errors).length === 0) return { values, errors: {} } as ResolverResult<Values>;
  return {
    values: {},
    errors: { ad: Object.fromEntries(Object.entries(errors).map(([key, message]) => [key, { type: "validate", message }])) as FieldErrors<Values>["ad"] },
  } as ResolverResult<Values>;
};

export function AdvertisementForm({
  uuid,
  initial,
  readOnly,
  organizationName,
}: {
  uuid: string | null;
  initial: AdvertisementDraft;
  readOnly: boolean;
  organizationName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { control, handleSubmit, formState, setError } = useForm<Values>({ defaultValues: { ad: initial }, resolver });
  const ad = useWatch({ control, name: "ad" });

  const errors: AdvertisementDraftErrors = Object.fromEntries(
    Object.entries(formState.errors.ad ?? {}).map(([key, value]) => [key, (value as { message?: string } | undefined)?.message]),
  );

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveAdvertisementAction(uuid, values.ad);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values.ad) setError(`ad.${key as keyof AdvertisementDraft}`, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success("Advertisement saved.");
      if (!uuid) router.push(`/advertisements/${result.data.uuid}`);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3" noValidate>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={readOnly || pending} className="contents">
            <Controller control={control} name="ad" render={({ field }) => <AdvertisementFields value={field.value} onChange={field.onChange} errors={errors} />} />
          </fieldset>
        </CardContent>
      </Card>
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <NotificationPreview title={ad.title} message={ad.message} imageUrl={ad.imageUrl || null} ctaLabel={ad.ctaLabel || null} organizationName={organizationName} />
        {!readOnly ? (
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? <Loader2 className="animate-spin" /> : null}
              {uuid ? "Save changes" : "Create advertisement"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
