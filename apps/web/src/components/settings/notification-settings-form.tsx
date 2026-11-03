"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { notificationSettingsSchema, type NotificationSettingsInput } from "@/lib/validation/settings";
import { updateNotificationSettingsAction } from "@/app/(dashboard)/settings/actions";
import { IntegerField } from "./form-helpers";

export function NotificationSettingsForm({ initial, readOnly, timezone }: { initial: NotificationSettingsInput; readOnly: boolean; timezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { control, handleSubmit, formState, register, setError } = useForm<NotificationSettingsInput>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: initial,
  });
  const quietEnabled = useWatch({ control, name: "quietHoursEnabled" });
  const duplicateEnabled = useWatch({ control, name: "duplicatePreventionEnabled" });
  const errors = formState.errors;

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateNotificationSettingsAction(values);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values) setError(key as keyof NotificationSettingsInput, { message: messages[0] });
        }
        return void toast.error(result.error);
      }
      toast.success("Notification settings saved.");
      router.refresh();
    }),
  );

  const int = (name: keyof NotificationSettingsInput, label: string, description: string, suffix?: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <IntegerField
          id={name}
          label={label}
          description={description}
          suffix={suffix}
          value={field.value as number}
          onChange={field.onChange}
          error={errors[name]?.message}
        />
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Frequency limits</CardTitle>
            <CardDescription>Defaults for every campaign. Campaigns can override cooldown and add their own daily limit.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-6 md:grid-cols-3">
              {int("defaultCooldownMinutes", "Default notification cooldown", "Minimum time before the same campaign notifies a device again.", "minutes")}
              {int("maxNotificationsPerDay", "Maximum notifications per user per day", "Cap across all campaigns, per anonymous device, per local day.", "per day")}
              {int("notificationExpirationMinutes", "Notification expiration", "The app discards notifications not shown within this time.", "minutes")}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proximity</CardTitle>
          </CardHeader>
          <CardContent>
            {int("minRssi", "Minimum RSSI threshold", "Beacons weaker than this (e.g. -75 dBm) are considered too far to notify. Stations can override.", "dBm")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quiet hours</CardTitle>
            <CardDescription>No notifications are marked eligible during quiet hours. Times use the system time zone ({timezone}).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Controller
              control={control}
              name="quietHoursEnabled"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch id="quiet" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="quiet" className="font-normal">
                    Enable quiet hours
                  </FieldLabel>
                </Field>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2 md:w-96">
              <Field data-invalid={Boolean(errors.quietHoursStart)}>
                <FieldLabel htmlFor="quiet-start">Start</FieldLabel>
                <Input id="quiet-start" type="time" {...register("quietHoursStart")} disabled={!quietEnabled || readOnly} />
                <FieldError>{errors.quietHoursStart?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.quietHoursEnd)}>
                <FieldLabel htmlFor="quiet-end">End</FieldLabel>
                <Input id="quiet-end" type="time" {...register("quietHoursEnd")} disabled={!quietEnabled || readOnly} />
                <FieldError>{errors.quietHoursEnd?.message}</FieldError>
              </Field>
            </div>
            <FieldDescription>Ranges may span midnight, for example 22:00 to 08:00.</FieldDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Duplicate prevention</CardTitle>
            <CardDescription>Ignores repeated identical event reports (same device, campaign and event type) within a time window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Controller
              control={control}
              name="duplicatePreventionEnabled"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch id="dupes" checked={field.value} onCheckedChange={field.onChange} />
                  <FieldLabel htmlFor="dupes" className="font-normal">
                    Prevent duplicate events
                  </FieldLabel>
                </Field>
              )}
            />
            {duplicateEnabled ? int("duplicateWindowSeconds", "Duplicate window", "Events inside this window are counted once.", "seconds") : null}
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
