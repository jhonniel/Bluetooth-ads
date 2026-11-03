"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action-result";
import type { UserCreateInput, UserUpdateInput } from "@/lib/validation/user";
import { requirePermission } from "@/server/authz";
import { userService } from "@/server/services/user-service";

export async function createUserAction(input: UserCreateInput) {
  return runAction("users.create", async () => {
    const actor = await requirePermission("users:manage");
    await userService.create(actor, input);
    revalidatePath("/users");
  });
}

export async function updateUserAction(uuid: string, input: UserUpdateInput) {
  return runAction("users.update", async () => {
    const actor = await requirePermission("users:manage");
    await userService.update(actor, uuid, input);
    revalidatePath("/users");
  });
}
