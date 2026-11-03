"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { updateBluetoothConfigAction } from "@/app/(dashboard)/stations/actions";

const nullableInt = (min: number, max: number, label: string) =>
  z.number().int(`${label} must be a whole number.`).min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`).nullable();

const schema = z.object({
  advertisingEnabled: z.boolean(),
  advertisementFormat: z.enum(["MANUFACTURER_DATA", "IBEACON"]),
  manufacturerId: z.union([z.literal(""), z.string().trim().regex(/^(0x)?[0-9a-fA-F]{1,4}$/, "Enter a 16-bit hex identifier, e.g. 0x0A1B.")]),
  iBeaconMajor: z.number().int().min(0).max(65535),
  measuredPower: z.number().int().min(-127).max(20),
  txPowerDbm: nullableInt(-127, 20, "Transmit power"),
  advertisingIntervalMs: nullableInt(20, 10240, "Interval"),
  minRssi: nullableInt(-127, 0, "Minimum RSSI"),
  targetCampaignId: z.string(),
});
type Values = z.infer<typeof schema>;

function NumberField({
  id,
  label,
  description,
  value,
  onChange,
  error,
  placeholder,
  nullable = true,
}: {
  id: string;
  label: string;
  description: string;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  placeholder?: string;
  nullable?: boolean;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : Number.NaN) : Number(e.target.value))}
        aria-invalid={Boolean(error)}
      />
      <FieldDescription>{description}</FieldDescription>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function BluetoothConfigForm({
  code,
  initial,
  assignedCampaigns,
  defaults,
  readOnly,
}: {
  code: string;
  initial: Omit<Values, "targetCampaignId"> & { targetCampaignId: string | null };
  assignedCampaigns: { uuid: string; name: string }[];
  defaults: { manufacturerId: string; minRssi: number };
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { control, handleSubmit, formState, setError, register } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ...initial, targetCampaignId: initial.targetCampaignId ?? "auto" },
  });
  const format = useWatch({ control, name: "advertisementFormat" });
  const errors = formState.errors;

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateBluetoothConfigAction(code, {
        ...values,
        targetCampaignId: values.targetCampaignId === "auto" ? null : values.targetCampaignId,
      });
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values) setError(key as keyof Values, { message: messages[0] });
        }
        return void toast.error(result.error);
      }
      toast.success("Bluetooth configuration saved. The agent applies it on its next sync.");
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <Controller
          control={control}
          name="advertisingEnabled"
          render={({ field }) => (
            <Field orientation="horizontal" className="rounded-lg border p-4">
              <div className="flex-1 space-y-0.5">
                <FieldLabel htmlFor="adv-enabled">Advertising enabled</FieldLabel>
                <FieldDescription>When disabled the agent stops broadcasting. Start/stop buttons also toggle this.</FieldDescription>
              </div>
              <Switch id="adv-enabled" checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />

        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Controller
            control={control}
            name="advertisementFormat"
            render={({ field }) => (
              <Field>
                <FieldLabel>Advertisement format</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANUFACTURER_DATA">Manufacturer-specific data (BPA v1)</SelectItem>
                    <SelectItem value="IBEACON">iBeacon layout (for future iOS support)</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>Only a 16-byte beacon UUID and a 2-byte campaign key are broadcast. Content is fetched from the API.</FieldDescription>
              </Field>
            )}
          />
          {format === "MANUFACTURER_DATA" ? (
            <Field data-invalid={Boolean(errors.manufacturerId)}>
              <FieldLabel htmlFor="manufacturerId">Company identifier (manufacturer data)</FieldLabel>
              <Input id="manufacturerId" {...register("manufacturerId")} placeholder={`Default: ${defaults.manufacturerId}`} className="font-mono" />
              <FieldDescription>Your Bluetooth SIG-assigned company ID. Leave empty to use the system default. 0xFFFF is test-only.</FieldDescription>
              <FieldError>{errors.manufacturerId?.message}</FieldError>
            </Field>
          ) : (
            <Controller
              control={control}
              name="iBeaconMajor"
              render={({ field }) => (
                <NumberField
                  id="iBeaconMajor"
                  label="iBeacon major"
                  description="Groups stations (e.g. per branch). Minor carries the campaign key."
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? Number.NaN)}
                  error={errors.iBeaconMajor?.message}
                  nullable={false}
                />
              )}
            />
          )}
        </FieldGroup>

        {format === "IBEACON" ? (
          <Alert>
            <Info />
            <AlertDescription>
              iBeacon uses Apple&apos;s company identifier 0x004C as defined by the iBeacon specification. Production use is subject to Apple&apos;s iBeacon licence terms.
            </AlertDescription>
          </Alert>
        ) : null}

        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Controller
            control={control}
            name="measuredPower"
            render={({ field }) => (
              <NumberField
                id="measuredPower"
                label="Measured power at 1 m (dBm)"
                description="Calibrated RSSI at one metre, included in the payload for distance estimation."
                value={field.value}
                onChange={(v) => field.onChange(v ?? Number.NaN)}
                error={errors.measuredPower?.message}
                nullable={false}
              />
            )}
          />
          <Controller
            control={control}
            name="txPowerDbm"
            render={({ field }) => (
              <NumberField
                id="txPowerDbm"
                label="Preferred transmit power (dBm)"
                description="Applied only if the adapter supports it (Windows 10 2004+). Leave empty for the default."
                value={field.value}
                onChange={field.onChange}
                error={errors.txPowerDbm?.message}
                placeholder="Adapter default"
              />
            )}
          />
          <Controller
            control={control}
            name="advertisingIntervalMs"
            render={({ field }) => (
              <NumberField
                id="advertisingIntervalMs"
                label="Advertising interval (ms)"
                description="Windows does not expose interval control; the agent reports this as unsupported and the OS default is used."
                value={field.value}
                onChange={field.onChange}
                error={errors.advertisingIntervalMs?.message}
                placeholder="OS default"
              />
            )}
          />
          <Controller
            control={control}
            name="minRssi"
            render={({ field }) => (
              <NumberField
                id="minRssi"
                label="Minimum RSSI for notifications (dBm)"
                description="Proximity threshold the mobile app applies for this beacon. Leave empty to use the global setting."
                value={field.value}
                onChange={field.onChange}
                error={errors.minRssi?.message}
                placeholder={`Global: ${defaults.minRssi}`}
              />
            )}
          />
        </FieldGroup>

        <Controller
          control={control}
          name="targetCampaignId"
          render={({ field }) => (
            <Field data-invalid={Boolean(errors.targetCampaignId)}>
              <FieldLabel>Target campaign</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full md:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic (highest-priority live campaign)</SelectItem>
                  {assignedCampaigns.map((c) => (
                    <SelectItem key={c.uuid} value={c.uuid}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>A pinned campaign is broadcast while it is live; otherwise selection falls back to priority.</FieldDescription>
              <FieldError>{errors.targetCampaignId?.message}</FieldError>
            </Field>
          )}
        />

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save configuration
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
