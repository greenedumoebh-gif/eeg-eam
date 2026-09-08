/**
 * نقطة الدخول — خادم HTTP واحد يخدم:
 *   /api/*   واجهة برمجية REST
 *   /*       واجهة رسومية عربية RTL
 *
 * يعمل كما هو على Deno Deploy وعلى أي خادم داخل الوزارة.
 */
import { config } from "./config.ts";
import { getRepo } from "./data/index.ts";
import type { Repo } from "./data/repo.ts";
import {
  clearCookie,
  createSession,
  destroySession,
  getCookie,
  readSession,
  sessionCookie,
} from "./auth/session.ts";
import { authorizeUrl, entraEnabled, exchangeCode, makePkce, resolveUser } from "./auth/oidc.ts";
import { authenticate } from "./services/users.ts";
import { handleApi } from "./http/api.ts";
import { handleUi } from "./http/ui.ts";
import { loginPage } from "./http/views/pages.ts";
import { html, json, readBody, redirect } from "./http/respond.ts";
import { seed } from "./seed.ts";

const SECURE = !["localhost", "127.0.0.1"].includes(Deno.env.get("HOST") ?? "") &&
  Deno.env.get("INSECURE_COOKIES") !== "true";

function securityHeaders(): HeadersInit {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "content-security-policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'",
  };
}

function withSecurity(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(securityHeaders())) headers.set(k, v as string);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** حماية CSRF بسيطة: أي طلب مُغيِّر للحالة يجب أن يأتي من نفس الأصل. */
function sameOrigin(req: Request, url: URL): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
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
  // طلبات API بلا متصفح (curl / تكامل خارجي) تُقبل عبر content-type: application/json
  return (req.headers.get("content-type") ?? "").includes("application/json");
}

export async function handler(req: Request, repo: Repo): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/healthz") {
    return json({ ok: true, driver: repo.driver, time: new Date().toISOString() });
  }

  if (!sameOrigin(req, url)) {
    return json({ error: "طلب مرفوض: مصدر غير مطابق (CSRF)" }, 403);
  }

  // ── البذر (للتجربة فقط) ──
  if (path === "/api/seed" && req.method === "POST") {
    if (!config.allowSeedEndpoint) return json({ error: "البذر معطّل" }, 403);
    const users = await repo.users.list({ limit: 1 });
    const body: Record<string, unknown> = await readBody(req).catch(() => ({}));
    if (users.length && body.force !== true && body.force !== "true") {
      return json({ error: "النظام مبذور مسبقاً. أرسل force=true لإعادة البناء." }, 409);
    }
    return json(await seed(repo, { wipe: true, withActivity: true }));
  }

  // ── الدخول المحلي ──
  if (path === "/login") {
    if (req.method === "GET") {
      const existing = await readSession(repo, req);
      if (existing) return redirect("/");
      return html(
        loginPage(
          url.searchParams.get("err") ?? undefined,
          url.searchParams.get("ok") ?? undefined,
        ),
      );
    }
    if (req.method === "POST") {
      const b = await readBody(req);
      try {
        const user = await authenticate(repo, String(b.email ?? ""), String(b.password ?? ""));
        const token = await createSession(repo, user);
        return redirect("/", { "set-cookie": sessionCookie(token, SECURE) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return html(loginPage(msg), 401);
      }
    }
  }

  if (path === "/logout" && req.method === "POST") {
    await destroySession(repo, req);
    return redirect("/login", { "set-cookie": clearCookie(SECURE) });
  }

  // ── الدخول الموحّد عبر Entra ID (معطّل افتراضياً) ──
  if (path === "/auth/entra/start" && req.method === "GET") {
    if (!entraEnabled()) return html(loginPage("الدخول الموحّد غير مفعّل"), 400);
    const { verifier, challenge } = await makePkce();
    const state = crypto.randomUUID();
    const cookie = `entra_pkce=${
      encodeURIComponent(`${state}|${verifier}`)
    }; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${SECURE ? "; Secure" : ""}`;
    return redirect(authorizeUrl(state, challenge), { "set-cookie": cookie });
  }

  if (path === "/auth/entra/callback" && req.method === "GET") {
    if (!entraEnabled()) return html(loginPage("الدخول الموحّد غير مفعّل"), 400);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const raw = getCookie(req, "entra_pkce");
    if (!code || !state || !raw) return html(loginPage("طلب دخول غير مكتمل"), 400);
    const [savedState, verifier] = raw.split("|");
    if (savedState !== state) return html(loginPage("حالة الطلب غير مطابقة"), 400);
    try {
      const claims = await exchangeCode(code, verifier);
      const user = await resolveUser(repo, claims);
      const token = await createSession(repo, user);
      return redirect("/", {
        "set-cookie": sessionCookie(token, SECURE),
      });
    } catch (err) {
      return html(loginPage(err instanceof Error ? err.message : String(err)), 401);
    }
  }

  // ── ما بعد هذه النقطة يتطلب جلسة ──
  const user = await readSession(repo, req);
  if (!user) {
    if (path.startsWith("/api/")) return json({ error: "غير مصرّح — يلزم تسجيل الدخول" }, 401);
    return redirect("/login");
  }

  if (path.startsWith("/api/")) return await handleApi(req, url, repo, user);
  return await handleUi(req, url, repo, user);
}

if (import.meta.main) {
  const repo = await getRepo();

  // بذر تلقائي عند أول تشغيل على قاعدة فارغة — يجعل التجربة فورية
  if ((await repo.users.list({ limit: 1 })).length === 0) {
    const r = await seed(repo, { withActivity: true });
    console.log("قاعدة بيانات فارغة — تم البذر التلقائي:", r);
  }

  Deno.serve({ port: config.port }, async (req) => {
    try {
      return withSecurity(await handler(req, repo));
    } catch (err) {
      console.error(err);
      return withSecurity(json({ error: "خطأ داخلي في الخادم" }, 500));
    }
  });
}
