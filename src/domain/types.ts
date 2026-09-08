/**
 * نماذج المجال (Domain Model) — نظام الخدمات المساندة المطور
 * ERP/EAM — مجموعة الهندسة الإلكترونية
 *
 * كل الكيانات تُخزَّن كسجلات JSON مسطّحة حتى تعمل على Deno KV و PostgreSQL معاً.
 * التواريخ تُخزَّن كسلاسل ISO-8601 (UTC) دائماً.
 */

// ────────────────────────────── أساسيات ──────────────────────────────

/** الطابع الزمني ISO-8601 */
export type Iso = string;

export interface Auditable {
  createdAt: Iso;
  createdBy: string;
  updatedAt: Iso;
  updatedBy: string;
}

// ────────────────────────────── المستخدمون والأدوار ──────────────────────────────

export const ROLES = [
  "admin", // مدير النظام
  "engineer", // مهندس — يفتح البلاغات ويعتمد الإنجاز الفني
  "technician", // فني — ينفذ أوامر العمل
  "storekeeper", // أمين مستودع — العهد والأصول
  "accountant", // محاسب — صانع طلب الصرف
  "finance_reviewer", // مراجع مالي
  "finance_approver", // معتمد مالي
  "supplier", // مورد خارجي — بوابة المورد
  "requester", // موظف طالب خدمة
] as const;

export type Role = typeof ROLES[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير النظام",
  engineer: "مهندس",
  technician: "فني",
  storekeeper: "أمين عهدة",
  accountant: "محاسب (صانع)",
  finance_reviewer: "مراجع مالي",
  finance_approver: "معتمد مالي",
  supplier: "مورد",
  requester: "طالب خدمة",
};

export interface User extends Auditable {
  id: string;
  email: string;
  displayName: string;
  /** PBKDF2-SHA256، مخزّن base64. فارغ إذا كان المستخدم من Entra ID فقط. */
  passwordHash: string;
  passwordSalt: string;
  roles: Role[];
  department: string;
  /** يُملأ عند ربط الحساب بـ Microsoft Entra ID */
  externalId?: string;
  /** للموردين فقط: يربط المستخدم بسجل المورد */
  supplierId?: string;
  isActive: boolean;
}

// ────────────────────────────── الموردون والعقود ──────────────────────────────

export interface Supplier extends Auditable {
  id: string; // SUP-0001
  name: string;
  commercialReg: string;
  contactName: string;
  email: string;
  phone: string;
  supplyScope: string;
  isActive: boolean;
}

export const CONTRACT_STATUSES = ["مسودة", "ساري", "منتهي", "ملغى", "موقوف"] as const;
export type ContractStatus = typeof CONTRACT_STATUSES[number];

export const BILLING_BASES = ["دفعات دورية", "لكل أمر عمل", "مختلط"] as const;
export type BillingBasis = typeof BILLING_BASES[number];

export const BILLING_CYCLES = ["شهري", "ربعي", "نصف سنوي", "سنوي"] as const;
export type BillingCycle = typeof BILLING_CYCLES[number];

export interface Contract extends Auditable {
  id: string; // CN-2026-001
  title: string;
  supplierId: string;
  /** رموز أنواع الأصول المشمولة بالعقد، مثل ["COP","PRN"] */
  coveredTypes: string[];
  /** فارغ = كل المواقع */
  coveredSites: string[];
  startDate: Iso;
  expiryDate: Iso;
  value: number;
  status: ContractStatus;
  billingBasis: BillingBasis;
  billingCycle?: BillingCycle;
  /** زمن الاستجابة التعاقدي بالساعات (SLA) */
  responseHours: number;
  /** نسبة غرامة التأخير عن كل يوم تجاوز، من قيمة أمر العمل */
  penaltyRatePerDay: number;
  /** بند الميزانية الذي يُحمَّل عليه العقد */
  budgetLineId: string;
  notes: string;
}

// ────────────────────────────── الأصول ──────────────────────────────

