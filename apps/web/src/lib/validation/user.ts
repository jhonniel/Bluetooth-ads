import { z } from "zod";
import { USER_ROLES } from "@bpa/shared";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200)
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  email: z.email("Enter a valid email address.").max(255),
  role: z.enum(USER_ROLES),
  password: passwordSchema,
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  password: z.union([z.literal(""), passwordSchema]).optional(),
});
export type UserUpdateInput = z.input<typeof userUpdateSchema>;
