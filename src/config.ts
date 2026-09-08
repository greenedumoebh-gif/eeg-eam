/** إعدادات التطبيق — كلها من متغيرات البيئة، بقيم افتراضية صالحة للتشغيل الفوري. */

function env(key: string, fallback = ""): string {
  return Deno.env.get(key) ?? fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = Deno.env.get(key);
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const config = {
  /** kv | postgres */
  dbDriver: env("DB_DRIVER", "kv") as "kv" | "postgres",
  databaseUrl: env("DATABASE_URL"),
  /** مسار ملف Deno KV محلياً؛ فارغ = الافتراضي (وعلى Deno Deploy: KV المُدار) */
  kvPath: env("KV_PATH") || undefined,

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
  demoNotice: env(
    "DEMO_NOTICE",
    "نسخة تجريبية لعرض الفكرة — جميع البيانات المعروضة افتراضية ولا تمثّل بيانات فعلية للوزارة",
  ),

  /** اسم الجهة — يظهر في الواجهة والتقارير */
  orgName: env("ORG_NAME", "وزارة التربية والتعليم — مجموعة الهندسة الإلكترونية"),
  currency: env("CURRENCY", "د.ب"),
} as const;

export type Config = typeof config;
