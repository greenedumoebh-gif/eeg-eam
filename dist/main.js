var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/data/postgres.ts
var postgres_exports = {};
__export(postgres_exports, {
  PostgresRepo: () => PostgresRepo
});
var PG_DRIVER_VERSION, PgCollection, PgUsers, TABLES, PostgresRepo;
var init_postgres = __esm({
  "src/data/postgres.ts"() {
    PG_DRIVER_VERSION = "0.19";
    PgCollection = class {
      static {
        __name(this, "PgCollection");
      }
      pool;
      table;
      constructor(pool, table) {
        this.pool = pool;
        this.table = table;
      }
      async q(sql, args = []) {
        const c = await this.pool.connect();
        try {
          const res = await c.queryObject(sql, args);
          return res.rows;
        } finally {
          c.release();
        }
      }
      async get(id) {
        const rows = await this.q(`SELECT data FROM ${this.table} WHERE id = $1`, [
          id
        ]);
        return rows[0]?.data ?? null;
      }
      async put(id, value) {
        await this.q(`INSERT INTO ${this.table} (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [
          id,
          JSON.stringify(value)
        ]);
      }
      async delete(id) {
        await this.q(`DELETE FROM ${this.table} WHERE id = $1`, [
          id
        ]);
      }
      async list(opts) {
        const limit = opts?.limit ?? 1e4;
        const rows = await this.q(`SELECT data FROM ${this.table} ORDER BY id LIMIT $1`, [
          limit
        ]);
        return rows.map((r) => r.data);
      }
    };
    PgUsers = class extends PgCollection {
      static {
        __name(this, "PgUsers");
      }
      async put(id, value) {
        await this.q(`INSERT INTO users (id, email, data, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, data = EXCLUDED.data, updated_at = now()`, [
          id,
          value.email.toLowerCase(),
          JSON.stringify(value)
        ]);
      }
      async byEmail(email) {
        const rows = await this.q(`SELECT data FROM users WHERE lower(email) = lower($1)`, [
          email
        ]);
        return rows[0]?.data ?? null;
      }
    };
    TABLES = [
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
      "audit"
    ];
    PostgresRepo = class _PostgresRepo {
      static {
        __name(this, "PostgresRepo");
      }
      pool;
      driver;
      users;
      sessions;
      suppliers;
      contracts;
      assetTypes;
      sites;
      assets;
      tickets;
      workOrders;
      budgetLines;
      invoices;
      approvals;
      payments;
      audit;
      constructor(pool) {
        this.pool = pool;
        this.driver = "postgres";
        this.users = new PgUsers(pool, "users");
        this.sessions = new PgCollection(pool, "sessions");
        this.suppliers = new PgCollection(pool, "suppliers");
        this.contracts = new PgCollection(pool, "contracts");
        this.assetTypes = new PgCollection(pool, "asset_types");
        this.sites = new PgCollection(pool, "sites");
        this.assets = new PgCollection(pool, "assets");
        this.tickets = new PgCollection(pool, "tickets");
        this.workOrders = new PgCollection(pool, "work_orders");
        this.budgetLines = new PgCollection(pool, "budget_lines");
        this.invoices = new PgCollection(pool, "invoices");
        this.approvals = new PgCollection(pool, "approvals");
        this.payments = new PgCollection(pool, "payments");
        this.audit = new PgCollection(pool, "audit");
      }
      static async open(url, poolSize = 5) {
        const spec = [
          "jsr:@db",
          "postgres@" + PG_DRIVER_VERSION
        ].join("/");
        const mod = await import(spec);
        const Pool = mod.Pool;
        const pool = new Pool(url, poolSize, true);
        const repo = new _PostgresRepo(pool);
        await repo.migrate();
        return repo;
      }
      /** ينفذ schema.sql — آمن للتكرار (كل العبارات IF NOT EXISTS) */
      async migrate() {
        const sql = await Deno.readTextFile(new URL("./schema.sql", import.meta.url));
        const c = await this.pool.connect();
        try {
          await c.queryObject(sql);
        } finally {
          c.release();
        }
      }
      async nextSequence(name) {
        const c = await this.pool.connect();
        try {
          const res = await c.queryObject(`INSERT INTO sequences (name, value) VALUES ($1, 1)
         ON CONFLICT (name) DO UPDATE SET value = sequences.value + 1
         RETURNING value`, [
            name
          ]);
          return Number(res.rows[0].value);
        } finally {
          c.release();
        }
      }
      async wipe() {
        const c = await this.pool.connect();
        try {
          await c.queryObject(`TRUNCATE ${TABLES.join(", ")}, sequences`);
        } finally {
          c.release();
        }
      }
      async close() {
        await this.pool.end();
      }
    };
  }
});

// src/config.ts
function env(key, fallback = "") {
  return Deno.env.get(key) ?? fallback;
}
__name(env, "env");
function bool(key, fallback = false) {
  const v = Deno.env.get(key);
  if (v === void 0) return fallback;
  return [
    "1",
    "true",
    "yes",
    "on"
  ].includes(v.toLowerCase());
}
__name(bool, "bool");
var config = {
  /** kv | postgres */
  dbDriver: env("DB_DRIVER", "kv"),
  databaseUrl: env("DATABASE_URL"),
  /** مسار ملف Deno KV محلياً؛ فارغ = الافتراضي (وعلى Deno Deploy: KV المُدار) */
  kvPath: env("KV_PATH") || void 0,
  port: Number(env("PORT", "8000")),
  /** سرّ توقيع الجلسات — يجب تغييره في الإنتاج */
  sessionSecret: env("SESSION_SECRET", "dev-only-insecure-secret-change-me"),
  sessionHours: Number(env("SESSION_HOURS", "12")),
  /** تشغيل الدخول عبر Microsoft Entra ID (OIDC). الافتراضي: معطّل */
  entraEnabled: bool("ENTRA_ENABLED", false),
  entraTenantId: env("ENTRA_TENANT_ID"),
  entraClientId: env("ENTRA_CLIENT_ID"),
  entraClientSecret: env("ENTRA_CLIENT_SECRET"),
  entraRedirectUri: env("ENTRA_REDIRECT_URI"),
  /** يسمح بإنشاء بيانات تجريبية عبر /api/seed */
  allowSeedEndpoint: bool("ALLOW_SEED_ENDPOINT", true),
  /** بيانات مدير النظام الأول عند البذر */
  bootstrapAdminEmail: env("BOOTSTRAP_ADMIN_EMAIL", "admin@demo.eeg"),
  bootstrapAdminPassword: env("BOOTSTRAP_ADMIN_PASSWORD", "Admin@12345"),
  /**
   * وضع العرض: يُظهر شريطاً دائماً يوضّح أن هذه نسخة تجريبية ببيانات افتراضية.
   * يبقى مفعّلاً في بيئة العرض للجهات العليا، ويُطفأ عند التشغيل الفعلي.
   */
  demoMode: bool("DEMO_MODE", true),
  demoNotice: env("DEMO_NOTICE", "\u0646\u0633\u062E\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0644\u0639\u0631\u0636 \u0627\u0644\u0641\u0643\u0631\u0629 \u2014 \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629 \u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 \u0648\u0644\u0627 \u062A\u0645\u062B\u0651\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0641\u0639\u0644\u064A\u0629 \u0644\u0644\u0648\u0632\u0627\u0631\u0629"),
  /** اسم الجهة — يظهر في الواجهة والتقارير */
  orgName: env("ORG_NAME", "\u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u062A\u0631\u0628\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0645 \u2014 \u0645\u062C\u0645\u0648\u0639\u0629 \u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629"),
  currency: env("CURRENCY", "\u062F.\u0628")
};

// src/data/kv.ts
var KvCollection = class {
  static {
    __name(this, "KvCollection");
  }
  kv;
  prefix;
  constructor(kv, prefix) {
    this.kv = kv;
    this.prefix = prefix;
  }
  async get(id) {
    const res = await this.kv.get([
      this.prefix,
      id
    ]);
    return res.value ?? null;
  }
  async put(id, value) {
    await this.kv.set([
      this.prefix,
      id
    ], value);
  }
  async delete(id) {
    await this.kv.delete([
      this.prefix,
      id
    ]);
  }
  async list(opts) {
    const out = [];
    const iter = this.kv.list({
      prefix: [
        this.prefix
      ]
    }, {
      limit: opts?.limit
    });
    for await (const e of iter) out.push(e.value);
    return out;
  }
};
var KvUsers = class extends KvCollection {
  static {
    __name(this, "KvUsers");
  }
  async put(id, value) {
    const email = value.email.toLowerCase();
    const prev = await this.get(id);
    const tx = this.kv.atomic().set([
      this.prefix,
      id
    ], value).set([
      "users_by_email",
      email
    ], id);
    if (prev && prev.email.toLowerCase() !== email) {
      tx.delete([
        "users_by_email",
        prev.email.toLowerCase()
      ]);
    }
    await tx.commit();
  }
  async delete(id) {
    const prev = await this.get(id);
    const tx = this.kv.atomic().delete([
      this.prefix,
      id
    ]);
    if (prev) tx.delete([
      "users_by_email",
      prev.email.toLowerCase()
    ]);
    await tx.commit();
  }
  async byEmail(email) {
    const idx = await this.kv.get([
      "users_by_email",
      email.toLowerCase()
    ]);
    if (!idx.value) return null;
    return await this.get(idx.value);
  }
};
var KvRepo = class _KvRepo {
  static {
    __name(this, "KvRepo");
  }
  kv;
  driver;
  users;
  sessions;
  suppliers;
  contracts;
  assetTypes;
  sites;
  assets;
  tickets;
  workOrders;
  budgetLines;
  invoices;
  approvals;
  payments;
  audit;
  constructor(kv) {
    this.kv = kv;
    this.driver = "kv";
    this.users = new KvUsers(kv, "users");
    this.sessions = new KvCollection(kv, "sessions");
    this.suppliers = new KvCollection(kv, "suppliers");
    this.contracts = new KvCollection(kv, "contracts");
    this.assetTypes = new KvCollection(kv, "asset_types");
    this.sites = new KvCollection(kv, "sites");
    this.assets = new KvCollection(kv, "assets");
    this.tickets = new KvCollection(kv, "tickets");
    this.workOrders = new KvCollection(kv, "work_orders");
    this.budgetLines = new KvCollection(kv, "budget_lines");
    this.invoices = new KvCollection(kv, "invoices");
    this.approvals = new KvCollection(kv, "approvals");
    this.payments = new KvCollection(kv, "payments");
    this.audit = new KvCollection(kv, "audit");
  }
  static async open(path) {
    const kv = await Deno.openKv(path);
    return new _KvRepo(kv);
  }
  async nextSequence(name) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const cur = await this.kv.get([
        "seq",
        name
      ]);
      const next = (cur.value ?? 0) + 1;
      const ok = await this.kv.atomic().check(cur).set([
        "seq",
        name
      ], next).commit();
      if (ok.ok) return next;
    }
    throw new Error(`\u062A\u0639\u0630\u0651\u0631 \u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0633\u0644\u0633\u0644: ${name}`);
  }
  async wipe() {
    const iter = this.kv.list({
      prefix: []
    });
    const keys = [];
    for await (const e of iter) keys.push(e.key);
    for (const k of keys) await this.kv.delete(k);
  }
  close() {
    this.kv.close();
    return Promise.resolve();
  }
};

// src/data/index.ts
var cached = null;
async function openRepo(opts) {
  const driver = opts?.driver ?? config.dbDriver;
  if (driver === "postgres") {
    const url = opts?.url ?? config.databaseUrl;
    if (!url) throw new Error("DATABASE_URL \u0645\u0637\u0644\u0648\u0628 \u0639\u0646\u062F DB_DRIVER=postgres");
    const { PostgresRepo: PostgresRepo2 } = await Promise.resolve().then(() => (init_postgres(), postgres_exports));
    return await PostgresRepo2.open(url);
  }
  return await KvRepo.open(opts?.kvPath ?? config.kvPath);
}
__name(openRepo, "openRepo");
async function getRepo() {
  if (!cached) cached = await openRepo();
  return cached;
}
__name(getRepo, "getRepo");

// src/auth/session.ts
var COOKIE_NAME = "eeg_session";
async function hmacKey() {
  return await crypto.subtle.importKey("raw", new TextEncoder().encode(config.sessionSecret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign",
    "verify"
  ]);
}
__name(hmacKey, "hmacKey");
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(b64url, "b64url");
async function sign(value) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(value));
  return `${value}.${b64url(new Uint8Array(sig))}`;
}
__name(sign, "sign");
async function unsign(signed) {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = await sign(value);
  if (expected.length !== signed.length) return null;
  let diff = 0;
  for (let k = 0; k < expected.length; k++) diff |= expected.charCodeAt(k) ^ signed.charCodeAt(k);
  return diff === 0 ? value : null;
}
__name(unsign, "unsign");
async function createSession(repo, user) {
  const id = crypto.randomUUID();
  const now2 = /* @__PURE__ */ new Date();
  const expires = new Date(now2.getTime() + config.sessionHours * 36e5);
  const session = {
    id,
    userId: user.id,
    createdAt: now2.toISOString(),
    expiresAt: expires.toISOString()
  };
  await repo.sessions.put(id, session);
  return await sign(id);
}
__name(createSession, "createSession");
async function readSession(repo, req) {
  const raw = getCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const id = await unsign(raw);
  if (!id) return null;
  const session = await repo.sessions.get(id);
  if (!session) return null;
  if (new Date(session.expiresAt) < /* @__PURE__ */ new Date()) {
    await repo.sessions.delete(id);
    return null;
  }
  const user = await repo.users.get(session.userId);
  if (!user || !user.isActive) return null;
  return user;
}
__name(readSession, "readSession");
async function destroySession(repo, req) {
  const raw = getCookie(req, COOKIE_NAME);
  if (!raw) return;
  const id = await unsign(raw);
  if (id) await repo.sessions.delete(id);
}
__name(destroySession, "destroySession");
function getCookie(req, name) {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
__name(getCookie, "getCookie");
function sessionCookie(value, secure) {
  const maxAge = config.sessionHours * 3600;
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}
__name(sessionCookie, "sessionCookie");
function clearCookie(secure) {
  const flags = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}
__name(clearCookie, "clearCookie");

// src/auth/oidc.ts
function entraEnabled() {
  return config.entraEnabled && Boolean(config.entraTenantId && config.entraClientId && config.entraClientSecret);
}
__name(entraEnabled, "entraEnabled");
function authority() {
  return `https://login.microsoftonline.com/${config.entraTenantId}/oauth2/v2.0`;
}
__name(authority, "authority");
function b64url2(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(b64url2, "b64url");
async function makePkce() {
  const verifier = b64url2(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: b64url2(new Uint8Array(digest))
  };
}
__name(makePkce, "makePkce");
function authorizeUrl(state, challenge) {
  const p = new URLSearchParams({
    client_id: config.entraClientId,
    response_type: "code",
    redirect_uri: config.entraRedirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  return `${authority()}/authorize?${p}`;
}
__name(authorizeUrl, "authorizeUrl");
function decodeJwtPayload(jwt) {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("\u0631\u0645\u0632 \u0647\u0648\u064A\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
  const pad = part.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
__name(decodeJwtPayload, "decodeJwtPayload");
async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    client_id: config.entraClientId,
    client_secret: config.entraClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.entraRedirectUri,
    code_verifier: verifier,
    scope: "openid profile email"
  });
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await res.json();
  if (!res.ok || !data.id_token) {
    throw new Error(data.error_description ?? "\u0641\u0634\u0644 \u062A\u0628\u0627\u062F\u0644 \u0631\u0645\u0632 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0639 Entra ID");
  }
  const claims = decodeJwtPayload(data.id_token);
  const email = String(claims.preferred_username ?? claims.email ?? "").toLowerCase();
  if (!email) throw new Error("\u0644\u0645 \u064A\u0631\u062C\u0639 Entra ID \u0628\u0631\u064A\u062F\u0627\u064B \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u064B");
  return {
    email,
    name: String(claims.name ?? email),
    oid: String(claims.oid ?? claims.sub ?? "")
  };
}
__name(exchangeCode, "exchangeCode");
async function resolveUser(repo, claims) {
  const user = await repo.users.byEmail(claims.email);
  if (!user) {
    throw new Error(`\u0627\u0644\u062D\u0633\u0627\u0628 ${claims.email} \u063A\u064A\u0631 \u0645\u0633\u062C\u0651\u0644 \u0641\u064A \u0627\u0644\u0646\u0638\u0627\u0645. \u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u0644\u0645\u0646\u062D \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A.`);
  }
  if (!user.isActive) throw new Error("\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0648\u0642\u0648\u0641");
  if (user.externalId !== claims.oid) {
    await repo.users.put(user.id, {
      ...user,
      externalId: claims.oid,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedBy: "entra"
    });
  }
  return user;
}
__name(resolveUser, "resolveUser");

// src/domain/types.ts
var ROLES = [
  "admin",
  "engineer",
  "technician",
  "storekeeper",
  "accountant",
  "finance_reviewer",
  "finance_approver",
  "supplier",
  "requester"
];
var ROLE_LABELS = {
  admin: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645",
  engineer: "\u0645\u0647\u0646\u062F\u0633",
  technician: "\u0641\u0646\u064A",
  storekeeper: "\u0623\u0645\u064A\u0646 \u0639\u0647\u062F\u0629",
  accountant: "\u0645\u062D\u0627\u0633\u0628 (\u0635\u0627\u0646\u0639)",
  finance_reviewer: "\u0645\u0631\u0627\u062C\u0639 \u0645\u0627\u0644\u064A",
  finance_approver: "\u0645\u0639\u062A\u0645\u062F \u0645\u0627\u0644\u064A",
  supplier: "\u0645\u0648\u0631\u062F",
  requester: "\u0637\u0627\u0644\u0628 \u062E\u062F\u0645\u0629"
};
var CONTRACT_STATUSES = [
  "\u0645\u0633\u0648\u062F\u0629",
  "\u0633\u0627\u0631\u064A",
  "\u0645\u0646\u062A\u0647\u064A",
  "\u0645\u0644\u063A\u0649",
  "\u0645\u0648\u0642\u0648\u0641"
];
var BILLING_BASES = [
  "\u062F\u0641\u0639\u0627\u062A \u062F\u0648\u0631\u064A\u0629",
  "\u0644\u0643\u0644 \u0623\u0645\u0631 \u0639\u0645\u0644",
  "\u0645\u062E\u062A\u0644\u0637"
];
var ASSET_STATUSES = [
  "\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629",
  "\u062A\u062D\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629",
  "\u062E\u0627\u0631\u062C \u0627\u0644\u062E\u062F\u0645\u0629",
  "\u0645\u062E\u0632\u0646",
  "\u0645\u0634\u0637\u0648\u0628"
];
var PRIORITIES = [
  "\u0639\u0627\u062C\u0644",
  "\u0645\u0631\u062A\u0641\u0639",
  "\u0645\u062A\u0648\u0633\u0637",
  "\u0645\u0646\u062E\u0641\u0636"
];
var PRIORITY_SLA_HOURS = {
  "\u0639\u0627\u062C\u0644": 4,
  "\u0645\u0631\u062A\u0641\u0639": 24,
  "\u0645\u062A\u0648\u0633\u0637": 72,
  "\u0645\u0646\u062E\u0641\u0636": 168
};
var TICKET_STATUSES = [
  "\u062C\u062F\u064A\u062F",
  "\u0645\u0639\u064A\u0651\u0646",
  "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630",
  "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0642\u0637\u0639 \u063A\u064A\u0627\u0631",
  "\u0645\u063A\u0644\u0642",
  "\u0645\u0644\u063A\u0649"
];
var WORK_TYPES = [
  "\u0625\u0635\u0644\u0627\u062D",
  "\u0635\u064A\u0627\u0646\u0629 \u0648\u0642\u0627\u0626\u064A\u0629",
  "\u062A\u0631\u0643\u064A\u0628",
  "\u0627\u0633\u062A\u0628\u062F\u0627\u0644",
  "\u0641\u062D\u0635"
];
var INVOICE_STATUSES = [
  "\u0645\u0633\u0648\u062F\u0629",
  "\u0645\u0642\u062F\u0645\u0629",
  "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F",
  "\u0645\u0639\u062A\u0645\u062F\u0629",
  "\u0645\u0631\u0641\u0648\u0636\u0629",
  "\u0645\u0635\u0631\u0648\u0641\u0629",
  "\u0645\u0644\u063A\u0627\u0629"
];
var VAT_RATE = 0.1;
var APPROVAL_STEPS = [
  "\u0635\u0627\u0646\u0639",
  "\u0645\u0631\u0627\u062C\u0639",
  "\u0645\u0639\u062A\u0645\u062F"
];
var STEP_ROLE = {
  "\u0635\u0627\u0646\u0639": "accountant",
  "\u0645\u0631\u0627\u062C\u0639": "finance_reviewer",
  "\u0645\u0639\u062A\u0645\u062F": "finance_approver"
};

// src/domain/errors.ts
var DomainError = class extends Error {
  static {
    __name(this, "DomainError");
  }
  status;
  constructor(message, status = 400) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
};
var NotFoundError = class extends DomainError {
  static {
    __name(this, "NotFoundError");
  }
  constructor(entity, id) {
    super(`${entity} \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F: ${id}`, 404);
    this.name = "NotFoundError";
  }
};
var ValidationError = class extends DomainError {
  static {
    __name(this, "ValidationError");
  }
  fields;
  constructor(fields, message) {
    const detail = Object.values(fields).join("\u060C ");
    super(message ?? `\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629: ${detail}`, 422);
    this.name = "ValidationError";
    this.fields = fields;
  }
};
var ConflictError = class extends DomainError {
  static {
    __name(this, "ConflictError");
  }
  constructor(message) {
    super(message, 409);
    this.name = "ConflictError";
  }
};
function statusOf(err) {
  if (err && typeof err === "object" && "status" in err) {
    const s = err.status;
    if (typeof s === "number") return s;
  }
  return 500;
}
__name(statusOf, "statusOf");

// src/domain/rbac.ts
var PERMISSIONS = [
  // الأصول
  "asset:read",
  "asset:write",
  "assettype:write",
  "site:write",
  // العقود والموردين
  "contract:read",
  "contract:write",
  "supplier:read",
  "supplier:write",
  // البلاغات
  "ticket:read",
  "ticket:create",
  "ticket:assign",
  "ticket:close",
  // أوامر العمل
  "workorder:read",
  "workorder:write",
  "workorder:complete",
  "workorder:price",
  // المالية
  "invoice:read",
  "invoice:create",
  "invoice:submit",
  "invoice:review",
  "invoice:approve",
  "payment:execute",
  "budget:read",
  "budget:write",
  // النظام
  "user:manage",
  "audit:read"
];
var ALL = [
  ...PERMISSIONS
];
var ROLE_PERMISSIONS = {
  admin: ALL,
  engineer: [
    "asset:read",
    "asset:write",
    "contract:read",
    "supplier:read",
    "ticket:read",
    "ticket:create",
    "ticket:assign",
    "ticket:close",
    "workorder:read",
    "workorder:write",
    "workorder:complete",
    "workorder:price",
    "invoice:read",
    "budget:read",
    "audit:read"
  ],
  technician: [
    "asset:read",
    "ticket:read",
    "workorder:read",
    "workorder:write",
    "workorder:complete"
  ],
  storekeeper: [
    "asset:read",
    "asset:write",
    "ticket:read",
    "workorder:read"
  ],
  accountant: [
    "asset:read",
    "contract:read",
    "supplier:read",
    "ticket:read",
    "workorder:read",
    "invoice:read",
    "invoice:create",
    "invoice:submit",
    "budget:read",
    "audit:read"
  ],
  finance_reviewer: [
    "contract:read",
    "supplier:read",
    "workorder:read",
    "invoice:read",
    "invoice:review",
    "budget:read",
    "audit:read"
  ],
  finance_approver: [
    "contract:read",
    "supplier:read",
    "workorder:read",
    "invoice:read",
    "invoice:approve",
    "payment:execute",
    "budget:read",
    "budget:write",
    "audit:read"
  ],
  supplier: [
    // بوابة المورد: يرى ما يخصه فقط — التصفية تتم في طبقة الخدمات
    "contract:read",
    "ticket:read",
    "workorder:read",
    "invoice:read"
  ],
  requester: [
    "asset:read",
    "ticket:read",
    "ticket:create"
  ]
};
function permissionsOf(roles) {
  const set = /* @__PURE__ */ new Set();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}
__name(permissionsOf, "permissionsOf");
function can(user, perm) {
  return permissionsOf(user.roles).has(perm);
}
__name(can, "can");
var ForbiddenError = class extends Error {
  static {
    __name(this, "ForbiddenError");
  }
  status = 403;
  constructor(perm) {
    super(`\u0644\u0627 \u062A\u0645\u0644\u0643 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629: ${perm}`);
    this.name = "ForbiddenError";
  }
};
function require_(user, perm) {
  if (!can(user, perm)) throw new ForbiddenError(perm);
}
__name(require_, "require_");
var SegregationError = class extends Error {
  static {
    __name(this, "SegregationError");
  }
  status = 409;
  constructor(msg) {
    super(msg);
    this.name = "SegregationError";
  }
};

// src/domain/ids.ts
function year() {
  return (/* @__PURE__ */ new Date()).getUTCFullYear();
}
__name(year, "year");
async function seq(repo, prefix, width) {
  const y = year();
  const n = await repo.nextSequence(`${prefix}-${y}`);
  return `${prefix}-${y}-${String(n).padStart(width, "0")}`;
}
__name(seq, "seq");
var nextTicketRef = /* @__PURE__ */ __name((r) => seq(r, "TK", 5), "nextTicketRef");
var nextWorkOrderRef = /* @__PURE__ */ __name((r) => seq(r, "WO", 5), "nextWorkOrderRef");
var nextInvoiceRef = /* @__PURE__ */ __name((r) => seq(r, "INV", 5), "nextInvoiceRef");
var nextPaymentRef = /* @__PURE__ */ __name((r) => seq(r, "PAY", 5), "nextPaymentRef");
var nextContractId = /* @__PURE__ */ __name((r) => seq(r, "CN", 3), "nextContractId");
async function nextSupplierId(repo) {
  const n = await repo.nextSequence("SUP");
  return `SUP-${String(n).padStart(4, "0")}`;
}
__name(nextSupplierId, "nextSupplierId");
async function nextUserId(repo) {
  const n = await repo.nextSequence("USR");
  return `USR-${String(n).padStart(4, "0")}`;
}
__name(nextUserId, "nextUserId");
async function nextAssetTag(repo, tagPrefix) {
  const n = await repo.nextSequence(`ASSET-${tagPrefix}`);
  return `${tagPrefix}-${String(n).padStart(6, "0")}`;
}
__name(nextAssetTag, "nextAssetTag");

// src/auth/password.ts
var ITERATIONS = 21e4;
var KEY_LEN = 32;
function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
__name(toB64, "toB64");
function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(fromB64, "fromB64");
function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}
__name(newSalt, "newSalt");
async function hashPassword(password, saltB64) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: fromB64(saltB64),
    iterations: ITERATIONS,
    hash: "SHA-256"
  }, key, KEY_LEN * 8);
  return toB64(bits);
}
__name(hashPassword, "hashPassword");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
async function verifyPassword(password, saltB64, expectedHash) {
  if (!saltB64 || !expectedHash) return false;
  const actual = await hashPassword(password, saltB64);
  return timingSafeEqual(actual, expectedHash);
}
__name(verifyPassword, "verifyPassword");
function validatePassword(pw) {
  if (pw.length < 10) return "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0644\u0627 \u062A\u0642\u0644 \u0639\u0646 \u0661\u0660 \u0645\u062D\u0627\u0631\u0641";
  if (!/[A-Za-z]/.test(pw)) return "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062D\u062A\u0648\u064A \u062D\u0631\u0641\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644";
  if (!/[0-9]/.test(pw)) return "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062D\u062A\u0648\u064A \u0631\u0642\u0645\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644";
  return null;
}
__name(validatePassword, "validatePassword");

// src/services/audit.ts
async function log(repo, actor, action, entity, entityId, detail = "") {
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const entry = {
    id: `${at}-${crypto.randomUUID().slice(0, 8)}`,
    at,
    actor,
    action,
    entity,
    entityId,
    detail
  };
  await repo.audit.put(entry.id, entry);
}
__name(log, "log");
async function trail(repo, entity, entityId) {
  const all = await repo.audit.list();
  return all.filter((e) => e.entity === entity && e.entityId === entityId).sort((a, b) => a.at.localeCompare(b.at));
}
__name(trail, "trail");
async function recent(repo, limit = 100) {
  const all = await repo.audit.list();
  return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
__name(recent, "recent");

// src/services/users.ts
async function createUser(repo, actor, input) {
  require_(actor, "user:manage");
  const errors = {};
  if (!input.email?.includes("@")) errors.email = "\u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D";
  if (!input.displayName?.trim()) errors.displayName = "\u0627\u0644\u0627\u0633\u0645 \u0645\u0637\u0644\u0648\u0628";
  if (!input.roles?.length) errors.roles = "\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u062F\u0648\u0631 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644";
  for (const r of input.roles ?? []) {
    if (!ROLES.includes(r)) errors.roles = `\u062F\u0648\u0631 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641: ${r}`;
  }
  if (input.password) {
    const pwErr = validatePassword(input.password);
    if (pwErr) errors.password = pwErr;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (await repo.users.byEmail(input.email)) {
    throw new ConflictError(`\u0627\u0644\u0628\u0631\u064A\u062F ${input.email} \u0645\u0633\u062C\u0651\u0644 \u0645\u0633\u0628\u0642\u0627\u064B`);
  }
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const salt = newSalt();
  const user = {
    id: await nextUserId(repo),
    email: input.email.toLowerCase(),
    displayName: input.displayName.trim(),
    passwordSalt: input.password ? salt : "",
    passwordHash: input.password ? await hashPassword(input.password, salt) : "",
    roles: input.roles,
    department: input.department ?? "",
    supplierId: input.supplierId,
    isActive: true,
    createdAt: now2,
    createdBy: actor.id,
    updatedAt: now2,
    updatedBy: actor.id
  };
  await repo.users.put(user.id, user);
  await log(repo, actor.id, "\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u062A\u062E\u062F\u0645", "user", user.id, `${user.email} [${user.roles.join(",")}]`);
  return user;
}
__name(createUser, "createUser");
var AuthError = class extends DomainError {
  static {
    __name(this, "AuthError");
  }
  constructor(message = "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629") {
    super(message, 401);
    this.name = "AuthError";
  }
};
async function authenticate(repo, email, password) {
  const user = await repo.users.byEmail(email);
  if (!user || !user.isActive || !user.passwordHash) throw new AuthError();
  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) throw new AuthError();
  return user;
}
__name(authenticate, "authenticate");
async function changePassword(repo, actor, userId, newPassword) {
  if (actor.id !== userId) require_(actor, "user:manage");
  const user = await repo.users.get(userId);
  if (!user) throw new NotFoundError("\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", userId);
  const err = validatePassword(newPassword);
  if (err) throw new ValidationError({
    password: err
  });
  const salt = newSalt();
  const updated = {
    ...user,
    passwordSalt: salt,
    passwordHash: await hashPassword(newPassword, salt),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor.id
  };
  await repo.users.put(userId, updated);
  await log(repo, actor.id, "\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "user", userId);
  return updated;
}
__name(changePassword, "changePassword");
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    roles: u.roles,
    department: u.department,
    supplierId: u.supplierId,
    isActive: u.isActive
  };
}
__name(publicUser, "publicUser");
async function listUsers(repo, actor) {
  require_(actor, "user:manage");
  return (await repo.users.list()).sort((a, b) => a.id.localeCompare(b.id)).map(publicUser);
}
__name(listUsers, "listUsers");

// src/http/respond.ts
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
__name(json, "json");
function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers
    }
  });
}
__name(html, "html");
function redirect(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      ...headers
    }
  });
}
__name(redirect, "redirect");
function errorJson(err) {
  const status = statusOf(err);
  const message = err instanceof Error ? err.message : String(err);
  const body = {
    error: message
  };
  if (err && typeof err === "object" && "fields" in err) {
    body.fields = err.fields;
  }
  if (status === 500) console.error(err);
  return json(body, status);
}
__name(errorJson, "errorJson");
async function readBody(req) {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  const form = await req.formData();
  const out = {};
  for (const [k, v] of form.entries()) {
    const val = typeof v === "string" ? v : v.name;
    if (k in out) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [
        ...prev,
        val
      ] : [
        prev,
        val
      ];
    } else {
      out[k] = val;
    }
  }
  return out;
}
__name(readBody, "readBody");
function asArray(v) {
  if (v === void 0 || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}
__name(asArray, "asArray");
function asNumber(v, fallback = 0) {
  if (v === void 0 || v === null || v === "") return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}
__name(asNumber, "asNumber");

// src/services/contracts.ts
function stamp(actor) {
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  return {
    createdAt: now2,
    createdBy: actor,
    updatedAt: now2,
    updatedBy: actor
  };
}
__name(stamp, "stamp");
async function createSupplier(repo, actor, input) {
  require_(actor, "supplier:write");
  const errors = {};
  if (!input.name?.trim()) errors.name = "\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0631\u062F \u0645\u0637\u0644\u0648\u0628";
  if (input.email && !input.email.includes("@")) errors.email = "\u0628\u0631\u064A\u062F \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const id = input.id ?? await nextSupplierId(repo);
  const supplier = {
    id,
    name: input.name.trim(),
    commercialReg: input.commercialReg ?? "",
    contactName: input.contactName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
    supplyScope: input.supplyScope ?? "",
    isActive: input.isActive ?? true,
    ...stamp(actor.id)
  };
  await repo.suppliers.put(id, supplier);
  await log(repo, actor.id, "\u0625\u0646\u0634\u0627\u0621 \u0645\u0648\u0631\u062F", "supplier", id, supplier.name);
  return supplier;
}
__name(createSupplier, "createSupplier");
async function getSupplier(repo, id) {
  const s = await repo.suppliers.get(id);
  if (!s) throw new NotFoundError("\u0627\u0644\u0645\u0648\u0631\u062F", id);
  return s;
}
__name(getSupplier, "getSupplier");
async function createContract(repo, actor, input) {
  require_(actor, "contract:write");
  const errors = {};
  if (!input.title?.trim()) errors.title = "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0639\u0642\u062F \u0645\u0637\u0644\u0648\u0628";
  if (!input.supplierId) errors.supplierId = "\u0627\u0644\u0645\u0648\u0631\u062F \u0645\u0637\u0644\u0648\u0628";
  if (!input.startDate) errors.startDate = "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0628\u062F\u0621 \u0645\u0637\u0644\u0648\u0628";
  if (!input.expiryDate) errors.expiryDate = "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 \u0645\u0637\u0644\u0648\u0628";
  if (input.startDate && input.expiryDate && input.expiryDate <= input.startDate) {
    errors.expiryDate = "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0644\u064A \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0628\u062F\u0621";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  await getSupplier(repo, input.supplierId);
  if (input.budgetLineId && !await repo.budgetLines.get(input.budgetLineId)) {
    throw new NotFoundError("\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629", input.budgetLineId);
  }
  const id = input.id ?? await nextContractId(repo);
  const contract = {
    id,
    title: input.title.trim(),
    supplierId: input.supplierId,
    coveredTypes: input.coveredTypes ?? [],
    coveredSites: input.coveredSites ?? [],
    startDate: input.startDate,
    expiryDate: input.expiryDate,
    value: input.value ?? 0,
    status: input.status ?? "\u0645\u0633\u0648\u062F\u0629",
    billingBasis: input.billingBasis ?? "\u0644\u0643\u0644 \u0623\u0645\u0631 \u0639\u0645\u0644",
    billingCycle: input.billingCycle,
    responseHours: input.responseHours ?? 24,
    penaltyRatePerDay: input.penaltyRatePerDay ?? 0,
    budgetLineId: input.budgetLineId ?? "",
    notes: input.notes ?? "",
    ...stamp(actor.id)
  };
  await repo.contracts.put(id, contract);
  await log(repo, actor.id, "\u0625\u0646\u0634\u0627\u0621 \u0639\u0642\u062F", "contract", id, contract.title);
  return contract;
}
__name(createContract, "createContract");
async function getContract(repo, id) {
  const c = await repo.contracts.get(id);
  if (!c) throw new NotFoundError("\u0627\u0644\u0639\u0642\u062F", id);
  return c;
}
__name(getContract, "getContract");
async function setContractStatus(repo, actor, id, status) {
  require_(actor, "contract:write");
  const c = await getContract(repo, id);
  if (c.status === status) return c;
  if (status === "\u0633\u0627\u0631\u064A" && !c.budgetLineId) {
    throw new ConflictError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0639\u0642\u062F \u0642\u0628\u0644 \u0631\u0628\u0637\u0647 \u0628\u0628\u0646\u062F \u0645\u064A\u0632\u0627\u0646\u064A\u0629");
  }
  const updated = {
    ...c,
    status,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor.id
  };
  await repo.contracts.put(id, updated);
  await log(repo, actor.id, `\u062A\u063A\u064A\u064A\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0639\u0642\u062F \u0625\u0644\u0649 ${status}`, "contract", id);
  return updated;
}
__name(setContractStatus, "setContractStatus");
function isLive(c, at) {
  return c.status === "\u0633\u0627\u0631\u064A" && c.startDate <= at && at <= c.expiryDate;
}
__name(isLive, "isLive");
async function findCoveringContract(repo, typeCode, siteCode, at = (/* @__PURE__ */ new Date()).toISOString()) {
  const all = await repo.contracts.list();
  const candidates = all.filter((c) => isLive(c, at) && (c.coveredTypes.length === 0 || c.coveredTypes.includes(typeCode)) && (c.coveredSites.length === 0 || c.coveredSites.includes(siteCode)));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const spec = /* @__PURE__ */ __name((c) => (c.coveredTypes.length ? 2 : 0) + (c.coveredSites.length ? 1 : 0), "spec");
    const d = spec(b) - spec(a);
    return d !== 0 ? d : a.expiryDate.localeCompare(b.expiryDate);
  });
  return candidates[0];
}
__name(findCoveringContract, "findCoveringContract");
async function listContracts(repo) {
  return (await repo.contracts.list()).sort((a, b) => a.id.localeCompare(b.id));
}
__name(listContracts, "listContracts");
async function listSuppliers(repo) {
  return (await repo.suppliers.list()).sort((a, b) => a.id.localeCompare(b.id));
}
__name(listSuppliers, "listSuppliers");

