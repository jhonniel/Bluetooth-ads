import "server-only";
import bcrypt from "bcryptjs";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { paginate, type PageRequest } from "@/lib/pagination";
import { rateLimiter } from "@/lib/rate-limit";
import { userCreateSchema, userUpdateSchema, type UserCreateInput, type UserUpdateInput } from "@/lib/validation/user";
import { prisma } from "@/lib/db";
import { userRepository } from "@/server/repositories/user-repository";
import { auditService } from "./audit-service";
import type { CurrentUser } from "@/server/authz";

const BCRYPT_ROUNDS = 12;
let dummyHash: Promise<string> | null = null;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const getDummyHash = () => (dummyHash ??= bcrypt.hash("unused-password-placeholder", BCRYPT_ROUNDS));

export const userService = {
  hashPassword(password: string) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  },

  /** Returns the user for valid credentials, or null. Limits guessing per email address. */
  async verifyCredentials(email: string, password: string) {
    const normalized = email.toLowerCase();
    const limiter = rateLimiter("login", 10, 15 * 60_000);
    if (!limiter.consume(normalized).allowed) return null;

    const user = await userRepository.findByEmail(normalized);
    const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid || !user.isActive) return null;
    await userRepository.touchLogin(user.id);
    return user;
  },

  async list(q: string | undefined, page: PageRequest) {
    const { items, total } = await userRepository.list({ q }, page);
    return paginate(items, total, page);
  },

  async create(actor: CurrentUser, input: UserCreateInput) {
    const data = userCreateSchema.parse(input);
    if (await userRepository.findByEmail(data.email)) {
      throw new ValidationError("A user with this email already exists.", { email: ["Email is already in use."] });
    }
    const user = await userRepository.create({
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: await this.hashPassword(data.password),
    });
    await auditService.record(actor, "user.created", { type: "user", id: user.uuid }, `Created user ${user.email} (${user.role})`);
    return user;
  },

  async update(actor: CurrentUser, uuid: string, input: UserUpdateInput) {
    const data = userUpdateSchema.parse(input);
    const existing = await userRepository.findByUuid(uuid);
    if (!existing) throw new NotFoundError("User not found.");

    if (existing.uuid === actor.uuid && (data.role !== "ADMIN" || !data.isActive)) {
      throw new ConflictError("You cannot remove your own administrator access.");
    }
    const losesAdmin = existing.role === "ADMIN" && existing.isActive && (data.role !== "ADMIN" || !data.isActive);

    return prisma.$transaction(async (tx) => {
      if (losesAdmin && (await userRepository.countActiveAdmins(tx)) <= 1) {
        throw new ConflictError("At least one active administrator is required.");
      }
      const user = await userRepository.update(
        uuid,
        {
          name: data.name,
          role: data.role,
          isActive: data.isActive,
          ...(data.password ? { passwordHash: await this.hashPassword(data.password) } : {}),
        },
        tx,
      );
      const changes = [
        existing.role !== data.role ? `role ${existing.role} -> ${data.role}` : null,
        existing.isActive !== data.isActive ? (data.isActive ? "activated" : "deactivated") : null,
        data.password ? "password reset" : null,
      ].filter(Boolean);
      await auditService.record(
        actor,
        "user.updated",
        { type: "user", id: uuid },
        `Updated user ${existing.email}${changes.length ? ` (${changes.join(", ")})` : ""}`,
        undefined,
        tx,
      );
      return user;
    });
  },
};
