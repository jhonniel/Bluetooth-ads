"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createStationAction } from "@/app/(dashboard)/stations/actions";
import { CredentialRevealDialog } from "./credential-reveal-dialog";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  stationCode: z.union([z.literal(""), z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/, "Use 3-32 uppercase letters, digits or dashes.")]),
  location: z.string().max(255),
  beaconIdentifier: z.union([z.literal(""), z.guid("Enter a UUID, e.g. f7826da6-4fa2-4e98-8024-bc5b71e0893e.")]),
});
type Values = z.infer<typeof schema>;

export function StationCreateDialog({ canIssueCredentials, serverUrl }: { canIssueCredentials: boolean; serverUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState(canIssueCredentials);
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ token: string; stationCode: string } | null>(null);
  const { register, handleSubmit, formState, reset, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", stationCode: "", location: "", beaconIdentifier: "" },
  });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = await createStationAction(values, issue && canIssueCredentials);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (key in values) setError(key as keyof Values, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success("Station registered.");
      setOpen(false);
      reset();
      if (result.data.credential) {
        setRevealed({ token: result.data.credential.token, stationCode: result.data.stationCode });
      } else {
        router.push(`/stations/${result.data.stationCode}`);
      }
    }),
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogTrigger asChild>
          <Button>
            <Plus /> Register station
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <DialogHeader>
              <DialogTitle>Register advertising station</DialogTitle>
              <DialogDescription>Creates the station record. The Windows agent connects once it is enrolled with a credential.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={Boolean(formState.errors.name)}>
                <FieldLabel htmlFor="st-name">Station name</FieldLabel>
                <Input id="st-name" {...register("name")} placeholder="Makati Flagship - Entrance" />
                <FieldError>{formState.errors.name?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(formState.errors.location)}>
                <FieldLabel htmlFor="st-location">Location / branch</FieldLabel>
                <Input id="st-location" {...register("location")} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field data-invalid={Boolean(formState.errors.stationCode)}>
                  <FieldLabel htmlFor="st-code">Station ID</FieldLabel>
                  <Input id="st-code" {...register("stationCode", { setValueAs: (v: string) => v.toUpperCase() })} placeholder="Auto-generated" />
                  <FieldError>{formState.errors.stationCode?.message}</FieldError>
                </Field>
                <Field data-invalid={Boolean(formState.errors.beaconIdentifier)}>
                  <FieldLabel htmlFor="st-beacon">Beacon UUID</FieldLabel>
                  <Input id="st-beacon" {...register("beaconIdentifier")} placeholder="Auto-generated" />
                  <FieldError>{formState.errors.beaconIdentifier?.message}</FieldError>
                </Field>
              </div>
              {canIssueCredentials ? (
                <Field orientation="horizontal">
                  <Checkbox id="st-issue" checked={issue} onCheckedChange={(v) => setIssue(v === true)} />
                  <FieldLabel htmlFor="st-issue" className="font-normal">
                    Generate agent credentials now
                  </FieldLabel>
                </Field>
              ) : (
                <FieldDescription>An administrator must generate credentials before the agent can connect.</FieldDescription>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Register
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {revealed ? (
        <CredentialRevealDialog
          open
          token={revealed.token}
          stationCode={revealed.stationCode}
          serverUrl={serverUrl}
          onClose={() => {
            const code = revealed.stationCode;
            setRevealed(null);
            router.push(`/stations/${code}`);
          }}
        />
      ) : null}
    </>
  );
}
