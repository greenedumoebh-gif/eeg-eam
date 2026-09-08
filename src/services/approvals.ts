/**
 * محرك سير العمل المالي — صانع ← مراجع ← معتمد، ثم الصرف.
 *
 * قواعد الحوكمة المطبقة:
 *  - لا تدخل الفاتورة مسار الاعتماد إلا بعد نجاح المطابقة الثلاثية.
 *  - فصل المهام: لا يعتمد أحد خطوةً هو من قام بسابقتها.
 *  - يُحجز المبلغ على بند الميزانية لحظة الاعتماد النهائي، ويُحوَّل إلى صرف عند الدفع.
 *  - الرفض في أي خطوة يعيد الفاتورة إلى «مرفوضة» ويفك الحجز.
 */
import type { Repo } from "../data/repo.ts";
import type { Approval, ApprovalStep, Invoice, Payment, User } from "../domain/types.ts";
import { APPROVAL_STEPS, STEP_ROLE } from "../domain/types.ts";
import { ConflictError, NotFoundError } from "../domain/errors.ts";
import { require_, SegregationError } from "../domain/rbac.ts";
import { nextPaymentRef } from "../domain/ids.ts";
import { getInvoice, setInvoiceStatus, threeWayMatch } from "./invoices.ts";
import * as budget from "./budget.ts";
import { log } from "./audit.ts";

function stamp(actor: string) {
  const now = new Date().toISOString();
  return { createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
}

export async function chainOf(repo: Repo, invoiceRef: string): Promise<Approval[]> {
  return (await repo.approvals.list())
    .filter((a) => a.invoiceRef === invoiceRef)
    .sort((a, b) => a.order - b.order);
}

/**
 * تقديم الفاتورة للاعتماد. يبني مسار الاعتماد ويسجّل خطوة «الصانع» معتمدةً
 * باسم مقدّم الطلب، ثم يفتح خطوة «المراجع».
 */
export async function submitForApproval(
  repo: Repo,
  actor: User,
  invoiceRef: string,
): Promise<{ invoice: Invoice; chain: Approval[] }> {
  require_(actor, "invoice:submit");
  const inv = await getInvoice(repo, invoiceRef);
  if (inv.status !== "مسودة" && inv.status !== "مرفوضة") {
    throw new ConflictError(`الفاتورة في حالة «${inv.status}» ولا تقبل التقديم`);
  }

  const match = await threeWayMatch(repo, invoiceRef);
  if (!match.matched) {
    await setInvoiceStatus(repo, actor.id, invoiceRef, inv.status, { matchResult: match });
    const failed = match.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
    throw new ConflictError(`فشلت المطابقة الثلاثية — ${failed.join(" | ")}`);
  }

  // مسار جديد نظيف
  for (const old of await chainOf(repo, invoiceRef)) await repo.approvals.delete(old.id);

  const chain: Approval[] = [];
  APPROVAL_STEPS.forEach((step: ApprovalStep, i) => {
    chain.push({
      id: `AP-${invoiceRef}-${i + 1}`,
      invoiceRef,
      step,
      order: i + 1,
      requiredRole: STEP_ROLE[step],
      status: i === 0 ? "معتمد" : "بانتظار",
      actedBy: i === 0 ? actor.id : undefined,
      actedAt: i === 0 ? new Date().toISOString() : undefined,
      note: i === 0 ? "تقديم الطلب" : "",
      ...stamp(actor.id),
    });
  });
  for (const a of chain) await repo.approvals.put(a.id, a);

  const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "قيد الاعتماد", {
    matchResult: match,
  });
  await log(repo, actor.id, "تقديم فاتورة للاعتماد", "invoice", invoiceRef);
  return { invoice, chain };
}

/** الخطوة المفتوحة حالياً */
export async function currentStep(repo: Repo, invoiceRef: string): Promise<Approval | null> {
  const chain = await chainOf(repo, invoiceRef);
  return chain.find((a) => a.status === "بانتظار") ?? null;
}

