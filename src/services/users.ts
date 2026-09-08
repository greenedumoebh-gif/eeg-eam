/** إدارة المستخدمين والدخول المحلي. */
import type { Repo } from "../data/repo.ts";
import type { Role, User } from "../domain/types.ts";
import { ROLES } from "../domain/types.ts";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { nextUserId } from "../domain/ids.ts";
import { hashPassword, newSalt, validatePassword, verifyPassword } from "../auth/password.ts";
import { log } from "./audit.ts";

export interface CreateUserInput {
  email: string;
  displayName: string;
  password?: string;
  roles: Role[];
  department?: string;
  supplierId?: string;
}

export async function createUser(
  repo: Repo,
  actor: User | { id: string; roles: Role[] },
  input: CreateUserInput,
): Promise<User> {
  require_(actor, "user:manage");
  const errors: Record<string, string> = {};
  if (!input.email?.includes("@")) errors.email = "بريد إلكتروني غير صالح";
  if (!input.displayName?.trim()) errors.displayName = "الاسم مطلوب";
  if (!input.roles?.length) errors.roles = "يجب اختيار دور واحد على الأقل";
  for (const r of input.roles ?? []) {
    if (!ROLES.includes(r)) errors.roles = `دور غير معروف: ${r}`;
  }
  if (input.password) {
    const pwErr = validatePassword(input.password);
    if (pwErr) errors.password = pwErr;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  if (await repo.users.byEmail(input.email)) {
    throw new ConflictError(`البريد ${input.email} مسجّل مسبقاً`);
  }

  const now = new Date().toISOString();
  const salt = newSalt();
  const user: User = {
    id: await nextUserId(repo),
    email: input.email.toLowerCase(),
    displayName: input.displayName.trim(),
    passwordSalt: input.password ? salt : "",
    passwordHash: input.password ? await hashPassword(input.password, salt) : "",
    roles: input.roles,
    department: input.department ?? "",
    supplierId: input.supplierId,
    isActive: true,
    createdAt: now,
    createdBy: actor.id,
    updatedAt: now,
    updatedBy: actor.id,
  };
  await repo.users.put(user.id, user);
  await log(
    repo,
    actor.id,
    "إنشاء مستخدم",
    "user",
    user.id,
    `${user.email} [${user.roles.join(",")}]`,
  );
  return user;
}

export class AuthError extends DomainError {
  constructor(message = "البريد الإلكتروني أو كلمة المرور غير صحيحة") {
    super(message, 401);
    this.name = "AuthError";
  }
}

export async function authenticate(repo: Repo, email: string, password: string): Promise<User> {
  const user = await repo.users.byEmail(email);
  if (!user || !user.isActive || !user.passwordHash) throw new AuthError();
  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) throw new AuthError();
  return user;
}

export async function changePassword(
  repo: Repo,
  actor: User,
  userId: string,
  newPassword: string,
): Promise<User> {
  if (actor.id !== userId) require_(actor, "user:manage");
  const user = await repo.users.get(userId);
  if (!user) throw new NotFoundError("المستخدم", userId);
  const err = validatePassword(newPassword);
  if (err) throw new ValidationError({ password: err });
  const salt = newSalt();
  const updated: User = {
    ...user,
    passwordSalt: salt,
    passwordHash: await hashPassword(newPassword, salt),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  await repo.users.put(userId, updated);
  await log(repo, actor.id, "تغيير كلمة المرور", "user", userId);
  return updated;
}

export async function setActive(
  repo: Repo,
  actor: User,
  userId: string,
  isActive: boolean,
): Promise<User> {
  require_(actor, "user:manage");
  const user = await repo.users.get(userId);
  if (!user) throw new NotFoundError("المستخدم", userId);
  const updated = { ...user, isActive, updatedAt: new Date().toISOString(), updatedBy: actor.id };
  await repo.users.put(userId, updated);
  await log(repo, actor.id, isActive ? "تفعيل مستخدم" : "إيقاف مستخدم", "user", userId);
  return updated;
}

/** نسخة آمنة للعرض — بلا أسرار */
export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    roles: u.roles,
    department: u.department,
    supplierId: u.supplierId,
    isActive: u.isActive,
  };
}

export async function listUsers(repo: Repo, actor: User) {
  require_(actor, "user:manage");
  return (await repo.users.list()).sort((a, b) => a.id.localeCompare(b.id)).map(publicUser);
}
