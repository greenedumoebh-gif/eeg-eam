/** الرقابة على الميزانية — الحجز عند الاعتماد والصرف عند الدفع. */
import type { Repo } from "../data/repo.ts";
import type { BudgetLine, User } from "../domain/types.ts";
import { ConflictError, NotFoundError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { log } from "./audit.ts";

export async function getBudgetLine(repo: Repo, id: string): Promise<BudgetLine> {
  const b = await repo.budgetLines.get(id);
  if (!b) throw new NotFoundError("بند الميزانية", id);
  return b;
}

export function available(line: BudgetLine): number {
  return Math.round((line.allocated - line.committed - line.spent) * 1000) / 1000;
}

export async function createBudgetLine(
  repo: Repo,
  actor: User,
  input: { id: string; name: string; fiscalYear: number; allocated: number },
): Promise<BudgetLine> {
  require_(actor, "budget:write");
  const now = new Date().toISOString();
  const line: BudgetLine = {
    id: input.id,
    name: input.name,
    fiscalYear: input.fiscalYear,
    allocated: input.allocated,
    committed: 0,
    spent: 0,
    isActive: true,
    createdAt: now,
    createdBy: actor.id,
    updatedAt: now,
    updatedBy: actor.id,
  };
  await repo.budgetLines.put(line.id, line);
  await log(repo, actor.id, "إنشاء بند ميزانية", "budget", line.id, `${input.allocated}`);
  return line;
}

/** التحقق من توفر سيولة كافية قبل تمرير أي طلب دفع */
export async function assertAvailable(
  repo: Repo,
  lineId: string,
  amount: number,
): Promise<BudgetLine> {
  const line = await getBudgetLine(repo, lineId);
  if (!line.isActive) throw new ConflictError(`بند الميزانية ${lineId} غير مفعّل`);
  if (available(line) < amount) {
    throw new ConflictError(
      `السيولة غير كافية في بند «${line.name}»: المتاح ${available(line)} والمطلوب ${amount}`,
    );
  }
  return line;
}

/** حجز المبلغ عند اعتماد الفاتورة */
export async function commit(
  repo: Repo,
  actor: string,
  lineId: string,
  amount: number,
): Promise<BudgetLine> {
  const line = await assertAvailable(repo, lineId, amount);
  const updated: BudgetLine = {
    ...line,
    committed: round3(line.committed + amount),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await repo.budgetLines.put(lineId, updated);
  await log(repo, actor, "حجز مالي", "budget", lineId, `${amount}`);
  return updated;
}

/** فك الحجز عند رفض الفاتورة أو إلغائها */
export async function release(
  repo: Repo,
  actor: string,
  lineId: string,
  amount: number,
): Promise<BudgetLine> {
  const line = await getBudgetLine(repo, lineId);
  const updated: BudgetLine = {
    ...line,
    committed: round3(Math.max(0, line.committed - amount)),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await repo.budgetLines.put(lineId, updated);
  await log(repo, actor, "فك حجز مالي", "budget", lineId, `${amount}`);
  return updated;
}

/** تحويل الحجز إلى صرف فعلي عند الدفع */
export async function spend(
  repo: Repo,
  actor: string,
  lineId: string,
  amount: number,
): Promise<BudgetLine> {
  const line = await getBudgetLine(repo, lineId);
  const updated: BudgetLine = {
    ...line,
    committed: round3(Math.max(0, line.committed - amount)),
    spent: round3(line.spent + amount),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await repo.budgetLines.put(lineId, updated);
  await log(repo, actor, "صرف فعلي", "budget", lineId, `${amount}`);
  return updated;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function listBudgetLines(repo: Repo): Promise<BudgetLine[]> {
  return (await repo.budgetLines.list()).sort((a, b) => a.id.localeCompare(b.id));
}
