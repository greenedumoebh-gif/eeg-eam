/** أدوات الاستجابة المشتركة. */
import { statusOf } from "../domain/errors.ts";

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

export function redirect(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, { status: 303, headers: { location, ...headers } });
}

export function errorJson(err: unknown): Response {
  const status = statusOf(err);
  const message = err instanceof Error ? err.message : String(err);
  const body: Record<string, unknown> = { error: message };
  if (err && typeof err === "object" && "fields" in err) {
    body.fields = (err as { fields: unknown }).fields;
  }
  if (status === 500) console.error(err);
  return json(body, status);
}

/** يقرأ جسم الطلب سواء JSON أو نموذج HTML */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return await req.json() as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  const form = await req.formData();
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    const val = typeof v === "string" ? v : v.name;
    if (k in out) {
      const prev = out[k];
      out[k] = Array.isArray(prev) ? [...prev, val] : [prev, val];
    } else {
      out[k] = val;
    }
  }
  return out;
}

/** يحوّل قيمة نموذج إلى مصفوفة دائماً */
export function asArray(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

export function asNumber(v: unknown, fallback = 0): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}
