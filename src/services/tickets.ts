/** خدمات البلاغات — التوجيه الآلي للعقد الساري، وحساب SLA. */
import type { Repo } from "../data/repo.ts";
import type { Priority, Ticket, TicketStatus, User } from "../domain/types.ts";
import { PRIORITY_SLA_HOURS } from "../domain/types.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { nextTicketRef } from "../domain/ids.ts";
import { findCoveringContract } from "./contracts.ts";
import { getAsset, setAssetStatus } from "./assets.ts";
import { log } from "./audit.ts";

function stamp(actor: string) {
  const now = new Date().toISOString();
  return { createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
}

/** انتقالات الحالة المسموحة — آلة حالة صريحة تمنع القفزات غير المنطقية */
const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  "جديد": ["معيّن", "ملغى"],
  "معيّن": ["قيد التنفيذ", "بانتظار قطع غيار", "ملغى"],
  "قيد التنفيذ": ["بانتظار قطع غيار", "مغلق", "ملغى"],
  "بانتظار قطع غيار": ["قيد التنفيذ", "مغلق", "ملغى"],
  "مغلق": [],
  "ملغى": [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export async function getTicket(repo: Repo, ref: string): Promise<Ticket> {
  const t = await repo.tickets.get(ref);
  if (!t) throw new NotFoundError("البلاغ", ref);
  return t;
}

export interface CreateTicketInput {
  assetTag: string;
  description: string;
  priority?: Priority;
  requestingDept?: string;
  isPreventive?: boolean;
}

/**
 * فتح بلاغ على أصل. النظام يقوم آلياً بـ:
 *  1) اشتقاق نوع الأصل وموقعه من سجل الأصل نفسه (لا إدخال مزدوج)،
 *  2) إيجاد العقد الساري الذي يغطيه وتحديد المورد المسؤول،
 *  3) حساب موعد الاستجابة من SLA التعاقدي أو من أولوية البلاغ.
 */
export async function createTicket(
  repo: Repo,
  actor: User,
  input: CreateTicketInput,
): Promise<Ticket> {
  require_(actor, "ticket:create");
  const errors: Record<string, string> = {};
  if (!input.assetTag) errors.assetTag = "رقم الأصل مطلوب";
  if (!input.description?.trim()) errors.description = "وصف العطل مطلوب";
  if (Object.keys(errors).length) throw new ValidationError(errors);

  const asset = await getAsset(repo, input.assetTag);
  if (asset.status === "مشطوب") {
    throw new ConflictError(`الأصل ${asset.tag} مشطوب ولا تُقبل عليه بلاغات`);
  }

  const now = new Date();
  const priority: Priority = input.priority ?? "متوسط";
  const contract = await findCoveringContract(
    repo,
    asset.typeCode,
    asset.siteCode,
    now.toISOString(),
  );
  const slaHours = contract?.responseHours ?? PRIORITY_SLA_HOURS[priority];
  const ref = await nextTicketRef(repo);

  const ticket: Ticket = {
    ref,
    assetTag: asset.tag,
    typeCode: asset.typeCode,
    siteCode: asset.siteCode,
    requestingDept: input.requestingDept ?? actor.department,
    reportedBy: actor.id,
    description: input.description.trim(),
    priority,
    status: "جديد",
    contractId: contract?.id,
    supplierId: contract?.supplierId,
    dueDate: new Date(now.getTime() + slaHours * 3600_000).toISOString(),
    slaBreached: false,
    isPreventive: input.isPreventive ?? false,
    ...stamp(actor.id),
  };
  await repo.tickets.put(ref, ticket);
  await log(
    repo,
    actor.id,
    "فتح بلاغ",
    "ticket",
    ref,
    contract ? `مغطّى بالعقد ${contract.id}` : "بلا عقد ساري",
  );
  return ticket;
}

export async function assignTicket(
  repo: Repo,
  actor: User,
  ref: string,
  assignee: string,
): Promise<Ticket> {
  require_(actor, "ticket:assign");
  const t = await getTicket(repo, ref);
  if (t.status !== "جديد" && t.status !== "معيّن") {
    throw new ConflictError(`لا يمكن التعيين والبلاغ في حالة «${t.status}»`);
  }
  const updated: Ticket = {
    ...t,
    assignedTo: assignee,
    status: "معيّن",
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  };
  await repo.tickets.put(ref, updated);
  await log(repo, actor.id, "تعيين البلاغ", "ticket", ref, assignee);
  return updated;
}

export async function setTicketStatus(
  repo: Repo,
  actor: User,
  ref: string,
  status: TicketStatus,
): Promise<Ticket> {
  require_(actor, status === "مغلق" ? "ticket:close" : "ticket:assign");
  const t = await getTicket(repo, ref);
  if (t.status === status) return t;
  if (!canTransition(t.status, status)) {
    throw new ConflictError(`انتقال غير مسموح: «${t.status}» ← «${status}»`);
  }
  // لا يُغلق البلاغ إلا بأمر عمل منجز — هذا أحد أضلاع المطابقة الثلاثية
  if (status === "مغلق") {
    if (!t.workOrderRef) throw new ConflictError("لا يمكن إغلاق البلاغ قبل إنجاز أمر عمل عليه");
    const wo = await repo.workOrders.get(t.workOrderRef);
    if (!wo || (wo.status !== "منجز فنياً" && wo.status !== "مغلق")) {
      throw new ConflictError("أمر العمل المرتبط لم يُنجَز فنياً بعد");
    }
  }
  const now = new Date();
  const updated: Ticket = {
    ...t,
    status,
    closedDate: status === "مغلق" ? now.toISOString() : t.closedDate,
    slaBreached: status === "مغلق" ? now.toISOString() > t.dueDate : t.slaBreached,
    updatedAt: now.toISOString(),
    updatedBy: actor.id,
  };
  await repo.tickets.put(ref, updated);
  await log(repo, actor.id, `تغيير حالة البلاغ إلى ${status}`, "ticket", ref);

  // إعادة الأصل إلى الخدمة عند الإغلاق
  if (status === "مغلق") {
    const asset = await repo.assets.get(t.assetTag);
    if (asset && asset.status === "تحت الصيانة") {
      await setAssetStatus(repo, actor, t.assetTag, "في الخدمة");
    }
  }
  return updated;
}

/** يحدّث علم تجاوز SLA على البلاغات المفتوحة — يُستدعى من لوحة المؤشرات */
export async function refreshSlaFlags(repo: Repo): Promise<number> {
  const now = new Date().toISOString();
  const open = (await repo.tickets.list()).filter((t) =>
    t.status !== "مغلق" && t.status !== "ملغى" && !t.slaBreached && t.dueDate < now
  );
  for (const t of open) {
    await repo.tickets.put(t.ref, { ...t, slaBreached: true, updatedAt: now, updatedBy: "system" });
  }
  return open.length;
}

export async function listTickets(
  repo: Repo,
  filter?: { status?: string; siteCode?: string; assetTag?: string; supplierId?: string },
): Promise<Ticket[]> {
  let items = await repo.tickets.list();
  if (filter?.status) items = items.filter((t) => t.status === filter.status);
  if (filter?.siteCode) items = items.filter((t) => t.siteCode === filter.siteCode);
  if (filter?.assetTag) items = items.filter((t) => t.assetTag === filter.assetTag);
  if (filter?.supplierId) items = items.filter((t) => t.supplierId === filter.supplierId);
  return items.sort((a, b) => b.ref.localeCompare(a.ref));
}