export const FIELD_INPUT_TYPES = ["نص", "رقم", "تاريخ", "قائمة", "نعم/لا"] as const;
export type FieldInputType = typeof FIELD_INPUT_TYPES[number];

/** تعريف حقل ديناميكي خاص بنوع أصل — يقابل قائمة «حقول النوع» في نسخة SharePoint */
export interface TypeField {
  key: string; // معرّف برمجي، مثل "meter_at_install"
  label: string; // التسمية العربية المعروضة
  inputType: FieldInputType;
  choices?: string[];
  required: boolean;
  showInGrid: boolean;
  sortOrder: number;
}

export interface AssetType extends Auditable {
  code: string; // COP, PRN, PBX ...
  name: string;
  nature: string; // جهاز / نظام / خدمة
  tagPrefix: string; // بادئة رقم الأصل
  needsSerial: boolean;
  needsMeter: boolean;
  needsContract: boolean;
  usefulLifeYears: number;
  /** دورة الصيانة الوقائية بالأيام؛ 0 = لا صيانة وقائية */
  maintCycleDays: number;
  owningTeam: string;
  isEnabled: boolean;
  sortOrder: number;
  fields: TypeField[];
}

export interface Site extends Auditable {
  code: string; // SCH-005
  name: string;
  buildingName: string;
  floorName: string;
  governorate: string;
  region: string;
  responsibleDept: string;
  category: string;
  isActive: boolean;
}

export const ASSET_STATUSES = [
  "في الخدمة",
  "تحت الصيانة",
  "خارج الخدمة",
  "مخزن",
  "مشطوب",
] as const;
export type AssetStatus = typeof ASSET_STATUSES[number];

export interface Asset extends Auditable {
  tag: string; // COP-000001
  typeCode: string;
  name: string;
  manufacturer: string;
  modelName: string;
  serialNumber: string;
  siteCode: string;
  department: string;
  custodian: string;
  acquisitionDate: Iso;
  acquisitionCost: number;
  acquisitionSource: string;
  warrantyEnd?: Iso;
  status: AssetStatus;
  /** العقد الذي وُرِّد الأصل بموجبه (تتبّع من المناقصات إلى الأصول) */
  sourceContractId?: string;
  /** القيم الديناميكية حسب تعريف حقول النوع */
  attributes: Record<string, string | number | boolean | null>;
  notes: string;
}

// ────────────────────────────── البلاغات وأوامر العمل ──────────────────────────────

export const PRIORITIES = ["عاجل", "مرتفع", "متوسط", "منخفض"] as const;
export type Priority = typeof PRIORITIES[number];

/** ساعات الاستجابة الافتراضية عند غياب SLA تعاقدي */
export const PRIORITY_SLA_HOURS: Record<Priority, number> = {
  "عاجل": 4,
  "مرتفع": 24,
  "متوسط": 72,
  "منخفض": 168,
};

export const TICKET_STATUSES = [
  "جديد",
  "معيّن",
  "قيد التنفيذ",
  "بانتظار قطع غيار",
  "مغلق",
  "ملغى",
] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

export interface Ticket extends Auditable {
  ref: string; // TK-2026-00001
  assetTag: string;
  typeCode: string;
  siteCode: string;
  requestingDept: string;
  reportedBy: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  /** العقد الساري الذي يغطي هذا البلاغ (يُحدَّد آلياً) */
  contractId?: string;
  supplierId?: string;
  assignedTo?: string;
  /** موعد الاستجابة المستحق بحسب SLA */
  dueDate: Iso;
  closedDate?: Iso;
  slaBreached: boolean;
  /** أمر العمل المتولّد عن البلاغ */
  workOrderRef?: string;
  isPreventive: boolean;
}

export const WORK_TYPES = ["إصلاح", "صيانة وقائية", "تركيب", "استبدال", "فحص"] as const;
export type WorkType = typeof WORK_TYPES[number];

export const WORK_ORDER_STATUSES = [
  "مفتوح",
  "قيد التنفيذ",
  "منجز فنياً",
  "مغلق",
  "ملغى",
] as const;
export type WorkOrderStatus = typeof WORK_ORDER_STATUSES[number];