// src/services/assets.ts
function stamp2(actor) {
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  return {
    createdAt: now2,
    createdBy: actor,
    updatedAt: now2,
    updatedBy: actor
  };
}
__name(stamp2, "stamp");
async function getAssetType(repo, code) {
  const t = await repo.assetTypes.get(code);
  if (!t) throw new NotFoundError("\u0646\u0648\u0639 \u0627\u0644\u0623\u0635\u0644", code);
  return t;
}
__name(getAssetType, "getAssetType");
async function getSite(repo, code) {
  const s = await repo.sites.get(code);
  if (!s) throw new NotFoundError("\u0627\u0644\u0645\u0648\u0642\u0639", code);
  return s;
}
__name(getSite, "getSite");
async function getAsset(repo, tag) {
  const a = await repo.assets.get(tag);
  if (!a) throw new NotFoundError("\u0627\u0644\u0623\u0635\u0644", tag);
  return a;
}
__name(getAsset, "getAsset");
function validateAttributes(fields, attrs) {
  const errors = {};
  for (const f of fields) {
    const v = attrs[f.key];
    const empty = v === void 0 || v === null || v === "";
    if (f.required && empty) {
      errors[f.key] = `${f.label} \u0645\u0637\u0644\u0648\u0628`;
      continue;
    }
    if (empty) continue;
    switch (f.inputType) {
      case "\u0631\u0642\u0645":
        if (typeof v !== "number" && isNaN(Number(v))) {
          errors[f.key] = `${f.label} \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0631\u0642\u0645\u0627\u064B`;
        }
        break;
      case "\u062A\u0627\u0631\u064A\u062E":
        if (isNaN(Date.parse(String(v)))) errors[f.key] = `${f.label} \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u062A\u0627\u0631\u064A\u062E\u0627\u064B \u0635\u0627\u0644\u062D\u0627\u064B`;
        break;
      case "\u0642\u0627\u0626\u0645\u0629":
        if (f.choices && !f.choices.includes(String(v))) {
          errors[f.key] = `${f.label} \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u062D\u062F: ${f.choices.join("\u060C ")}`;
        }
        break;
      case "\u0646\u0639\u0645/\u0644\u0627":
        if (typeof v !== "boolean" && ![
          "true",
          "false"
        ].includes(String(v))) {
          errors[f.key] = `${f.label} \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0646\u0639\u0645 \u0623\u0648 \u0644\u0627`;
        }
        break;
    }
  }
  return errors;
}
__name(validateAttributes, "validateAttributes");
function coerceAttributes(fields, attrs) {
  const out = {};
  for (const f of fields) {
    const v = attrs[f.key];
    if (v === void 0 || v === null || v === "") continue;
    switch (f.inputType) {
      case "\u0631\u0642\u0645":
        out[f.key] = Number(v);
        break;
      case "\u0646\u0639\u0645/\u0644\u0627":
        out[f.key] = v === true || v === "true";
        break;
      default:
        out[f.key] = String(v);
    }
  }
  return out;
}
__name(coerceAttributes, "coerceAttributes");
async function createAsset(repo, actor, input) {
  require_(actor, "asset:write");
  const type = await getAssetType(repo, input.typeCode);
  if (!type.isEnabled) throw new ConflictError(`\u0646\u0648\u0639 \u0627\u0644\u0623\u0635\u0644 ${type.name} \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644`);
  await getSite(repo, input.siteCode);
  const errors = {};
  if (!input.name?.trim()) errors.name = "\u0627\u0633\u0645 \u0627\u0644\u0623\u0635\u0644 \u0645\u0637\u0644\u0648\u0628";
  if (type.needsSerial && !input.serialNumber?.trim()) {
    errors.serialNumber = "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A \u0645\u0637\u0644\u0648\u0628 \u0644\u0647\u0630\u0627 \u0627\u0644\u0646\u0648\u0639";
  }
  Object.assign(errors, validateAttributes(type.fields, input.attributes ?? {}));
  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (input.serialNumber) {
    const dup = (await repo.assets.list()).find((a) => a.serialNumber && a.serialNumber === input.serialNumber);
    if (dup) throw new ConflictError(`\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A \u0645\u0633\u062C\u0651\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0635\u0644 ${dup.tag}`);
  }
  const tag = input.tag ?? await nextAssetTag(repo, type.tagPrefix);
  const asset = {
    tag,
    typeCode: type.code,
    name: input.name.trim(),
    manufacturer: input.manufacturer ?? "",
    modelName: input.modelName ?? "",
    serialNumber: input.serialNumber ?? "",
    siteCode: input.siteCode,
    department: input.department ?? "",
    custodian: input.custodian ?? "",
    acquisitionDate: input.acquisitionDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    acquisitionCost: input.acquisitionCost ?? 0,
    acquisitionSource: input.acquisitionSource ?? "\u0634\u0631\u0627\u0621",
    warrantyEnd: input.warrantyEnd,
    status: input.status ?? "\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629",
    sourceContractId: input.sourceContractId,
    attributes: coerceAttributes(type.fields, input.attributes ?? {}),
    notes: input.notes ?? "",
    ...stamp2(actor.id)
  };
  await repo.assets.put(tag, asset);
  await log(repo, actor.id, "\u062A\u0633\u062C\u064A\u0644 \u0623\u0635\u0644", "asset", tag, `${asset.name} @ ${asset.siteCode}`);
  return asset;
}
__name(createAsset, "createAsset");
async function receiveFromContract(repo, actor, contractId, items) {
  require_(actor, "asset:write");
  const contract = await repo.contracts.get(contractId);
  if (!contract) throw new NotFoundError("\u0627\u0644\u0639\u0642\u062F", contractId);
  const created = [];
  for (const it of items) {
    created.push(await createAsset(repo, actor, {
      typeCode: it.typeCode,
      name: it.name,
      siteCode: it.siteCode,
      serialNumber: it.serialNumber,
      attributes: it.attributes,
      acquisitionCost: it.cost ?? 0,
      acquisitionSource: "\u0634\u0631\u0627\u0621",
      sourceContractId: contractId
    }));
  }
  await log(repo, actor.id, "\u062A\u0631\u062D\u064A\u0644 \u062A\u0648\u0631\u064A\u062F\u0627\u062A \u0627\u0644\u0639\u0642\u062F \u0625\u0644\u0649 \u0623\u0635\u0648\u0644", "contract", contractId, `${created.length} \u0623\u0635\u0644`);
  return created;
}
__name(receiveFromContract, "receiveFromContract");
async function setAssetStatus(repo, actor, tag, status) {
  require_(actor, "asset:write");
  const a = await getAsset(repo, tag);
  const updated = {
    ...a,
    status,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor.id
  };
  await repo.assets.put(tag, updated);
  await log(repo, actor.id, `\u062A\u063A\u064A\u064A\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0623\u0635\u0644 \u0625\u0644\u0649 ${status}`, "asset", tag);
  return updated;
}
__name(setAssetStatus, "setAssetStatus");
function depreciation(asset, type, at = /* @__PURE__ */ new Date()) {
  const cost = asset.acquisitionCost ?? 0;
  const life = type.usefulLifeYears || 0;
  if (life <= 0 || cost <= 0) {
    return {
      method: "\u0642\u0633\u0637 \u062B\u0627\u0628\u062A",
      cost,
      usefulLifeYears: life,
      annualDepreciation: 0,
      elapsedYears: 0,
      accumulated: 0,
      bookValue: cost
    };
  }
  const start = new Date(asset.acquisitionDate);
  const years = Math.max(0, (at.getTime() - start.getTime()) / (365.25 * 24 * 36e5));
  const annual = cost / life;
  const accumulated = Math.min(cost, annual * years);
  return {
    method: "\u0642\u0633\u0637 \u062B\u0627\u0628\u062A",
    cost,
    usefulLifeYears: life,
    annualDepreciation: round2(annual),
    elapsedYears: round2(years),
    accumulated: round2(accumulated),
    bookValue: round2(cost - accumulated)
  };
}
__name(depreciation, "depreciation");
function round2(n) {
  return Math.round(n * 100) / 100;
}
__name(round2, "round2");
async function totalCostOfOwnership(repo, tag) {
  const asset = await getAsset(repo, tag);
  const wos = (await repo.workOrders.list()).filter((w) => w.assetTag === tag && w.status !== "\u0645\u0644\u063A\u0649");
  const maintenance = wos.reduce((s, w) => s + (w.billableAmount ?? 0), 0);
  return {
    acquisition: round2(asset.acquisitionCost ?? 0),
    maintenance: round2(maintenance),
    total: round2((asset.acquisitionCost ?? 0) + maintenance),
    workOrders: wos.length
  };
}
__name(totalCostOfOwnership, "totalCostOfOwnership");
function qrPayload(baseUrl, tag) {
  return `${baseUrl.replace(/\/$/, "")}/a/${encodeURIComponent(tag)}`;
}
__name(qrPayload, "qrPayload");
async function listAssets(repo, filter) {
  let items = await repo.assets.list();
  if (filter?.typeCode) items = items.filter((a) => a.typeCode === filter.typeCode);
  if (filter?.siteCode) items = items.filter((a) => a.siteCode === filter.siteCode);
  if (filter?.status) items = items.filter((a) => a.status === filter.status);
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    items = items.filter((a) => a.tag.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.serialNumber.toLowerCase().includes(q));
  }
  return items.sort((a, b) => a.tag.localeCompare(b.tag));
}
__name(listAssets, "listAssets");

// src/services/tickets.ts
function stamp3(actor) {
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  return {
    createdAt: now2,
    createdBy: actor,
    updatedAt: now2,
    updatedBy: actor
  };
}
__name(stamp3, "stamp");
var TICKET_TRANSITIONS = {
  "\u062C\u062F\u064A\u062F": [
    "\u0645\u0639\u064A\u0651\u0646",
    "\u0645\u0644\u063A\u0649"
  ],
  "\u0645\u0639\u064A\u0651\u0646": [
    "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630",
    "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0642\u0637\u0639 \u063A\u064A\u0627\u0631",
    "\u0645\u0644\u063A\u0649"
  ],
  "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630": [
    "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0642\u0637\u0639 \u063A\u064A\u0627\u0631",
    "\u0645\u063A\u0644\u0642",
    "\u0645\u0644\u063A\u0649"
  ],
  "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0642\u0637\u0639 \u063A\u064A\u0627\u0631": [
    "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630",
    "\u0645\u063A\u0644\u0642",
    "\u0645\u0644\u063A\u0649"
  ],
  "\u0645\u063A\u0644\u0642": [],
  "\u0645\u0644\u063A\u0649": []
};
function canTransition(from, to) {
  return TICKET_TRANSITIONS[from].includes(to);
}
__name(canTransition, "canTransition");
async function getTicket(repo, ref) {
  const t = await repo.tickets.get(ref);
  if (!t) throw new NotFoundError("\u0627\u0644\u0628\u0644\u0627\u063A", ref);
  return t;
}
__name(getTicket, "getTicket");
async function createTicket(repo, actor, input) {
  require_(actor, "ticket:create");
  const errors = {};
  if (!input.assetTag) errors.assetTag = "\u0631\u0642\u0645 \u0627\u0644\u0623\u0635\u0644 \u0645\u0637\u0644\u0648\u0628";
  if (!input.description?.trim()) errors.description = "\u0648\u0635\u0641 \u0627\u0644\u0639\u0637\u0644 \u0645\u0637\u0644\u0648\u0628";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const asset = await getAsset(repo, input.assetTag);
  if (asset.status === "\u0645\u0634\u0637\u0648\u0628") {
    throw new ConflictError(`\u0627\u0644\u0623\u0635\u0644 ${asset.tag} \u0645\u0634\u0637\u0648\u0628 \u0648\u0644\u0627 \u062A\u064F\u0642\u0628\u0644 \u0639\u0644\u064A\u0647 \u0628\u0644\u0627\u063A\u0627\u062A`);
  }
  const now2 = /* @__PURE__ */ new Date();
  const priority = input.priority ?? "\u0645\u062A\u0648\u0633\u0637";
  const contract = await findCoveringContract(repo, asset.typeCode, asset.siteCode, now2.toISOString());
  const slaHours = contract?.responseHours ?? PRIORITY_SLA_HOURS[priority];
  const ref = await nextTicketRef(repo);
  const ticket = {
    ref,
    assetTag: asset.tag,
    typeCode: asset.typeCode,
    siteCode: asset.siteCode,
    requestingDept: input.requestingDept ?? actor.department,
    reportedBy: actor.id,
    description: input.description.trim(),
    priority,
    status: "\u062C\u062F\u064A\u062F",
    contractId: contract?.id,
    supplierId: contract?.supplierId,
    dueDate: new Date(now2.getTime() + slaHours * 36e5).toISOString(),
    slaBreached: false,
    isPreventive: input.isPreventive ?? false,
    ...stamp3(actor.id)
  };
  await repo.tickets.put(ref, ticket);
  await log(repo, actor.id, "\u0641\u062A\u062D \u0628\u0644\u0627\u063A", "ticket", ref, contract ? `\u0645\u063A\u0637\u0651\u0649 \u0628\u0627\u0644\u0639\u0642\u062F ${contract.id}` : "\u0628\u0644\u0627 \u0639\u0642\u062F \u0633\u0627\u0631\u064A");
  return ticket;
}
__name(createTicket, "createTicket");
async function assignTicket(repo, actor, ref, assignee) {
  require_(actor, "ticket:assign");
  const t = await getTicket(repo, ref);
  if (t.status !== "\u062C\u062F\u064A\u062F" && t.status !== "\u0645\u0639\u064A\u0651\u0646") {
    throw new ConflictError(`\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0639\u064A\u064A\u0646 \u0648\u0627\u0644\u0628\u0644\u0627\u063A \u0641\u064A \u062D\u0627\u0644\u0629 \xAB${t.status}\xBB`);
  }
  const updated = {
    ...t,
    assignedTo: assignee,
    status: "\u0645\u0639\u064A\u0651\u0646",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor.id
  };
  await repo.tickets.put(ref, updated);
  await log(repo, actor.id, "\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0628\u0644\u0627\u063A", "ticket", ref, assignee);
  return updated;
}
__name(assignTicket, "assignTicket");
async function setTicketStatus(repo, actor, ref, status) {
  require_(actor, status === "\u0645\u063A\u0644\u0642" ? "ticket:close" : "ticket:assign");
  const t = await getTicket(repo, ref);
  if (t.status === status) return t;
  if (!canTransition(t.status, status)) {
    throw new ConflictError(`\u0627\u0646\u062A\u0642\u0627\u0644 \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D: \xAB${t.status}\xBB \u2190 \xAB${status}\xBB`);
  }
  if (status === "\u0645\u063A\u0644\u0642") {
    if (!t.workOrderRef) throw new ConflictError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0628\u0644\u0627\u063A \u0642\u0628\u0644 \u0625\u0646\u062C\u0627\u0632 \u0623\u0645\u0631 \u0639\u0645\u0644 \u0639\u0644\u064A\u0647");
    const wo = await repo.workOrders.get(t.workOrderRef);
    if (!wo || wo.status !== "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" && wo.status !== "\u0645\u063A\u0644\u0642") {
      throw new ConflictError("\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0631\u062A\u0628\u0637 \u0644\u0645 \u064A\u064F\u0646\u062C\u064E\u0632 \u0641\u0646\u064A\u0627\u064B \u0628\u0639\u062F");
    }
  }
  const now2 = /* @__PURE__ */ new Date();
  const updated = {
    ...t,
    status,
    closedDate: status === "\u0645\u063A\u0644\u0642" ? now2.toISOString() : t.closedDate,
    slaBreached: status === "\u0645\u063A\u0644\u0642" ? now2.toISOString() > t.dueDate : t.slaBreached,
    updatedAt: now2.toISOString(),
    updatedBy: actor.id
  };
  await repo.tickets.put(ref, updated);
  await log(repo, actor.id, `\u062A\u063A\u064A\u064A\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0628\u0644\u0627\u063A \u0625\u0644\u0649 ${status}`, "ticket", ref);
  if (status === "\u0645\u063A\u0644\u0642") {
    const asset = await repo.assets.get(t.assetTag);
    if (asset && asset.status === "\u062A\u062D\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629") {
      await setAssetStatus(repo, actor, t.assetTag, "\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629");
    }
  }
  return updated;
}
__name(setTicketStatus, "setTicketStatus");
async function refreshSlaFlags(repo) {
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const open = (await repo.tickets.list()).filter((t) => t.status !== "\u0645\u063A\u0644\u0642" && t.status !== "\u0645\u0644\u063A\u0649" && !t.slaBreached && t.dueDate < now2);
  for (const t of open) {
    await repo.tickets.put(t.ref, {
      ...t,
      slaBreached: true,
      updatedAt: now2,
      updatedBy: "system"
    });
  }
  return open.length;
}
__name(refreshSlaFlags, "refreshSlaFlags");
async function listTickets(repo, filter) {
  let items = await repo.tickets.list();
  if (filter?.status) items = items.filter((t) => t.status === filter.status);
  if (filter?.siteCode) items = items.filter((t) => t.siteCode === filter.siteCode);
  if (filter?.assetTag) items = items.filter((t) => t.assetTag === filter.assetTag);
  if (filter?.supplierId) items = items.filter((t) => t.supplierId === filter.supplierId);
  return items.sort((a, b) => b.ref.localeCompare(a.ref));
}
__name(listTickets, "listTickets");

