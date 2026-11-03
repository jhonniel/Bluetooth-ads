"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AsyncMultiSelect, AsyncSelect, type Option } from "@/components/common/async-select";
import { DateTimePicker } from "@/components/common/date-time-picker";
import {
  emptyAdvertisementDraft,
  validateAdvertisementDraft,
  type AdvertisementDraft,
} from "@/components/advertisements/advertisement-draft";
import { AdvertisementFields } from "@/components/advertisements/advertisement-fields";
import { NotificationPreview } from "@/components/advertisements/notification-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { advertisementPreviewAction } from "@/app/(dashboard)/advertisements/actions";
import { saveCampaignAction } from "@/app/(dashboard)/campaigns/actions";
import { searchAdvertisementsAction, searchStationsAction } from "@/app/(dashboard)/search-actions";

const optionSchema = z.object({ value: z.string(), label: z.string(), description: z.string().nullish() });
const draftSchema = z.object({
  name: z.string(),
  title: z.string(),
  message: z.string(),
  description: z.string(),
  imageUrl: z.string(),
  landingUrl: z.string(),
  ctaLabel: z.string(),
});

const formSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required.").max(120),
    description: z.string().max(1000),
    adMode: z.enum(["existing", "new"]),
    advertisement: optionSchema.nullable(),
    newAd: draftSchema,
    startAt: z.date().nullable(),
    endAt: z.date().nullable(),
    priority: z.number({ error: "Enter a priority." }).int().min(1, "Minimum is 1.").max(100, "Maximum is 100."),
    cooldownMinutes: z.number().int().min(0).max(10080, "Maximum is 7 days.").nullable(),
    maxNotificationsPerDay: z.number().int().min(1).max(100).nullable(),
    stations: z.array(optionSchema),
  })
  .superRefine((values, ctx) => {
    if (values.startAt && values.endAt && values.endAt <= values.startAt) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "End must be after the start." });
    }
    if (values.adMode === "new") {
      const errors = validateAdvertisementDraft(values.newAd);
      for (const [key, message] of Object.entries(errors)) ctx.addIssue({ code: "custom", path: ["newAd", key], message });
    }
  });

export type CampaignFormValues = z.infer<typeof formSchema>;

