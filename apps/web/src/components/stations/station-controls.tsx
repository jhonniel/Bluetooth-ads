"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2, Loader2, Pencil, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AsyncMultiSelect, type Option } from "@/components/common/async-select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteStationAction,
  issueCredentialAction,
  queueStationCommandAction,
  revokeCredentialAction,
  setStationCampaignsAction,
  updateStationDetailsAction,
} from "@/app/(dashboard)/stations/actions";
import { searchCampaignsAction } from "@/app/(dashboard)/search-actions";
import { CredentialRevealDialog } from "./credential-reveal-dialog";

/**
 * Remote control goes through the authenticated command queue: the dashboard records intent and the
 * agent executes it on its next poll, then reports the actual result.
 */
export function StationCommandButtons({ code, advertisingEnabled, canCommand }: { code: string; advertisingEnabled: boolean; canCommand: boolean }) {
  if (!canCommand) return null;
  return (
    <>
      {advertisingEnabled ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Square /> Stop advertising
            </Button>
          }
          title="Stop advertising on this station?"
          description="Advertising is disabled for this station and a stop command is queued. The agent applies it on its next poll and reports the result in the command history."
          confirmLabel="Queue stop command"
          successMessage="Stop command queued. Waiting for the agent to acknowledge."
          onConfirm={() => queueStationCommandAction(code, "STOP_ADVERTISING")}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button>
              <Play /> Start advertising
            </Button>
          }
          title="Start advertising on this station?"
          description="Advertising is enabled and a start command is queued. The agent broadcasts the highest-priority live campaign assigned to this station, if any."
          confirmLabel="Queue start command"
          successMessage="Start command queued. Waiting for the agent to acknowledge."
          onConfirm={() => queueStationCommandAction(code, "START_ADVERTISING")}
        />
      )}
      <ConfirmDialog
        trigger={
          <Button variant="outline">
            <RefreshCw /> Sync now
          </Button>
        }
        title="Request campaign sync?"
        description="Queues a command asking the agent to re-fetch its configuration and active campaign immediately."
        confirmLabel="Queue sync"
        successMessage="Sync command queued."
        onConfirm={() => queueStationCommandAction(code, "SYNC_CAMPAIGNS")}
      />
    </>
  );
}

export function DeleteStationButton({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive">
          <Trash2 /> Remove
        </Button>
      }
      title={`Remove "${name}"?`}
      description="All credentials are revoked immediately, so the agent can no longer connect. Logs and analytics for this station are retained."
      confirmLabel="Remove station"
      destructive
      successMessage="Station removed."
      onConfirm={async () => {
        const result = await deleteStationAction(code);
        if (result.ok) router.push("/stations");
        return result;
      }}
    />
  );
}

export function EditStationDetailsDialog({ code, name, location }: { code: string; name: string; location: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name, location: location ?? "" });
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateStationDetailsAction(code, values);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Station updated.");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit station</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-name">Station name</FieldLabel>
            <Input id="edit-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} maxLength={120} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-location">Location / branch</FieldLabel>
            <Input id="edit-location" value={values.location} onChange={(e) => setValues({ ...values, location: e.target.value })} maxLength={255} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || values.name.trim().length < 2}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StationCampaignsDialog({ code, initial }: { code: string; initial: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option[]>(initial);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await setStationCampaignsAction(
        code,
        selected.map((o) => o.value),
      );
      if (!result.ok) return void toast.error(result.error);
      toast.success("Campaign assignments updated.");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(initial);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 /> Assign campaigns
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign campaigns</DialogTitle>
          <DialogDescription>The station broadcasts the highest-priority live campaign among those assigned, unless one is pinned in its Bluetooth configuration.</DialogDescription>
        </DialogHeader>
        <AsyncMultiSelect value={selected} onChange={setSelected} search={searchCampaignsAction} placeholder="Add campaigns…" searchPlaceholder="Campaign name" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssueCredentialDialog({ code, serverUrl, hasActive }: { code: string; serverUrl: string; hasActive: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expires, setExpires] = useState("never");
  const [revokeExisting, setRevokeExisting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const issue = () =>
    startTransition(async () => {
      const result = await issueCredentialAction(code, {
        expiresInDays: expires === "never" ? null : Number(expires),
        revokeExisting: hasActive && revokeExisting,
      });
      if (!result.ok) return void toast.error(result.error);
      setOpen(false);
      setToken(result.data.token);
      router.refresh();
    });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <KeyRound /> {hasActive ? "Rotate credential" : "Generate credential"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasActive ? "Rotate station credential" : "Generate station credential"}</DialogTitle>
            <DialogDescription>A new random token is generated. Only its SHA-256 hash is stored.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Expiry</FieldLabel>
              <Select value={expires} onValueChange={setExpires}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Does not expire</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Expired credentials are rejected; rotate before expiry to avoid downtime.</FieldDescription>
            </Field>
            {hasActive ? (
              <Field orientation="horizontal">
                <Checkbox id="revoke-existing" checked={revokeExisting} onCheckedChange={(v) => setRevokeExisting(v === true)} />
                <FieldLabel htmlFor="revoke-existing" className="font-normal">
                  Revoke existing credentials immediately
                </FieldLabel>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={issue} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {token ? <CredentialRevealDialog open token={token} stationCode={code} serverUrl={serverUrl} onClose={() => setToken(null)} /> : null}
    </>
  );
}

export function RevokeCredentialButton({ code, credentialId, prefix }: { code: string; credentialId: string; prefix: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          Revoke
        </Button>
      }
      title={`Revoke credential ${prefix}…?`}
      description="The agent using this credential is rejected on its next request."
      confirmLabel="Revoke"
      destructive
      successMessage="Credential revoked."
      onConfirm={() => revokeCredentialAction(code, credentialId)}
    />
  );
}
