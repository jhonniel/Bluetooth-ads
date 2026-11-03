import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@bpa/shared";

/** Edge-safe configuration shared by the middleware. Must not import Prisma or Node-only modules. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isSignedIn = Boolean(auth?.user);
      if (request.nextUrl.pathname.startsWith("/login")) {
        return isSignedIn ? Response.redirect(new URL("/dashboard", request.nextUrl)) : true;
      }
      return isSignedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: UserRole }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