export async function act(
  repo: Repo,
  actor: User,
  invoiceRef: string,
  decision: "معتمد" | "مرفوض",
  note = "",
): Promise<{ invoice: Invoice; chain: Approval[] }> {
  const inv = await getInvoice(repo, invoiceRef);
  if (inv.status !== "قيد الاعتماد") {
    throw new ConflictError(`الفاتورة في حالة «${inv.status}» ولا توجد خطوة اعتماد مفتوحة`);
  }
  const step = await currentStep(repo, invoiceRef);
  if (!step) throw new NotFoundError("خطوة الاعتماد", invoiceRef);

  require_(actor, step.step === "مراجع" ? "invoice:review" : "invoice:approve");
  if (!actor.roles.includes(step.requiredRole) && !actor.roles.includes("admin")) {
    throw new ConflictError(`هذه الخطوة تتطلب دور «${step.requiredRole}»`);
  }

  // فصل المهام: لا يعتمد أحد خطوةً سبق أن تصرّف في سابقتها
  const chain = await chainOf(repo, invoiceRef);
  const prior = chain.filter((a) => a.order < step.order);
  if (prior.some((a) => a.actedBy === actor.id)) {
    throw new SegregationError(
      `فصل المهام: لا يمكنك اعتماد خطوة «${step.step}» وقد تصرّفت في خطوة سابقة على الفاتورة نفسها`,
    );
  }

  const now = new Date().toISOString();
  await repo.approvals.put(step.id, {
    ...step,
    status: decision,
    actedBy: actor.id,
    actedAt: now,
    note,
    updatedAt: now,
    updatedBy: actor.id,
  });

  if (decision === "مرفوض") {
    for (const a of chain.filter((a) => a.order > step.order)) {
      await repo.approvals.put(a.id, {
        ...a,
        status: "متجاوَز",
        updatedAt: now,
        updatedBy: actor.id,
      });
    }
    const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "مرفوضة");
    await log(repo, actor.id, `رفض الفاتورة في خطوة ${step.step}`, "invoice", invoiceRef, note);
    return { invoice, chain: await chainOf(repo, invoiceRef) };
  }

  const next = await currentStep(repo, invoiceRef);
  if (next) {
    await log(repo, actor.id, `اعتماد خطوة ${step.step}`, "invoice", invoiceRef, note);
    return { invoice: inv, chain: await chainOf(repo, invoiceRef) };
  }

  // اكتمل المسار: حجز المبلغ ثم وسم الفاتورة معتمدة
  await budget.commit(repo, actor.id, inv.budgetLineId, inv.grandTotal);
  const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "معتمدة");
  await log(repo, actor.id, "اعتماد نهائي للفاتورة", "invoice", invoiceRef, note);
  return { invoice, chain: await chainOf(repo, invoiceRef) };
}

// ───────────────────────── الصرف ─────────────────────────

export async function pay(
  repo: Repo,
  actor: User,
  invoiceRef: string,
  input: { method?: Payment["method"]; bankReference?: string } = {},
): Promise<{ invoice: Invoice; payment: Payment }> {
  require_(actor, "payment:execute");
  const inv = await getInvoice(repo, invoiceRef);
  if (inv.status !== "معتمدة") {
    throw new ConflictError(`لا يمكن الصرف: الفاتورة في حالة «${inv.status}»`);
  }
  if (inv.paymentRef) throw new ConflictError(`الفاتورة مصروفة مسبقاً بالسند ${inv.paymentRef}`);

  // فصل المهام: من اعتمد نهائياً لا يصرف
  const chain = await chainOf(repo, invoiceRef);
  const finalStep = chain.find((a) => a.step === "معتمد");
  if (finalStep?.actedBy === actor.id && !actor.roles.includes("admin")) {
    throw new SegregationError("فصل المهام: لا يجوز أن يقوم المعتمد نفسه بتنفيذ الصرف");
  }

  const now = new Date().toISOString();
  const ref = await nextPaymentRef(repo);
  const payment: Payment = {
    ref,
    invoiceRef,
    supplierId: inv.supplierId,
    amount: inv.grandTotal,
    method: input.method ?? "تحويل بنكي",
    bankReference: input.bankReference ?? "",
    paidAt: now,
    budgetLineId: inv.budgetLineId,
    ...stamp(actor.id),
  };
  await repo.payments.put(ref, payment);
  await budget.spend(repo, actor.id, inv.budgetLineId, inv.grandTotal);
  const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "مصروفة", { paymentRef: ref });
  await log(repo, actor.id, "تنفيذ الصرف", "invoice", invoiceRef, `${ref} بمبلغ ${inv.grandTotal}`);
  return { invoice, payment };
}

/** الفواتير المنتظرة تصرّف هذا المستخدم */
export async function inbox(repo: Repo, user: User): Promise<Invoice[]> {
  const pending = (await repo.approvals.list()).filter((a) => a.status === "بانتظار");
  const mine = pending.filter((a) =>
    user.roles.includes(a.requiredRole) || user.roles.includes("admin")
  );
  const out: Invoice[] = [];
  for (const a of mine) {
    const inv = await repo.invoices.get(a.invoiceRef);
    if (inv && inv.status === "قيد الاعتماد") out.push(inv);
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}