export function CampaignForm({
  uuid,
  initial,
  isRunning,
  defaults,
  organizationName,
  initialPreview,
}: {
  uuid: string | null;
  initial?: Partial<CampaignFormValues>;
  isRunning: boolean;
  defaults: { cooldownMinutes: number; maxNotificationsPerDay: number };
  organizationName: string;
  initialPreview?: { title: string; message: string; imageUrl: string | null; ctaLabel: string | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [existingPreview, setExistingPreview] = useState(initialPreview ?? null);

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      adMode: "existing",
      advertisement: null,
      newAd: emptyAdvertisementDraft,
      startAt: null,
      endAt: null,
      priority: 50,
      cooldownMinutes: null,
      maxNotificationsPerDay: null,
      stations: [],
      ...initial,
    },
  });
  const { control, register, handleSubmit, formState, setError } = form;
  const adMode = useWatch({ control, name: "adMode" });
  const newAd = useWatch({ control, name: "newAd" });

  const submit = (activate: boolean) =>
    handleSubmit((values) =>
      startTransition(async () => {
        if (activate && values.adMode === "existing" && !values.advertisement) {
          setError("advertisement", { message: "Select an advertisement before activating." });
          return;
        }
        const result = await saveCampaignAction({
          uuid,
          activate,
          campaign: {
            name: values.name,
            description: values.description,
            advertisementId: values.adMode === "existing" ? (values.advertisement?.value ?? null) : null,
            startAt: values.startAt,
            endAt: values.endAt,
            priority: values.priority,
            cooldownMinutes: values.cooldownMinutes,
            maxNotificationsPerDay: values.maxNotificationsPerDay,
            stationCodes: values.stations.map((s) => s.value),
          },
          newAdvertisement: values.adMode === "new" ? values.newAd : null,
        });
        if (!result.ok) {
          const fieldMap: Record<string, keyof CampaignFormValues> = { stationCodes: "stations", advertisementId: "advertisement" };
          for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
            const field = fieldMap[key] ?? (key in values ? (key as keyof CampaignFormValues) : null);
            if (field) setError(field, { message: messages[0] });
          }
          toast.error(result.error);
          return;
        }
        toast.success(activate ? "Campaign saved and activated." : "Campaign saved.");
        router.push(`/campaigns/${result.data.uuid}`);
        router.refresh();
      }),
    );

  const errors = formState.errors;
  const newAdErrors = Object.fromEntries(
    Object.entries(errors.newAd ?? {}).map(([key, value]) => [key, (value as { message?: string } | undefined)?.message]),
  ) as Partial<Record<keyof AdvertisementDraft, string>>;
  const preview = adMode === "new" ? { title: newAd.title, message: newAd.message, imageUrl: newAd.imageUrl || null, ctaLabel: newAd.ctaLabel || null } : existingPreview;

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-6 lg:grid-cols-3" noValidate>
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaign details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="name">Campaign name</FieldLabel>
                <Input id="name" {...register("name")} maxLength={120} aria-invalid={Boolean(errors.name)} />
                <FieldError>{errors.name?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.description)}>
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <Textarea id="description" rows={3} {...register("description")} maxLength={1000} />
                <FieldError>{errors.description?.message}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Advertisement content</CardTitle>
            <CardDescription>The notification title, message, image and landing page shown to customers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Controller
              control={control}
              name="adMode"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "existing", label: "Use an existing advertisement", hint: "Reuse content shared across campaigns." },
                    { value: "new", label: "Create a new advertisement", hint: "Saved to the advertisement library." },
                  ].map((option) => (
                    <Label key={option.value} htmlFor={`mode-${option.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-muted/50">
                      <RadioGroupItem id={`mode-${option.value}`} value={option.value} className="mt-0.5" />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="block text-xs font-normal text-muted-foreground">{option.hint}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
            {adMode === "existing" ? (
              <Controller
                control={control}
                name="advertisement"
                render={({ field }) => (
                  <Field data-invalid={Boolean(errors.advertisement)}>
                    <FieldLabel htmlFor="advertisement">Advertisement</FieldLabel>
                    <AsyncSelect
                      id="advertisement"
                      value={field.value}
                      onChange={async (option) => {
                        field.onChange(option);
                        if (!option) return setExistingPreview(null);
                        const result = await advertisementPreviewAction(option.value);
                        setExistingPreview(result.ok ? result.data : null);
                      }}
                      search={searchAdvertisementsAction}
                      placeholder="Search advertisements…"
                      searchPlaceholder="Name or title"
                      invalid={Boolean(errors.advertisement)}
                    />
                    <FieldDescription>Required before the campaign can be activated.</FieldDescription>
                    <FieldError>{errors.advertisement?.message}</FieldError>
                  </Field>
                )}
              />
            ) : (
              <Controller
                control={control}
                name="newAd"
                render={({ field }) => <AdvertisementFields value={field.value} onChange={field.onChange} errors={newAdErrors} />}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Leave empty to start immediately on activation or run without an end date.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <Controller
              control={control}
              name="startAt"
              render={({ field }) => (
                <Field data-invalid={Boolean(errors.startAt)}>
                  <FieldLabel htmlFor="startAt">Start</FieldLabel>
                  <DateTimePicker id="startAt" value={field.value} onChange={field.onChange} invalid={Boolean(errors.startAt)} />
                  <FieldError>{errors.startAt?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="endAt"
              render={({ field }) => (
                <Field data-invalid={Boolean(errors.endAt)}>
                  <FieldLabel htmlFor="endAt">End</FieldLabel>
                  <DateTimePicker id="endAt" value={field.value} onChange={field.onChange} defaultTime="23:59" invalid={Boolean(errors.endAt)} />
                  <FieldError>{errors.endAt?.message}</FieldError>
                </Field>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery rules</CardTitle>
            <CardDescription>Leave limits empty to use the global notification settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3">
            {(
              [
                { name: "priority", label: "Priority", hint: "1 (lowest) to 100 (highest). Highest live campaign is broadcast.", placeholder: "50" },
                { name: "cooldownMinutes", label: "Notification cooldown (min)", hint: `Default: ${defaults.cooldownMinutes} min`, placeholder: String(defaults.cooldownMinutes) },
                { name: "maxNotificationsPerDay", label: "Max per user per day", hint: `Global cap: ${defaults.maxNotificationsPerDay}`, placeholder: String(defaults.maxNotificationsPerDay) },
              ] as const
            ).map((item) => (
              <Controller
                key={item.name}
                control={control}
                name={item.name}
                render={({ field }) => (
                  <Field data-invalid={Boolean(errors[item.name])}>
                    <FieldLabel htmlFor={item.name}>{item.label}</FieldLabel>
                    <Input
                      id={item.name}
                      type="number"
                      inputMode="numeric"
                      value={field.value ?? ""}
                      placeholder={item.placeholder}
                      onChange={(e) => field.onChange(e.target.value === "" ? (item.name === "priority" ? Number.NaN : null) : Number(e.target.value))}
                      aria-invalid={Boolean(errors[item.name])}
                    />
                    <FieldDescription>{item.hint}</FieldDescription>
                    <FieldError>{errors[item.name]?.message}</FieldError>
                  </Field>
                )}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bluetooth stations</CardTitle>
            <CardDescription>Stations that broadcast this campaign&apos;s beacon. At least one is required to activate.</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="stations"
              render={({ field }) => (
                <Field data-invalid={Boolean(errors.stations)}>
                  <AsyncMultiSelect
                    value={field.value as Option[]}
                    onChange={field.onChange}
                    search={searchStationsAction}
                    placeholder="Add stations…"
                    searchPlaceholder="Name, code or location"
                    invalid={Boolean(errors.stations)}
                  />
                  <FieldError>{errors.stations?.message}</FieldError>
                </Field>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {preview ? (
          <NotificationPreview title={preview.title} message={preview.message} imageUrl={preview.imageUrl} ctaLabel={preview.ctaLabel} organizationName={organizationName} />
        ) : (
          <NotificationPreview title="" message="" organizationName={organizationName} />
        )}
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isRunning
                ? "This campaign is running. Changes are picked up by stations on their next sync."
                : "Save as a draft to keep editing, or activate to start broadcasting at the scheduled time."}
            </p>
            <div className="flex flex-col gap-2">
              {!isRunning ? (
                <Button type="button" onClick={submit(true)} disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  Save and activate
                </Button>
              ) : null}
              <Button type="button" variant={isRunning ? "default" : "outline"} onClick={submit(false)} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {isRunning ? "Save changes" : uuid ? "Save changes" : "Save as draft"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
