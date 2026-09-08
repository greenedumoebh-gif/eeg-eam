/** توليد المراجع المتسلسلة — نمط موحّد: PREFIX-YYYY-NNNNN */
import type { Repo } from "../data/repo.ts";

function year(): number {
  return new Date().getUTCFullYear();
}

async function seq(repo: Repo, prefix: string, width: number): Promise<string> {
  const y = year();
  const n = await repo.nextSequence(`${prefix}-${y}`);
  return `${prefix}-${y}-${String(n).padStart(width, "0")}`;
}

export const nextTicketRef = (r: Repo) => seq(r, "TK", 5);
export const nextWorkOrderRef = (r: Repo) => seq(r, "WO", 5);
export const nextInvoiceRef = (r: Repo) => seq(r, "INV", 5);
export const nextPaymentRef = (r: Repo) => seq(r, "PAY", 5);
export const nextContractId = (r: Repo) => seq(r, "CN", 3);

export async function nextSupplierId(repo: Repo): Promise<string> {
  const n = await repo.nextSequence("SUP");
  return `SUP-${String(n).padStart(4, "0")}`;
}

export async function nextUserId(repo: Repo): Promise<string> {
  const n = await repo.nextSequence("USR");
  return `USR-${String(n).padStart(4, "0")}`;
}

/** رقم الأصل يتبع بادئة نوعه: COP-000001 */
export async function nextAssetTag(repo: Repo, tagPrefix: string): Promise<string> {
  const n = await repo.nextSequence(`ASSET-${tagPrefix}`);
  return `${tagPrefix}-${String(n).padStart(6, "0")}`;
}