// src/services/workorders.ts
function stamp4(actor) {
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  return {
    createdAt: now2,
    createdBy: actor,
    updatedAt: now2,
    updatedBy: actor
  };
}
__name(stamp4, "stamp");
async function getWorkOrder(repo, ref) {
  const w = await repo.workOrders.get(ref);
  if (!w) throw new NotFoundError("\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644", ref);
  return w;
}
__name(getWorkOrder, "getWorkOrder");
async function openWorkOrder(repo, actor, input) {
  require_(actor, "workorder:write");
  const ticket = await getTicket(repo, input.ticketRef);
  if (ticket.status === "\u0645\u063A\u0644\u0642" || ticket.status === "\u0645\u0644\u063A\u0649") {
    throw new ConflictError(`\u0627\u0644\u0628\u0644\u0627\u063A ${ticket.ref} \u0641\u064A \u062D\u0627\u0644\u0629 \xAB${ticket.status}\xBB`);
  }
  if (ticket.workOrderRef) {
    const existing = await repo.workOrders.get(ticket.workOrderRef);
    if (existing && existing.status !== "\u0645\u0644\u063A\u0649") {
      throw new ConflictError(`\u0644\u0644\u0628\u0644\u0627\u063A \u0623\u0645\u0631 \u0639\u0645\u0644 \u0642\u0627\u0626\u0645: ${existing.ref}`);
    }
  }
  const ref = await nextWorkOrderRef(repo);
  const wo = {
    ref,
    ticketRef: ticket.ref,
    assetTag: ticket.assetTag,
    siteCode: ticket.siteCode,
    workType: input.workType ?? (ticket.isPreventive ? "\u0635\u064A\u0627\u0646\u0629 \u0648\u0642\u0627\u0626\u064A\u0629" : "\u0625\u0635\u0644\u0627\u062D"),
    technician: input.technician ?? actor.id,
    partsUsed: "",
    laborHours: 0,
    outcome: "",
    status: "\u0645\u0641\u062A\u0648\u062D",
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    contractId: ticket.contractId,
    supplierId: ticket.supplierId,
    underContract: false,
    billableAmount: 0,
    penaltyAmount: 0,
    ...stamp4(actor.id)
  };
  await repo.workOrders.put(ref, wo);
  await repo.tickets.put(ticket.ref, {
    ...ticket,
    workOrderRef: ref,
    status: ticket.status === "\u062C\u062F\u064A\u062F" || ticket.status === "\u0645\u0639\u064A\u0651\u0646" ? "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630" : ticket.status,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor.id
  });
  const asset = await repo.assets.get(ticket.assetTag);
  if (asset && asset.status === "\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629" && wo.workType !== "\u0641\u062D\u0635") {
    await setAssetStatus(repo, actor, asset.tag, "\u062A\u062D\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629");
  }
  await log(repo, actor.id, "\u0641\u062A\u062D \u0623\u0645\u0631 \u0639\u0645\u0644", "workorder", ref, `\u0639\u0644\u0649 \u0627\u0644\u0628\u0644\u0627\u063A ${ticket.ref}`);
  return wo;
}
__name(openWorkOrder, "openWorkOrder");
async function completeWorkOrder(repo, actor, ref, input) {
  require_(actor, "workorder:complete");
  const wo = await getWorkOrder(repo, ref);
  if (wo.status === "\u0645\u063A\u0644\u0642" || wo.status === "\u0645\u0644\u063A\u0649") {
    throw new ConflictError(`\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${ref} \u0641\u064A \u062D\u0627\u0644\u0629 \xAB${wo.status}\xBB`);
  }
  if (!input.outcome?.trim()) {
    throw new ValidationError({
      outcome: "\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0639\u0645\u0644 \u0645\u0637\u0644\u0648\u0628\u0629"
    });
  }
  const ticket = await getTicket(repo, wo.ticketRef);
  const contract = wo.contractId ? await repo.contracts.get(wo.contractId) : null;
  const periodic = contract?.billingBasis === "\u062F\u0641\u0639\u0627\u062A \u062F\u0648\u0631\u064A\u0629";
  const billable = periodic ? 0 : Math.max(0, input.billableAmount ?? 0);
  if (billable > 0) require_(actor, "workorder:price");
  const now2 = /* @__PURE__ */ new Date();
  let penalty = 0;
  if (contract && contract.penaltyRatePerDay > 0 && now2.toISOString() > ticket.dueDate) {
    const lateDays = Math.max(1, Math.floor((now2.getTime() - new Date(ticket.dueDate).getTime()) / (24 * 36e5)));
    penalty = Math.round(billable * contract.penaltyRatePerDay * lateDays * 100) / 100;
    penalty = Math.min(penalty, billable);
  }
  const updated = {
    ...wo,
    outcome: input.outcome.trim(),
    partsUsed: input.partsUsed ?? wo.partsUsed,
    laborHours: input.laborHours ?? wo.laborHours,
    status: "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B",
    closedDate: now2.toISOString(),
    underContract: periodic,
    billableAmount: billable,
    penaltyAmount: penalty,
    updatedAt: now2.toISOString(),
    updatedBy: actor.id
  };
  await repo.workOrders.put(ref, updated);
  await log(repo, actor.id, "\u0625\u0646\u062C\u0627\u0632 \u0623\u0645\u0631 \u0639\u0645\u0644 \u0641\u0646\u064A\u0627\u064B", "workorder", ref, periodic ? "\u0645\u0634\u0645\u0648\u0644 \u0628\u062F\u0641\u0639\u0627\u062A \u0627\u0644\u0639\u0642\u062F \u0627\u0644\u062F\u0648\u0631\u064A\u0629" : `\u0645\u0628\u0644\u063A \u0645\u0633\u062A\u062D\u0642: ${billable}`);
  return updated;
}
__name(completeWorkOrder, "completeWorkOrder");
async function markInvoiced(repo, actor, ref, invoiceRef) {
  const wo = await getWorkOrder(repo, ref);
  if (wo.invoiceRef && wo.invoiceRef !== invoiceRef) {
    throw new ConflictError(`\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${ref} \u0645\u0641\u0648\u062A\u064E\u0631 \u0645\u0633\u0628\u0642\u0627\u064B \u0628\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 ${wo.invoiceRef}`);
  }
  const updated = {
    ...wo,
    invoiceRef,
    status: "\u0645\u063A\u0644\u0642",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor
  };
  await repo.workOrders.put(ref, updated);
  await log(repo, actor, "\u0631\u0628\u0637 \u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 \u0628\u0641\u0627\u062A\u0648\u0631\u0629", "workorder", ref, invoiceRef);
  return updated;
}
__name(markInvoiced, "markInvoiced");
async function billableWorkOrders(repo, supplierId) {
  return (await repo.workOrders.list()).filter((w) => w.status === "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" && !w.invoiceRef && !w.underContract && w.billableAmount > 0 && (!supplierId || w.supplierId === supplierId)).sort((a, b) => a.ref.localeCompare(b.ref));
}
__name(billableWorkOrders, "billableWorkOrders");
async function listWorkOrders(repo, filter) {
  let items = await repo.workOrders.list();
  if (filter?.status) items = items.filter((w) => w.status === filter.status);
  if (filter?.supplierId) items = items.filter((w) => w.supplierId === filter.supplierId);
  if (filter?.assetTag) items = items.filter((w) => w.assetTag === filter.assetTag);
  return items.sort((a, b) => b.ref.localeCompare(a.ref));
}
__name(listWorkOrders, "listWorkOrders");

// src/services/budget.ts
async function getBudgetLine(repo, id) {
  const b = await repo.budgetLines.get(id);
  if (!b) throw new NotFoundError("\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629", id);
  return b;
}
__name(getBudgetLine, "getBudgetLine");
function available(line) {
  return Math.round((line.allocated - line.committed - line.spent) * 1e3) / 1e3;
}
__name(available, "available");
async function createBudgetLine(repo, actor, input) {
  require_(actor, "budget:write");
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const line = {
    id: input.id,
    name: input.name,
    fiscalYear: input.fiscalYear,
    allocated: input.allocated,
    committed: 0,
    spent: 0,
    isActive: true,
    createdAt: now2,
    createdBy: actor.id,
    updatedAt: now2,
    updatedBy: actor.id
  };
  await repo.budgetLines.put(line.id, line);
  await log(repo, actor.id, "\u0625\u0646\u0634\u0627\u0621 \u0628\u0646\u062F \u0645\u064A\u0632\u0627\u0646\u064A\u0629", "budget", line.id, `${input.allocated}`);
  return line;
}
__name(createBudgetLine, "createBudgetLine");
async function assertAvailable(repo, lineId, amount) {
  const line = await getBudgetLine(repo, lineId);
  if (!line.isActive) throw new ConflictError(`\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 ${lineId} \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644`);
  if (available(line) < amount) {
    throw new ConflictError(`\u0627\u0644\u0633\u064A\u0648\u0644\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064A\u0629 \u0641\u064A \u0628\u0646\u062F \xAB${line.name}\xBB: \u0627\u0644\u0645\u062A\u0627\u062D ${available(line)} \u0648\u0627\u0644\u0645\u0637\u0644\u0648\u0628 ${amount}`);
  }
  return line;
}
__name(assertAvailable, "assertAvailable");
async function commit(repo, actor, lineId, amount) {
  const line = await assertAvailable(repo, lineId, amount);
  const updated = {
    ...line,
    committed: round3(line.committed + amount),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor
  };
  await repo.budgetLines.put(lineId, updated);
  await log(repo, actor, "\u062D\u062C\u0632 \u0645\u0627\u0644\u064A", "budget", lineId, `${amount}`);
  return updated;
}
__name(commit, "commit");
async function spend(repo, actor, lineId, amount) {
  const line = await getBudgetLine(repo, lineId);
  const updated = {
    ...line,
    committed: round3(Math.max(0, line.committed - amount)),
    spent: round3(line.spent + amount),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actor
  };
  await repo.budgetLines.put(lineId, updated);
  await log(repo, actor, "\u0635\u0631\u0641 \u0641\u0639\u0644\u064A", "budget", lineId, `${amount}`);
  return updated;
}
__name(spend, "spend");
function round3(n) {
  return Math.round(n * 1e3) / 1e3;
}
__name(round3, "round3");
async function listBudgetLines(repo) {
  return (await repo.budgetLines.list()).sort((a, b) => a.id.localeCompare(b.id));
}
__name(listBudgetLines, "listBudgetLines");

