"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page could not be loaded"
      description={`An unexpected error occurred. Try again, and contact an administrator if it persists.${error.digest ? ` Reference: ${error.digest}` : ""}`}
      action={
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
