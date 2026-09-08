/**
 * تنفيذ المستودع فوق Deno KV.
 * مناسب للتجربة والنشر السريع على Deno Deploy — بلا أي إعداد.
 */
import type { Collection, Repo } from "./repo.ts";
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

class KvCollection<T> implements Collection<T> {
  constructor(protected kv: Deno.Kv, protected prefix: string) {}

  async get(id: string): Promise<T | null> {
    const res = await this.kv.get<T>([this.prefix, id]);
    return res.value ?? null;
  }

  async put(id: string, value: T): Promise<void> {
    await this.kv.set([this.prefix, id], value);
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete([this.prefix, id]);
  }

  async list(opts?: { limit?: number }): Promise<T[]> {
    const out: T[] = [];
    const iter = this.kv.list<T>({ prefix: [this.prefix] }, { limit: opts?.limit });
    for await (const e of iter) out.push(e.value);
    return out;
  }
}

class KvUsers extends KvCollection<User> {
  override async put(id: string, value: User): Promise<void> {
    const email = value.email.toLowerCase();
    const prev = await this.get(id);
    const tx = this.kv.atomic().set([this.prefix, id], value).set(["users_by_email", email], id);
    if (prev && prev.email.toLowerCase() !== email) {
      tx.delete(["users_by_email", prev.email.toLowerCase()]);
    }
    await tx.commit();
  }

  override async delete(id: string): Promise<void> {
    const prev = await this.get(id);
    const tx = this.kv.atomic().delete([this.prefix, id]);
    if (prev) tx.delete(["users_by_email", prev.email.toLowerCase()]);
    await tx.commit();
  }

  async byEmail(email: string): Promise<User | null> {
    const idx = await this.kv.get<string>(["users_by_email", email.toLowerCase()]);
    if (!idx.value) return null;
    return await this.get(idx.value);
  }
}

export class KvRepo implements Repo {
  readonly driver = "kv";

  readonly users: KvUsers;
  readonly sessions: Collection<Session>;
  readonly suppliers: Collection<Supplier>;
  readonly contracts: Collection<Contract>;
  readonly assetTypes: Collection<AssetType>;
  readonly sites: Collection<Site>;
  readonly assets: Collection<Asset>;
  readonly tickets: Collection<Ticket>;
  readonly workOrders: Collection<WorkOrder>;
  readonly budgetLines: Collection<BudgetLine>;
  readonly invoices: Collection<Invoice>;
  readonly approvals: Collection<Approval>;
  readonly payments: Collection<Payment>;
  readonly audit: Collection<AuditEntry>;

  private constructor(private kv: Deno.Kv) {
    this.users = new KvUsers(kv, "users");
    this.sessions = new KvCollection<Session>(kv, "sessions");
    this.suppliers = new KvCollection<Supplier>(kv, "suppliers");
    this.contracts = new KvCollection<Contract>(kv, "contracts");
    this.assetTypes = new KvCollection<AssetType>(kv, "asset_types");
    this.sites = new KvCollection<Site>(kv, "sites");
    this.assets = new KvCollection<Asset>(kv, "assets");
    this.tickets = new KvCollection<Ticket>(kv, "tickets");
    this.workOrders = new KvCollection<WorkOrder>(kv, "work_orders");
    this.budgetLines = new KvCollection<BudgetLine>(kv, "budget_lines");
    this.invoices = new KvCollection<Invoice>(kv, "invoices");
    this.approvals = new KvCollection<Approval>(kv, "approvals");
    this.payments = new KvCollection<Payment>(kv, "payments");
    this.audit = new KvCollection<AuditEntry>(kv, "audit");
  }

  static async open(path?: string): Promise<KvRepo> {
    const kv = await Deno.openKv(path);
    return new KvRepo(kv);
  }

  async nextSequence(name: string): Promise<number> {
    // عدّاد ذرّي مع إعادة المحاولة عند التنافس
    for (let attempt = 0; attempt < 20; attempt++) {
      const cur = await this.kv.get<number>(["seq", name]);
      const next = (cur.value ?? 0) + 1;
      const ok = await this.kv.atomic()
        .check(cur)
        .set(["seq", name], next)
        .commit();
      if (ok.ok) return next;
    }
    throw new Error(`تعذّر توليد الرقم المتسلسل: ${name}`);
  }

  async wipe(): Promise<void> {
    const iter = this.kv.list({ prefix: [] });
    const keys: Deno.KvKey[] = [];
    for await (const e of iter) keys.push(e.key);
    for (const k of keys) await this.kv.delete(k);
  }

  close(): Promise<void> {
    this.kv.close();
    return Promise.resolve();
  }
}
