"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export interface LoginState {
  error: string | null;
  email: string;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");
  if (!email || !password) return { error: "Enter your email and password.", email };

  try {
    await signIn("credentials", {
      email,
      password,
      // Only allow same-site relative redirects.
      redirectTo: callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/dashboard",
    });
    return { error: null, email };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password, or too many attempts. Please try again.", email };
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
