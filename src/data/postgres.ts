/**
 * تنفيذ المستودع فوق PostgreSQL — مسار الإنتاج.
 *
 * يُحمَّل مشغّل قاعدة البيانات ديناميكياً حتى لا يحتاج مسار Deno KV
 * إلى أي تبعية خارجية إطلاقاً.
 *
 * متغيرات البيئة:
 *   DB_DRIVER=postgres
 *   DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
 *
 * توافق مثبت مع: AWS RDS for PostgreSQL في إقليم me-south-1 (البحرين)،
 * وأي PostgreSQL 14+ داخل مركز بيانات الوزارة.
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

/** الحد الأدنى من واجهة العميل الذي نحتاجه من مشغّل postgres */
/** إصدار مشغّل PostgreSQL — يُجلب عند التشغيل فقط، لا عند البناء */
const PG_DRIVER_VERSION = "0.19";

interface PgClient {
  queryObject<T>(
    query: string,
    args?: unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

interface PgPool {
  connect(): Promise<PgClient & { release(): void }>;
  end(): Promise<void>;
}

class PgCollection<T> implements Collection<T> {
  constructor(protected pool: PgPool, protected table: string) {}

  protected async q<R>(sql: string, args: unknown[] = []): Promise<R[]> {
    const c = await this.pool.connect();
    try {
      const res = await c.queryObject<R>(sql, args);
      return res.rows;
    } finally {
      c.release();
    }
  }

  async get(id: string): Promise<T | null> {
    const rows = await this.q<{ data: T }>(
      `SELECT data FROM ${this.table} WHERE id = $1`,
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async put(id: string, value: T): Promise<void> {
    await this.q(
      `INSERT INTO ${this.table} (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [id, JSON.stringify(value)],
    );
  }

  async delete(id: string): Promise<void> {
    await this.q(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
  }

  async list(opts?: { limit?: number }): Promise<T[]> {
    const limit = opts?.limit ?? 10000;
    const rows = await this.q<{ data: T }>(
      `SELECT data FROM ${this.table} ORDER BY id LIMIT $1`,
      [limit],
    );
    return rows.map((r) => r.data);
  }
}

class PgUsers extends PgCollection<User> {
  override async put(id: string, value: User): Promise<void> {
    await this.q(
      `INSERT INTO users (id, email, data, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, data = EXCLUDED.data, updated_at = now()`,
      [id, value.email.toLowerCase(), JSON.stringify(value)],
    );
  }

  async byEmail(email: string): Promise<User | null> {
    const rows = await this.q<{ data: User }>(
      `SELECT data FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return rows[0]?.data ?? null;
  }
}

const TABLES = [
  "users",
  "sessions",
  "suppliers",
  "contracts",
  "asset_types",
  "sites",
  "assets",
  "tickets",
  "work_orders",
  "budget_lines",
  "invoices",
  "approvals",
  "payments",
  "audit",
];

export class PostgresRepo implements Repo {
  readonly driver = "postgres";

  readonly users: PgUsers;
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

  private constructor(private pool: PgPool) {
    this.users = new PgUsers(pool, "users");
    this.sessions = new PgCollection<Session>(pool, "sessions");
    this.suppliers = new PgCollection<Supplier>(pool, "suppliers");
    this.contracts = new PgCollection<Contract>(pool, "contracts");
    this.assetTypes = new PgCollection<AssetType>(pool, "asset_types");
    this.sites = new PgCollection<Site>(pool, "sites");
    this.assets = new PgCollection<Asset>(pool, "assets");
    this.tickets = new PgCollection<Ticket>(pool, "tickets");
    this.workOrders = new PgCollection<WorkOrder>(pool, "work_orders");
    this.budgetLines = new PgCollection<BudgetLine>(pool, "budget_lines");
    this.invoices = new PgCollection<Invoice>(pool, "invoices");
    this.approvals = new PgCollection<Approval>(pool, "approvals");
    this.payments = new PgCollection<Payment>(pool, "payments");
    this.audit = new PgCollection<AuditEntry>(pool, "audit");
  }

  static async open(url: string, poolSize = 5): Promise<PostgresRepo> {
    // تحميل ديناميكي بمُعرّف مُركَّب عمداً: لا يستطيع `deno cache` تحليله ثابتاً،
    // فلا يُجلب مشغّل PostgreSQL إطلاقاً عند التشغيل على Deno KV.
    // النتيجة: نشر التجربة لا يعتمد على أي حزمة خارجية.
    const spec = ["jsr:@db", "postgres@" + PG_DRIVER_VERSION].join("/");
    const mod = await import(spec);
    const Pool = (mod as unknown as { Pool: new (u: string, n: number, lazy: boolean) => PgPool })
      .Pool;
    const pool = new Pool(url, poolSize, true);
    const repo = new PostgresRepo(pool);
    await repo.migrate();
    return repo;
  }

  /** ينفذ schema.sql — آمن للتكرار (كل العبارات IF NOT EXISTS) */
  async migrate(): Promise<void> {
    const sql = await Deno.readTextFile(new URL("./schema.sql", import.meta.url));
    const c = await this.pool.connect();
    try {
      await c.queryObject(sql);
    } finally {
      c.release();
    }
  }

  async nextSequence(name: string): Promise<number> {
    const c = await this.pool.connect();
    try {
      const res = await c.queryObject<{ value: bigint | number }>(
        `INSERT INTO sequences (name, value) VALUES ($1, 1)
         ON CONFLICT (name) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        [name],
      );
      return Number(res.rows[0].value);
    } finally {
      c.release();
    }
  }

  async wipe(): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.queryObject(`TRUNCATE ${TABLES.join(", ")}, sequences`);
    } finally {
      c.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