export interface WorkOrder extends Auditable {
  ref: string; // WO-2026-00001
  ticketRef: string;
  assetTag: string;
  siteCode: string;
  workType: WorkType;
  technician: string;
  partsUsed: string;
  laborHours: number;
  outcome: string;
  status: WorkOrderStatus;
  startedAt?: Iso;
  closedDate?: Iso;
  contractId?: string;
  supplierId?: string;
  /** true = مشمول بدفعات العقد الدورية، فلا يُفوتَر منفرداً */
  underContract: boolean;
  billableAmount: number;
  /** غرامة التأخير المحسوبة عند تجاوز SLA */
  penaltyAmount: number;
  /** رقم الفاتورة المتولّدة — يمنع تكرار الفوترة */
  invoiceRef?: string;
}

// ────────────────────────────── المالية ──────────────────────────────

export interface BudgetLine extends Auditable {
  id: string; // BL-2026-MAINT
  name: string;
  fiscalYear: number;
  allocated: number;
  /** محجوز على عقود/طلبات لم تُصرف بعد */
  committed: number;
  /** مصروف فعلياً */
  spent: number;
  isActive: boolean;
}

export const INVOICE_BASES = ["عقد", "أمر عمل", "أمر شراء"] as const;
export type InvoiceBasis = typeof INVOICE_BASES[number];

export const INVOICE_STATUSES = [
  "مسودة",
  "مقدمة",
  "قيد الاعتماد",
  "معتمدة",
  "مرفوضة",
  "مصروفة",
  "ملغاة",
] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

/** نسبة ضريبة القيمة المضافة في مملكة البحرين */
export const VAT_RATE = 0.10;

export interface Invoice extends Auditable {
  ref: string; // INV-2026-00001
  supplierId: string;
  contractId?: string;
  basis: InvoiceBasis;
  /** أوامر العمل المشمولة بهذه الفاتورة */
  workOrderRefs: string[];
  description: string;
  amount: number;
  vatAmount: number;
  penaltyAmount: number;
  grandTotal: number;
  issueDate: Iso;
  periodFrom?: Iso;
  periodTo?: Iso;
  status: InvoiceStatus;
  budgetLineId: string;
  /** نتيجة المطابقة الثلاثية */
  matchResult?: MatchResult;
  paymentRef?: string;
  supplierInvoiceNo: string;
}

export interface MatchResult {
  matched: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  checkedAt: Iso;
}

export const APPROVAL_STEPS = ["صانع", "مراجع", "معتمد"] as const;
export type ApprovalStep = typeof APPROVAL_STEPS[number];

export const APPROVAL_STATUSES = ["بانتظار", "معتمد", "مرفوض", "متجاوَز"] as const;
export type ApprovalStatus = typeof APPROVAL_STATUSES[number];

/** الدور المسؤول عن كل خطوة في مسار الاعتماد */
export const STEP_ROLE: Record<ApprovalStep, Role> = {
  "صانع": "accountant",
  "مراجع": "finance_reviewer",
  "معتمد": "finance_approver",
};

export interface Approval extends Auditable {
  id: string; // AP-INV-2026-00001-2
  invoiceRef: string;
  step: ApprovalStep;
  order: number;
  requiredRole: Role;
  status: ApprovalStatus;
  actedBy?: string;
  actedAt?: Iso;
  note: string;
}

export const PAYMENT_METHODS = ["تحويل بنكي", "شيك", "مقاصة"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface Payment extends Auditable {
  ref: string; // PAY-2026-00001
  invoiceRef: string;
  supplierId: string;
  amount: number;
  method: PaymentMethod;
  bankReference: string;
  paidAt: Iso;
  budgetLineId: string;
}

// ────────────────────────────── التدقيق ──────────────────────────────

export interface AuditEntry {
  id: string;
  at: Iso;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
}

// ────────────────────────────── الجلسات ──────────────────────────────

export interface Session {
  id: string;
  userId: string;
  createdAt: Iso;
  expiresAt: Iso;
}
