import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { userService } from "@/server/services/user-service";

const credentialsSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await userService.verifyCredentials(parsed.data.email, parsed.data.password);
        if (!user) return null;
        return { id: user.uuid, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
