/** خدمات الموردين والعقود — نقطة بداية السلسلة. */
import type { Repo } from "../data/repo.ts";
import type { Contract, ContractStatus, Supplier, User } from "../domain/types.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { nextContractId, nextSupplierId } from "../domain/ids.ts";
import { log } from "./audit.ts";

function stamp(actor: string) {
  const now = new Date().toISOString();
  return { createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
}

// ───────────────────────── الموردون ─────────────────────────

export async function createSupplier(
  repo: Repo,
  actor: User,
  input: Partial<Supplier> & { name: string },
): Promise<Supplier> {
  require_(actor, "supplier:write");
  const errors: Record<string, string> = {};
  if (!input.name?.trim()) errors.name = "اسم المورد مطلوب";
  if (input.email && !input.email.includes("@")) errors.email = "بريد إلكتروني غير صالح";
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const id = input.id ?? await nextSupplierId(repo);
  const supplier: Supplier = {
    id,
    name: input.name.trim(),
    commercialReg: input.commercialReg ?? "",
    contactName: input.contactName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    supplyScope: input.supplyScope ?? "",
    isActive: input.isActive ?? true,
    ...stamp(actor.id),
  };
  await repo.suppliers.put(id, supplier);
  await log(repo, actor.id, "إنشاء مورد", "supplier", id, supplier.name);
  return supplier;
}

export async function getSupplier(repo: Repo, id: string): Promise<Supplier> {
  const s = await repo.suppliers.get(id);
  if (!s) throw new NotFoundError("المورد", id);
  return s;
}

// ───────────────────────── العقود ─────────────────────────

export async function createContract(
  repo: Repo,
  actor: User,
  input: Partial<Contract> & {
    title: string;
    supplierId: string;
    startDate: string;
    expiryDate: string;
  },
): Promise<Contract> {
  require_(actor, "contract:write");
  const errors: Record<string, string> = {};
  if (!input.title?.trim()) errors.title = "عنوان العقد مطلوب";
  if (!input.supplierId) errors.supplierId = "المورد مطلوب";
  if (!input.startDate) errors.startDate = "تاريخ البدء مطلوب";
  if (!input.expiryDate) errors.expiryDate = "تاريخ الانتهاء مطلوب";
  if (input.startDate && input.expiryDate && input.expiryDate <= input.startDate) {
    errors.expiryDate = "تاريخ الانتهاء يجب أن يلي تاريخ البدء";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);

  await getSupplier(repo, input.supplierId);
  if (input.budgetLineId && !(await repo.budgetLines.get(input.budgetLineId))) {
    throw new NotFoundError("بند الميزانية", input.budgetLineId);
  }

  const id = input.id ?? await nextContractId(repo);
  const contract: Contract = {
    id,
    title: input.title.trim(),
    supplierId: input.supplierId,
    coveredTypes: input.coveredTypes ?? [],
    coveredSites: input.coveredSites ?? [],
    startDate: input.startDate,
    expiryDate: input.expiryDate,
    value: input.value ?? 0,
    status: input.status ?? "مسودة",
    billingBasis: input.billingBasis ?? "لكل أمر عمل",
    billingCycle: input.billingCycle,
    responseHours: input.responseHours ?? 24,
    penaltyRatePerDay: input.penaltyRatePerDay ?? 0,
    budgetLineId: input.budgetLineId ?? "",
    notes: input.notes ?? "",
    ...stamp(actor.id),
  };
  await repo.contracts.put(id, contract);
  await log(repo, actor.id, "إنشاء عقد", "contract", id, contract.title);
  return contract;
}

export async function getContract(repo: Repo, id: string): Promise<Contract> {
  const c = await repo.contracts.get(id);
  if (!c) throw new NotFoundError("العقد", id);
  return c;
}

export async function setContractStatus(
  repo: Repo,
  actor: User,
  id: string,
  status: ContractStatus,
): Promise<Contract> {
  require_(actor, "contract:write");
  const c = await getContract(repo, id);
  if (c.status === status) return c;
  if (status === "ساري" && !c.budgetLineId) {
    throw new ConflictError("لا يمكن تفعيل العقد قبل ربطه ببند ميزانية");
  }
  const updated: Contract = {
    ...c,
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  await repo.contracts.put(id, updated);
  await log(repo, actor.id, `تغيير حالة العقد إلى ${status}`, "contract", id);
  return updated;
}

/** هل العقد ساري في تاريخ معيّن؟ */
export function isLive(c: Contract, at: string): boolean {
  return c.status === "ساري" && c.startDate <= at && at <= c.expiryDate;
}

/**
 * إيجاد العقد الساري الذي يغطي نوع أصل في موقع معيّن.
 * هذه هي الآلية التي تربط «الأصول» بـ«المناقصات والعقود» تلقائياً.
 */
export async function findCoveringContract(
  repo: Repo,
  typeCode: string,
  siteCode: string,
  at: string = new Date().toISOString(),
): Promise<Contract | null> {
  const all = await repo.contracts.list();
  const candidates = all.filter((c) =>
    isLive(c, at) &&
    (c.coveredTypes.length === 0 || c.coveredTypes.includes(typeCode)) &&
    (c.coveredSites.length === 0 || c.coveredSites.includes(siteCode))
  );
  if (candidates.length === 0) return null;
  // الأدق أولاً: العقد المحدد بالنوع والموقع يسبق العقد الشامل
  candidates.sort((a, b) => {
    const spec = (c: Contract) => (c.coveredTypes.length ? 2 : 0) + (c.coveredSites.length ? 1 : 0);
    const d = spec(b) - spec(a);
    return d !== 0 ? d : a.expiryDate.localeCompare(b.expiryDate);
  });
  return candidates[0];
}

export async function listContracts(repo: Repo): Promise<Contract[]> {
  return (await repo.contracts.list()).sort((a, b) => a.id.localeCompare(b.id));
}

export async function listSuppliers(repo: Repo): Promise<Supplier[]> {
  return (await repo.suppliers.list()).sort((a, b) => a.id.localeCompare(b.id));
}
