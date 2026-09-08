/**
 * خدمات الفواتير — التوليد الآلي من أوامر العمل، والمطابقة الثلاثية.
 *
 * المطابقة الثلاثية (3-Way Matching):
 *   ١) العقد / أمر الشراء  — يوجد وساري ويعود لنفس المورد
 *   ٢) تقرير الإنجاز       — أمر العمل منجز فنياً ومربوط بالبلاغ
 *   ٣) فاتورة المورد        — مبلغها مطابق لمجموع أوامر العمل بعد الغرامات
 * ولا تُمرَّر أي فاتورة إلى مسار الاعتماد قبل نجاح المطابقة.
 */
import type { Repo } from "../data/repo.ts";
import type { Invoice, InvoiceStatus, MatchResult, User, WorkOrder } from "../domain/types.ts";
import { VAT_RATE } from "../domain/types.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { nextInvoiceRef } from "../domain/ids.ts";
import { isLive } from "./contracts.ts";
import { billableWorkOrders, markInvoiced } from "./workorders.ts";
import { assertAvailable } from "./budget.ts";
import { log } from "./audit.ts";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function getInvoice(repo: Repo, ref: string): Promise<Invoice> {
  const i = await repo.invoices.get(ref);
  if (!i) throw new NotFoundError("الفاتورة", ref);
  return i;
}

export interface DraftInvoiceInput {
  supplierId: string;
  workOrderRefs: string[];
  budgetLineId?: string;
  supplierInvoiceNo?: string;
  description?: string;
}

/**
 * إنشاء مسودة فاتورة من أوامر عمل منجزة.
 * المبلغ يُحسب من أوامر العمل نفسها — لا يُدخَل يدوياً — وهذا ما يغلق الثغرة المالية.
 */
export async function draftFromWorkOrders(
  repo: Repo,
  actor: User,
  input: DraftInvoiceInput,
): Promise<Invoice> {
  require_(actor, "invoice:create");
  if (!input.workOrderRefs.length) {
    throw new ValidationError({ workOrderRefs: "يجب اختيار أمر عمل واحد على الأقل" });
  }

  const wos: WorkOrder[] = [];
  for (const ref of input.workOrderRefs) {
    const w = await repo.workOrders.get(ref);
    if (!w) throw new NotFoundError("أمر العمل", ref);
    if (w.invoiceRef) throw new ConflictError(`أمر العمل ${ref} مفوتَر مسبقاً (${w.invoiceRef})`);
    if (w.status !== "منجز فنياً") {
      throw new ConflictError(`أمر العمل ${ref} غير منجز فنياً (${w.status})`);
    }
    if (w.underContract) {
      throw new ConflictError(`أمر العمل ${ref} مشمول بدفعات العقد الدورية ولا يُفوتَر منفرداً`);
    }
    if (w.supplierId !== input.supplierId) {
      throw new ConflictError(`أمر العمل ${ref} يعود لمورد آخر`);
    }
    wos.push(w);
  }

  const contractIds = [...new Set(wos.map((w) => w.contractId).filter(Boolean))] as string[];
  if (contractIds.length > 1) {
    throw new ConflictError("لا يمكن جمع أوامر عمل من عقود مختلفة في فاتورة واحدة");
  }
  const contractId = contractIds[0];
  const contract = contractId ? await repo.contracts.get(contractId) : null;

  const gross = round3(wos.reduce((s, w) => s + w.billableAmount, 0));
  const penalty = round3(wos.reduce((s, w) => s + w.penaltyAmount, 0));
  const net = round3(gross - penalty);
  const vat = round3(net * VAT_RATE);
  const total = round3(net + vat);

  const budgetLineId = input.budgetLineId ?? contract?.budgetLineId ?? "";
  if (!budgetLineId) {
    throw new ValidationError({ budgetLineId: "بند الميزانية مطلوب" });
  }
  await assertAvailable(repo, budgetLineId, total);

  const now = new Date().toISOString();
  const ref = await nextInvoiceRef(repo);
  const invoice: Invoice = {
    ref,
    supplierId: input.supplierId,
    contractId,
    basis: "أمر عمل",
    workOrderRefs: wos.map((w) => w.ref),
    description: input.description ??
      `أعمال صيانة: ${wos.map((w) => w.ref).join("، ")}`,
    amount: net,
    vatAmount: vat,
    penaltyAmount: penalty,
    grandTotal: total,
    issueDate: now,
    status: "مسودة",
    budgetLineId,
    supplierInvoiceNo: input.supplierInvoiceNo ?? "",
    createdAt: now,
    createdBy: actor.id,
    updatedAt: now,
    updatedBy: actor.id,
  };
  await repo.invoices.put(ref, invoice);
  for (const w of wos) await markInvoiced(repo, actor.id, w.ref, ref);

  await log(repo, actor.id, "إنشاء مسودة فاتورة", "invoice", ref, `الإجمالي ${total}`);
  return invoice;
}

/**
 * الفوترة الآلية: يمسح أوامر العمل المنجزة غير المفوتَرة ويجمعها بحسب المورد والعقد.
 * هذا ما كان يقوم به تدفق Power Automate «فوترة أوامر العمل» في النسخة السابقة.
 */
