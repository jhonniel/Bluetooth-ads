"use client";

import { KeyRound, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/common/misc";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a newly issued station token exactly once. The token is never retrievable again. */
export function CredentialRevealDialog({
  open,
  onClose,
  token,
  stationCode,
  serverUrl,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  stationCode: string;
  serverUrl: string;
}) {
  const command = `bpa-agent enroll --server ${serverUrl} --station ${stationCode} --token ${token}`;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Station credential
          </DialogTitle>
          <DialogDescription>Enroll the Windows agent on the station with this token. It is stored only as a hash on the server.</DialogDescription>
        </DialogHeader>
        <Alert>
          <TriangleAlert />
          <AlertDescription>Copy it now. This token will not be shown again; issue a new credential if it is lost.</AlertDescription>
        </Alert>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Token</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 font-mono text-xs break-all">{token}</code>
              <CopyButton value={token} label="Copy token" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Enrollment command (run on the station as Administrator)</p>
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className="flex-1 font-mono text-xs break-all">{command}</code>
              <CopyButton value={command} label="Copy command" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I have saved the token</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
