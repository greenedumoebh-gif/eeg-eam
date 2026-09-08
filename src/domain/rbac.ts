/**
 * صلاحيات مبنية على الأدوار (RBAC)
 * كل عملية حساسة في النظام لها صلاحية مسماة، وكل دور يملك مجموعة صلاحيات.
 */
import type { Role, User } from "./types.ts";

export const PERMISSIONS = [
  // الأصول
  "asset:read",
  "asset:write",
  "assettype:write",
  "site:write",
  // العقود والموردين
  "contract:read",
  "contract:write",
  "supplier:read",
  "supplier:write",
  // البلاغات
  "ticket:read",
  "ticket:create",
  "ticket:assign",
  "ticket:close",
  // أوامر العمل
  "workorder:read",
  "workorder:write",
  "workorder:complete",
  "workorder:price", // تسعير أمر العمل (المبلغ المستحق)
  // المالية
  "invoice:read",
  "invoice:create",
  "invoice:submit",
  "invoice:review",
  "invoice:approve",
  "payment:execute",
  "budget:read",
  "budget:write",
  // النظام
  "user:manage",
  "audit:read",
] as const;

export type Permission = typeof PERMISSIONS[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,

  engineer: [
    "asset:read",
    "asset:write",
    "contract:read",
    "supplier:read",
    "ticket:read",
    "ticket:create",
    "ticket:assign",
    "ticket:close",
    "workorder:read",
    "workorder:write",
    "workorder:complete",
    "workorder:price",
    "invoice:read",
    "budget:read",
    "audit:read",
  ],

  technician: [
    "asset:read",
    "ticket:read",
    "workorder:read",
    "workorder:write",
    "workorder:complete",
  ],

  storekeeper: [
    "asset:read",
    "asset:write",
    "ticket:read",
    "workorder:read",
  ],

  accountant: [
    "asset:read",
    "contract:read",
    "supplier:read",
    "ticket:read",
    "workorder:read",
    "invoice:read",
    "invoice:create",
    "invoice:submit",
    "budget:read",
    "audit:read",
  ],

  finance_reviewer: [
    "contract:read",
    "supplier:read",
    "workorder:read",
    "invoice:read",
    "invoice:review",
    "budget:read",
    "audit:read",
  ],

  finance_approver: [
    "contract:read",
    "supplier:read",
    "workorder:read",
    "invoice:read",
    "invoice:approve",
    "payment:execute",
    "budget:read",
    "budget:write",
    "audit:read",
  ],

  supplier: [
    // بوابة المورد: يرى ما يخصه فقط — التصفية تتم في طبقة الخدمات
    "contract:read",
    "ticket:read",
    "workorder:read",
    "invoice:read",
  ],

  requester: [
    "asset:read",
    "ticket:read",
    "ticket:create",
  ],
};

export function permissionsOf(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function can(user: Pick<User, "roles">, perm: Permission): boolean {
  return permissionsOf(user.roles).has(perm);
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(perm: Permission) {
    super(`لا تملك الصلاحية المطلوبة: ${perm}`);
    this.name = "ForbiddenError";
  }
}

export function require_(user: Pick<User, "roles">, perm: Permission): void {
  if (!can(user, perm)) throw new ForbiddenError(perm);
}

/** فصل المهام: لا يجوز أن يعتمد الشخص نفسه ما صنعه */
export class SegregationError extends Error {
  readonly status = 409;
  constructor(msg: string) {
    super(msg);
    this.name = "SegregationError";
  }
}
