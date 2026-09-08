/** خدمات أوامر العمل — التنفيذ، الإنجاز الفني، حساب غرامة التأخير، وتفعيل الفوترة. */
import type { Repo } from "../data/repo.ts";
import type { User, WorkOrder, WorkType } from "../domain/types.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { nextWorkOrderRef } from "../domain/ids.ts";
import { getTicket } from "./tickets.ts";
import { setAssetStatus } from "./assets.ts";
import { log } from "./audit.ts";

function stamp(actor: string) {
  const now = new Date().toISOString();
  return { createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
}

export async function getWorkOrder(repo: Repo, ref: string): Promise<WorkOrder> {
  const w = await repo.workOrders.get(ref);
  if (!w) throw new NotFoundError("أمر العمل", ref);
  return w;
}

export interface OpenWorkOrderInput {
  ticketRef: string;
  workType?: WorkType;
  technician?: string;
}

/** يفتح أمر عمل على بلاغ. بلاغ واحد ← أمر عمل واحد فعّال. */
export async function openWorkOrder(
  repo: Repo,
  actor: User,
  input: OpenWorkOrderInput,
): Promise<WorkOrder> {
  require_(actor, "workorder:write");
  const ticket = await getTicket(repo, input.ticketRef);
  if (ticket.status === "مغلق" || ticket.status === "ملغى") {
    throw new ConflictError(`البلاغ ${ticket.ref} في حالة «${ticket.status}»`);
  }
  if (ticket.workOrderRef) {
    const existing = await repo.workOrders.get(ticket.workOrderRef);
    if (existing && existing.status !== "ملغى") {
      throw new ConflictError(`للبلاغ أمر عمل قائم: ${existing.ref}`);
    }
  }

  const ref = await nextWorkOrderRef(repo);
  const wo: WorkOrder = {
    ref,
    ticketRef: ticket.ref,
    assetTag: ticket.assetTag,
    siteCode: ticket.siteCode,
    workType: input.workType ?? (ticket.isPreventive ? "صيانة وقائية" : "إصلاح"),
    technician: input.technician ?? actor.id,
    partsUsed: "",
    laborHours: 0,
    outcome: "",
    status: "مفتوح",
    startedAt: new Date().toISOString(),
    contractId: ticket.contractId,
    supplierId: ticket.supplierId,
    underContract: false,
    billableAmount: 0,
    penaltyAmount: 0,
    ...stamp(actor.id),
  };
  await repo.workOrders.put(ref, wo);

  await repo.tickets.put(ticket.ref, {
    ...ticket,
    workOrderRef: ref,
    status: ticket.status === "جديد" || ticket.status === "معيّن" ? "قيد التنفيذ" : ticket.status,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  });

  // الأصل يخرج من الخدمة أثناء الإصلاح
  const asset = await repo.assets.get(ticket.assetTag);
  if (asset && asset.status === "في الخدمة" && wo.workType !== "فحص") {
    await setAssetStatus(repo, actor, asset.tag, "تحت الصيانة");
  }

  await log(repo, actor.id, "فتح أمر عمل", "workorder", ref, `على البلاغ ${ticket.ref}`);
  return wo;
}

export interface CompleteWorkOrderInput {
  outcome: string;
  partsUsed?: string;
  laborHours?: number;
  /** المبلغ المستحق للمورد؛ يُتجاهل إذا كان العقد بدفعات دورية */
  billableAmount?: number;
}

/**
 * إنجاز أمر العمل فنياً. هنا يتحدد مصير الفوترة:
 *  - عقد «دفعات دورية»  ← underContract=true، لا فاتورة منفردة.
 *  - عقد «لكل أمر عمل» أو «مختلط» أو بلا عقد ← قابل للفوترة بمبلغه.
 * وتُحسب غرامة التأخير إن تجاوز الإنجاز موعد SLA.
 */
export async function completeWorkOrder(
  repo: Repo,
  actor: User,
  ref: string,
  input: CompleteWorkOrderInput,
): Promise<WorkOrder> {
  require_(actor, "workorder:complete");
  const wo = await getWorkOrder(repo, ref);
  if (wo.status === "مغلق" || wo.status === "ملغى") {
    throw new ConflictError(`أمر العمل ${ref} في حالة «${wo.status}»`);
  }
  if (!input.outcome?.trim()) {
    throw new ValidationError({ outcome: "نتيجة العمل مطلوبة" });
  }

  const ticket = await getTicket(repo, wo.ticketRef);
  const contract = wo.contractId ? await repo.contracts.get(wo.contractId) : null;
  const periodic = contract?.billingBasis === "دفعات دورية";

  const billable = periodic ? 0 : Math.max(0, input.billableAmount ?? 0);
  if (billable > 0) require_(actor, "workorder:price");

  // غرامة التأخير التعاقدية
  const now = new Date();
  let penalty = 0;
  if (contract && contract.penaltyRatePerDay > 0 && now.toISOString() > ticket.dueDate) {
    // أيام التأخير الكاملة، بحد أدنى يوم واحد عند أي تجاوز
    const lateDays = Math.max(
      1,
      Math.floor((now.getTime() - new Date(ticket.dueDate).getTime()) / (24 * 3600_000)),
    );
    penalty = Math.round(billable * contract.penaltyRatePerDay * lateDays * 100) / 100;
    penalty = Math.min(penalty, billable); // لا تتجاوز الغرامة قيمة العمل
  }

  const updated: WorkOrder = {
    ...wo,
    outcome: input.outcome.trim(),
    partsUsed: input.partsUsed ?? wo.partsUsed,
    laborHours: input.laborHours ?? wo.laborHours,
    status: "منجز فنياً",
    closedDate: now.toISOString(),
    underContract: periodic,
    billableAmount: billable,
    penaltyAmount: penalty,
    updatedAt: now.toISOString(),
    updatedBy: actor.id,
  };
  await repo.workOrders.put(ref, updated);
  await log(
    repo,
    actor.id,
    "إنجاز أمر عمل فنياً",
    "workorder",
    ref,
    periodic ? "مشمول بدفعات العقد الدورية" : `مبلغ مستحق: ${billable}`,
  );
  return updated;
}

/** يُستدعى بعد إصدار الفاتورة لمنع تكرار الفوترة */
export async function markInvoiced(
  repo: Repo,
  actor: string,
  ref: string,
  invoiceRef: string,
): Promise<WorkOrder> {
  const wo = await getWorkOrder(repo, ref);
  if (wo.invoiceRef && wo.invoiceRef !== invoiceRef) {
    throw new ConflictError(`أمر العمل ${ref} مفوتَر مسبقاً بالفاتورة ${wo.invoiceRef}`);
  }
  const updated: WorkOrder = {
    ...wo,
    invoiceRef,
    status: "مغلق",
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await repo.workOrders.put(ref, updated);
  await log(repo, actor, "ربط أمر العمل بفاتورة", "workorder", ref, invoiceRef);
  return updated;
}

/** أوامر العمل المنجزة القابلة للفوترة وغير المفوتَرة بعد */
export async function billableWorkOrders(repo: Repo, supplierId?: string): Promise<WorkOrder[]> {
  return (await repo.workOrders.list())
    .filter((w) =>
      w.status === "منجز فنياً" &&
      !w.invoiceRef &&
      !w.underContract &&
      w.billableAmount > 0 &&
      (!supplierId || w.supplierId === supplierId)
    )
    .sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function listWorkOrders(
  repo: Repo,
  filter?: { status?: string; supplierId?: string; assetTag?: string },
): Promise<WorkOrder[]> {
  let items = await repo.workOrders.list();
  if (filter?.status) items = items.filter((w) => w.status === filter.status);
  if (filter?.supplierId) items = items.filter((w) => w.supplierId === filter.supplierId);
  if (filter?.assetTag) items = items.filter((w) => w.assetTag === filter.assetTag);
  return items.sort((a, b) => b.ref.localeCompare(a.ref));
}
