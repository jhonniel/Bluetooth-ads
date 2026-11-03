import type { Metadata } from "next";
import { Bluetooth } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  let target = "/dashboard";
  try {
    // Auth.js passes an absolute callback URL; keep only the path so redirects stay on this site.
    if (callbackUrl) target = new URL(callbackUrl, "http://local").pathname || "/dashboard";
  } catch {
    target = "/dashboard";
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bluetooth className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">Beacon Ads</h1>
          <p className="text-sm text-muted-foreground">Bluetooth proximity advertising platform</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your administrator account.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={target} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
