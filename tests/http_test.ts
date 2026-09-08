/** اختبارات طبقة HTTP: الجلسات، الصلاحيات، الـ API، والواجهة. */
import { assert, assertEquals, fixture } from "./helpers.ts";
import { handler } from "../src/main.ts";
import type { Repo } from "../src/data/repo.ts";

const BASE = "http://localhost:8000";

function req(path: string, init: RequestInit = {}): Request {
  return new Request(BASE + path, {
    ...init,
    headers: { origin: BASE, ...(init.headers ?? {}) },
  });
}

async function login(repo: Repo, email: string, password: string): Promise<string> {
  const res = await handler(
    req("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password }),
    }),
    repo,
  );
  assertEquals(res.status, 303, "الدخول الصحيح يجب أن يعيد توجيهاً");
  const setCookie = res.headers.get("set-cookie");
  assert(setCookie, "يجب أن تُصدر كوكي جلسة");
  return setCookie!.split(";")[0];
}

function withCookie(path: string, cookie: string, init: RequestInit = {}): Request {
  return req(path, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
}

Deno.test("HTTP: فحص الصحة متاح بلا جلسة", async () => {
  const f = await fixture();
  try {
    const res = await handler(req("/healthz"), f.repo);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.driver, "kv");
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: الصفحات محمية والـ API يعيد 401", async () => {
  const f = await fixture();
  try {
    const page = await handler(req("/"), f.repo);
    assertEquals(page.status, 303);
    assertEquals(page.headers.get("location"), "/login");

    const api = await handler(req("/api/assets"), f.repo);
    assertEquals(api.status, 401);
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: كلمة مرور خاطئة تُرفض", async () => {
  const f = await fixture();
  try {
    const res = await handler(
      req("/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "admin@demo.eeg", password: "wrong" }),
      }),
      f.repo,
    );
    assertEquals(res.status, 401);
    assert((await res.text()).includes("غير صحيحة"));
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: دورة دخول كاملة وعرض لوحة المؤشرات", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.repo, "admin@demo.eeg", "Admin@12345");

    const dash = await handler(withCookie("/", cookie), f.repo);
    assertEquals(dash.status, 200);
    const body = await dash.text();
    assert(body.includes('dir="rtl"'), "الواجهة يجب أن تكون RTL");
    assert(body.includes("لوحة المؤشرات"));
    assert(body.includes("مدير النظام"));

    const me = await handler(withCookie("/api/me", cookie), f.repo);
    const meBody = await me.json();
    assertEquals(meBody.user.email, "admin@demo.eeg");
    assert(meBody.permissions.includes("payment:execute"));

    const out = await handler(withCookie("/logout", cookie, { method: "POST" }), f.repo);
    assertEquals(out.status, 303);
    const after = await handler(withCookie("/", cookie), f.repo);
    assertEquals(after.status, 303, "الجلسة يجب أن تنتهي بعد الخروج");
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: الصلاحيات مطبَّقة على الـ API", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.repo, "requester@demo.eeg", "Demo@12345");

    // طالب الخدمة يرى الأصول
    const assets = await handler(withCookie("/api/assets", cookie), f.repo);
    assertEquals(assets.status, 200);
    assert((await assets.json()).length > 0);

    // ولا يستطيع إنشاء مورد
    const create = await handler(
      withCookie("/api/suppliers", cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "مورد غير مصرّح" }),
      }),
      f.repo,
    );
    assertEquals(create.status, 403);

    // ولا تظهر له تبويبة الفواتير
    const home = await handler(withCookie("/", cookie), f.repo);
    const html = await home.text();
    assert(!html.includes('href="/invoices"'), "طالب الخدمة لا يرى تبويبة الفواتير");
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: السلسلة كاملة عبر الـ API", async () => {
  const f = await fixture();
  try {
    const eng = await login(f.repo, "engineer@demo.eeg", "Demo@12345");
    const acc = await login(f.repo, "accountant@demo.eeg", "Demo@12345");
    const rev = await login(f.repo, "reviewer@demo.eeg", "Demo@12345");
    const app = await login(f.repo, "approver@demo.eeg", "Demo@12345");
    const pay = await login(f.repo, "payer@demo.eeg", "Demo@12345");

    const post = async (cookie: string, path: string, body: unknown) => {
      const res = await handler(
        withCookie(path, cookie, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        f.repo,
      );
      const json = await res.json();
      assert(res.status < 400, `${path} → ${res.status}: ${JSON.stringify(json)}`);
      return json;
    };

    const asset = (await f.repo.assets.list()).find((a) => a.typeCode === "COP")!;
    const ticket = await post(eng, "/api/tickets", {
      assetTag: asset.tag,
      description: "لا يطبع",
      priority: "عاجل",
    });
    const wo = await post(eng, "/api/work-orders", { ticketRef: ticket.ref });
    await post(eng, `/api/work-orders/${wo.ref}/complete`, {
      outcome: "تنظيف رأس الطباعة",
      laborHours: 1,
      billableAmount: 75,
    });
    await post(eng, `/api/tickets/${ticket.ref}/status`, { status: "مغلق" });

    const invoice = await post(acc, "/api/invoices", {
      supplierId: wo.supplierId,
      workOrderRefs: [wo.ref],
    });
    assertEquals(invoice.amount, 75);

    const match = await (await handler(
      withCookie(`/api/invoices/${invoice.ref}/match`, acc),
      f.repo,
    )).json();
    assertEquals(match.matched, true);

    await post(acc, `/api/invoices/${invoice.ref}/submit`, {});
    await post(rev, `/api/invoices/${invoice.ref}/approve`, { note: "مراجَعة" });
    await post(app, `/api/invoices/${invoice.ref}/approve`, { note: "معتمدة" });
    const paid = await post(pay, `/api/invoices/${invoice.ref}/pay`, { bankReference: "REF-1" });
    assertEquals(paid.invoice.status, "مصروفة");

    // المؤشرات تعكس النتيجة
    const kpis = await (await handler(withCookie("/api/kpis", app), f.repo)).json();
    assert(kpis.finance.paidValue > 0);
    assertEquals(kpis.finance.approvedUnpaid, 0);
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: حماية CSRF ترفض الطلبات من أصل مختلف", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.repo, "admin@demo.eeg", "Admin@12345");
    const res = await handler(
      new Request(BASE + "/api/suppliers", {
        method: "POST",
        headers: {
          cookie,
          origin: "https://evil.example",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ name: "مخترق" }),
      }),
      f.repo,
    );
    assertEquals(res.status, 403);
    assert((await res.json()).error.includes("CSRF"));
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: نموذج الأصل يعرض حقول النوع ديناميكياً", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.repo, "admin@demo.eeg", "Admin@12345");
    const res = await handler(withCookie("/assets/new?typeCode=CAM", cookie), f.repo);
    const html = await res.text();
    assert(html.includes("دقة التصوير"), "يجب أن يظهر حقل خاص بالكاميرات");
    assert(html.includes("attr_resolution"));
    assert(!html.includes("سرعة النسخ"), "لا يجب أن تظهر حقول آلة التصوير");
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: رابط ملصق QR المختصر يعيد التوجيه لصفحة الأصل", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.repo, "admin@demo.eeg", "Admin@12345");
    const asset = (await f.repo.assets.list())[0];
    const res = await handler(withCookie(`/a/${encodeURIComponent(asset.tag)}`, cookie), f.repo);
    assertEquals(res.status, 303);
    assertEquals(res.headers.get("location"), `/assets/${encodeURIComponent(asset.tag)}`);
  } finally {
    await f.close();
  }
});

Deno.test("HTTP: شريط العرض التجريبي ظاهر في كل الصفحات", async () => {
  const f = await fixture();
  try {
    // صفحة الدخول قبل المصادقة
    const loginPage = await handler(req("/login"), f.repo);
    const loginHtml = await loginPage.text();
    assert(loginHtml.includes("عرض تجريبي"), "شريط العرض يجب أن يظهر في صفحة الدخول");
    assert(loginHtml.includes("لا تمثّل بيانات فعلية"));

    // وبعد الدخول
    const cookie = await login(f.repo, "admin@demo.eeg", "Admin@12345");
    const dash = await handler(withCookie("/", cookie), f.repo);
    assert((await dash.text()).includes("عرض تجريبي"), "وفي لوحة المؤشرات");
  } finally {
    await f.close();
  }
});
