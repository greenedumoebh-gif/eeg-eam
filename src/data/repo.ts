/**
 * واجهة مستودع البيانات (Repository Interface)
 *
 * كل الوصول للبيانات يمر من هنا. الهدف: أن يكون تبديل مكان تخزين البيانات
 * (Deno KV للتجربة ← PostgreSQL داخل البحرين للإنتاج) تغييرَ متغيّر بيئة واحد،
 * دون تعديل أي سطر في طبقة الخدمات أو الواجهة.
 */
import type {
  Approval,
  Asset,
  AssetType,
  AuditEntry,
  BudgetLine,
  Contract,
  Invoice,
  Payment,
  Session,
  Site,
  Supplier,
  Ticket,
  User,
  WorkOrder,
} from "../domain/types.ts";

/** مجموعة عامة: مفتاح نصي واحد لكل سجل */
export interface Collection<T> {
  get(id: string): Promise<T | null>;
  put(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
  list(opts?: { limit?: number }): Promise<T[]>;
}

export interface Repo {
  readonly driver: string;

  users: Collection<User> & { byEmail(email: string): Promise<User | null> };
  sessions: Collection<Session>;

  suppliers: Collection<Supplier>;
  contracts: Collection<Contract>;

  assetTypes: Collection<AssetType>;
  sites: Collection<Site>;
  assets: Collection<Asset>;

  tickets: Collection<Ticket>;
  workOrders: Collection<WorkOrder>;

  budgetLines: Collection<BudgetLine>;
  invoices: Collection<Invoice>;
  approvals: Collection<Approval>;
  payments: Collection<Payment>;

  audit: Collection<AuditEntry>;

  /** عدّاد ذرّي لتوليد المراجع المتسلسلة (TK-2026-00001 …) */
  nextSequence(name: string): Promise<number>;

  /** يمسح كل البيانات — للاختبارات وإعادة البذر فقط */
  wipe(): Promise<void>;

  close(): Promise<void>;
}