export async function autoInvoice(repo: Repo, actor: User): Promise<Invoice[]> {
  require_(actor, "invoice:create");
  const pending = await billableWorkOrders(repo);
  const groups = new Map<string, WorkOrder[]>();
  for (const w of pending) {
    if (!w.supplierId) continue;
    const key = `${w.supplierId}::${w.contractId ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(w);
    groups.set(key, arr);
  }
  const out: Invoice[] = [];
  for (const [key, wos] of groups) {
    const [supplierId] = key.split("::");
    try {
      out.push(
        await draftFromWorkOrders(repo, actor, {
          supplierId,
          workOrderRefs: wos.map((w) => w.ref),
        }),
      );
    } catch (err) {
      await log(
        repo,
        actor.id,
        "تعذّرت الفوترة الآلية",
        "supplier",
        supplierId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return out;
}

// ───────────────────────── المطابقة الثلاثية ─────────────────────────

export async function threeWayMatch(repo: Repo, ref: string): Promise<MatchResult> {
  const inv = await getInvoice(repo, ref);
  const checks: MatchResult["checks"] = [];

  // ١) الضلع التعاقدي
  if (inv.contractId) {
    const c = await repo.contracts.get(inv.contractId);
    if (!c) {
      checks.push({ name: "العقد", ok: false, detail: `العقد ${inv.contractId} غير موجود` });
    } else if (c.supplierId !== inv.supplierId) {
      checks.push({ name: "العقد", ok: false, detail: "العقد يعود لمورد مختلف عن مورد الفاتورة" });
    } else if (!isLive(c, inv.issueDate)) {
      checks.push({
        name: "العقد",
        ok: false,
        detail: `العقد ${c.id} غير ساري في تاريخ الفاتورة (${c.status})`,
      });
    } else {
      checks.push({ name: "العقد", ok: true, detail: `العقد ${c.id} ساري ومطابق للمورد` });
    }
  } else {
    checks.push({
      name: "العقد",
      ok: false,
      detail: "لا يوجد عقد أو أمر شراء مرجعي — يلزم استثناء معتمد",
    });
  }

  // ٢) ضلع الإنجاز
  let sumGross = 0, sumPenalty = 0;
  let deliveryOk = inv.workOrderRefs.length > 0;
  const problems: string[] = [];
  for (const woRef of inv.workOrderRefs) {
    const w = await repo.workOrders.get(woRef);
    if (!w) {
      deliveryOk = false;
      problems.push(`${woRef} غير موجود`);
      continue;
    }
    if (w.status !== "منجز فنياً" && w.status !== "مغلق") {
      deliveryOk = false;
      problems.push(`${woRef} غير منجز`);
    }
    if (!w.outcome?.trim()) {
      deliveryOk = false;
      problems.push(`${woRef} بلا تقرير إنجاز`);
    }
    if (w.invoiceRef && w.invoiceRef !== ref) {
      deliveryOk = false;
      problems.push(`${woRef} مربوط بفاتورة أخرى`);
    }
    sumGross += w.billableAmount;
    sumPenalty += w.penaltyAmount;
  }
  checks.push({
    name: "تقرير الإنجاز",
    ok: deliveryOk,
    detail: deliveryOk
      ? `${inv.workOrderRefs.length} أمر عمل منجز بتقارير مكتملة`
      : problems.join("؛ "),
  });

  // ٣) ضلع الفاتورة
  const expectedNet = round3(sumGross - sumPenalty);
  const expectedTotal = round3(expectedNet + round3(expectedNet * VAT_RATE));
  const amountOk = Math.abs(expectedTotal - inv.grandTotal) < 0.005;
  checks.push({
    name: "مبلغ الفاتورة",
    ok: amountOk,
    detail: amountOk
      ? `الإجمالي ${inv.grandTotal} مطابق لأوامر العمل`
      : `المتوقع ${expectedTotal} والمسجّل ${inv.grandTotal}`,
  });

  // الرقابة على الميزانية
  let budgetOk = true, budgetDetail = "";
  try {
    const line = await assertAvailable(repo, inv.budgetLineId, inv.grandTotal);
    budgetDetail = `سيولة كافية في بند «${line.name}»`;
  } catch (err) {
    budgetOk = false;
    budgetDetail = err instanceof Error ? err.message : String(err);
  }
  checks.push({ name: "توفر الميزانية", ok: budgetOk, detail: budgetDetail });

  return { matched: checks.every((c) => c.ok), checks, checkedAt: new Date().toISOString() };
}

export async function setInvoiceStatus(
  repo: Repo,
  actorId: string,
  ref: string,
  status: InvoiceStatus,
  extra: Partial<Invoice> = {},
): Promise<Invoice> {
  const inv = await getInvoice(repo, ref);
  const updated: Invoice = {
    ...inv,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: actorId,
  };
  await repo.invoices.put(ref, updated);
  await log(repo, actorId, `تغيير حالة الفاتورة إلى ${status}`, "invoice", ref);
  return updated;
}

export async function listInvoices(
  repo: Repo,
  filter?: { status?: string; supplierId?: string },
): Promise<Invoice[]> {
  let items = await repo.invoices.list();
  if (filter?.status) items = items.filter((i) => i.status === filter.status);
  if (filter?.supplierId) items = items.filter((i) => i.supplierId === filter.supplierId);
  return items.sort((a, b) => b.ref.localeCompare(a.ref));
}
