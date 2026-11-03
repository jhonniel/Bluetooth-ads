import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // API routes authenticate themselves (session, station token or mobile API key); media is public.
  matcher: ["/((?!api|media|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