// src/services/invoices.ts
function round32(n) {
  return Math.round(n * 1e3) / 1e3;
}
__name(round32, "round3");
async function getInvoice(repo, ref) {
  const i = await repo.invoices.get(ref);
  if (!i) throw new NotFoundError("\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629", ref);
  return i;
}
__name(getInvoice, "getInvoice");
async function draftFromWorkOrders(repo, actor, input) {
  require_(actor, "invoice:create");
  if (!input.workOrderRefs.length) {
    throw new ValidationError({
      workOrderRefs: "\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0623\u0645\u0631 \u0639\u0645\u0644 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644"
    });
  }
  const wos = [];
  for (const ref2 of input.workOrderRefs) {
    const w = await repo.workOrders.get(ref2);
    if (!w) throw new NotFoundError("\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644", ref2);
    if (w.invoiceRef) throw new ConflictError(`\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${ref2} \u0645\u0641\u0648\u062A\u064E\u0631 \u0645\u0633\u0628\u0642\u0627\u064B (${w.invoiceRef})`);
    if (w.status !== "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B") {
      throw new ConflictError(`\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${ref2} \u063A\u064A\u0631 \u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B (${w.status})`);
    }
    if (w.underContract) {
      throw new ConflictError(`\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${ref2} \u0645\u0634\u0645\u0648\u0644 \u0628\u062F\u0641\u0639\u0627\u062A \u0627\u0644\u0639\u0642\u062F \u0627\u0644\u062F\u0648\u0631\u064A\u0629 \u0648\u0644\u0627 \u064A\u064F\u0641\u0648\u062A\u064E\u0631 \u0645\u0646\u0641\u0631\u062F\u0627\u064B`);
    }
    if (w.supplierId !== input.supplierId) {
      throw new ConflictError(`\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${ref2} \u064A\u0639\u0648\u062F \u0644\u0645\u0648\u0631\u062F \u0622\u062E\u0631`);
    }
    wos.push(w);
  }
  const contractIds = [
    ...new Set(wos.map((w) => w.contractId).filter(Boolean))
  ];
  if (contractIds.length > 1) {
    throw new ConflictError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062C\u0645\u0639 \u0623\u0648\u0627\u0645\u0631 \u0639\u0645\u0644 \u0645\u0646 \u0639\u0642\u0648\u062F \u0645\u062E\u062A\u0644\u0641\u0629 \u0641\u064A \u0641\u0627\u062A\u0648\u0631\u0629 \u0648\u0627\u062D\u062F\u0629");
  }
  const contractId = contractIds[0];
  const contract = contractId ? await repo.contracts.get(contractId) : null;
  const gross = round32(wos.reduce((s, w) => s + w.billableAmount, 0));
  const penalty = round32(wos.reduce((s, w) => s + w.penaltyAmount, 0));
  const net = round32(gross - penalty);
  const vat = round32(net * VAT_RATE);
  const total = round32(net + vat);
  const budgetLineId = input.budgetLineId ?? contract?.budgetLineId ?? "";
  if (!budgetLineId) {
    throw new ValidationError({
      budgetLineId: "\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 \u0645\u0637\u0644\u0648\u0628"
    });
  }
  await assertAvailable(repo, budgetLineId, total);
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const ref = await nextInvoiceRef(repo);
  const invoice = {
    ref,
    supplierId: input.supplierId,
    contractId,
    basis: "\u0623\u0645\u0631 \u0639\u0645\u0644",
    workOrderRefs: wos.map((w) => w.ref),
    description: input.description ?? `\u0623\u0639\u0645\u0627\u0644 \u0635\u064A\u0627\u0646\u0629: ${wos.map((w) => w.ref).join("\u060C ")}`,
    amount: net,
    vatAmount: vat,
    penaltyAmount: penalty,
    grandTotal: total,
    issueDate: now2,
    status: "\u0645\u0633\u0648\u062F\u0629",
    budgetLineId,
    supplierInvoiceNo: input.supplierInvoiceNo ?? "",
    createdAt: now2,
    createdBy: actor.id,
    updatedAt: now2,
    updatedBy: actor.id
  };
  await repo.invoices.put(ref, invoice);
  for (const w of wos) await markInvoiced(repo, actor.id, w.ref, ref);
  await log(repo, actor.id, "\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0648\u062F\u0629 \u0641\u0627\u062A\u0648\u0631\u0629", "invoice", ref, `\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A ${total}`);
  return invoice;
}
__name(draftFromWorkOrders, "draftFromWorkOrders");
async function autoInvoice(repo, actor) {
  require_(actor, "invoice:create");
  const pending = await billableWorkOrders(repo);
  const groups = /* @__PURE__ */ new Map();
  for (const w of pending) {
    if (!w.supplierId) continue;
    const key = `${w.supplierId}::${w.contractId ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(w);
    groups.set(key, arr);
  }
  const out = [];
  for (const [key, wos] of groups) {
    const [supplierId] = key.split("::");
    try {
      out.push(await draftFromWorkOrders(repo, actor, {
        supplierId,
        workOrderRefs: wos.map((w) => w.ref)
      }));
    } catch (err) {
      await log(repo, actor.id, "\u062A\u0639\u0630\u0651\u0631\u062A \u0627\u0644\u0641\u0648\u062A\u0631\u0629 \u0627\u0644\u0622\u0644\u064A\u0629", "supplier", supplierId, err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}
__name(autoInvoice, "autoInvoice");
async function threeWayMatch(repo, ref) {
  const inv = await getInvoice(repo, ref);
  const checks = [];
  if (inv.contractId) {
    const c = await repo.contracts.get(inv.contractId);
    if (!c) {
      checks.push({
        name: "\u0627\u0644\u0639\u0642\u062F",
        ok: false,
        detail: `\u0627\u0644\u0639\u0642\u062F ${inv.contractId} \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F`
      });
    } else if (c.supplierId !== inv.supplierId) {
      checks.push({
        name: "\u0627\u0644\u0639\u0642\u062F",
        ok: false,
        detail: "\u0627\u0644\u0639\u0642\u062F \u064A\u0639\u0648\u062F \u0644\u0645\u0648\u0631\u062F \u0645\u062E\u062A\u0644\u0641 \u0639\u0646 \u0645\u0648\u0631\u062F \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629"
      });
    } else if (!isLive(c, inv.issueDate)) {
      checks.push({
        name: "\u0627\u0644\u0639\u0642\u062F",
        ok: false,
        detail: `\u0627\u0644\u0639\u0642\u062F ${c.id} \u063A\u064A\u0631 \u0633\u0627\u0631\u064A \u0641\u064A \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 (${c.status})`
      });
    } else {
      checks.push({
        name: "\u0627\u0644\u0639\u0642\u062F",
        ok: true,
        detail: `\u0627\u0644\u0639\u0642\u062F ${c.id} \u0633\u0627\u0631\u064A \u0648\u0645\u0637\u0627\u0628\u0642 \u0644\u0644\u0645\u0648\u0631\u062F`
      });
    }
  } else {
    checks.push({
      name: "\u0627\u0644\u0639\u0642\u062F",
      ok: false,
      detail: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0639\u0642\u062F \u0623\u0648 \u0623\u0645\u0631 \u0634\u0631\u0627\u0621 \u0645\u0631\u062C\u0639\u064A \u2014 \u064A\u0644\u0632\u0645 \u0627\u0633\u062A\u062B\u0646\u0627\u0621 \u0645\u0639\u062A\u0645\u062F"
    });
  }
  let sumGross = 0, sumPenalty = 0;
  let deliveryOk = inv.workOrderRefs.length > 0;
  const problems = [];
  for (const woRef of inv.workOrderRefs) {
    const w = await repo.workOrders.get(woRef);
    if (!w) {
      deliveryOk = false;
      problems.push(`${woRef} \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F`);
      continue;
    }
    if (w.status !== "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" && w.status !== "\u0645\u063A\u0644\u0642") {
      deliveryOk = false;
      problems.push(`${woRef} \u063A\u064A\u0631 \u0645\u0646\u062C\u0632`);
    }
    if (!w.outcome?.trim()) {
      deliveryOk = false;
      problems.push(`${woRef} \u0628\u0644\u0627 \u062A\u0642\u0631\u064A\u0631 \u0625\u0646\u062C\u0627\u0632`);
    }
    if (w.invoiceRef && w.invoiceRef !== ref) {
      deliveryOk = false;
      problems.push(`${woRef} \u0645\u0631\u0628\u0648\u0637 \u0628\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u062E\u0631\u0649`);
    }
    sumGross += w.billableAmount;
    sumPenalty += w.penaltyAmount;
  }
  checks.push({
    name: "\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0625\u0646\u062C\u0627\u0632",
    ok: deliveryOk,
    detail: deliveryOk ? `${inv.workOrderRefs.length} \u0623\u0645\u0631 \u0639\u0645\u0644 \u0645\u0646\u062C\u0632 \u0628\u062A\u0642\u0627\u0631\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629` : problems.join("\u061B ")
  });
  const expectedNet = round32(sumGross - sumPenalty);
  const expectedTotal = round32(expectedNet + round32(expectedNet * VAT_RATE));
  const amountOk = Math.abs(expectedTotal - inv.grandTotal) < 5e-3;
  checks.push({
    name: "\u0645\u0628\u0644\u063A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629",
    ok: amountOk,
    detail: amountOk ? `\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A ${inv.grandTotal} \u0645\u0637\u0627\u0628\u0642 \u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644` : `\u0627\u0644\u0645\u062A\u0648\u0642\u0639 ${expectedTotal} \u0648\u0627\u0644\u0645\u0633\u062C\u0651\u0644 ${inv.grandTotal}`
  });
  let budgetOk = true, budgetDetail = "";
  try {
    const line = await assertAvailable(repo, inv.budgetLineId, inv.grandTotal);
    budgetDetail = `\u0633\u064A\u0648\u0644\u0629 \u0643\u0627\u0641\u064A\u0629 \u0641\u064A \u0628\u0646\u062F \xAB${line.name}\xBB`;
  } catch (err) {
    budgetOk = false;
    budgetDetail = err instanceof Error ? err.message : String(err);
  }
  checks.push({
    name: "\u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629",
    ok: budgetOk,
    detail: budgetDetail
  });
  return {
    matched: checks.every((c) => c.ok),
    checks,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(threeWayMatch, "threeWayMatch");
async function setInvoiceStatus(repo, actorId, ref, status, extra = {}) {
  const inv = await getInvoice(repo, ref);
  const updated = {
    ...inv,
    ...extra,
    status,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: actorId
  };
  await repo.invoices.put(ref, updated);
  await log(repo, actorId, `\u062A\u063A\u064A\u064A\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0625\u0644\u0649 ${status}`, "invoice", ref);
  return updated;
}
__name(setInvoiceStatus, "setInvoiceStatus");
async function listInvoices(repo, filter) {
  let items = await repo.invoices.list();
  if (filter?.status) items = items.filter((i) => i.status === filter.status);
  if (filter?.supplierId) items = items.filter((i) => i.supplierId === filter.supplierId);
  return items.sort((a, b) => b.ref.localeCompare(a.ref));
}
__name(listInvoices, "listInvoices");

// src/services/approvals.ts
function stamp5(actor) {
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  return {
    createdAt: now2,
    createdBy: actor,
    updatedAt: now2,
    updatedBy: actor
  };
}
__name(stamp5, "stamp");
async function chainOf(repo, invoiceRef) {
  return (await repo.approvals.list()).filter((a) => a.invoiceRef === invoiceRef).sort((a, b) => a.order - b.order);
}
__name(chainOf, "chainOf");
async function submitForApproval(repo, actor, invoiceRef) {
  require_(actor, "invoice:submit");
  const inv = await getInvoice(repo, invoiceRef);
  if (inv.status !== "\u0645\u0633\u0648\u062F\u0629" && inv.status !== "\u0645\u0631\u0641\u0648\u0636\u0629") {
    throw new ConflictError(`\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0641\u064A \u062D\u0627\u0644\u0629 \xAB${inv.status}\xBB \u0648\u0644\u0627 \u062A\u0642\u0628\u0644 \u0627\u0644\u062A\u0642\u062F\u064A\u0645`);
  }
  const match = await threeWayMatch(repo, invoiceRef);
  if (!match.matched) {
    await setInvoiceStatus(repo, actor.id, invoiceRef, inv.status, {
      matchResult: match
    });
    const failed = match.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
    throw new ConflictError(`\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u062B\u0644\u0627\u062B\u064A\u0629 \u2014 ${failed.join(" | ")}`);
  }
  for (const old of await chainOf(repo, invoiceRef)) await repo.approvals.delete(old.id);
  const chain = [];
  APPROVAL_STEPS.forEach((step, i) => {
    chain.push({
      id: `AP-${invoiceRef}-${i + 1}`,
      invoiceRef,
      step,
      order: i + 1,
      requiredRole: STEP_ROLE[step],
      status: i === 0 ? "\u0645\u0639\u062A\u0645\u062F" : "\u0628\u0627\u0646\u062A\u0638\u0627\u0631",
      actedBy: i === 0 ? actor.id : void 0,
      actedAt: i === 0 ? (/* @__PURE__ */ new Date()).toISOString() : void 0,
      note: i === 0 ? "\u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0637\u0644\u0628" : "",
      ...stamp5(actor.id)
    });
  });
  for (const a of chain) await repo.approvals.put(a.id, a);
  const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F", {
    matchResult: match
  });
  await log(repo, actor.id, "\u062A\u0642\u062F\u064A\u0645 \u0641\u0627\u062A\u0648\u0631\u0629 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F", "invoice", invoiceRef);
  return {
    invoice,
    chain
  };
}
__name(submitForApproval, "submitForApproval");
async function currentStep(repo, invoiceRef) {
  const chain = await chainOf(repo, invoiceRef);
  return chain.find((a) => a.status === "\u0628\u0627\u0646\u062A\u0638\u0627\u0631") ?? null;
}
__name(currentStep, "currentStep");
async function act(repo, actor, invoiceRef, decision, note = "") {
  const inv = await getInvoice(repo, invoiceRef);
  if (inv.status !== "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F") {
    throw new ConflictError(`\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0641\u064A \u062D\u0627\u0644\u0629 \xAB${inv.status}\xBB \u0648\u0644\u0627 \u062A\u0648\u062C\u062F \u062E\u0637\u0648\u0629 \u0627\u0639\u062A\u0645\u0627\u062F \u0645\u0641\u062A\u0648\u062D\u0629`);
  }
  const step = await currentStep(repo, invoiceRef);
  if (!step) throw new NotFoundError("\u062E\u0637\u0648\u0629 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F", invoiceRef);
  require_(actor, step.step === "\u0645\u0631\u0627\u062C\u0639" ? "invoice:review" : "invoice:approve");
  if (!actor.roles.includes(step.requiredRole) && !actor.roles.includes("admin")) {
    throw new ConflictError(`\u0647\u0630\u0647 \u0627\u0644\u062E\u0637\u0648\u0629 \u062A\u062A\u0637\u0644\u0628 \u062F\u0648\u0631 \xAB${step.requiredRole}\xBB`);
  }
  const chain = await chainOf(repo, invoiceRef);
  const prior = chain.filter((a) => a.order < step.order);
  if (prior.some((a) => a.actedBy === actor.id)) {
    throw new SegregationError(`\u0641\u0635\u0644 \u0627\u0644\u0645\u0647\u0627\u0645: \u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0627\u0639\u062A\u0645\u0627\u062F \u062E\u0637\u0648\u0629 \xAB${step.step}\xBB \u0648\u0642\u062F \u062A\u0635\u0631\u0651\u0641\u062A \u0641\u064A \u062E\u0637\u0648\u0629 \u0633\u0627\u0628\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0646\u0641\u0633\u0647\u0627`);
  }
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  await repo.approvals.put(step.id, {
    ...step,
    status: decision,
    actedBy: actor.id,
    actedAt: now2,
    note,
    updatedAt: now2,
    updatedBy: actor.id
  });
  if (decision === "\u0645\u0631\u0641\u0648\u0636") {
    for (const a of chain.filter((a2) => a2.order > step.order)) {
      await repo.approvals.put(a.id, {
        ...a,
        status: "\u0645\u062A\u062C\u0627\u0648\u064E\u0632",
        updatedAt: now2,
        updatedBy: actor.id
      });
    }
    const invoice2 = await setInvoiceStatus(repo, actor.id, invoiceRef, "\u0645\u0631\u0641\u0648\u0636\u0629");
    await log(repo, actor.id, `\u0631\u0641\u0636 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0641\u064A \u062E\u0637\u0648\u0629 ${step.step}`, "invoice", invoiceRef, note);
    return {
      invoice: invoice2,
      chain: await chainOf(repo, invoiceRef)
    };
  }
  const next = await currentStep(repo, invoiceRef);
  if (next) {
    await log(repo, actor.id, `\u0627\u0639\u062A\u0645\u0627\u062F \u062E\u0637\u0648\u0629 ${step.step}`, "invoice", invoiceRef, note);
    return {
      invoice: inv,
      chain: await chainOf(repo, invoiceRef)
    };
  }
  await commit(repo, actor.id, inv.budgetLineId, inv.grandTotal);
  const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "\u0645\u0639\u062A\u0645\u062F\u0629");
  await log(repo, actor.id, "\u0627\u0639\u062A\u0645\u0627\u062F \u0646\u0647\u0627\u0626\u064A \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629", "invoice", invoiceRef, note);
  return {
    invoice,
    chain: await chainOf(repo, invoiceRef)
  };
}
__name(act, "act");
async function pay(repo, actor, invoiceRef, input = {}) {
  require_(actor, "payment:execute");
  const inv = await getInvoice(repo, invoiceRef);
  if (inv.status !== "\u0645\u0639\u062A\u0645\u062F\u0629") {
    throw new ConflictError(`\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u0635\u0631\u0641: \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0641\u064A \u062D\u0627\u0644\u0629 \xAB${inv.status}\xBB`);
  }
  if (inv.paymentRef) throw new ConflictError(`\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0635\u0631\u0648\u0641\u0629 \u0645\u0633\u0628\u0642\u0627\u064B \u0628\u0627\u0644\u0633\u0646\u062F ${inv.paymentRef}`);
  const chain = await chainOf(repo, invoiceRef);
  const finalStep = chain.find((a) => a.step === "\u0645\u0639\u062A\u0645\u062F");
  if (finalStep?.actedBy === actor.id && !actor.roles.includes("admin")) {
    throw new SegregationError("\u0641\u0635\u0644 \u0627\u0644\u0645\u0647\u0627\u0645: \u0644\u0627 \u064A\u062C\u0648\u0632 \u0623\u0646 \u064A\u0642\u0648\u0645 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0646\u0641\u0633\u0647 \u0628\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0635\u0631\u0641");
  }
  const now2 = (/* @__PURE__ */ new Date()).toISOString();
  const ref = await nextPaymentRef(repo);
  const payment = {
    ref,
    invoiceRef,
    supplierId: inv.supplierId,
    amount: inv.grandTotal,
    method: input.method ?? "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A",
    bankReference: input.bankReference ?? "",
    paidAt: now2,
    budgetLineId: inv.budgetLineId,
    ...stamp5(actor.id)
  };
  await repo.payments.put(ref, payment);
  await spend(repo, actor.id, inv.budgetLineId, inv.grandTotal);
  const invoice = await setInvoiceStatus(repo, actor.id, invoiceRef, "\u0645\u0635\u0631\u0648\u0641\u0629", {
    paymentRef: ref
  });
  await log(repo, actor.id, "\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0635\u0631\u0641", "invoice", invoiceRef, `${ref} \u0628\u0645\u0628\u0644\u063A ${inv.grandTotal}`);
  return {
    invoice,
    payment
  };
}
__name(pay, "pay");
async function inbox(repo, user) {
  const pending = (await repo.approvals.list()).filter((a) => a.status === "\u0628\u0627\u0646\u062A\u0638\u0627\u0631");
  const mine = pending.filter((a) => user.roles.includes(a.requiredRole) || user.roles.includes("admin"));
  const out = [];
  for (const a of mine) {
    const inv = await repo.invoices.get(a.invoiceRef);
    if (inv && inv.status === "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F") out.push(inv);
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}
__name(inbox, "inbox");

// src/services/dashboard.ts
async function kpis(repo) {
  const [assets, types, tickets, wos, invoices, lines, contracts] = await Promise.all([
    repo.assets.list(),
    repo.assetTypes.list(),
    repo.tickets.list(),
    repo.workOrders.list(),
    repo.invoices.list(),
    repo.budgetLines.list(),
    repo.contracts.list()
  ]);
  const typeMap = new Map(types.map((t) => [
    t.code,
    t
  ]));
  let bookValue = 0;
  for (const a of assets) {
    const t = typeMap.get(a.typeCode);
    bookValue += t ? depreciation(a, t).bookValue : a.acquisitionCost;
  }
  const now2 = /* @__PURE__ */ new Date();
  const monthStart = new Date(Date.UTC(now2.getUTCFullYear(), now2.getUTCMonth(), 1)).toISOString();
  const closed = tickets.filter((t) => t.status === "\u0645\u063A\u0644\u0642" && t.closedDate);
  const closedThisMonth = closed.filter((t) => (t.closedDate ?? "") >= monthStart);
  const durations = closed.map((t) => (new Date(t.closedDate).getTime() - new Date(t.createdAt).getTime()) / 36e5);
  const byPriority = {};
  for (const t of tickets) {
    if (t.status === "\u0645\u063A\u0644\u0642" || t.status === "\u0645\u0644\u063A\u0649") continue;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }
  const faultCount = /* @__PURE__ */ new Map();
  for (const t of tickets) faultCount.set(t.assetTag, (faultCount.get(t.assetTag) ?? 0) + 1);
  const assetMap = new Map(assets.map((a) => [
    a.tag,
    a
  ]));
  const topFaultyAssets = [
    ...faultCount.entries()
  ].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, n]) => ({
    tag,
    name: assetMap.get(tag)?.name ?? tag,
    tickets: n
  }));
  const in60 = new Date(now2.getTime() + 60 * 24 * 36e5).toISOString().slice(0, 10);
  const today = now2.toISOString().slice(0, 10);
  const approvedUnpaid = invoices.filter((i) => i.status === "\u0645\u0639\u062A\u0645\u062F\u0629");
  return {
    assets: {
      total: assets.length,
      inService: assets.filter((a) => a.status === "\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629").length,
      underMaintenance: assets.filter((a) => a.status === "\u062A\u062D\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629").length,
      bookValue: round22(bookValue)
    },
    tickets: {
      open: tickets.filter((t) => t.status !== "\u0645\u063A\u0644\u0642" && t.status !== "\u0645\u0644\u063A\u0649").length,
      breached: tickets.filter((t) => t.slaBreached && t.status !== "\u0645\u0644\u063A\u0649").length,
      closedThisMonth: closedThisMonth.length,
      avgCloseHours: durations.length ? round22(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      byPriority
    },
    workOrders: {
      open: wos.filter((w) => w.status === "\u0645\u0641\u062A\u0648\u062D" || w.status === "\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630").length,
      completed: wos.filter((w) => w.status === "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" || w.status === "\u0645\u063A\u0644\u0642").length,
      awaitingInvoice: wos.filter((w) => w.status === "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" && !w.invoiceRef && !w.underContract && w.billableAmount > 0).length
    },
    finance: {
      draft: invoices.filter((i) => i.status === "\u0645\u0633\u0648\u062F\u0629").length,
      inApproval: invoices.filter((i) => i.status === "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F").length,
      approvedUnpaid: approvedUnpaid.length,
      approvedUnpaidValue: round22(approvedUnpaid.reduce((s, i) => s + i.grandTotal, 0)),
      paidValue: round22(invoices.filter((i) => i.status === "\u0645\u0635\u0631\u0648\u0641\u0629").reduce((s, i) => s + i.grandTotal, 0))
    },
    budget: {
      allocated: round22(lines.reduce((s, l) => s + l.allocated, 0)),
      committed: round22(lines.reduce((s, l) => s + l.committed, 0)),
      spent: round22(lines.reduce((s, l) => s + l.spent, 0)),
      available: round22(lines.reduce((s, l) => s + available(l), 0))
    },
    contracts: {
      live: contracts.filter((c) => c.status === "\u0633\u0627\u0631\u064A").length,
      expiringIn60Days: contracts.filter((c) => c.status === "\u0633\u0627\u0631\u064A" && c.expiryDate.slice(0, 10) >= today && c.expiryDate.slice(0, 10) <= in60).length
    },
    topFaultyAssets
  };
}
__name(kpis, "kpis");
function round22(n) {
  return Math.round(n * 100) / 100;
}
__name(round22, "round2");

// src/http/api.ts
function supplierScope(user) {
  return user.roles.includes("supplier") && !user.roles.includes("admin") ? user.supplierId : void 0;
}
__name(supplierScope, "supplierScope");
async function handleApi(req, url, repo, user) {
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const seg = path.split("/").filter(Boolean);
  const m = req.method;
  try {
    if (path === "/me") {
      return json({
        user: publicUser(user),
        permissions: [
          ...permissionsOf(user.roles)
        ],
        roleLabels: ROLE_LABELS
      });
    }
    if (path === "/meta") {
      return json({
        priorities: PRIORITIES,
        ticketStatuses: TICKET_STATUSES,
        workTypes: WORK_TYPES,
        assetStatuses: ASSET_STATUSES,
        contractStatuses: CONTRACT_STATUSES,
        invoiceStatuses: INVOICE_STATUSES,
        billingBases: BILLING_BASES,
        roles: ROLE_LABELS
      });
    }
    if (path === "/kpis" && m === "GET") {
      await refreshSlaFlags(repo);
      return json(await kpis(repo));
    }
    if (seg[0] === "suppliers") {
      if (m === "GET" && seg.length === 1) return json(await listSuppliers(repo));
      if (m === "GET" && seg.length === 2) {
        return json(await getSupplier(repo, seg[1]));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await createSupplier(repo, user, b), 201);
      }
    }
    if (seg[0] === "contracts") {
      if (m === "GET" && seg.length === 1) {
        const scope = supplierScope(user);
        const all = await listContracts(repo);
        return json(scope ? all.filter((c) => c.supplierId === scope) : all);
      }
      if (m === "GET" && seg.length === 2) {
        return json(await getContract(repo, seg[1]));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await createContract(repo, user, {
          title: String(b.title ?? ""),
          supplierId: String(b.supplierId ?? ""),
          startDate: String(b.startDate ?? ""),
          expiryDate: String(b.expiryDate ?? ""),
          coveredTypes: asArray(b.coveredTypes),
          coveredSites: asArray(b.coveredSites),
          value: asNumber(b.value),
          billingBasis: b.billingBasis,
          billingCycle: b.billingCycle,
          responseHours: asNumber(b.responseHours, 24),
          penaltyRatePerDay: asNumber(b.penaltyRatePerDay),
          budgetLineId: String(b.budgetLineId ?? ""),
          notes: String(b.notes ?? "")
        }), 201);
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "status") {
        const b = await readBody(req);
        return json(await setContractStatus(repo, user, seg[1], b.status));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "receive") {
        const b = await readBody(req);
        const items = Array.isArray(b.items) ? b.items : [];
        return json(await receiveFromContract(repo, user, seg[1], items), 201);
      }
    }
    if (path === "/asset-types" && m === "GET") {
      return json((await repo.assetTypes.list()).sort((a, b) => a.sortOrder - b.sortOrder));
    }
    if (path === "/sites" && m === "GET") {
      return json((await repo.sites.list()).sort((a, b) => a.code.localeCompare(b.code)));
    }
    if (seg[0] === "assets") {
      if (m === "GET" && seg.length === 1) {
        return json(await listAssets(repo, {
          typeCode: url.searchParams.get("typeCode") ?? void 0,
          siteCode: url.searchParams.get("siteCode") ?? void 0,
          status: url.searchParams.get("status") ?? void 0,
          q: url.searchParams.get("q") ?? void 0
        }));
      }
      if (m === "GET" && seg.length === 2) {
        const asset = await getAsset(repo, decodeURIComponent(seg[1]));
        const type = await getAssetType(repo, asset.typeCode);
        return json({
          asset,
          type,
          depreciation: depreciation(asset, type),
          tco: await totalCostOfOwnership(repo, asset.tag),
          qr: qrPayload(url.origin, asset.tag),
          tickets: await listTickets(repo, {
            assetTag: asset.tag
          })
        });
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await createAsset(repo, user, {
          typeCode: String(b.typeCode ?? ""),
          name: String(b.name ?? ""),
          siteCode: String(b.siteCode ?? ""),
          manufacturer: String(b.manufacturer ?? ""),
          modelName: String(b.modelName ?? ""),
          serialNumber: String(b.serialNumber ?? ""),
          department: String(b.department ?? ""),
          custodian: String(b.custodian ?? ""),
          acquisitionCost: asNumber(b.acquisitionCost),
          acquisitionDate: b.acquisitionDate ? String(b.acquisitionDate) : void 0,
          attributes: b.attributes ?? {},
          notes: String(b.notes ?? "")
        }), 201);
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "status") {
        const b = await readBody(req);
        return json(await setAssetStatus(repo, user, decodeURIComponent(seg[1]), b.status));
      }
    }
    if (seg[0] === "tickets") {
      if (m === "GET" && seg.length === 1) {
        return json(await listTickets(repo, {
          status: url.searchParams.get("status") ?? void 0,
          siteCode: url.searchParams.get("siteCode") ?? void 0,
          assetTag: url.searchParams.get("assetTag") ?? void 0,
          supplierId: supplierScope(user) ?? url.searchParams.get("supplierId") ?? void 0
        }));
      }
      if (m === "GET" && seg.length === 2) {
        const t = await getTicket(repo, seg[1]);
        return json({
          ticket: t,
          workOrder: t.workOrderRef ? await repo.workOrders.get(t.workOrderRef) : null,
          audit: await trail(repo, "ticket", t.ref)
        });
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await createTicket(repo, user, {
          assetTag: String(b.assetTag ?? ""),
          description: String(b.description ?? ""),
          priority: b.priority || void 0,
          requestingDept: b.requestingDept ? String(b.requestingDept) : void 0,
          isPreventive: b.isPreventive === true || b.isPreventive === "true"
        }), 201);
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "assign") {
        const b = await readBody(req);
        return json(await assignTicket(repo, user, seg[1], String(b.assignee ?? "")));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "status") {
        const b = await readBody(req);
        return json(await setTicketStatus(repo, user, seg[1], b.status));
      }
    }
    if (seg[0] === "work-orders") {
      if (m === "GET" && seg.length === 1) {
        return json(await listWorkOrders(repo, {
          status: url.searchParams.get("status") ?? void 0,
          supplierId: supplierScope(user) ?? url.searchParams.get("supplierId") ?? void 0,
          assetTag: url.searchParams.get("assetTag") ?? void 0
        }));
      }
      if (m === "GET" && seg.length === 2) return json(await getWorkOrder(repo, seg[1]));
      if (m === "GET" && seg.length === 2 && seg[1] === "billable") {
        return json(await billableWorkOrders(repo, supplierScope(user)));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await openWorkOrder(repo, user, {
          ticketRef: String(b.ticketRef ?? ""),
          workType: b.workType || void 0,
          technician: b.technician ? String(b.technician) : void 0
        }), 201);
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "complete") {
        const b = await readBody(req);
        return json(await completeWorkOrder(repo, user, seg[1], {
          outcome: String(b.outcome ?? ""),
          partsUsed: String(b.partsUsed ?? ""),
          laborHours: asNumber(b.laborHours),
          billableAmount: asNumber(b.billableAmount)
        }));
      }
    }
    if (seg[0] === "invoices") {
      if (m === "GET" && seg.length === 1) {
        return json(await listInvoices(repo, {
          status: url.searchParams.get("status") ?? void 0,
          supplierId: supplierScope(user) ?? url.searchParams.get("supplierId") ?? void 0
        }));
      }
      if (m === "GET" && seg.length === 2 && seg[1] === "inbox") {
        return json(await inbox(repo, user));
      }
      if (m === "GET" && seg.length === 2) {
        const inv = await getInvoice(repo, seg[1]);
        return json({
          invoice: inv,
          chain: await chainOf(repo, inv.ref),
          match: inv.matchResult ?? await threeWayMatch(repo, inv.ref),
          workOrders: await Promise.all(inv.workOrderRefs.map((r) => repo.workOrders.get(r))),
          payment: inv.paymentRef ? await repo.payments.get(inv.paymentRef) : null,
          audit: await trail(repo, "invoice", inv.ref)
        });
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await draftFromWorkOrders(repo, user, {
          supplierId: String(b.supplierId ?? ""),
          workOrderRefs: asArray(b.workOrderRefs),
          budgetLineId: b.budgetLineId ? String(b.budgetLineId) : void 0,
          supplierInvoiceNo: String(b.supplierInvoiceNo ?? "")
        }), 201);
      }
      if (m === "POST" && seg.length === 2 && seg[1] === "auto") {
        return json(await autoInvoice(repo, user), 201);
      }
      if (m === "GET" && seg.length === 3 && seg[2] === "match") {
        return json(await threeWayMatch(repo, seg[1]));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "submit") {
        return json(await submitForApproval(repo, user, seg[1]));
      }
      if (m === "POST" && seg.length === 3 && (seg[2] === "approve" || seg[2] === "reject")) {
        const b = await readBody(req);
        return json(await act(repo, user, seg[1], seg[2] === "approve" ? "\u0645\u0639\u062A\u0645\u062F" : "\u0645\u0631\u0641\u0648\u0636", String(b.note ?? "")));
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "pay") {
        const b = await readBody(req);
        return json(await pay(repo, user, seg[1], {
          method: b.method,
          bankReference: String(b.bankReference ?? "")
        }));
      }
    }
    if (seg[0] === "budget") {
      if (m === "GET" && seg.length === 1) {
        const lines = await listBudgetLines(repo);
        return json(lines.map((l) => ({
          ...l,
          available: available(l)
        })));
      }
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(await createBudgetLine(repo, user, {
          id: String(b.id ?? ""),
          name: String(b.name ?? ""),
          fiscalYear: asNumber(b.fiscalYear, (/* @__PURE__ */ new Date()).getFullYear()),
          allocated: asNumber(b.allocated)
        }), 201);
      }
    }
    if (seg[0] === "users") {
      if (m === "GET" && seg.length === 1) return json(await listUsers(repo, user));
      if (m === "POST" && seg.length === 1) {
        const b = await readBody(req);
        return json(publicUser(await createUser(repo, user, {
          email: String(b.email ?? ""),
          displayName: String(b.displayName ?? ""),
          password: b.password ? String(b.password) : void 0,
          roles: asArray(b.roles),
          department: String(b.department ?? ""),
          supplierId: b.supplierId ? String(b.supplierId) : void 0
        })), 201);
      }
      if (m === "POST" && seg.length === 3 && seg[2] === "password") {
        const b = await readBody(req);
        await changePassword(repo, user, seg[1], String(b.password ?? ""));
        return json({
          ok: true
        });
      }
    }
    if (path === "/audit" && m === "GET") {
      const entity = url.searchParams.get("entity");
      const id = url.searchParams.get("id");
      if (entity && id) return json(await trail(repo, entity, id));
      return json(await recent(repo, asNumber(url.searchParams.get("limit"), 100)));
    }
    return json({
      error: `\u0645\u0633\u0627\u0631 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641: ${m} ${url.pathname}`
    }, 404);
  } catch (err) {
    return errorJson(err);
  }
}
__name(handleApi, "handleApi");

// src/http/views/layout.ts
function esc(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
__name(esc, "esc");
function money(n) {
  return `${n.toLocaleString("ar-BH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  })} ${config.currency}`;
}
__name(money, "money");
function dt(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString("ar-BH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
__name(dt, "dt");
function day(iso) {
  if (!iso) return "\u2014";
  return iso.slice(0, 10);
}
__name(day, "day");
var STYLE = `
:root{
  --bg:#f4f6f9; --panel:#fff; --ink:#16212e; --muted:#5c6a7a; --line:#dde4ec;
  --brand:#0b5d3b; --brand-2:#0e7a4d; --accent:#8a6d1f;
  --ok:#137a3d; --warn:#8a5a00; --bad:#a52121; --info:#1a4f8a;
  --radius:10px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Segoe UI","Noto Kufi Arabic","Tahoma",system-ui,sans-serif;
  font-size:15px;line-height:1.7}
a{color:var(--brand-2);text-decoration:none}
a:hover{text-decoration:underline}
header.top{background:var(--brand);color:#fff;padding:.6rem 1.2rem;
  display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
header.top .brand{font-weight:700;font-size:1.05rem}
header.top .brand small{display:block;font-weight:400;opacity:.85;font-size:.72rem}
header.top .spacer{flex:1}
header.top .who{font-size:.85rem;opacity:.95}
header.top a{color:#fff}
nav.main{background:var(--brand-2);padding:0 1.2rem;display:flex;gap:.2rem;flex-wrap:wrap}
nav.main a{color:#fff;padding:.55rem .9rem;font-size:.9rem;border-radius:6px 6px 0 0}
nav.main a:hover{background:rgba(255,255,255,.14);text-decoration:none}
nav.main a.active{background:var(--bg);color:var(--brand);font-weight:600}
main{padding:1.2rem;max-width:1400px;margin:0 auto}
h1{font-size:1.35rem;margin:.2rem 0 1rem}
h2{font-size:1.08rem;margin:1.4rem 0 .6rem;color:var(--brand)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  padding:1rem 1.1rem;margin-bottom:1rem}
.grid{display:grid;gap:1rem}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.8rem}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:.85rem 1rem}
.kpi .label{font-size:.8rem;color:var(--muted)}
.kpi .value{font-size:1.5rem;font-weight:700;margin-top:.25rem}
.kpi .value.sm{font-size:1.05rem}
.kpi.bad .value{color:var(--bad)} .kpi.ok .value{color:var(--ok)} .kpi.warn .value{color:var(--warn)}
.tablewrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{padding:.5rem .6rem;text-align:right;border-bottom:1px solid var(--line);vertical-align:top}
th{background:#eef2f6;font-weight:600;color:var(--muted);white-space:nowrap}
tbody tr:hover{background:#f8fafc}
.pill{display:inline-block;padding:.1rem .55rem;border-radius:999px;font-size:.78rem;
  border:1px solid var(--line);background:#f2f5f8;white-space:nowrap}
.pill.ok{background:#e6f5ec;border-color:#b6e0c6;color:var(--ok)}
.pill.warn{background:#fdf3e0;border-color:#f0dbaa;color:var(--warn)}
.pill.bad{background:#fdeaea;border-color:#f2c2c2;color:var(--bad)}
.pill.info{background:#e8f0fa;border-color:#c2d6ee;color:var(--info)}
form.stack{display:grid;gap:.7rem;max-width:640px}
form.wide{max-width:100%}
label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.2rem}
input,select,textarea{width:100%;padding:.5rem .6rem;border:1px solid var(--line);
  border-radius:7px;font:inherit;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--brand-2);outline-offset:1px}
textarea{min-height:90px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
button,.btn{background:var(--brand);color:#fff;border:0;padding:.5rem 1.1rem;
  border-radius:7px;font:inherit;cursor:pointer;display:inline-block}
button:hover,.btn:hover{background:var(--brand-2);text-decoration:none;color:#fff}
button.ghost,.btn.ghost{background:transparent;color:var(--brand);border:1px solid var(--brand)}
button.ghost:hover,.btn.ghost:hover{background:#eaf3ee;color:var(--brand)}
button.danger{background:var(--bad)}
.msg{padding:.6rem .9rem;border-radius:7px;margin-bottom:1rem;font-size:.9rem}
.msg.err{background:#fdeaea;border:1px solid #f2c2c2;color:var(--bad)}
.msg.ok{background:#e6f5ec;border:1px solid #b6e0c6;color:var(--ok)}
.chain{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.chain .step{border:1px solid var(--line);border-radius:7px;padding:.4rem .7rem;
  background:#f7f9fb;font-size:.83rem}
.chain .step.done{background:#e6f5ec;border-color:#b6e0c6}
.chain .step.wait{background:#fdf3e0;border-color:#f0dbaa}
.chain .step.rej{background:#fdeaea;border-color:#f2c2c2}
.chain .arrow{color:var(--muted)}
dl.kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;font-size:.9rem;margin:0}
dl.kv dt{color:var(--muted)}
dl.kv dd{margin:0}
.muted{color:var(--muted);font-size:.85rem}
.empty{padding:2rem;text-align:center;color:var(--muted)}
.toolbar{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end;margin-bottom:.8rem}
.toolbar > *{margin:0}
.toolbar .grow{flex:1;min-width:160px}
.login{max-width:420px;margin:8vh auto}
.login .panel{padding:1.6rem}
.checks li{margin-bottom:.3rem}
code{background:#eef2f6;padding:.1rem .35rem;border-radius:4px;font-size:.85em}
.demobar{background:#8a6d1f;color:#fff;padding:.4rem 1.2rem;font-size:.82rem;
  text-align:center;letter-spacing:.01em}
.demobar strong{font-weight:700}
footer{padding:1.5rem;text-align:center;color:var(--muted);font-size:.8rem}
footer .demo{display:block;margin-top:.35rem;color:#8a6d1f;font-weight:600}
@media (max-width:640px){ .row{grid-template-columns:1fr} main{padding:.8rem} }
`;
var NAV = [
  {
    href: "/",
    label: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A"
  },
  {
    href: "/assets",
    label: "\u0627\u0644\u0623\u0635\u0648\u0644",
    perm: "asset:read"
  },
  {
    href: "/tickets",
    label: "\u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A",
    perm: "ticket:read"
  },
  {
    href: "/work-orders",
    label: "\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644",
    perm: "workorder:read"
  },
  {
    href: "/invoices",
    label: "\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631",
    perm: "invoice:read"
  },
  {
    href: "/contracts",
    label: "\u0627\u0644\u0639\u0642\u0648\u062F \u0648\u0627\u0644\u0645\u0648\u0631\u062F\u0648\u0646",
    perm: "contract:read"
  },
  {
    href: "/budget",
    label: "\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629",
    perm: "budget:read"
  },
  {
    href: "/audit",
    label: "\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642",
    perm: "audit:read"
  }
];
function page(opts) {
  const perms = opts.user ? permissionsOf(opts.user.roles) : /* @__PURE__ */ new Set();
  const nav = opts.user ? NAV.filter((n) => !n.perm || perms.has(n.perm)).map((n) => `<a href="${n.href}" class="${opts.active === n.href ? "active" : ""}">${esc(n.label)}</a>`).join("") : "";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)} \u2014 \u0646\u0638\u0627\u0645 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0633\u0627\u0646\u062F\u0629</title>
<style>${STYLE}</style>
</head>
<body>
${config.demoMode ? `<div class="demobar"><strong>\u0639\u0631\u0636 \u062A\u062C\u0631\u064A\u0628\u064A</strong> \xB7 ${esc(config.demoNotice)}</div>` : ""}
<header class="top">
  <div class="brand">\u0646\u0638\u0627\u0645 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0633\u0627\u0646\u062F\u0629 \u0627\u0644\u0645\u0637\u0648\u0631<small>${esc(config.orgName)}</small></div>
  <div class="spacer"></div>
  ${opts.user ? `<div class="who">${esc(opts.user.displayName)} \u2014 ${esc(opts.user.roles.join("\u060C "))}</div>
         <form method="post" action="/logout" style="margin:0"><button class="ghost" style="color:#fff;border-color:#fff">\u062E\u0631\u0648\u062C</button></form>` : ""}
</header>
${opts.user ? `<nav class="main">${nav}</nav>` : ""}
<main>
  ${opts.message ? `<div class="msg ${opts.message.kind}">${esc(opts.message.text)}</div>` : ""}
  ${opts.body}
</main>
<footer>\u0646\u0638\u0627\u0645 \u0627\u0644\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0633\u0627\u0646\u062F\u0629 \u0627\u0644\u0645\u0637\u0648\u0631 \xB7 ${esc(config.orgName)} \xB7 \u0646\u0633\u062E\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629</footer>
</body>
</html>`;
}
__name(page, "page");

// src/http/views/pages.ts
function loginPage(error, notice) {
  return page({
    title: "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644",
    body: `
<div class="login">
  <div class="panel">
    <h1 style="margin-top:0">\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644</h1>
    ${error ? `<div class="msg err">${esc(error)}</div>` : ""}
    ${notice ? `<div class="msg ok">${esc(notice)}</div>` : ""}
    <form method="post" action="/login" class="stack">
      <div><label for="email">\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A</label>
        <input id="email" name="email" type="email" required autocomplete="username"></div>
      <div><label for="password">\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631</label>
        <input id="password" name="password" type="password" required autocomplete="current-password"></div>
      <button type="submit">\u062F\u062E\u0648\u0644</button>
    </form>
    ${entraEnabled() ? `<hr style="margin:1.2rem 0;border:0;border-top:1px solid var(--line)">
           <a class="btn ghost" style="width:100%;text-align:center" href="/auth/entra/start">\u0627\u0644\u062F\u062E\u0648\u0644 \u0639\u0628\u0631 \u062D\u0633\u0627\u0628 \u0627\u0644\u0648\u0632\u0627\u0631\u0629 (Microsoft Entra ID)</a>` : `<p class="muted" style="margin-top:1rem">\u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0645\u0648\u062D\u0651\u062F \u0639\u0628\u0631 Microsoft Entra ID \u062C\u0627\u0647\u0632 \u0641\u064A \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u0645\u0639\u0637\u0651\u0644 \u062D\u0627\u0644\u064A\u0627\u064B \u2014 \u064A\u064F\u0641\u0639\u064E\u0651\u0644 \u0628\u0636\u0628\u0637 <code>ENTRA_ENABLED=true</code>.</p>`}
  </div>
</div>`
  });
}
__name(loginPage, "loginPage");
function dashboardPage(user, k) {
  const kpi = /* @__PURE__ */ __name((label, value, cls = "") => `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`, "kpi");
  const kpiSm = /* @__PURE__ */ __name((label, value, cls = "") => `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value sm">${value}</div></div>`, "kpiSm");
  return page({
    title: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A",
    user,
    active: "/",
    body: `
<h1>\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A</h1>

<h2>\u0627\u0644\u062A\u0634\u063A\u064A\u0644</h2>
<div class="cards">
  ${kpi("\u0628\u0644\u0627\u063A\u0627\u062A \u0645\u0641\u062A\u0648\u062D\u0629", String(k.tickets.open))}
  ${kpi("\u062A\u062C\u0627\u0648\u0632\u062A \u0632\u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629", String(k.tickets.breached), k.tickets.breached ? "bad" : "ok")}
  ${kpi("\u0623\u0648\u0627\u0645\u0631 \u0639\u0645\u0644 \u062C\u0627\u0631\u064A\u0629", String(k.workOrders.open))}
  ${kpi("\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0641\u0648\u062A\u0631\u0629", String(k.workOrders.awaitingInvoice), k.workOrders.awaitingInvoice ? "warn" : "")}
  ${kpi("\u0623\u064F\u063A\u0644\u0642\u062A \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631", String(k.tickets.closedThisMonth), "ok")}
  ${kpiSm("\u0645\u062A\u0648\u0633\u0637 \u0632\u0645\u0646 \u0627\u0644\u0625\u063A\u0644\u0627\u0642", k.tickets.avgCloseHours === null ? "\u2014" : `${k.tickets.avgCloseHours} \u0633\u0627\u0639\u0629`)}
</div>

<h2>\u0627\u0644\u0623\u0635\u0648\u0644</h2>
<div class="cards">
  ${kpi("\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0623\u0635\u0648\u0644", String(k.assets.total))}
  ${kpi("\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629", String(k.assets.inService), "ok")}
  ${kpi("\u062A\u062D\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629", String(k.assets.underMaintenance), k.assets.underMaintenance ? "warn" : "")}
  ${kpiSm("\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u062F\u0641\u062A\u0631\u064A\u0629", money(k.assets.bookValue))}
</div>

<h2>\u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629</h2>
<div class="cards">
  ${kpi("\u0641\u0648\u0627\u062A\u064A\u0631 \u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F", String(k.finance.inApproval), k.finance.inApproval ? "warn" : "")}
  ${kpi("\u0645\u0639\u062A\u0645\u062F\u0629 \u063A\u064A\u0631 \u0645\u0635\u0631\u0648\u0641\u0629", String(k.finance.approvedUnpaid), k.finance.approvedUnpaid ? "warn" : "")}
  ${kpiSm("\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0633\u062A\u062D\u0642 \u063A\u064A\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639", money(k.finance.approvedUnpaidValue), k.finance.approvedUnpaidValue ? "warn" : "")}
  ${kpiSm("\u0627\u0644\u0645\u0635\u0631\u0648\u0641 \u0627\u0644\u0641\u0639\u0644\u064A", money(k.finance.paidValue), "ok")}
  ${kpiSm("\u0627\u0644\u0645\u062A\u0627\u062D \u0641\u064A \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629", money(k.budget.available), k.budget.available <= 0 ? "bad" : "ok")}
  ${kpiSm("\u0627\u0644\u0645\u062D\u062C\u0648\u0632", money(k.budget.committed))}
</div>

<h2>\u0627\u0644\u0639\u0642\u0648\u062F</h2>
<div class="cards">
  ${kpi("\u0639\u0642\u0648\u062F \u0633\u0627\u0631\u064A\u0629", String(k.contracts.live))}
  ${kpi("\u062A\u0646\u062A\u0647\u064A \u062E\u0644\u0627\u0644 \u0666\u0660 \u064A\u0648\u0645\u0627\u064B", String(k.contracts.expiringIn60Days), k.contracts.expiringIn60Days ? "warn" : "")}
</div>

<div class="panel">
  <h2 style="margin-top:0">\u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0623\u0643\u062B\u0631 \u062A\u0643\u0631\u0627\u0631\u0627\u064B \u0644\u0644\u0623\u0639\u0637\u0627\u0644</h2>
  ${k.topFaultyAssets.length ? `<div class="tablewrap"><table>
      <thead><tr><th>\u0631\u0642\u0645 \u0627\u0644\u0623\u0635\u0644</th><th>\u0627\u0644\u0627\u0633\u0645</th><th>\u0639\u062F\u062F \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A</th></tr></thead>
      <tbody>${k.topFaultyAssets.map((a) => `<tr><td><a href="/assets/${encodeURIComponent(a.tag)}">${esc(a.tag)}</a></td><td>${esc(a.name)}</td><td>${a.tickets}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0628\u0639\u062F.</p>`}
</div>`
  });
}
__name(dashboardPage, "dashboardPage");
function assetsPage(user, assets, types, sites, filter, canWrite) {
  const typeName = new Map(types.map((t) => [
    t.code,
    t.name
  ]));
  const siteName = new Map(sites.map((s) => [
    s.code,
    s.name
  ]));
  const opts = /* @__PURE__ */ __name((list, sel) => `<option value="">\u2014 \u0627\u0644\u0643\u0644 \u2014</option>` + list.map((o) => `<option value="${esc(o.v)}"${o.v === sel ? " selected" : ""}>${esc(o.l)}</option>`).join(""), "opts");
  return page({
    title: "\u0627\u0644\u0623\u0635\u0648\u0644",
    user,
    active: "/assets",
    body: `
<h1>\u0633\u062C\u0644 \u0627\u0644\u0623\u0635\u0648\u0644 <span class="muted">(${assets.length})</span></h1>

<form method="get" class="toolbar panel">
  <div class="grow"><label>\u0628\u062D\u062B</label><input name="q" value="${esc(filter.q ?? "")}" placeholder="\u0631\u0642\u0645 \u0627\u0644\u0623\u0635\u0644 \u0623\u0648 \u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A"></div>
  <div><label>\u0627\u0644\u0646\u0648\u0639</label><select name="typeCode">${opts(types.map((t) => ({
      v: t.code,
      l: t.name
    })), filter.typeCode ?? "")}</select></div>
  <div><label>\u0627\u0644\u0645\u0648\u0642\u0639</label><select name="siteCode">${opts(sites.map((s) => ({
      v: s.code,
      l: `${s.code} \u2014 ${s.name}`
    })), filter.siteCode ?? "")}</select></div>
  <div><label>\u0627\u0644\u062D\u0627\u0644\u0629</label><select name="status">${opts(ASSET_STATUSES.map((s) => ({
      v: s,
      l: s
    })), filter.status ?? "")}</select></div>
  <div><button type="submit">\u062A\u0635\u0641\u064A\u0629</button></div>
  ${canWrite ? `<div><a class="btn ghost" href="/assets/new">\u062A\u0633\u062C\u064A\u0644 \u0623\u0635\u0644</a></div>` : ""}
</form>

<div class="panel">
${assets.length ? `<div class="tablewrap"><table>
  <thead><tr><th>\u0631\u0642\u0645 \u0627\u0644\u0623\u0635\u0644</th><th>\u0627\u0644\u0627\u0633\u0645</th><th>\u0627\u0644\u0646\u0648\u0639</th><th>\u0627\u0644\u0645\u0648\u0642\u0639</th><th>\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A</th><th>\u0627\u0644\u062D\u0627\u0644\u0629</th><th>\u0627\u0644\u062A\u0643\u0644\u0641\u0629</th></tr></thead>
  <tbody>${assets.map((a) => `<tr>
    <td><a href="/assets/${encodeURIComponent(a.tag)}">${esc(a.tag)}</a></td>
    <td>${esc(a.name)}</td>
    <td>${esc(typeName.get(a.typeCode) ?? a.typeCode)}</td>
    <td>${esc(siteName.get(a.siteCode) ?? a.siteCode)}</td>
    <td>${esc(a.serialNumber || "\u2014")}</td>
    <td>${statusPill(a.status)}</td>
    <td>${money(a.acquisitionCost)}</td>
  </tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0635\u0648\u0644 \u0645\u0637\u0627\u0628\u0642\u0629.</p>`}
</div>`
  });
}
__name(assetsPage, "assetsPage");
function statusPill(s) {
  const cls = s === "\u0641\u064A \u0627\u0644\u062E\u062F\u0645\u0629" ? "ok" : s === "\u062A\u062D\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629" ? "warn" : s === "\u0645\u0634\u0637\u0648\u0628" || s === "\u062E\u0627\u0631\u062C \u0627\u0644\u062E\u062F\u0645\u0629" ? "bad" : "";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}
__name(statusPill, "statusPill");
function assetDetailPage(user, asset, type, site, dep, tco, tickets, qr, canCreateTicket) {
  const attrRows = type.fields.filter((f) => asset.attributes[f.key] !== void 0).map((f) => {
    const v = asset.attributes[f.key];
    const shown = typeof v === "boolean" ? v ? "\u0646\u0639\u0645" : "\u0644\u0627" : String(v);
    return `<dt>${esc(f.label)}</dt><dd>${esc(shown)}</dd>`;
  }).join("");
  return page({
    title: asset.tag,
    user,
    active: "/assets",
    body: `
<h1>${esc(asset.tag)} \u2014 ${esc(asset.name)} ${statusPill(asset.status)}</h1>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629</h2>
    <dl class="kv">
      <dt>\u0627\u0644\u0646\u0648\u0639</dt><dd>${esc(type.name)} (${esc(type.code)})</dd>
      <dt>\u0627\u0644\u0645\u0648\u0642\u0639</dt><dd>${esc(site ? `${site.code} \u2014 ${site.name}` : asset.siteCode)}</dd>
      <dt>\u0627\u0644\u0635\u0627\u0646\u0639 / \u0627\u0644\u0637\u0631\u0627\u0632</dt><dd>${esc(asset.manufacturer || "\u2014")} / ${esc(asset.modelName || "\u2014")}</dd>
      <dt>\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A</dt><dd>${esc(asset.serialNumber || "\u2014")}</dd>
      <dt>\u0627\u0644\u0625\u062F\u0627\u0631\u0629 / \u0627\u0644\u0639\u0647\u062F\u0629</dt><dd>${esc(asset.department || "\u2014")} / ${esc(asset.custodian || "\u2014")}</dd>
      <dt>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0642\u062A\u0646\u0627\u0621</dt><dd>${day(asset.acquisitionDate)}</dd>
      <dt>\u0645\u0635\u062F\u0631 \u0627\u0644\u0627\u0642\u062A\u0646\u0627\u0621</dt><dd>${esc(asset.acquisitionSource)}${asset.sourceContractId ? ` \u2014 \u0639\u0642\u062F <a href="/contracts/${encodeURIComponent(asset.sourceContractId)}">${esc(asset.sourceContractId)}</a>` : ""}</dd>
      <dt>\u0627\u0644\u0636\u0645\u0627\u0646 \u062D\u062A\u0649</dt><dd>${day(asset.warrantyEnd)}</dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u062E\u0635\u0627\u0626\u0635 \u0627\u0644\u0641\u0646\u064A\u0629</h2>
    ${attrRows ? `<dl class="kv">${attrRows}</dl>` : `<p class="muted">\u0644\u0627 \u062A\u0648\u062C\u062F \u062E\u0635\u0627\u0626\u0635 \u0645\u0633\u062C\u0651\u0644\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0646\u0648\u0639.</p>`}
  </div>

  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u0625\u0647\u0644\u0627\u0643 \u0648\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u062F\u0641\u062A\u0631\u064A\u0629</h2>
    <dl class="kv">
      <dt>\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0625\u0647\u0644\u0627\u0643</dt><dd>${esc(dep.method)}</dd>
      <dt>\u0627\u0644\u0639\u0645\u0631 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A</dt><dd>${dep.usefulLifeYears} \u0633\u0646\u0629</dd>
      <dt>\u0627\u0644\u0625\u0647\u0644\u0627\u0643 \u0627\u0644\u0633\u0646\u0648\u064A</dt><dd>${money(dep.annualDepreciation)}</dd>
      <dt>\u0645\u062C\u0645\u0651\u0639 \u0627\u0644\u0625\u0647\u0644\u0627\u0643</dt><dd>${money(dep.accumulated)}</dd>
      <dt><strong>\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u062F\u0641\u062A\u0631\u064A\u0629</strong></dt><dd><strong>${money(dep.bookValue)}</strong></dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 \u0644\u0644\u062A\u0645\u0644\u0651\u0643 (TCO)</h2>
    <dl class="kv">
      <dt>\u062B\u0645\u0646 \u0627\u0644\u0627\u0642\u062A\u0646\u0627\u0621</dt><dd>${money(tco.acquisition)}</dd>
      <dt>\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0635\u064A\u0627\u0646\u0629</dt><dd>${money(tco.maintenance)} (${tco.workOrders} \u0623\u0645\u0631 \u0639\u0645\u0644)</dd>
      <dt><strong>\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A</strong></dt><dd><strong>${money(tco.total)}</strong></dd>
    </dl>
    <p class="muted" style="margin-bottom:0">\u0631\u0627\u0628\u0637 \u0645\u0644\u0635\u0642 QR: <code>${esc(qr)}</code></p>
  </div>
</div>

${canCreateTicket ? `<div class="panel">
  <h2 style="margin-top:0">\u0641\u062A\u062D \u0628\u0644\u0627\u063A \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0623\u0635\u0644</h2>
  <form method="post" action="/tickets/new" class="stack wide">
    <input type="hidden" name="assetTag" value="${esc(asset.tag)}">
    <div class="row">
      <div><label>\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629</label><select name="priority">${PRIORITIES.map((p) => `<option${p === "\u0645\u062A\u0648\u0633\u0637" ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
      <div><label>\u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0637\u0627\u0644\u0628\u0629</label><input name="requestingDept" value="${esc(user.department)}"></div>
    </div>
    <div><label>\u0648\u0635\u0641 \u0627\u0644\u0639\u0637\u0644</label><textarea name="description" required></textarea></div>
    <div><button type="submit">\u0641\u062A\u062D \u0627\u0644\u0628\u0644\u0627\u063A</button></div>
  </form>
</div>` : ""}

<div class="panel">
  <h2 style="margin-top:0">\u0628\u0644\u0627\u063A\u0627\u062A \u0647\u0630\u0627 \u0627\u0644\u0623\u0635\u0644</h2>
  ${ticketTable(tickets)}
</div>`
  });
}
__name(assetDetailPage, "assetDetailPage");
function newAssetPage(user, types, sites, selectedType) {
  const typeOpts = types.map((t) => `<option value="${esc(t.code)}"${selectedType?.code === t.code ? " selected" : ""}>${esc(t.name)} (${esc(t.code)})</option>`).join("");
  const siteOpts = sites.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} \u2014 ${esc(s.name)}</option>`).join("");
  const dynFields = selectedType ? selectedType.fields.sort((a, b) => a.sortOrder - b.sortOrder).map((f) => {
    const name = `attr_${f.key}`;
    let input;
    switch (f.inputType) {
      case "\u0631\u0642\u0645":
        input = `<input type="number" step="any" name="${esc(name)}"${f.required ? " required" : ""}>`;
        break;
      case "\u062A\u0627\u0631\u064A\u062E":
        input = `<input type="date" name="${esc(name)}"${f.required ? " required" : ""}>`;
        break;
      case "\u0642\u0627\u0626\u0645\u0629":
        input = `<select name="${esc(name)}"${f.required ? " required" : ""}><option value="">\u2014</option>${(f.choices ?? []).map((c) => `<option>${esc(c)}</option>`).join("")}</select>`;
        break;
      case "\u0646\u0639\u0645/\u0644\u0627":
        input = `<select name="${esc(name)}"><option value="">\u2014</option><option value="true">\u0646\u0639\u0645</option><option value="false">\u0644\u0627</option></select>`;
        break;
      default:
        input = `<input name="${esc(name)}"${f.required ? " required" : ""}>`;
    }
    return `<div><label>${esc(f.label)}${f.required ? " *" : ""}</label>${input}</div>`;
  }).join("") : "";
  return page({
    title: "\u062A\u0633\u062C\u064A\u0644 \u0623\u0635\u0644",
    user,
    active: "/assets",
    body: `
<h1>\u062A\u0633\u062C\u064A\u0644 \u0623\u0635\u0644 \u062C\u062F\u064A\u062F</h1>

<form method="get" action="/assets/new" class="toolbar panel">
  <div class="grow"><label>\u0627\u062E\u062A\u0631 \u0646\u0648\u0639 \u0627\u0644\u0623\u0635\u0644 \u0623\u0648\u0644\u0627\u064B \u2014 \u062A\u0638\u0647\u0631 \u062E\u0635\u0627\u0626\u0635\u0647 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B</label>
    <select name="typeCode" onchange="this.form.submit()">
      <option value="">\u2014 \u0627\u062E\u062A\u0631 \u0627\u0644\u0646\u0648\u0639 \u2014</option>${typeOpts}
    </select></div>
  <noscript><button type="submit">\u0639\u0631\u0636 \u0627\u0644\u062E\u0635\u0627\u0626\u0635</button></noscript>
</form>

${selectedType ? `<form method="post" action="/assets/new" class="panel stack wide">
  <input type="hidden" name="typeCode" value="${esc(selectedType.code)}">
  <div class="row">
    <div><label>\u0627\u0633\u0645 \u0627\u0644\u0623\u0635\u0644 *</label><input name="name" required></div>
    <div><label>\u0627\u0644\u0645\u0648\u0642\u0639 *</label><select name="siteCode" required><option value="">\u2014</option>${siteOpts}</select></div>
  </div>
  <div class="row">
    <div><label>\u0627\u0644\u0635\u0627\u0646\u0639</label><input name="manufacturer"></div>
    <div><label>\u0627\u0644\u0637\u0631\u0627\u0632</label><input name="modelName"></div>
  </div>
  <div class="row">
    <div><label>\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A${selectedType.needsSerial ? " *" : ""}</label><input name="serialNumber"${selectedType.needsSerial ? " required" : ""}></div>
    <div><label>\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0627\u0642\u062A\u0646\u0627\u0621</label><input type="number" step="any" name="acquisitionCost" value="0"></div>
  </div>
  <div class="row">
    <div><label>\u0627\u0644\u0625\u062F\u0627\u0631\u0629</label><input name="department"></div>
    <div><label>\u0627\u0644\u0639\u0647\u062F\u0629 (\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641)</label><input name="custodian"></div>
  </div>
  <div class="row">
    <div><label>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0642\u062A\u0646\u0627\u0621</label><input type="date" name="acquisitionDate"></div>
    <div><label>\u0627\u0644\u0636\u0645\u0627\u0646 \u062D\u062A\u0649</label><input type="date" name="warrantyEnd"></div>
  </div>
  ${dynFields ? `<h2>\u062E\u0635\u0627\u0626\u0635 \xAB${esc(selectedType.name)}\xBB</h2><div class="row">${dynFields}</div>` : ""}
  <div><label>\u0645\u0644\u0627\u062D\u0638\u0627\u062A</label><textarea name="notes"></textarea></div>
  <div><button type="submit">\u062D\u0641\u0638 \u0627\u0644\u0623\u0635\u0644</button> <a class="btn ghost" href="/assets">\u0625\u0644\u063A\u0627\u0621</a></div>
</form>` : `<p class="empty">\u0627\u062E\u062A\u0631 \u0646\u0648\u0639 \u0627\u0644\u0623\u0635\u0644 \u0644\u0639\u0631\u0636 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0628\u062E\u0635\u0627\u0626\u0635\u0647.</p>`}`
  });
}
__name(newAssetPage, "newAssetPage");
function ticketTable(tickets) {
  if (!tickets.length) return `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A.</p>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>\u0627\u0644\u0645\u0631\u062C\u0639</th><th>\u0627\u0644\u0623\u0635\u0644</th><th>\u0627\u0644\u0648\u0635\u0641</th><th>\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629</th><th>\u0627\u0644\u062D\u0627\u0644\u0629</th><th>\u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642</th><th>SLA</th></tr></thead>
  <tbody>${tickets.map((t) => `<tr>
    <td><a href="/tickets/${encodeURIComponent(t.ref)}">${esc(t.ref)}</a></td>
    <td><a href="/assets/${encodeURIComponent(t.assetTag)}">${esc(t.assetTag)}</a></td>
    <td>${esc(t.description.slice(0, 70))}${t.description.length > 70 ? "\u2026" : ""}</td>
    <td><span class="pill ${t.priority === "\u0639\u0627\u062C\u0644" ? "bad" : t.priority === "\u0645\u0631\u062A\u0641\u0639" ? "warn" : ""}">${esc(t.priority)}</span></td>
    <td><span class="pill ${t.status === "\u0645\u063A\u0644\u0642" ? "ok" : t.status === "\u0645\u0644\u063A\u0649" ? "" : "info"}">${esc(t.status)}</span></td>
    <td>${dt(t.dueDate)}</td>
    <td>${t.slaBreached ? `<span class="pill bad">\u062A\u062C\u0627\u0648\u0632</span>` : `<span class="pill ok">\u0645\u0644\u062A\u0632\u0645</span>`}</td>
  </tr>`).join("")}</tbody></table></div>`;
}
__name(ticketTable, "ticketTable");
function ticketsPage(user, tickets, canCreate) {
  return page({
    title: "\u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A",
    user,
    active: "/tickets",
    body: `
<h1>\u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A <span class="muted">(${tickets.length})</span></h1>
${canCreate ? `<p><a class="btn" href="/assets">\u0641\u062A\u062D \u0628\u0644\u0627\u063A \u2014 \u0627\u0628\u062F\u0623 \u0628\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0623\u0635\u0644</a></p>` : ""}
<div class="panel">${ticketTable(tickets)}</div>`
  });
}
__name(ticketsPage, "ticketsPage");
function ticketDetailPage(user, t, asset, contract, supplier, wo, audit, perms) {
  const canOpenWo = perms.has("workorder:write") && !wo && t.status !== "\u0645\u063A\u0644\u0642" && t.status !== "\u0645\u0644\u063A\u0649";
  const canClose = perms.has("ticket:close") && wo && (wo.status === "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" || wo.status === "\u0645\u063A\u0644\u0642") && t.status !== "\u0645\u063A\u0644\u0642";
  return page({
    title: t.ref,
    user,
    active: "/tickets",
    body: `
<h1>\u0627\u0644\u0628\u0644\u0627\u063A ${esc(t.ref)} <span class="pill ${t.status === "\u0645\u063A\u0644\u0642" ? "ok" : "info"}">${esc(t.status)}</span></h1>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0628\u0644\u0627\u063A</h2>
    <dl class="kv">
      <dt>\u0627\u0644\u0623\u0635\u0644</dt><dd><a href="/assets/${encodeURIComponent(t.assetTag)}">${esc(t.assetTag)}</a> \u2014 ${esc(asset?.name ?? "")}</dd>
      <dt>\u0627\u0644\u0645\u0648\u0642\u0639</dt><dd>${esc(t.siteCode)}</dd>
      <dt>\u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0637\u0627\u0644\u0628\u0629</dt><dd>${esc(t.requestingDept || "\u2014")}</dd>
      <dt>\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629</dt><dd>${esc(t.priority)}</dd>
      <dt>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0641\u062A\u062D</dt><dd>${dt(t.createdAt)}</dd>
      <dt>\u0645\u0648\u0639\u062F \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629</dt><dd>${dt(t.dueDate)} ${t.slaBreached ? `<span class="pill bad">\u062A\u062C\u0627\u0648\u0632</span>` : ""}</dd>
      <dt>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u063A\u0644\u0627\u0642</dt><dd>${dt(t.closedDate)}</dd>
      <dt>\u0627\u0644\u0648\u0635\u0641</dt><dd>${esc(t.description)}</dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u062A\u063A\u0637\u064A\u0629 \u0627\u0644\u062A\u0639\u0627\u0642\u062F\u064A\u0629</h2>
    ${contract ? `<dl class="kv">
        <dt>\u0627\u0644\u0639\u0642\u062F</dt><dd><a href="/contracts/${encodeURIComponent(contract.id)}">${esc(contract.id)}</a> \u2014 ${esc(contract.title)}</dd>
        <dt>\u0627\u0644\u0645\u0648\u0631\u062F</dt><dd>${esc(supplier?.name ?? contract.supplierId)}</dd>
        <dt>\u0623\u0633\u0627\u0633 \u0627\u0644\u0641\u0648\u062A\u0631\u0629</dt><dd>${esc(contract.billingBasis)}</dd>
        <dt>\u0632\u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629</dt><dd>${contract.responseHours} \u0633\u0627\u0639\u0629</dd>
        <dt>\u063A\u0631\u0627\u0645\u0629 \u0627\u0644\u062A\u0623\u062E\u064A\u0631</dt><dd>${(contract.penaltyRatePerDay * 100).toFixed(1)}\u066A \u0639\u0646 \u0643\u0644 \u064A\u0648\u0645</dd>
      </dl>` : `<p class="msg err" style="margin:0">\u0644\u0627 \u064A\u0648\u062C\u062F \u0639\u0642\u062F \u0633\u0627\u0631\u064A \u064A\u063A\u0637\u064A \u0647\u0630\u0627 \u0627\u0644\u0623\u0635\u0644 \u2014 \u0633\u064A\u064F\u0646\u0641\u064E\u0651\u0630 \u0627\u0644\u0639\u0645\u0644 \u062F\u0627\u062E\u0644\u064A\u0627\u064B \u0623\u0648 \u064A\u0644\u0632\u0645 \u0623\u0645\u0631 \u0634\u0631\u0627\u0621 \u0645\u0628\u0627\u0634\u0631.</p>`}
  </div>
</div>

<div class="panel">
  <h2 style="margin-top:0">\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644</h2>
  ${wo ? workOrderBlock(wo, perms) : canOpenWo ? `<form method="post" action="/work-orders/new" class="stack">
      <input type="hidden" name="ticketRef" value="${esc(t.ref)}">
      <div class="row">
        <div><label>\u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644</label><select name="workType">${WORK_TYPES.map((w) => `<option${w === "\u0625\u0635\u0644\u0627\u062D" ? " selected" : ""}>${esc(w)}</option>`).join("")}</select></div>
        <div><label>\u0627\u0644\u0641\u0646\u064A \u0627\u0644\u0645\u0633\u0646\u062F \u0625\u0644\u064A\u0647</label><input name="technician" value="${esc(user.id)}"></div>
      </div>
      <div><button type="submit">\u0641\u062A\u062D \u0623\u0645\u0631 \u0639\u0645\u0644</button></div>
    </form>` : `<p class="muted">\u0644\u0627 \u064A\u0648\u062C\u062F \u0623\u0645\u0631 \u0639\u0645\u0644.</p>`}
</div>

${canClose ? `<div class="panel">
  <form method="post" action="/tickets/${encodeURIComponent(t.ref)}/close">
    <button type="submit">\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0628\u0644\u0627\u063A</button>
    <span class="muted">\u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0645\u0633\u0645\u0648\u062D \u0644\u0623\u0646 \u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 \u0645\u064F\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B.</span>
  </form>
</div>` : ""}

<div class="panel">
  <h2 style="margin-top:0">\u0633\u062C\u0644 \u0627\u0644\u062D\u0631\u0643\u0629</h2>
  ${auditTable(audit)}
</div>`
  });
}
__name(ticketDetailPage, "ticketDetailPage");
function workOrderBlock(wo, perms) {
  const canComplete = perms.has("workorder:complete") && wo.status !== "\u0645\u0646\u062C\u0632 \u0641\u0646\u064A\u0627\u064B" && wo.status !== "\u0645\u063A\u0644\u0642";
  return `<dl class="kv">
  <dt>\u0627\u0644\u0645\u0631\u062C\u0639</dt><dd><a href="/work-orders/${encodeURIComponent(wo.ref)}">${esc(wo.ref)}</a></dd>
  <dt>\u0627\u0644\u0646\u0648\u0639</dt><dd>${esc(wo.workType)}</dd>
  <dt>\u0627\u0644\u062D\u0627\u0644\u0629</dt><dd><span class="pill ${wo.status === "\u0645\u063A\u0644\u0642" ? "ok" : "info"}">${esc(wo.status)}</span></dd>
  <dt>\u0627\u0644\u0641\u0646\u064A</dt><dd>${esc(wo.technician)}</dd>
  <dt>\u0633\u0627\u0639\u0627\u062A \u0627\u0644\u0639\u0645\u0644</dt><dd>${wo.laborHours || "\u2014"}</dd>
  <dt>\u0642\u0637\u0639 \u0627\u0644\u063A\u064A\u0627\u0631</dt><dd>${esc(wo.partsUsed || "\u2014")}</dd>
  <dt>\u0627\u0644\u0646\u062A\u064A\u062C\u0629</dt><dd>${esc(wo.outcome || "\u2014")}</dd>
  <dt>\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u062D\u0642</dt><dd>${wo.underContract ? `<span class="pill">\u0645\u0634\u0645\u0648\u0644 \u0628\u062F\u0641\u0639\u0627\u062A \u0627\u0644\u0639\u0642\u062F</span>` : money(wo.billableAmount)}</dd>
  ${wo.penaltyAmount ? `<dt>\u063A\u0631\u0627\u0645\u0629 \u0627\u0644\u062A\u0623\u062E\u064A\u0631</dt><dd class="pill bad">${money(wo.penaltyAmount)}</dd>` : ""}
  <dt>\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629</dt><dd>${wo.invoiceRef ? `<a href="/invoices/${encodeURIComponent(wo.invoiceRef)}">${esc(wo.invoiceRef)}</a>` : "\u2014"}</dd>
</dl>
${canComplete ? `<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">
<form method="post" action="/work-orders/${encodeURIComponent(wo.ref)}/complete" class="stack">
  <div><label>\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0639\u0645\u0644 / \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0625\u0646\u062C\u0627\u0632 *</label><textarea name="outcome" required></textarea></div>
  <div class="row">
    <div><label>\u0642\u0637\u0639 \u0627\u0644\u063A\u064A\u0627\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u0629</label><input name="partsUsed"></div>
    <div><label>\u0633\u0627\u0639\u0627\u062A \u0627\u0644\u0639\u0645\u0644</label><input type="number" step="0.5" name="laborHours" value="1"></div>
  </div>
  <div><label>\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u062D\u0642 \u0644\u0644\u0645\u0648\u0631\u062F</label><input type="number" step="any" name="billableAmount" value="0">
    <span class="muted">\u064A\u064F\u062A\u062C\u0627\u0647\u0644 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0639\u0642\u062F \u0628\u062F\u0641\u0639\u0627\u062A \u062F\u0648\u0631\u064A\u0629.</span></div>
  <div><button type="submit">\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0625\u0646\u062C\u0627\u0632 \u0627\u0644\u0641\u0646\u064A</button></div>
</form>` : ""}`;
}
__name(workOrderBlock, "workOrderBlock");
function workOrdersPage(user, wos) {
  return page({
    title: "\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644",
    user,
    active: "/work-orders",
    body: `
<h1>\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 <span class="muted">(${wos.length})</span></h1>
<div class="panel">
${wos.length ? `<div class="tablewrap"><table>
  <thead><tr><th>\u0627\u0644\u0645\u0631\u062C\u0639</th><th>\u0627\u0644\u0628\u0644\u0627\u063A</th><th>\u0627\u0644\u0623\u0635\u0644</th><th>\u0627\u0644\u0646\u0648\u0639</th><th>\u0627\u0644\u062D\u0627\u0644\u0629</th><th>\u0627\u0644\u0645\u0633\u062A\u062D\u0642</th><th>\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629</th></tr></thead>
  <tbody>${wos.map((w) => `<tr>
    <td><a href="/work-orders/${encodeURIComponent(w.ref)}">${esc(w.ref)}</a></td>
    <td><a href="/tickets/${encodeURIComponent(w.ticketRef)}">${esc(w.ticketRef)}</a></td>
    <td>${esc(w.assetTag)}</td>
    <td>${esc(w.workType)}</td>
    <td><span class="pill ${w.status === "\u0645\u063A\u0644\u0642" ? "ok" : "info"}">${esc(w.status)}</span></td>
    <td>${w.underContract ? `<span class="pill">\u062F\u0641\u0639\u0627\u062A \u062F\u0648\u0631\u064A\u0629</span>` : money(w.billableAmount)}</td>
    <td>${w.invoiceRef ? `<a href="/invoices/${encodeURIComponent(w.invoiceRef)}">${esc(w.invoiceRef)}</a>` : "\u2014"}</td>
  </tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0648\u0627\u0645\u0631 \u0639\u0645\u0644.</p>`}
</div>`
  });
}
__name(workOrdersPage, "workOrdersPage");
function workOrderDetailPage(user, wo, perms) {
  return page({
    title: wo.ref,
    user,
    active: "/work-orders",
    body: `<h1>\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 ${esc(wo.ref)}</h1><div class="panel">${workOrderBlock(wo, perms)}</div>`
  });
}
__name(workOrderDetailPage, "workOrderDetailPage");
function invoicesPage(user, invoices, billable, suppliers, inbox2, perms) {
  const supName = new Map(suppliers.map((s) => [
    s.id,
    s.name
  ]));
  return page({
    title: "\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631",
    user,
    active: "/invoices",
    body: `
<h1>\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0648\u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0627\u062A</h1>

${inbox2.length ? `<div class="panel" style="border-color:#f0dbaa;background:#fffdf7">
  <h2 style="margin-top:0">\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0635\u0631\u0651\u0641\u0643 (${inbox2.length})</h2>
  ${invoiceTable(inbox2, supName)}
</div>` : ""}

${perms.has("invoice:create") && billable.length ? `<div class="panel">
  <h2 style="margin-top:0">\u0623\u0648\u0627\u0645\u0631 \u0639\u0645\u0644 \u0645\u0646\u062C\u0632\u0629 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0641\u0648\u062A\u0631\u0629 (${billable.length})</h2>
  <form method="post" action="/invoices/new" class="stack wide">
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>\u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644</th><th>\u0627\u0644\u0623\u0635\u0644</th><th>\u0627\u0644\u0645\u0648\u0631\u062F</th><th>\u0627\u0644\u0645\u0628\u0644\u063A</th><th>\u0627\u0644\u063A\u0631\u0627\u0645\u0629</th></tr></thead>
      <tbody>${billable.map((w) => `<tr>
        <td><input type="checkbox" name="workOrderRefs" value="${esc(w.ref)}" style="width:auto"
             data-supplier="${esc(w.supplierId ?? "")}"></td>
        <td>${esc(w.ref)}</td><td>${esc(w.assetTag)}</td>
        <td>${esc(supName.get(w.supplierId ?? "") ?? "\u2014")}</td>
        <td>${money(w.billableAmount)}</td><td>${w.penaltyAmount ? money(w.penaltyAmount) : "\u2014"}</td>
      </tr>`).join("")}</tbody></table></div>
    <div class="row">
      <div><label>\u0627\u0644\u0645\u0648\u0631\u062F *</label><select name="supplierId" required><option value="">\u2014</option>${suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></div>
      <div><label>\u0631\u0642\u0645 \u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0645\u0648\u0631\u062F</label><input name="supplierInvoiceNo"></div>
    </div>
    <div><button type="submit">\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0648\u062F\u0629 \u0641\u0627\u062A\u0648\u0631\u0629</button>
      <button type="submit" formaction="/invoices/auto" class="ghost">\u0641\u0648\u062A\u0631\u0629 \u0622\u0644\u064A\u0629 \u0644\u0643\u0644 \u0627\u0644\u0645\u0646\u062C\u0632</button></div>
  </form>
</div>` : ""}

<div class="panel">
  <h2 style="margin-top:0">\u0643\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 (${invoices.length})</h2>
  ${invoiceTable(invoices, supName)}
</div>`
  });
}
__name(invoicesPage, "invoicesPage");
function invoiceStatusPill(s) {
  const cls = s === "\u0645\u0635\u0631\u0648\u0641\u0629" || s === "\u0645\u0639\u062A\u0645\u062F\u0629" ? "ok" : s === "\u0645\u0631\u0641\u0648\u0636\u0629" || s === "\u0645\u0644\u063A\u0627\u0629" ? "bad" : s === "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" ? "warn" : "";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}
__name(invoiceStatusPill, "invoiceStatusPill");
function invoiceTable(invoices, supName) {
  if (!invoices.length) return `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0648\u0627\u062A\u064A\u0631.</p>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>\u0627\u0644\u0645\u0631\u062C\u0639</th><th>\u0627\u0644\u0645\u0648\u0631\u062F</th><th>\u0627\u0644\u0639\u0642\u062F</th><th>\u0627\u0644\u0623\u0633\u0627\u0633</th><th>\u0627\u0644\u0635\u0627\u0641\u064A</th><th>\u0627\u0644\u0636\u0631\u064A\u0628\u0629</th><th>\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A</th><th>\u0627\u0644\u062D\u0627\u0644\u0629</th><th>\u0627\u0644\u062A\u0627\u0631\u064A\u062E</th></tr></thead>
  <tbody>${invoices.map((i) => `<tr>
    <td><a href="/invoices/${encodeURIComponent(i.ref)}">${esc(i.ref)}</a></td>
    <td>${esc(supName.get(i.supplierId) ?? i.supplierId)}</td>
    <td>${i.contractId ? esc(i.contractId) : "\u2014"}</td>
    <td>${esc(i.basis)}</td>
    <td>${money(i.amount)}</td>
    <td>${money(i.vatAmount)}</td>
    <td><strong>${money(i.grandTotal)}</strong></td>
    <td>${invoiceStatusPill(i.status)}</td>
    <td>${day(i.issueDate)}</td>
  </tr>`).join("")}</tbody></table></div>`;
}
__name(invoiceTable, "invoiceTable");
function invoiceDetailPage(user, inv, supplier, chain, match, wos, payment, budgetLine, audit, perms, currentStep2) {
  const chainHtml = chain.map((a, i) => {
    const cls = a.status === "\u0645\u0639\u062A\u0645\u062F" ? "done" : a.status === "\u0628\u0627\u0646\u062A\u0638\u0627\u0631" ? "wait" : a.status === "\u0645\u0631\u0641\u0648\u0636" ? "rej" : "";
    return `${i ? `<span class="arrow">\u2190</span>` : ""}<div class="step ${cls}">
      <strong>${esc(a.step)}</strong> \u2014 ${esc(a.status)}<br>
      <span class="muted">${a.actedBy ? `${esc(a.actedBy)} \xB7 ${dt(a.actedAt)}` : "\u0644\u0645 \u064A\u064F\u062A\u062E\u0630 \u0625\u062C\u0631\u0627\u0621"}</span>
      ${a.note ? `<br><span class="muted">${esc(a.note)}</span>` : ""}
    </div>`;
  }).join("");
  const canSubmit = perms.has("invoice:submit") && (inv.status === "\u0645\u0633\u0648\u062F\u0629" || inv.status === "\u0645\u0631\u0641\u0648\u0636\u0629");
  const myStep = currentStep2 && (user.roles.includes(currentStep2.requiredRole) || user.roles.includes("admin")) && inv.status === "\u0642\u064A\u062F \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F";
  const canPay = perms.has("payment:execute") && inv.status === "\u0645\u0639\u062A\u0645\u062F\u0629";
  return page({
    title: inv.ref,
    user,
    active: "/invoices",
    body: `
<h1>\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 ${esc(inv.ref)} ${invoiceStatusPill(inv.status)}</h1>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629</h2>
    <dl class="kv">
      <dt>\u0627\u0644\u0645\u0648\u0631\u062F</dt><dd>${esc(supplier?.name ?? inv.supplierId)}</dd>
      <dt>\u0627\u0644\u0639\u0642\u062F</dt><dd>${inv.contractId ? `<a href="/contracts/${encodeURIComponent(inv.contractId)}">${esc(inv.contractId)}</a>` : "\u2014"}</dd>
      <dt>\u0631\u0642\u0645 \u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0645\u0648\u0631\u062F</dt><dd>${esc(inv.supplierInvoiceNo || "\u2014")}</dd>
      <dt>\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644</dt><dd>${inv.workOrderRefs.map((r) => `<a href="/work-orders/${encodeURIComponent(r)}">${esc(r)}</a>`).join("\u060C ")}</dd>
      <dt>\u0627\u0644\u0635\u0627\u0641\u064A</dt><dd>${money(inv.amount)}</dd>
      ${inv.penaltyAmount ? `<dt>\u063A\u0631\u0627\u0645\u0627\u062A \u0645\u062E\u0635\u0648\u0645\u0629</dt><dd class="pill bad">${money(inv.penaltyAmount)}</dd>` : ""}
      <dt>\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629</dt><dd>${money(inv.vatAmount)}</dd>
      <dt><strong>\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A</strong></dt><dd><strong>${money(inv.grandTotal)}</strong></dd>
      <dt>\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629</dt><dd>${esc(budgetLine ? `${budgetLine.id} \u2014 ${budgetLine.name}` : inv.budgetLineId)}</dd>
      <dt>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0635\u062F\u0627\u0631</dt><dd>${dt(inv.issueDate)}</dd>
    </dl>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u062B\u0644\u0627\u062B\u064A\u0629</h2>
    <p>${match.matched ? `<span class="pill ok">\u0645\u0637\u0627\u0628\u0642\u0629 \u0646\u0627\u062C\u062D\u0629</span>` : `<span class="pill bad">\u0645\u0637\u0627\u0628\u0642\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629</span>`}</p>
    <ul class="checks">${match.checks.map((c) => `<li>${c.ok ? "\u2714" : "\u2718"} <strong>${esc(c.name)}</strong> \u2014 ${esc(c.detail)}</li>`).join("")}</ul>
    <p class="muted">\u0622\u062E\u0631 \u0641\u062D\u0635: ${dt(match.checkedAt)}</p>
  </div>
</div>

<div class="panel">
  <h2 style="margin-top:0">\u0645\u0633\u0627\u0631 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F</h2>
  ${chain.length ? `<div class="chain">${chainHtml}</div>` : `<p class="muted">\u0644\u0645 \u062A\u064F\u0642\u062F\u064E\u0651\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u0628\u0639\u062F.</p>`}

  ${canSubmit ? `<form method="post" action="/invoices/${encodeURIComponent(inv.ref)}/submit" style="margin-top:1rem">
      <button type="submit">\u062A\u0642\u062F\u064A\u0645 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F</button>
      <span class="muted">\u0644\u0646 \u062A\u064F\u0642\u0628\u0644 \u0625\u0644\u0627 \u0628\u0639\u062F \u0646\u062C\u0627\u062D \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u062B\u0644\u0627\u062B\u064A\u0629.</span></form>` : ""}

  ${myStep ? `<form method="post" action="/invoices/${encodeURIComponent(inv.ref)}/act" class="stack" style="margin-top:1rem">
      <div><label>\u0645\u0644\u0627\u062D\u0638\u0629</label><input name="note" placeholder="\u0627\u062E\u062A\u064A\u0627\u0631\u064A"></div>
      <div>
        <button type="submit" name="decision" value="approve">\u0627\u0639\u062A\u0645\u0627\u062F \u062E\u0637\u0648\u0629 \xAB${esc(currentStep2.step)}\xBB</button>
        <button type="submit" name="decision" value="reject" class="danger">\u0631\u0641\u0636</button>
      </div></form>` : ""}

  ${canPay ? `<form method="post" action="/invoices/${encodeURIComponent(inv.ref)}/pay" class="stack" style="margin-top:1rem">
      <div class="row">
        <div><label>\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0635\u0631\u0641</label><select name="method"><option>\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A</option><option>\u0634\u064A\u0643</option><option>\u0645\u0642\u0627\u0635\u0629</option></select></div>
        <div><label>\u0645\u0631\u062C\u0639 \u0627\u0644\u0628\u0646\u0643 / \u0627\u0644\u0634\u064A\u0643</label><input name="bankReference"></div>
      </div>
      <div><button type="submit">\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0635\u0631\u0641</button></div></form>` : ""}

  ${payment ? `<div class="msg ok" style="margin-top:1rem">\u0635\u064F\u0631\u0641\u062A \u0628\u0627\u0644\u0633\u0646\u062F <strong>${esc(payment.ref)}</strong> \u0628\u0645\u0628\u0644\u063A ${money(payment.amount)} \u2014 ${esc(payment.method)} ${esc(payment.bankReference)} \u0628\u062A\u0627\u0631\u064A\u062E ${dt(payment.paidAt)}</div>` : ""}
</div>

<div class="panel">
  <h2 style="margin-top:0">\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629</h2>
  ${wos.filter(Boolean).length ? `<div class="tablewrap"><table>
    <thead><tr><th>\u0627\u0644\u0645\u0631\u062C\u0639</th><th>\u0627\u0644\u0623\u0635\u0644</th><th>\u0627\u0644\u0646\u062A\u064A\u062C\u0629</th><th>\u0633\u0627\u0639\u0627\u062A</th><th>\u0627\u0644\u0645\u0628\u0644\u063A</th></tr></thead>
    <tbody>${wos.filter(Boolean).map((w) => `<tr>
      <td><a href="/work-orders/${encodeURIComponent(w.ref)}">${esc(w.ref)}</a></td>
      <td>${esc(w.assetTag)}</td><td>${esc(w.outcome)}</td>
      <td>${w.laborHours}</td><td>${money(w.billableAmount)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u2014</p>`}
</div>

<div class="panel"><h2 style="margin-top:0">\u0633\u062C\u0644 \u0627\u0644\u062D\u0631\u0643\u0629</h2>${auditTable(audit)}</div>`
  });
}
__name(invoiceDetailPage, "invoiceDetailPage");
function contractsPage(user, contracts, suppliers, types, budgetLines, canWrite) {
  const supName = new Map(suppliers.map((s) => [
    s.id,
    s.name
  ]));
  return page({
    title: "\u0627\u0644\u0639\u0642\u0648\u062F \u0648\u0627\u0644\u0645\u0648\u0631\u062F\u0648\u0646",
    user,
    active: "/contracts",
    body: `
<h1>\u0627\u0644\u0639\u0642\u0648\u062F \u0648\u0627\u0644\u0645\u0648\u0631\u062F\u0648\u0646</h1>

<div class="panel">
  <h2 style="margin-top:0">\u0627\u0644\u0639\u0642\u0648\u062F (${contracts.length})</h2>
  ${contracts.length ? `<div class="tablewrap"><table>
    <thead><tr><th>\u0627\u0644\u0631\u0642\u0645</th><th>\u0627\u0644\u0639\u0646\u0648\u0627\u0646</th><th>\u0627\u0644\u0645\u0648\u0631\u062F</th><th>\u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629</th><th>\u0623\u0633\u0627\u0633 \u0627\u0644\u0641\u0648\u062A\u0631\u0629</th><th>SLA</th><th>\u0627\u0644\u0642\u064A\u0645\u0629</th><th>\u0627\u0644\u0633\u0631\u064A\u0627\u0646</th><th>\u0627\u0644\u062D\u0627\u0644\u0629</th></tr></thead>
    <tbody>${contracts.map((c) => `<tr>
      <td><a href="/contracts/${encodeURIComponent(c.id)}">${esc(c.id)}</a></td>
      <td>${esc(c.title)}</td>
      <td>${esc(supName.get(c.supplierId) ?? c.supplierId)}</td>
      <td>${c.coveredTypes.length ? esc(c.coveredTypes.join("\u060C ")) : `<span class="muted">\u0627\u0644\u0643\u0644</span>`}</td>
      <td>${esc(c.billingBasis)}</td>
      <td>${c.responseHours} \u0633\u0627\u0639\u0629</td>
      <td>${money(c.value)}</td>
      <td>${day(c.startDate)} \u2190 ${day(c.expiryDate)}</td>
      <td><span class="pill ${c.status === "\u0633\u0627\u0631\u064A" ? "ok" : c.status === "\u0645\u0646\u062A\u0647\u064A" || c.status === "\u0645\u0644\u063A\u0649" ? "bad" : ""}">${esc(c.status)}</span></td>
    </tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0639\u0642\u0648\u062F.</p>`}
</div>

<div class="panel">
  <h2 style="margin-top:0">\u0627\u0644\u0645\u0648\u0631\u062F\u0648\u0646 (${suppliers.length})</h2>
  ${suppliers.length ? `<div class="tablewrap"><table>
    <thead><tr><th>\u0627\u0644\u0631\u0645\u0632</th><th>\u0627\u0644\u0627\u0633\u0645</th><th>\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062A\u062C\u0627\u0631\u064A</th><th>\u062C\u0647\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644</th><th>\u0627\u0644\u0628\u0631\u064A\u062F</th><th>\u0627\u0644\u062D\u0627\u0644\u0629</th></tr></thead>
    <tbody>${suppliers.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.commercialReg || "\u2014")}</td>
      <td>${esc(s.contactName || "\u2014")}</td><td>${esc(s.email || "\u2014")}</td>
      <td>${s.isActive ? `<span class="pill ok">\u0646\u0634\u0637</span>` : `<span class="pill bad">\u0645\u0648\u0642\u0648\u0641</span>`}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0648\u0631\u062F\u0648\u0646.</p>`}
</div>

${canWrite ? `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
  <div class="panel">
    <h2 style="margin-top:0">\u062A\u0633\u062C\u064A\u0644 \u0645\u0648\u0631\u062F</h2>
    <form method="post" action="/suppliers/new" class="stack wide">
      <div><label>\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0631\u062F *</label><input name="name" required></div>
      <div class="row">
        <div><label>\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062A\u062C\u0627\u0631\u064A</label><input name="commercialReg"></div>
        <div><label>\u062C\u0647\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644</label><input name="contactName"></div>
      </div>
      <div class="row">
        <div><label>\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A</label><input name="email" type="email"></div>
        <div><label>\u0627\u0644\u0647\u0627\u062A\u0641</label><input name="phone"></div>
      </div>
      <div><button type="submit">\u062D\u0641\u0638 \u0627\u0644\u0645\u0648\u0631\u062F</button></div>
    </form>
  </div>

  <div class="panel">
    <h2 style="margin-top:0">\u0625\u0628\u0631\u0627\u0645 \u0639\u0642\u062F</h2>
    <form method="post" action="/contracts/new" class="stack wide">
      <div><label>\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0639\u0642\u062F *</label><input name="title" required></div>
      <div class="row">
        <div><label>\u0627\u0644\u0645\u0648\u0631\u062F *</label><select name="supplierId" required><option value="">\u2014</option>${suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></div>
        <div><label>\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 *</label><select name="budgetLineId" required><option value="">\u2014</option>${budgetLines.map((b) => `<option value="${esc(b.id)}">${esc(b.id)} \u2014 ${esc(b.name)}</option>`).join("")}</select></div>
      </div>
      <div><label>\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629 (\u0627\u062A\u0631\u0643\u0647\u0627 \u0641\u0627\u0631\u063A\u0629 = \u0627\u0644\u0643\u0644)</label>
        <select name="coveredTypes" multiple size="4">${types.map((t) => `<option value="${esc(t.code)}">${esc(t.name)} (${esc(t.code)})</option>`).join("")}</select></div>
      <div class="row">
        <div><label>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0628\u062F\u0621 *</label><input type="date" name="startDate" required></div>
        <div><label>\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621 *</label><input type="date" name="expiryDate" required></div>
      </div>
      <div class="row">
        <div><label>\u0642\u064A\u0645\u0629 \u0627\u0644\u0639\u0642\u062F</label><input type="number" step="any" name="value" value="0"></div>
        <div><label>\u0623\u0633\u0627\u0633 \u0627\u0644\u0641\u0648\u062A\u0631\u0629</label><select name="billingBasis">${BILLING_BASES.map((b) => `<option>${esc(b)}</option>`).join("")}</select></div>
      </div>
      <div class="row">
        <div><label>\u0632\u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629 (\u0633\u0627\u0639\u0629)</label><input type="number" name="responseHours" value="24"></div>
        <div><label>\u063A\u0631\u0627\u0645\u0629 \u0627\u0644\u062A\u0623\u062E\u064A\u0631 \u0627\u0644\u064A\u0648\u0645\u064A\u0629 (\u0646\u0633\u0628\u0629\u060C \u0645\u062B\u0627\u0644 0.02)</label><input type="number" step="any" name="penaltyRatePerDay" value="0"></div>
      </div>
      <div><button type="submit">\u062D\u0641\u0638 \u0627\u0644\u0639\u0642\u062F \u0643\u0645\u0633\u0648\u062F\u0629</button></div>
    </form>
  </div>
</div>` : ""}`
  });
}
__name(contractsPage, "contractsPage");
function contractDetailPage(user, c, supplier, assets, tickets, invoices, types, sites, canWrite) {
  return page({
    title: c.id,
    user,
    active: "/contracts",
    body: `
<h1>\u0627\u0644\u0639\u0642\u062F ${esc(c.id)} <span class="pill ${c.status === "\u0633\u0627\u0631\u064A" ? "ok" : ""}">${esc(c.status)}</span></h1>

<div class="panel">
  <h2 style="margin-top:0">${esc(c.title)}</h2>
  <dl class="kv">
    <dt>\u0627\u0644\u0645\u0648\u0631\u062F</dt><dd>${esc(supplier?.name ?? c.supplierId)}</dd>
    <dt>\u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629</dt><dd>${c.coveredTypes.length ? esc(c.coveredTypes.join("\u060C ")) : "\u0643\u0644 \u0627\u0644\u0623\u0646\u0648\u0627\u0639"}</dd>
    <dt>\u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629</dt><dd>${c.coveredSites.length ? esc(c.coveredSites.join("\u060C ")) : "\u0643\u0644 \u0627\u0644\u0645\u0648\u0627\u0642\u0639"}</dd>
    <dt>\u0627\u0644\u0633\u0631\u064A\u0627\u0646</dt><dd>${day(c.startDate)} \u2190 ${day(c.expiryDate)}</dd>
    <dt>\u0627\u0644\u0642\u064A\u0645\u0629</dt><dd>${money(c.value)}</dd>
    <dt>\u0623\u0633\u0627\u0633 \u0627\u0644\u0641\u0648\u062A\u0631\u0629</dt><dd>${esc(c.billingBasis)}${c.billingCycle ? ` (${esc(c.billingCycle)})` : ""}</dd>
    <dt>\u0632\u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629</dt><dd>${c.responseHours} \u0633\u0627\u0639\u0629</dd>
    <dt>\u063A\u0631\u0627\u0645\u0629 \u0627\u0644\u062A\u0623\u062E\u064A\u0631</dt><dd>${(c.penaltyRatePerDay * 100).toFixed(1)}\u066A \u064A\u0648\u0645\u064A\u0627\u064B</dd>
    <dt>\u0628\u0646\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629</dt><dd>${esc(c.budgetLineId || "\u2014")}</dd>
  </dl>
  ${canWrite ? `<form method="post" action="/contracts/${encodeURIComponent(c.id)}/status" class="toolbar" style="margin-top:1rem">
    <div><label>\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u062D\u0627\u0644\u0629</label><select name="status">
      <option>\u0645\u0633\u0648\u062F\u0629</option><option>\u0633\u0627\u0631\u064A</option><option>\u0645\u0648\u0642\u0648\u0641</option><option>\u0645\u0646\u062A\u0647\u064A</option><option>\u0645\u0644\u063A\u0649</option>
    </select></div><div><button type="submit">\u062A\u0637\u0628\u064A\u0642</button></div></form>` : ""}
</div>

${canWrite ? `<div class="panel">
  <h2 style="margin-top:0">\u0627\u0633\u062A\u0644\u0627\u0645 \u062A\u0648\u0631\u064A\u062F\u0627\u062A \u0648\u062A\u0631\u062D\u064A\u0644\u0647\u0627 \u0625\u0644\u0649 \u0633\u062C\u0644 \u0627\u0644\u0623\u0635\u0648\u0644</h2>
  <p class="muted">\u0628\u0646\u062F \u0648\u0627\u062D\u062F \u0644\u0643\u0644 \u0627\u0633\u062A\u0644\u0627\u0645. \u064A\u064F\u0646\u0634\u0623 \u0627\u0644\u0623\u0635\u0644 \u0645\u0631\u0628\u0648\u0637\u0627\u064B \u0628\u0647\u0630\u0627 \u0627\u0644\u0639\u0642\u062F \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B.</p>
  <form method="post" action="/contracts/${encodeURIComponent(c.id)}/receive" class="stack wide">
    <div class="row">
      <div><label>\u0646\u0648\u0639 \u0627\u0644\u0623\u0635\u0644 *</label><select name="typeCode" required>${types.map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join("")}</select></div>
      <div><label>\u0627\u0644\u0645\u0648\u0642\u0639 *</label><select name="siteCode" required>${sites.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} \u2014 ${esc(s.name)}</option>`).join("")}</select></div>
    </div>
    <div class="row">
      <div><label>\u0627\u0633\u0645 \u0627\u0644\u0623\u0635\u0644 *</label><input name="name" required></div>
      <div><label>\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u0644\u0633\u0644\u064A</label><input name="serialNumber"></div>
    </div>
    <div><label>\u0627\u0644\u062A\u0643\u0644\u0641\u0629</label><input type="number" step="any" name="cost" value="0"></div>
    <div><button type="submit">\u062A\u0631\u062D\u064A\u0644 \u0625\u0644\u0649 \u0627\u0644\u0623\u0635\u0648\u0644</button></div>
  </form>
</div>` : ""}

<div class="panel">
  <h2 style="margin-top:0">\u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0645\u0648\u0631\u064E\u0651\u062F\u0629 \u0628\u0645\u0648\u062C\u0628 \u0647\u0630\u0627 \u0627\u0644\u0639\u0642\u062F (${assets.length})</h2>
  ${assets.length ? `<div class="tablewrap"><table><thead><tr><th>\u0627\u0644\u0631\u0642\u0645</th><th>\u0627\u0644\u0627\u0633\u0645</th><th>\u0627\u0644\u0645\u0648\u0642\u0639</th><th>\u0627\u0644\u062A\u0643\u0644\u0641\u0629</th></tr></thead>
    <tbody>${assets.map((a) => `<tr><td><a href="/assets/${encodeURIComponent(a.tag)}">${esc(a.tag)}</a></td><td>${esc(a.name)}</td><td>${esc(a.siteCode)}</td><td>${money(a.acquisitionCost)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F.</p>`}
</div>

<div class="panel"><h2 style="margin-top:0">\u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A \u0627\u0644\u0645\u063A\u0637\u0627\u0629 (${tickets.length})</h2>${ticketTable(tickets)}</div>
<div class="panel"><h2 style="margin-top:0">\u0641\u0648\u0627\u062A\u064A\u0631 \u0647\u0630\u0627 \u0627\u0644\u0639\u0642\u062F (${invoices.length})</h2>${invoiceTable(invoices, new Map(supplier ? [
      [
        supplier.id,
        supplier.name
      ]
    ] : []))}</div>`
  });
}
__name(contractDetailPage, "contractDetailPage");
function budgetPage(user, lines, canWrite) {
  return page({
    title: "\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629",
    user,
    active: "/budget",
    body: `
<h1>\u0628\u0646\u0648\u062F \u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629</h1>
<div class="panel">
${lines.length ? `<div class="tablewrap"><table>
  <thead><tr><th>\u0627\u0644\u0628\u0646\u062F</th><th>\u0627\u0644\u0627\u0633\u0645</th><th>\u0627\u0644\u0633\u0646\u0629</th><th>\u0627\u0644\u0645\u062E\u0635\u0635</th><th>\u0627\u0644\u0645\u062D\u062C\u0648\u0632</th><th>\u0627\u0644\u0645\u0635\u0631\u0648\u0641</th><th>\u0627\u0644\u0645\u062A\u0627\u062D</th></tr></thead>
  <tbody>${lines.map((l) => `<tr>
    <td>${esc(l.id)}</td><td>${esc(l.name)}</td><td>${l.fiscalYear}</td>
    <td>${money(l.allocated)}</td><td>${money(l.committed)}</td><td>${money(l.spent)}</td>
    <td><strong class="${l.available <= 0 ? "pill bad" : "pill ok"}">${money(l.available)}</strong></td>
  </tr>`).join("")}</tbody></table></div>` : `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0646\u0648\u062F.</p>`}
</div>
${canWrite ? `<div class="panel">
  <h2 style="margin-top:0">\u0625\u0636\u0627\u0641\u0629 \u0628\u0646\u062F</h2>
  <form method="post" action="/budget/new" class="stack">
    <div class="row">
      <div><label>\u0631\u0645\u0632 \u0627\u0644\u0628\u0646\u062F *</label><input name="id" required placeholder="BL-2026-XXXX"></div>
      <div><label>\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629</label><input type="number" name="fiscalYear" value="${(/* @__PURE__ */ new Date()).getFullYear()}"></div>
    </div>
    <div><label>\u0627\u0644\u0627\u0633\u0645 *</label><input name="name" required></div>
    <div><label>\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062E\u0635\u0635</label><input type="number" step="any" name="allocated" value="0"></div>
    <div><button type="submit">\u062D\u0641\u0638</button></div>
  </form>
</div>` : ""}`
  });
}
__name(budgetPage, "budgetPage");
function auditTable(entries) {
  if (!entries.length) return `<p class="empty">\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0627\u062A.</p>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>\u0627\u0644\u0648\u0642\u062A</th><th>\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645</th><th>\u0627\u0644\u0625\u062C\u0631\u0627\u0621</th><th>\u0627\u0644\u0643\u064A\u0627\u0646</th><th>\u0627\u0644\u062A\u0641\u0635\u064A\u0644</th></tr></thead>
  <tbody>${entries.map((e) => `<tr><td>${dt(e.at)}</td><td>${esc(e.actor)}</td><td>${esc(e.action)}</td><td>${esc(e.entity)} / ${esc(e.entityId)}</td><td>${esc(e.detail)}</td></tr>`).join("")}</tbody></table></div>`;
}
__name(auditTable, "auditTable");
function auditPage(user, entries) {
  return page({
    title: "\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642",
    user,
    active: "/audit",
    body: `<h1>\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0642\u064A\u0642 <span class="muted">(\u0622\u062E\u0631 ${entries.length} \u062D\u0631\u0643\u0629)</span></h1>
<div class="panel">${auditTable(entries)}</div>`
  });
}
__name(auditPage, "auditPage");
function errorPage(user, message, status) {
  return page({
    title: `\u062E\u0637\u0623 ${status}`,
    user,
    body: `<div class="panel"><h1>\u062D\u062F\u062B \u062E\u0637\u0623 (${status})</h1><p class="msg err">${esc(message)}</p>
    <p><a class="btn ghost" href="/">\u0627\u0644\u0639\u0648\u062F\u0629 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062A</a></p></div>`
  });
}
__name(errorPage, "errorPage");

// src/http/ui.ts
function flash(url) {
  const ok = url.searchParams.get("ok");
  const err = url.searchParams.get("err");
  if (ok) return {
    kind: "ok",
    text: ok
  };
  if (err) return {
    kind: "err",
    text: err
  };
  return null;
}
__name(flash, "flash");
function back(path, err) {
  const msg = err instanceof Error ? err.message : String(err);
  const sep = path.includes("?") ? "&" : "?";
  return redirect(`${path}${sep}err=${encodeURIComponent(msg)}`);
}
__name(back, "back");
function withFlash(body, url) {
  const f = flash(url);
  if (!f) return body;
  return body.replace("<main>", `<main><div class="msg ${f.kind}">${escapeHtml(f.text)}</div>`);
}
__name(withFlash, "withFlash");
function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
__name(escapeHtml, "escapeHtml");
async function handleUi(req, url, repo, user) {
  const path = url.pathname;
  const seg = path.split("/").filter(Boolean);
  const m = req.method;
  const perms = permissionsOf(user.roles);
  try {
    if (path === "/" && m === "GET") {
      await refreshSlaFlags(repo);
      return html(withFlash(dashboardPage(user, await kpis(repo)), url));
    }
    if (path === "/assets" && m === "GET") {
      const filter = {
        q: url.searchParams.get("q") ?? "",
        typeCode: url.searchParams.get("typeCode") ?? "",
        siteCode: url.searchParams.get("siteCode") ?? "",
        status: url.searchParams.get("status") ?? ""
      };
      const [assets, types, sites] = await Promise.all([
        listAssets(repo, filter),
        repo.assetTypes.list(),
        repo.sites.list()
      ]);
      types.sort((a, b) => a.sortOrder - b.sortOrder);
      sites.sort((a, b) => a.code.localeCompare(b.code));
      return html(withFlash(assetsPage(user, assets, types, sites, filter, perms.has("asset:write")), url));
    }
    if (path === "/assets/new" && m === "GET") {
      const types = (await repo.assetTypes.list()).sort((a, b) => a.sortOrder - b.sortOrder);
      const sites = (await repo.sites.list()).sort((a, b) => a.code.localeCompare(b.code));
      const code = url.searchParams.get("typeCode");
      const selected = code ? types.find((t) => t.code === code) : void 0;
      return html(withFlash(newAssetPage(user, types, sites, selected), url));
    }
    if (path === "/assets/new" && m === "POST") {
      const b = await readBody(req);
      const attributes = {};
      for (const [k, v] of Object.entries(b)) {
        if (k.startsWith("attr_") && v !== "") attributes[k.slice(5)] = v;
      }
      try {
        const asset = await createAsset(repo, user, {
          typeCode: String(b.typeCode ?? ""),
          name: String(b.name ?? ""),
          siteCode: String(b.siteCode ?? ""),
          manufacturer: String(b.manufacturer ?? ""),
          modelName: String(b.modelName ?? ""),
          serialNumber: String(b.serialNumber ?? ""),
          department: String(b.department ?? ""),
          custodian: String(b.custodian ?? ""),
          acquisitionCost: asNumber(b.acquisitionCost),
          acquisitionDate: b.acquisitionDate ? String(b.acquisitionDate) : void 0,
          warrantyEnd: b.warrantyEnd ? String(b.warrantyEnd) : void 0,
          notes: String(b.notes ?? ""),
          attributes
        });
        return redirect(`/assets/${encodeURIComponent(asset.tag)}?ok=${encodeURIComponent("\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0623\u0635\u0644")}`);
      } catch (err) {
        return back(`/assets/new?typeCode=${encodeURIComponent(String(b.typeCode ?? ""))}`, err);
      }
    }
    if (seg[0] === "a" && seg.length === 2 && m === "GET") {
      return redirect(`/assets/${encodeURIComponent(decodeURIComponent(seg[1]))}`);
    }
    if (seg[0] === "assets" && seg.length === 2 && m === "GET") {
      const tag = decodeURIComponent(seg[1]);
      const asset = await getAsset(repo, tag);
      const type = await getAssetType(repo, asset.typeCode);
      const site = await repo.sites.get(asset.siteCode);
      return html(withFlash(assetDetailPage(user, asset, type, site, depreciation(asset, type), await totalCostOfOwnership(repo, tag), await listTickets(repo, {
        assetTag: tag
      }), qrPayload(url.origin, tag), perms.has("ticket:create")), url));
    }
    if (path === "/tickets" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin") ? user.supplierId : void 0;
      const tickets = await listTickets(repo, {
        supplierId: scope
      });
      return html(withFlash(ticketsPage(user, tickets, perms.has("ticket:create")), url));
    }
    if (path === "/tickets/new" && m === "POST") {
      const b = await readBody(req);
      try {
        const t = await createTicket(repo, user, {
          assetTag: String(b.assetTag ?? ""),
          description: String(b.description ?? ""),
          priority: b.priority || void 0,
          requestingDept: b.requestingDept ? String(b.requestingDept) : void 0
        });
        return redirect(`/tickets/${encodeURIComponent(t.ref)}?ok=${encodeURIComponent("\u062A\u0645 \u0641\u062A\u062D \u0627\u0644\u0628\u0644\u0627\u063A")}`);
      } catch (err) {
        return back(`/assets/${encodeURIComponent(String(b.assetTag ?? ""))}`, err);
      }
    }
    if (seg[0] === "tickets" && seg.length === 2 && m === "GET") {
      const t = await getTicket(repo, decodeURIComponent(seg[1]));
      const contract = t.contractId ? await repo.contracts.get(t.contractId) : null;
      return html(withFlash(ticketDetailPage(user, t, await repo.assets.get(t.assetTag), contract, contract ? await repo.suppliers.get(contract.supplierId) : null, t.workOrderRef ? await repo.workOrders.get(t.workOrderRef) : null, await trail(repo, "ticket", t.ref), perms), url));
    }
    if (seg[0] === "tickets" && seg.length === 3 && seg[2] === "close" && m === "POST") {
      const ref = decodeURIComponent(seg[1]);
      try {
        await setTicketStatus(repo, user, ref, "\u0645\u063A\u0644\u0642");
        return redirect(`/tickets/${encodeURIComponent(ref)}?ok=${encodeURIComponent("\u062A\u0645 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0628\u0644\u0627\u063A")}`);
      } catch (err) {
        return back(`/tickets/${encodeURIComponent(ref)}`, err);
      }
    }
    if (path === "/work-orders" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin") ? user.supplierId : void 0;
      return html(withFlash(workOrdersPage(user, await listWorkOrders(repo, {
        supplierId: scope
      })), url));
    }
    if (path === "/work-orders/new" && m === "POST") {
      const b = await readBody(req);
      const ticketRef = String(b.ticketRef ?? "");
      try {
        await openWorkOrder(repo, user, {
          ticketRef,
          workType: b.workType || void 0,
          technician: b.technician ? String(b.technician) : void 0
        });
        return redirect(`/tickets/${encodeURIComponent(ticketRef)}?ok=${encodeURIComponent("\u062A\u0645 \u0641\u062A\u062D \u0623\u0645\u0631 \u0627\u0644\u0639\u0645\u0644")}`);
      } catch (err) {
        return back(`/tickets/${encodeURIComponent(ticketRef)}`, err);
      }
    }
    if (seg[0] === "work-orders" && seg.length === 3 && seg[2] === "complete" && m === "POST") {
      const ref = decodeURIComponent(seg[1]);
      const b = await readBody(req);
      try {
        const wo = await completeWorkOrder(repo, user, ref, {
          outcome: String(b.outcome ?? ""),
          partsUsed: String(b.partsUsed ?? ""),
          laborHours: asNumber(b.laborHours),
          billableAmount: asNumber(b.billableAmount)
        });
        return redirect(`/tickets/${encodeURIComponent(wo.ticketRef)}?ok=${encodeURIComponent("\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0625\u0646\u062C\u0627\u0632 \u0627\u0644\u0641\u0646\u064A")}`);
      } catch (err) {
        const wo = await repo.workOrders.get(ref);
        return back(`/tickets/${encodeURIComponent(wo?.ticketRef ?? "")}`, err);
      }
    }
    if (seg[0] === "work-orders" && seg.length === 2 && m === "GET") {
      const wo = await getWorkOrder(repo, decodeURIComponent(seg[1]));
      return html(withFlash(workOrderDetailPage(user, wo, perms), url));
    }
    if (path === "/invoices" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin") ? user.supplierId : void 0;
      const [invoices, billable, suppliers, inbox2] = await Promise.all([
        listInvoices(repo, {
          supplierId: scope
        }),
        billableWorkOrders(repo, scope),
        listSuppliers(repo),
        inbox(repo, user)
      ]);
      return html(withFlash(invoicesPage(user, invoices, billable, suppliers, inbox2, perms), url));
    }
    if (path === "/invoices/new" && m === "POST") {
      const b = await readBody(req);
      try {
        const inv = await draftFromWorkOrders(repo, user, {
          supplierId: String(b.supplierId ?? ""),
          workOrderRefs: asArray(b.workOrderRefs),
          supplierInvoiceNo: String(b.supplierInvoiceNo ?? "")
        });
        return redirect(`/invoices/${encodeURIComponent(inv.ref)}?ok=${encodeURIComponent("\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u0648\u062F\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")}`);
      } catch (err) {
        return back("/invoices", err);
      }
    }
    if (path === "/invoices/auto" && m === "POST") {
      try {
        const made = await autoInvoice(repo, user);
        return redirect(`/invoices?ok=${encodeURIComponent(`\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 ${made.length} \u0641\u0627\u062A\u0648\u0631\u0629 \u0622\u0644\u064A\u0627\u064B`)}`);
      } catch (err) {
        return back("/invoices", err);
      }
    }
    if (seg[0] === "invoices" && seg.length === 3 && m === "POST") {
      const ref = decodeURIComponent(seg[1]);
      const dest = `/invoices/${encodeURIComponent(ref)}`;
      try {
        if (seg[2] === "submit") {
          await submitForApproval(repo, user, ref);
          return redirect(`${dest}?ok=${encodeURIComponent("\u062A\u0645 \u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0644\u0644\u0627\u0639\u062A\u0645\u0627\u062F")}`);
        }
        if (seg[2] === "act") {
          const b = await readBody(req);
          const decision = b.decision === "reject" ? "\u0645\u0631\u0641\u0648\u0636" : "\u0645\u0639\u062A\u0645\u062F";
          await act(repo, user, ref, decision, String(b.note ?? ""));
          return redirect(`${dest}?ok=${encodeURIComponent(`\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0642\u0631\u0627\u0631\u0643: ${decision}`)}`);
        }
        if (seg[2] === "pay") {
          const b = await readBody(req);
          const { payment } = await pay(repo, user, ref, {
            method: b.method,
            bankReference: String(b.bankReference ?? "")
          });
          return redirect(`${dest}?ok=${encodeURIComponent(`\u062A\u0645 \u0627\u0644\u0635\u0631\u0641 \u0628\u0627\u0644\u0633\u0646\u062F ${payment.ref}`)}`);
        }
      } catch (err) {
        return back(dest, err);
      }
    }
    if (seg[0] === "invoices" && seg.length === 2 && m === "GET") {
      const ref = decodeURIComponent(seg[1]);
      const inv = await getInvoice(repo, ref);
      return html(withFlash(invoiceDetailPage(user, inv, await repo.suppliers.get(inv.supplierId), await chainOf(repo, ref), await threeWayMatch(repo, ref), await Promise.all(inv.workOrderRefs.map((r) => repo.workOrders.get(r))), inv.paymentRef ? await repo.payments.get(inv.paymentRef) : null, await repo.budgetLines.get(inv.budgetLineId), await trail(repo, "invoice", ref), perms, await currentStep(repo, ref)), url));
    }
    if (path === "/contracts" && m === "GET") {
      const scope = user.roles.includes("supplier") && !user.roles.includes("admin") ? user.supplierId : void 0;
      const all = await listContracts(repo);
      const [suppliers, types, lines] = await Promise.all([
        listSuppliers(repo),
        repo.assetTypes.list(),
        listBudgetLines(repo)
      ]);
      types.sort((a, b) => a.sortOrder - b.sortOrder);
      return html(withFlash(contractsPage(user, scope ? all.filter((c) => c.supplierId === scope) : all, suppliers, types, lines, perms.has("contract:write")), url));
    }
    if (path === "/suppliers/new" && m === "POST") {
      const b = await readBody(req);
      try {
        await createSupplier(repo, user, {
          name: String(b.name ?? ""),
          commercialReg: String(b.commercialReg ?? ""),
          contactName: String(b.contactName ?? ""),
          email: String(b.email ?? ""),
          phone: String(b.phone ?? "")
        });
        return redirect(`/contracts?ok=${encodeURIComponent("\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0648\u0631\u062F")}`);
      } catch (err) {
        return back("/contracts", err);
      }
    }
    if (path === "/contracts/new" && m === "POST") {
      const b = await readBody(req);
      try {
        const c = await createContract(repo, user, {
          title: String(b.title ?? ""),
          supplierId: String(b.supplierId ?? ""),
          startDate: String(b.startDate ?? ""),
          expiryDate: String(b.expiryDate ?? ""),
          coveredTypes: asArray(b.coveredTypes),
          value: asNumber(b.value),
          billingBasis: b.billingBasis,
          responseHours: asNumber(b.responseHours, 24),
          penaltyRatePerDay: asNumber(b.penaltyRatePerDay),
          budgetLineId: String(b.budgetLineId ?? "")
        });
        return redirect(`/contracts/${encodeURIComponent(c.id)}?ok=${encodeURIComponent("\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0639\u0642\u062F")}`);
      } catch (err) {
        return back("/contracts", err);
      }
    }
    if (seg[0] === "contracts" && seg.length === 3 && seg[2] === "status" && m === "POST") {
      const id = decodeURIComponent(seg[1]);
      const b = await readBody(req);
      try {
        await setContractStatus(repo, user, id, b.status);
        return redirect(`/contracts/${encodeURIComponent(id)}?ok=${encodeURIComponent("\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062D\u0627\u0644\u0629")}`);
      } catch (err) {
        return back(`/contracts/${encodeURIComponent(id)}`, err);
      }
    }
    if (seg[0] === "contracts" && seg.length === 3 && seg[2] === "receive" && m === "POST") {
      const id = decodeURIComponent(seg[1]);
      const b = await readBody(req);
      try {
        await receiveFromContract(repo, user, id, [
          {
            typeCode: String(b.typeCode ?? ""),
            name: String(b.name ?? ""),
            siteCode: String(b.siteCode ?? ""),
            serialNumber: String(b.serialNumber ?? ""),
            cost: asNumber(b.cost)
          }
        ]);
        return redirect(`/contracts/${encodeURIComponent(id)}?ok=${encodeURIComponent("\u062A\u0645 \u062A\u0631\u062D\u064A\u0644 \u0627\u0644\u062A\u0648\u0631\u064A\u062F \u0625\u0644\u0649 \u0633\u062C\u0644 \u0627\u0644\u0623\u0635\u0648\u0644")}`);
      } catch (err) {
        return back(`/contracts/${encodeURIComponent(id)}`, err);
      }
    }
    if (seg[0] === "contracts" && seg.length === 2 && m === "GET") {
      const id = decodeURIComponent(seg[1]);
      const c = await getContract(repo, id);
      const [allAssets, allTickets, allInvoices, types, sites] = await Promise.all([
        repo.assets.list(),
        repo.tickets.list(),
        repo.invoices.list(),
        repo.assetTypes.list(),
        repo.sites.list()
      ]);
      types.sort((a, b) => a.sortOrder - b.sortOrder);
      sites.sort((a, b) => a.code.localeCompare(b.code));
      return html(withFlash(contractDetailPage(user, c, await repo.suppliers.get(c.supplierId), allAssets.filter((a) => a.sourceContractId === id), allTickets.filter((t) => t.contractId === id), allInvoices.filter((i) => i.contractId === id), types, sites, perms.has("contract:write")), url));
    }
    if (path === "/budget" && m === "GET") {
      const lines = await listBudgetLines(repo);
      return html(withFlash(budgetPage(user, lines.map((l) => ({
        ...l,
        available: available(l)
      })), perms.has("budget:write")), url));
    }
    if (path === "/budget/new" && m === "POST") {
      const b = await readBody(req);
      try {
        await createBudgetLine(repo, user, {
          id: String(b.id ?? ""),
          name: String(b.name ?? ""),
          fiscalYear: asNumber(b.fiscalYear, (/* @__PURE__ */ new Date()).getFullYear()),
          allocated: asNumber(b.allocated)
        });
        return redirect(`/budget?ok=${encodeURIComponent("\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0628\u0646\u062F")}`);
      } catch (err) {
        return back("/budget", err);
      }
    }
    if (path === "/audit" && m === "GET") {
      return html(withFlash(auditPage(user, await recent(repo, 200)), url));
    }
    return html(errorPage(user, `\u0627\u0644\u0635\u0641\u062D\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629: ${path}`, 404), 404);
  } catch (err) {
    const status = statusOf(err);
    const message = err instanceof Error ? err.message : String(err);
    if (status === 500) console.error(err);
    return html(errorPage(user, message, status), status);
  }
}
__name(handleUi, "handleUi");

// src/seed.ts
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(now, "now");
function stamp6() {
  return {
    createdAt: now(),
    createdBy: "seed",
    updatedAt: now(),
    updatedBy: "seed"
  };
}
__name(stamp6, "stamp");
var ASSET_TYPES = [
  {
    code: "COP",
    name: "\u0622\u0644\u0629 \u062A\u0635\u0648\u064A\u0631",
    nature: "\u062C\u0647\u0627\u0632",
    tagPrefix: "COP",
    needsSerial: true,
    needsMeter: true,
    needsContract: true,
    usefulLifeYears: 5,
    maintCycleDays: 90,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u0645\u0643\u0627\u062A\u0628",
    isEnabled: true,
    sortOrder: 1,
    fields: [
      {
        key: "print_type",
        label: "\u0646\u0648\u0639 \u0627\u0644\u0637\u0628\u0627\u0639\u0629",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "\u0623\u0628\u064A\u0636 \u0648\u0623\u0633\u0648\u062F",
          "\u0623\u0644\u0648\u0627\u0646"
        ],
        required: true,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "copy_speed",
        label: "\u0633\u0631\u0639\u0629 \u0627\u0644\u0646\u0633\u062E (\u0635\u0641\u062D\u0629/\u062F\u0642\u064A\u0642\u0629)",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: true,
        sortOrder: 2
      },
      {
        key: "max_paper",
        label: "\u0623\u0642\u0635\u0649 \u062D\u062C\u0645 \u0648\u0631\u0642",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "A4",
          "A3",
          "A2"
        ],
        required: false,
        showInGrid: false,
        sortOrder: 3
      },
      {
        key: "meter_at_install",
        label: "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0639\u062F\u0627\u062F \u0639\u0646\u062F \u0627\u0644\u062A\u0631\u0643\u064A\u0628",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: false,
        sortOrder: 4
      },
      {
        key: "toner_supplier",
        label: "\u0645\u0632\u0648\u0651\u062F \u0627\u0644\u062D\u0628\u0631",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: false,
        sortOrder: 5
      }
    ]
  },
  {
    code: "PRN",
    name: "\u0646\u0638\u0627\u0645 \u0637\u0628\u0627\u0639\u0629",
    nature: "\u062C\u0647\u0627\u0632",
    tagPrefix: "PRN",
    needsSerial: true,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 4,
    maintCycleDays: 180,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u0645\u0643\u0627\u062A\u0628",
    isEnabled: true,
    sortOrder: 2,
    fields: [
      {
        key: "print_speed",
        label: "\u0633\u0631\u0639\u0629 \u0627\u0644\u0637\u0628\u0627\u0639\u0629 (\u0635\u0641\u062D\u0629/\u062F\u0642\u064A\u0642\u0629)",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "duplex",
        label: "\u0637\u0628\u0627\u0639\u0629 \u0639\u0644\u0649 \u0627\u0644\u0648\u062C\u0647\u064A\u0646",
        inputType: "\u0646\u0639\u0645/\u0644\u0627",
        required: false,
        showInGrid: false,
        sortOrder: 2
      },
      {
        key: "networked",
        label: "\u0645\u062A\u0635\u0644 \u0628\u0627\u0644\u0634\u0628\u0643\u0629",
        inputType: "\u0646\u0639\u0645/\u0644\u0627",
        required: false,
        showInGrid: false,
        sortOrder: 3
      },
      {
        key: "ip_address",
        label: "\u0639\u0646\u0648\u0627\u0646 IP",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: false,
        sortOrder: 4
      }
    ]
  },
  {
    code: "PLT",
    name: "\u0622\u0644\u0629 \u0633\u062D\u0628 (\u0628\u0644\u0648\u062A\u0631)",
    nature: "\u062C\u0647\u0627\u0632",
    tagPrefix: "PLT",
    needsSerial: true,
    needsMeter: true,
    needsContract: true,
    usefulLifeYears: 6,
    maintCycleDays: 120,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u0645\u0643\u0627\u062A\u0628",
    isEnabled: true,
    sortOrder: 3,
    fields: [
      {
        key: "max_width",
        label: "\u0623\u0642\u0635\u0649 \u0639\u0631\u0636 \u0648\u0631\u0642",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "tech",
        label: "\u062A\u0642\u0646\u064A\u0629 \u0627\u0644\u0633\u062D\u0628",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "\u0646\u0641\u062B \u0627\u0644\u062D\u0628\u0631",
          "\u062D\u0631\u0627\u0631\u064A",
          "\u0642\u0644\u0645"
        ],
        required: false,
        showInGrid: false,
        sortOrder: 2
      },
      {
        key: "meter_at_install",
        label: "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0639\u062F\u0627\u062F \u0639\u0646\u062F \u0627\u0644\u062A\u0631\u0643\u064A\u0628",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: false,
        sortOrder: 3
      }
    ]
  },
  {
    code: "CAM",
    name: "\u0643\u0627\u0645\u064A\u0631\u0627 \u0623\u0645\u0646\u064A\u0629",
    nature: "\u062C\u0647\u0627\u0632",
    tagPrefix: "CAM",
    needsSerial: true,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 5,
    maintCycleDays: 180,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0623\u0645\u0646\u064A\u0629",
    isEnabled: true,
    sortOrder: 4,
    fields: [
      {
        key: "resolution",
        label: "\u062F\u0642\u0629 \u0627\u0644\u062A\u0635\u0648\u064A\u0631",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "720p",
          "1080p",
          "2K",
          "4K"
        ],
        required: true,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "cam_type",
        label: "\u0646\u0648\u0639 \u0627\u0644\u0643\u0627\u0645\u064A\u0631\u0627",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "\u062B\u0627\u0628\u062A\u0629",
          "\u062F\u0648\u0651\u0627\u0631\u0629 PTZ",
          "\u0642\u0628\u0651\u0629"
        ],
        required: false,
        showInGrid: true,
        sortOrder: 2
      },
      {
        key: "mount_position",
        label: "\u0645\u0648\u0636\u0639 \u0627\u0644\u062A\u0631\u0643\u064A\u0628",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: false,
        sortOrder: 3
      },
      {
        key: "linked_nvr",
        label: "\u0627\u0644\u0645\u0633\u062C\u0651\u0644 \u0627\u0644\u0645\u0631\u062A\u0628\u0637",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: false,
        sortOrder: 4
      },
      {
        key: "ip_address",
        label: "\u0639\u0646\u0648\u0627\u0646 IP",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: false,
        sortOrder: 5
      },
      {
        key: "view_angle",
        label: "\u0632\u0627\u0648\u064A\u0629 \u0627\u0644\u0631\u0624\u064A\u0629",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: false,
        sortOrder: 6
      },
      {
        key: "last_lens_cal",
        label: "\u062A\u0627\u0631\u064A\u062E \u0622\u062E\u0631 \u0636\u0628\u0637 \u0644\u0644\u0639\u062F\u0633\u0629",
        inputType: "\u062A\u0627\u0631\u064A\u062E",
        required: false,
        showInGrid: false,
        sortOrder: 7
      }
    ]
  },
  {
    code: "PBX",
    name: "\u0628\u062F\u0627\u0644\u0629 \u0647\u0627\u062A\u0641\u064A\u0629",
    nature: "\u0646\u0638\u0627\u0645",
    tagPrefix: "PBX",
    needsSerial: true,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 8,
    maintCycleDays: 180,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A",
    isEnabled: true,
    sortOrder: 5,
    fields: [
      {
        key: "system_model",
        label: "\u0637\u0631\u0627\u0632 \u0627\u0644\u0646\u0638\u0627\u0645",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "capacity",
        label: "\u0627\u0644\u0633\u0639\u0629 (\u0639\u062F\u062F \u0627\u0644\u0645\u0646\u0627\u0641\u0630)",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: true,
        sortOrder: 2
      },
      {
        key: "ports_used",
        label: "\u0627\u0644\u0645\u0646\u0627\u0641\u0630 \u0627\u0644\u0645\u0634\u063A\u0648\u0644\u0629",
        inputType: "\u0631\u0642\u0645",
        required: false,
        showInGrid: false,
        sortOrder: 3
      }
    ]
  },
  {
    code: "TEL",
    name: "\u0647\u0627\u062A\u0641 \u0645\u0643\u062A\u0628\u064A",
    nature: "\u062C\u0647\u0627\u0632",
    tagPrefix: "TEL",
    needsSerial: false,
    needsMeter: false,
    needsContract: false,
    usefulLifeYears: 6,
    maintCycleDays: 0,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A",
    isEnabled: true,
    sortOrder: 6,
    fields: [
      {
        key: "phone_type",
        label: "\u0646\u0648\u0639 \u0627\u0644\u0647\u0627\u062A\u0641",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "\u062A\u0646\u0627\u0638\u0631\u064A",
          "\u0631\u0642\u0645\u064A",
          "IP"
        ],
        required: false,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "extension",
        label: "\u0627\u0644\u062A\u062D\u0648\u064A\u0644\u0629",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: true,
        sortOrder: 2
      }
    ]
  },
  {
    code: "DID",
    name: "\u0631\u0642\u0645 \u0645\u0628\u0627\u0634\u0631",
    nature: "\u062E\u062F\u0645\u0629",
    tagPrefix: "DID",
    needsSerial: false,
    needsMeter: false,
    needsContract: false,
    usefulLifeYears: 0,
    maintCycleDays: 0,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A",
    isEnabled: true,
    sortOrder: 7,
    fields: [
      {
        key: "number",
        label: "\u0627\u0644\u0631\u0642\u0645",
        inputType: "\u0646\u0635",
        required: true,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "carrier",
        label: "\u0627\u0644\u0645\u0634\u063A\u0651\u0644",
        inputType: "\u0646\u0635",
        required: false,
        showInGrid: true,
        sortOrder: 2
      }
    ]
  },
  {
    code: "ACC",
    name: "\u062D\u0633\u0627\u0628 \u0627\u062A\u0635\u0627\u0644\u0627\u062A",
    nature: "\u062E\u062F\u0645\u0629",
    tagPrefix: "ACC",
    needsSerial: false,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 0,
    maintCycleDays: 0,
    owningTeam: "\u0641\u0631\u064A\u0642 \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A",
    isEnabled: true,
    sortOrder: 8,
    fields: [
      {
        key: "account_no",
        label: "\u0631\u0642\u0645 \u0627\u0644\u062D\u0633\u0627\u0628",
        inputType: "\u0646\u0635",
        required: true,
        showInGrid: true,
        sortOrder: 1
      },
      {
        key: "service",
        label: "\u0627\u0644\u062E\u062F\u0645\u0629",
        inputType: "\u0642\u0627\u0626\u0645\u0629",
        choices: [
          "\u0625\u0646\u062A\u0631\u0646\u062A",
          "\u0647\u0627\u062A\u0641 \u062B\u0627\u0628\u062A",
          "\u062E\u0637 \u0645\u0624\u062C\u064E\u0651\u0631"
        ],
        required: false,
        showInGrid: true,
        sortOrder: 2
      }
    ]
  }
];
var SITES = [
  {
    code: "HQ-001",
    name: "\u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A (\u0646\u0645\u0648\u0630\u062C)",
    buildingName: "\u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A",
    floorName: "\u0627\u0644\u0623\u0631\u0636\u064A",
    governorate: "\u0627\u0644\u0639\u0627\u0635\u0645\u0629",
    region: "1",
    responsibleDept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629",
    category: "\u0625\u062F\u0627\u0631\u064A",
    isActive: true
  },
  {
    code: "SCH-005",
    name: "\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0627\u0628\u062A\u062F\u0627\u0626\u064A\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 (\u0646\u0645\u0648\u0630\u062C)",
    buildingName: "\u0627\u0644\u0645\u0628\u0646\u0649 \u0623",
    floorName: "\u0627\u0644\u0623\u0648\u0644",
    governorate: "\u0627\u0644\u0645\u062D\u0631\u0642",
    region: "2",
    responsibleDept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629",
    category: "\u0627\u0628\u062A\u062F\u0627\u0626\u064A",
    isActive: true
  },
  {
    code: "SCH-018",
    name: "\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u062B\u0627\u0646\u0648\u064A\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629 (\u0646\u0645\u0648\u0630\u062C)",
    buildingName: "\u0627\u0644\u0645\u0628\u0646\u0649 \u0628",
    floorName: "\u0627\u0644\u062B\u0627\u0646\u064A",
    governorate: "\u0627\u0644\u0634\u0645\u0627\u0644\u064A\u0629",
    region: "3",
    responsibleDept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629",
    category: "\u062B\u0627\u0646\u0648\u064A",
    isActive: true
  },
  {
    code: "SCH-042",
    name: "\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u064A\u0629 \u0627\u0644\u062B\u0627\u0644\u062B\u0629 (\u0646\u0645\u0648\u0630\u062C)",
    buildingName: "\u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A",
    floorName: "\u0627\u0644\u0623\u0631\u0636\u064A",
    governorate: "\u0627\u0644\u062C\u0646\u0648\u0628\u064A\u0629",
    region: "4",
    responsibleDept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629",
    category: "\u0625\u0639\u062F\u0627\u062F\u064A",
    isActive: true
  },
  {
    code: "WH-001",
    name: "\u0645\u0633\u062A\u0648\u062F\u0639 \u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629",
    buildingName: "\u0627\u0644\u0645\u0633\u062A\u0648\u062F\u0639",
    floorName: "\u0627\u0644\u0623\u0631\u0636\u064A",
    governorate: "\u0627\u0644\u0639\u0627\u0635\u0645\u0629",
    region: "1",
    responsibleDept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629",
    category: "\u0645\u0633\u062A\u0648\u062F\u0639",
    isActive: true
  }
];
var DEMO_PASSWORD = "Demo@12345";
var ACCOUNTS = [
  {
    email: config.bootstrapAdminEmail,
    name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645",
    password: config.bootstrapAdminPassword,
    roles: [
      "admin"
    ],
    dept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629"
  },
  {
    email: "engineer@demo.eeg",
    name: "\u0645\u0647\u0646\u062F\u0633 \u0635\u064A\u0627\u0646\u0629",
    password: DEMO_PASSWORD,
    roles: [
      "engineer"
    ],
    dept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629"
  },
  {
    email: "technician@demo.eeg",
    name: "\u0641\u0646\u064A \u0635\u064A\u0627\u0646\u0629",
    password: DEMO_PASSWORD,
    roles: [
      "technician"
    ],
    dept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629"
  },
  {
    email: "storekeeper@demo.eeg",
    name: "\u0623\u0645\u064A\u0646 \u0639\u0647\u062F\u0629",
    password: DEMO_PASSWORD,
    roles: [
      "storekeeper"
    ],
    dept: "\u0627\u0644\u0647\u0646\u062F\u0633\u0629 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629"
  },
  {
    email: "accountant@demo.eeg",
    name: "\u0645\u062D\u0627\u0633\u0628 \u2014 \u0635\u0627\u0646\u0639 \u0627\u0644\u0637\u0644\u0628",
    password: DEMO_PASSWORD,
    roles: [
      "accountant"
    ],
    dept: "\u0627\u0644\u0634\u0624\u0648\u0646 \u0627\u0644\u0645\u0627\u0644\u064A\u0629"
  },
  {
    email: "reviewer@demo.eeg",
    name: "\u0645\u0631\u0627\u062C\u0639 \u0645\u0627\u0644\u064A",
    password: DEMO_PASSWORD,
    roles: [
      "finance_reviewer"
    ],
    dept: "\u0627\u0644\u0634\u0624\u0648\u0646 \u0627\u0644\u0645\u0627\u0644\u064A\u0629"
  },
  {
    email: "approver@demo.eeg",
    name: "\u0645\u0639\u062A\u0645\u062F \u0645\u0627\u0644\u064A",
    password: DEMO_PASSWORD,
    roles: [
      "finance_approver"
    ],
    dept: "\u0627\u0644\u0634\u0624\u0648\u0646 \u0627\u0644\u0645\u0627\u0644\u064A\u0629"
  },
  {
    email: "payer@demo.eeg",
    name: "\u0623\u0645\u064A\u0646 \u0627\u0644\u0635\u0631\u0641",
    password: DEMO_PASSWORD,
    roles: [
      "finance_approver"
    ],
    dept: "\u0627\u0644\u0634\u0624\u0648\u0646 \u0627\u0644\u0645\u0627\u0644\u064A\u0629"
  },
  {
    email: "supplier@demo.eeg",
    name: "\u0645\u0648\u0631\u062F \u062E\u0627\u0631\u062C\u064A",
    password: DEMO_PASSWORD,
    roles: [
      "supplier"
    ],
    dept: "\u062C\u0647\u0629 \u062E\u0627\u0631\u062C\u064A\u0629",
    linkFirstSupplier: true
  },
  {
    email: "requester@demo.eeg",
    name: "\u0637\u0627\u0644\u0628 \u062E\u062F\u0645\u0629",
    password: DEMO_PASSWORD,
    roles: [
      "requester"
    ],
    dept: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062F\u0627\u0631\u0633"
  }
];
async function seed(repo, opts = {}) {
  if (opts.wipe) await repo.wipe();
  const salt = newSalt();
  const admin = {
    id: "USR-0001",
    email: ACCOUNTS[0].email.toLowerCase(),
    displayName: ACCOUNTS[0].name,
    passwordSalt: salt,
    passwordHash: await hashPassword(ACCOUNTS[0].password, salt),
    roles: [
      "admin"
    ],
    department: ACCOUNTS[0].dept,
    isActive: true,
    ...stamp6()
  };
  await repo.users.put(admin.id, admin);
  await repo.nextSequence("USR");
  for (const t of ASSET_TYPES) await repo.assetTypes.put(t.code, {
    ...t,
    ...stamp6()
  });
  for (const s of SITES) await repo.sites.put(s.code, {
    ...s,
    ...stamp6()
  });
  await createBudgetLine(repo, admin, {
    id: "BL-2026-MAINT",
    name: "\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u0645\u0643\u062A\u0628\u064A\u0629 \u0648\u0627\u0644\u0623\u0646\u0638\u0645\u0629",
    fiscalYear: 2026,
    allocated: 25e4
  });
  await createBudgetLine(repo, admin, {
    id: "BL-2026-CAPEX",
    name: "\u062A\u0648\u0631\u064A\u062F \u0623\u062C\u0647\u0632\u0629 \u0648\u0645\u0639\u062F\u0627\u062A",
    fiscalYear: 2026,
    allocated: 5e5
  });
  const supplier = await createSupplier(repo, admin, {
    name: "\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0645\u0643\u0627\u062A\u0628 (\u0645\u0648\u0631\u062F \u0627\u0641\u062A\u0631\u0627\u0636\u064A)",
    commercialReg: "CR-DEMO-0001",
    contactName: "\u0645\u0645\u062B\u0644 \u0627\u0644\u0645\u0648\u0631\u062F",
    email: "supplier@demo.eeg",
    phone: "+973 0000 0001",
    supplyScope: "\u0623\u062C\u0647\u0632\u0629 \u062A\u0635\u0648\u064A\u0631 \u0648\u0637\u0628\u0627\u0639\u0629 \u0648\u0635\u064A\u0627\u0646\u062A\u0647\u0627"
  });
  const supplier2 = await createSupplier(repo, admin, {
    name: "\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0644\u0644\u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0623\u0645\u0646\u064A\u0629 (\u0645\u0648\u0631\u062F \u0627\u0641\u062A\u0631\u0627\u0636\u064A)",
    commercialReg: "CR-DEMO-0002",
    contactName: "\u0645\u0645\u062B\u0644 \u0627\u0644\u0645\u0648\u0631\u062F",
    email: "supplier2@demo.eeg",
    phone: "+973 0000 0002",
    supplyScope: "\u0643\u0627\u0645\u064A\u0631\u0627\u062A \u0645\u0631\u0627\u0642\u0628\u0629 \u0648\u0623\u0646\u0638\u0645\u0629 \u0623\u0645\u0646\u064A\u0629"
  });
  for (const a of ACCOUNTS.slice(1)) {
    await createUser(repo, admin, {
      email: a.email,
      displayName: a.name,
      password: a.password,
      roles: a.roles,
      department: a.dept,
      supplierId: a.linkFirstSupplier ? supplier.id : void 0
    });
  }
  const today = /* @__PURE__ */ new Date();
  const start = new Date(today.getTime() - 60 * 24 * 36e5).toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 300 * 24 * 36e5).toISOString().slice(0, 10);
  const c1 = await createContract(repo, admin, {
    title: "\u0639\u0642\u062F \u0635\u064A\u0627\u0646\u0629 \u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062A\u0635\u0648\u064A\u0631 \u0648\u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0662\u0660\u0662\u0666",
    supplierId: supplier.id,
    coveredTypes: [
      "COP",
      "PRN",
      "PLT"
    ],
    coveredSites: [],
    startDate: start,
    expiryDate: end,
    value: 48e3,
    billingBasis: "\u0644\u0643\u0644 \u0623\u0645\u0631 \u0639\u0645\u0644",
    responseHours: 8,
    penaltyRatePerDay: 0.02,
    budgetLineId: "BL-2026-MAINT"
  });
  await setContractStatus(repo, admin, c1.id, "\u0633\u0627\u0631\u064A");
  const c2 = await createContract(repo, admin, {
    title: "\u0639\u0642\u062F \u0635\u064A\u0627\u0646\u0629 \u0623\u0646\u0638\u0645\u0629 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629 \u0662\u0660\u0662\u0666 (\u062F\u0641\u0639\u0627\u062A \u0631\u0628\u0639\u064A\u0629)",
    supplierId: supplier2.id,
    coveredTypes: [
      "CAM"
    ],
    coveredSites: [],
    startDate: start,
    expiryDate: end,
    value: 36e3,
    billingBasis: "\u062F\u0641\u0639\u0627\u062A \u062F\u0648\u0631\u064A\u0629",
    billingCycle: "\u0631\u0628\u0639\u064A",
    responseHours: 24,
    penaltyRatePerDay: 0.01,
    budgetLineId: "BL-2026-MAINT"
  });
  await setContractStatus(repo, admin, c2.id, "\u0633\u0627\u0631\u064A");
  const created = await receiveFromContract(repo, admin, c1.id, [
    {
      typeCode: "COP",
      name: "\u0622\u0644\u0629 \u062A\u0635\u0648\u064A\u0631 \u2014 \u0625\u062F\u0627\u0631\u0629 \u0634\u0624\u0648\u0646 \u0627\u0644\u0637\u0644\u0628\u0629",
      siteCode: "HQ-001",
      serialNumber: "SN-COP-77120",
      cost: 2400,
      attributes: {
        print_type: "\u0623\u0644\u0648\u0627\u0646",
        copy_speed: 45,
        max_paper: "A3",
        meter_at_install: 0
      }
    },
    {
      typeCode: "COP",
      name: "\u0622\u0644\u0629 \u062A\u0635\u0648\u064A\u0631 \u2014 \u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0623\u0648\u0644\u0649",
      siteCode: "SCH-005",
      serialNumber: "SN-COP-77121",
      cost: 2200,
      attributes: {
        print_type: "\u0623\u0628\u064A\u0636 \u0648\u0623\u0633\u0648\u062F",
        copy_speed: 30,
        max_paper: "A4",
        meter_at_install: 1250
      }
    },
    {
      typeCode: "PRN",
      name: "\u0637\u0627\u0628\u0639\u0629 \u0634\u0628\u0643\u064A\u0629 \u2014 \u063A\u0631\u0641\u0629 \u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646",
      siteCode: "SCH-018",
      serialNumber: "SN-PRN-31004",
      cost: 850,
      attributes: {
        print_speed: 28,
        duplex: true,
        networked: true,
        ip_address: "10.20.18.41"
      }
    }
  ]);
  await createAsset(repo, admin, {
    typeCode: "CAM",
    name: "\u0643\u0627\u0645\u064A\u0631\u0627 \u0645\u062F\u062E\u0644 \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A",
    siteCode: "HQ-001",
    serialNumber: "SN-CAM-90211",
    acquisitionCost: 320,
    sourceContractId: c2.id,
    attributes: {
      resolution: "1080p",
      cam_type: "\u0642\u0628\u0651\u0629",
      mount_position: "\u0627\u0644\u0645\u062F\u062E\u0644 \u0627\u0644\u0634\u0645\u0627\u0644\u064A"
    }
  });
  await createAsset(repo, admin, {
    typeCode: "PBX",
    name: "\u0628\u062F\u0627\u0644\u0629 \u0627\u0644\u0645\u0628\u0646\u0649 \u0627\u0644\u0631\u0626\u064A\u0633\u064A",
    siteCode: "HQ-001",
    serialNumber: "SN-PBX-10001",
    acquisitionCost: 9800,
    attributes: {
      system_model: "OmniPCX",
      capacity: 240,
      ports_used: 187
    }
  });
  const result = {
    users: ACCOUNTS.length,
    sites: SITES.length,
    assetTypes: ASSET_TYPES.length,
    suppliers: 2,
    contracts: 2,
    assets: created.length + 2,
    budgetLines: 2,
    tickets: 0,
    workOrders: 0,
    invoices: 0
  };
  if (opts.withActivity) {
    Object.assign(result, await seedActivity(repo));
  }
  return result;
}
__name(seed, "seed");
async function seedActivity(repo) {
  const by = /* @__PURE__ */ __name(async (email) => {
    const u = await repo.users.byEmail(email);
    if (!u) throw new Error(`\u062D\u0633\u0627\u0628 \u0627\u0644\u0628\u0630\u0631 \u0645\u0641\u0642\u0648\u062F: ${email}`);
    return u;
  }, "by");
  const engineer = await by("engineer@demo.eeg");
  const accountant = await by("accountant@demo.eeg");
  const reviewer = await by("reviewer@demo.eeg");
  const approver = await by("approver@demo.eeg");
  const payer = await by("payer@demo.eeg");
  const all = await repo.assets.list();
  const cop = all.filter((a) => a.typeCode === "COP").sort((a, b) => a.tag.localeCompare(b.tag));
  const prn = all.find((a) => a.typeCode === "PRN");
  const cam = all.find((a) => a.typeCode === "CAM");
  await createTicket(repo, engineer, {
    assetTag: cop[0].tag,
    description: "\u062A\u0638\u0647\u0631 \u062E\u0637\u0648\u0637 \u0639\u0645\u0648\u062F\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0645\u0637\u0628\u0648\u0639\u0629\u060C \u0648\u064A\u064F\u0631\u062C\u064E\u0651\u062D \u0627\u062A\u0633\u0627\u062E \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u0635\u0648\u064A\u0631.",
    priority: "\u0645\u062A\u0648\u0633\u0637"
  });
  if (prn) {
    const t2 = await createTicket(repo, engineer, {
      assetTag: prn.tag,
      description: "\u0627\u0644\u0637\u0627\u0628\u0639\u0629 \u0644\u0627 \u062A\u0633\u062A\u062C\u064A\u0628 \u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0639\u0628\u0631 \u0627\u0644\u0634\u0628\u0643\u0629.",
      priority: "\u0645\u0631\u062A\u0641\u0639"
    });
    const w2 = await openWorkOrder(repo, engineer, {
      ticketRef: t2.ref
    });
    await completeWorkOrder(repo, engineer, w2.ref, {
      outcome: "\u0623\u064F\u0639\u064A\u062F \u0636\u0628\u0637 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0628\u0643\u0629 \u0648\u062D\u064F\u062F\u0650\u0651\u062B \u0628\u0631\u0646\u0627\u0645\u062C \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u060C \u0648\u0627\u062E\u062A\u064F\u0628\u0631\u062A \u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0628\u0646\u062C\u0627\u062D.",
      partsUsed: "\u0644\u0627 \u064A\u0648\u062C\u062F",
      laborHours: 1.5,
      billableAmount: 45
    });
    await setTicketStatus(repo, engineer, t2.ref, "\u0645\u063A\u0644\u0642");
  }
  const t3 = await createTicket(repo, engineer, {
    assetTag: cop[1]?.tag ?? cop[0].tag,
    description: "\u0627\u0644\u062C\u0647\u0627\u0632 \u064A\u0633\u062D\u0628 \u0623\u0643\u062B\u0631 \u0645\u0646 \u0648\u0631\u0642\u0629 \u0641\u064A \u0627\u0644\u0645\u0631\u0629 \u0627\u0644\u0648\u0627\u062D\u062F\u0629 \u0648\u064A\u062A\u0648\u0642\u0641.",
    priority: "\u0639\u0627\u062C\u0644"
  });
  const w3 = await openWorkOrder(repo, engineer, {
    ticketRef: t3.ref
  });
  await completeWorkOrder(repo, engineer, w3.ref, {
    outcome: "\u0627\u0633\u062A\u064F\u0628\u062F\u0644\u062A \u0628\u0643\u0631\u0629 \u0627\u0644\u0633\u062D\u0628 \u0648\u0648\u0633\u0627\u062F\u0629 \u0627\u0644\u0641\u0635\u0644\u060C \u0648\u0623\u064F\u062C\u0631\u064A \u0627\u062E\u062A\u0628\u0627\u0631 \u0633\u062D\u0628 \u0644\u0640 \u0665\u0660\u0660 \u0648\u0631\u0642\u0629 \u062F\u0648\u0646 \u062A\u0643\u0631\u0627\u0631 \u0627\u0644\u0639\u0637\u0644.",
    partsUsed: "\u0628\u0643\u0631\u0629 \u0633\u062D\u0628 \xD7 \u0661\u060C \u0648\u0633\u0627\u062F\u0629 \u0641\u0635\u0644 \xD7 \u0661",
    laborHours: 2,
    billableAmount: 135
  });
  await setTicketStatus(repo, engineer, t3.ref, "\u0645\u063A\u0644\u0642");
  const inv = await draftFromWorkOrders(repo, accountant, {
    supplierId: w3.supplierId,
    workOrderRefs: [
      w3.ref
    ],
    supplierInvoiceNo: "DEMO-INV-001"
  });
  await submitForApproval(repo, accountant, inv.ref);
  await act(repo, reviewer, inv.ref, "\u0645\u0639\u062A\u0645\u062F", "\u0631\u0648\u062C\u0639\u062A \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0648\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0631\u0641\u0642\u0629.");
  await act(repo, approver, inv.ref, "\u0645\u0639\u062A\u0645\u062F", "\u0645\u0639\u062A\u0645\u062F\u0629 \u0644\u0644\u0635\u0631\u0641 \u0636\u0645\u0646 \u0627\u0644\u0645\u062E\u0635\u0635.");
  await pay(repo, payer, inv.ref, {
    method: "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A",
    bankReference: "DEMO-TRF-0001"
  });
  if (cam) {
    await createTicket(repo, engineer, {
      assetTag: cam.tag,
      description: "\u0627\u0644\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0648\u0627\u0636\u062D\u0629 \u0644\u064A\u0644\u0627\u064B \u0648\u064A\u0644\u0632\u0645 \u0636\u0628\u0637 \u0627\u0644\u0625\u0636\u0627\u0621\u0629 \u062A\u062D\u062A \u0627\u0644\u062D\u0645\u0631\u0627\u0621.",
      priority: "\u0645\u0646\u062E\u0641\u0636"
    });
  }
  const t = await repo.tickets.list();
  const w = await repo.workOrders.list();
  const i = await repo.invoices.list();
  return {
    tickets: t.length,
    workOrders: w.length,
    invoices: i.length
  };
}
__name(seedActivity, "seedActivity");
if (false) {
  const repo = await openRepo2();
  setRepo(repo);
  const result = await seed(repo, {
    wipe: true,
    withActivity: true
  });
  console.log("\u062A\u0645 \u0628\u0630\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A:", result);
  console.log("\n\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0639\u0631\u0636 (\u0627\u0644\u0627\u0633\u0645 = \u0627\u0644\u062F\u0648\u0631\u060C \u0644\u0627 \u0627\u0633\u0645 \u0634\u062E\u0635):");
  for (const a of ACCOUNTS) {
    console.log(`  ${a.email.padEnd(24)} ${a.password.padEnd(14)} ${a.roles.join(",")}`);
  }
  await repo.close();
}

// src/main.ts
var SECURE = ![
  "localhost",
  "127.0.0.1"
].includes(Deno.env.get("HOST") ?? "") && Deno.env.get("INSECURE_COOKIES") !== "true";
function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'"
  };
}
__name(securityHeaders, "securityHeaders");
function withSecurity(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(securityHeaders())) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}
__name(withSecurity, "withSecurity");
function sameOrigin(req, url) {
  if ([
    "GET",
    "HEAD",
    "OPTIONS"
  ].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (origin) return origin === url.origin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return (req.headers.get("content-type") ?? "").includes("application/json");
}
__name(sameOrigin, "sameOrigin");
async function handler(req, repo) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/healthz") {
    return json({
      ok: true,
      driver: repo.driver,
      time: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  if (!sameOrigin(req, url)) {
    return json({
      error: "\u0637\u0644\u0628 \u0645\u0631\u0641\u0648\u0636: \u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642 (CSRF)"
    }, 403);
  }
  if (path === "/api/seed" && req.method === "POST") {
    if (!config.allowSeedEndpoint) return json({
      error: "\u0627\u0644\u0628\u0630\u0631 \u0645\u0639\u0637\u0651\u0644"
    }, 403);
    const users = await repo.users.list({
      limit: 1
    });
    const body = await readBody(req).catch(() => ({}));
    if (users.length && body.force !== true && body.force !== "true") {
      return json({
        error: "\u0627\u0644\u0646\u0638\u0627\u0645 \u0645\u0628\u0630\u0648\u0631 \u0645\u0633\u0628\u0642\u0627\u064B. \u0623\u0631\u0633\u0644 force=true \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0628\u0646\u0627\u0621."
      }, 409);
    }
    return json(await seed(repo, {
      wipe: true,
      withActivity: true
    }));
  }
  if (path === "/login") {
    if (req.method === "GET") {
      const existing = await readSession(repo, req);
      if (existing) return redirect("/");
      return html(loginPage(url.searchParams.get("err") ?? void 0, url.searchParams.get("ok") ?? void 0));
    }
    if (req.method === "POST") {
      const b = await readBody(req);
      try {
        const user2 = await authenticate(repo, String(b.email ?? ""), String(b.password ?? ""));
        const token = await createSession(repo, user2);
        return redirect("/", {
          "set-cookie": sessionCookie(token, SECURE)
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return html(loginPage(msg), 401);
      }
    }
  }
  if (path === "/logout" && req.method === "POST") {
    await destroySession(repo, req);
    return redirect("/login", {
      "set-cookie": clearCookie(SECURE)
    });
  }
  if (path === "/auth/entra/start" && req.method === "GET") {
    if (!entraEnabled()) return html(loginPage("\u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0645\u0648\u062D\u0651\u062F \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644"), 400);
    const { verifier, challenge } = await makePkce();
    const state = crypto.randomUUID();
    const cookie = `entra_pkce=${encodeURIComponent(`${state}|${verifier}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${SECURE ? "; Secure" : ""}`;
    return redirect(authorizeUrl(state, challenge), {
      "set-cookie": cookie
    });
  }
  if (path === "/auth/entra/callback" && req.method === "GET") {
    if (!entraEnabled()) return html(loginPage("\u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0645\u0648\u062D\u0651\u062F \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644"), 400);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const raw = getCookie(req, "entra_pkce");
    if (!code || !state || !raw) return html(loginPage("\u0637\u0644\u0628 \u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644"), 400);
    const [savedState, verifier] = raw.split("|");
    if (savedState !== state) return html(loginPage("\u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0637\u0627\u0628\u0642\u0629"), 400);
    try {
      const claims = await exchangeCode(code, verifier);
      const user2 = await resolveUser(repo, claims);
      const token = await createSession(repo, user2);
      return redirect("/", {
        "set-cookie": sessionCookie(token, SECURE)
      });
    } catch (err) {
      return html(loginPage(err instanceof Error ? err.message : String(err)), 401);
    }
  }
  const user = await readSession(repo, req);
  if (!user) {
    if (path.startsWith("/api/")) return json({
      error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u0651\u062D \u2014 \u064A\u0644\u0632\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644"
    }, 401);
    return redirect("/login");
  }
  if (path.startsWith("/api/")) return await handleApi(req, url, repo, user);
  return await handleUi(req, url, repo, user);
}
__name(handler, "handler");
if (import.meta.main) {
  const repo = await getRepo();
  if ((await repo.users.list({
    limit: 1
  })).length === 0) {
    const r = await seed(repo, {
      withActivity: true
    });
    console.log("\u0642\u0627\u0639\u062F\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0641\u0627\u0631\u063A\u0629 \u2014 \u062A\u0645 \u0627\u0644\u0628\u0630\u0631 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A:", r);
  }
  Deno.serve({
    port: config.port
  }, async (req) => {
    try {
      return withSecurity(await handler(req, repo));
    } catch (err) {
      console.error(err);
      return withSecurity(json({
        error: "\u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645"
      }, 500));
    }
  });
}
export {
  handler
};
