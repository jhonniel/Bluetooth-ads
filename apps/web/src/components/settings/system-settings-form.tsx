"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isValidTimeZone } from "@/lib/validation/settings";
import { updateSystemSettingsAction } from "@/app/(dashboard)/settings/actions";
import { IntegerField } from "./form-helpers";

const schema = z.object({
  organizationName: z.string().trim().min(2, "Name is required.").max(120),
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown IANA time zone."),
  defaultManufacturerId: z.union([z.literal(""), z.string().trim().regex(/^(0x)?[0-9a-fA-F]{1,4}$/, "Enter a 16-bit hex identifier, e.g. 0x0A1B.")]),
  defaultAdvertisementFormat: z.enum(["MANUFACTURER_DATA", "IBEACON"]),
  heartbeatIntervalSeconds: z.number().int().min(10).max(600),
  commandPollIntervalSeconds: z.number().int().min(5).max(600),
  campaignSyncIntervalSeconds: z.number().int().min(15).max(3600),
  offlineThresholdSeconds: z.number().int().min(30).max(3600),
});
type Values = z.infer<typeof schema>;

export function SystemSettingsForm({ initial, readOnly }: { initial: Values; readOnly: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timeZones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []), []);
  const { control, handleSubmit, formState, register, setError } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const errors = formState.errors;

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateSystemSettingsAction(values);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values) setError(key as keyof Values, { message: messages[0] });
        }
        return void toast.error(result.error);
      }
      toast.success("System settings saved.");
      router.refresh();
    }),
  );

  const int = (name: keyof Values, label: string, description: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <IntegerField id={name} label={label} description={description} suffix="seconds" value={field.value as number} onChange={field.onChange} error={errors[name]?.message} />
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-6 md:grid-cols-2">
              <Field data-invalid={Boolean(errors.organizationName)}>
                <FieldLabel htmlFor="org">Organization name</FieldLabel>
                <Input id="org" {...register("organizationName")} />
                <FieldError>{errors.organizationName?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.timezone)}>
                <FieldLabel htmlFor="tz">Time zone</FieldLabel>
                <Input id="tz" list="tz-list" {...register("timezone")} />
                <datalist id="tz-list">
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
                <FieldDescription>Used for daily limits, quiet hours and report buckets.</FieldDescription>
                <FieldError>{errors.timezone?.message}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bluetooth defaults</CardTitle>
            <CardDescription>Applied to stations that do not override them.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-6 md:grid-cols-2">
              <Field data-invalid={Boolean(errors.defaultManufacturerId)}>
                <FieldLabel htmlFor="company">Bluetooth SIG company identifier</FieldLabel>
                <Input id="company" {...register("defaultManufacturerId")} placeholder="e.g. 0x0A1B" className="font-mono" />
                <FieldDescription>
                  Required for manufacturer-data beacons in production. Obtain one from the Bluetooth SIG; never use another company&apos;s identifier.
                </FieldDescription>
                <FieldError>{errors.defaultManufacturerId?.message}</FieldError>
              </Field>
              <Controller
                control={control}
                name="defaultAdvertisementFormat"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Default format for new stations</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUFACTURER_DATA">Manufacturer-specific data (BPA v1)</SelectItem>
                        <SelectItem value="IBEACON">iBeacon layout</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent timing</CardTitle>
            <CardDescription>Delivered to agents in their configuration. Shorter intervals react faster but create more traffic.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-6 md:grid-cols-2">
              {int("heartbeatIntervalSeconds", "Heartbeat interval", "How often agents report health.")}
              {int("commandPollIntervalSeconds", "Command poll interval", "How often agents check for remote commands.")}
              {int("campaignSyncIntervalSeconds", "Campaign sync interval", "Periodic re-check of the active campaign, in addition to change notifications.")}
              {int("offlineThresholdSeconds", "Offline threshold", "A station without a heartbeat for this long is shown as offline.")}
            </FieldGroup>
          </CardContent>
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
