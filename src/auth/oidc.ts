/**
 * محوّل الدخول الموحّد عبر Microsoft Entra ID (OIDC Authorization Code + PKCE).
 *
 * ⚠️ معطّل افتراضياً. يُفعَّل بمتغيّر بيئة واحد: ENTRA_ENABLED=true
 * ولا يحتاج أي تعديل في بقية النظام — المستخدم يُطابَق بالبريد الإلكتروني
 * مع سجل مستخدم موجود، وتُستخدم أدواره المخزّنة كما هي.
 *
 * الإعداد المطلوب في Entra ID (App registration):
 *   Redirect URI (Web): https://<your-app>/auth/entra/callback
 *   API permissions: openid, profile, email  (delegated)
 *   Client secret: يُوضع في ENTRA_CLIENT_SECRET
 */
import { config } from "../config.ts";
import type { Repo } from "../data/repo.ts";
import type { User } from "../domain/types.ts";

export function entraEnabled(): boolean {
  return config.entraEnabled &&
    Boolean(config.entraTenantId && config.entraClientId && config.entraClientSecret);
}

function authority(): string {
  return `https://login.microsoftonline.com/${config.entraTenantId}/oauth2/v2.0`;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export async function makePkce(): Promise<PkcePair> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export function authorizeUrl(state: string, challenge: string): string {
  const p = new URLSearchParams({
    client_id: config.entraClientId,
    response_type: "code",
    redirect_uri: config.entraRedirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${authority()}/authorize?${p}`;
}

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

export interface EntraClaims {
  email: string;
  name: string;
  oid: string;
}

/** فك ترميز حمولة JWT دون تحقق — التحقق يتم بأن الرمز جاء من نقطة token مباشرة عبر TLS */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("رمز هوية غير صالح");
  const pad = part.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function exchangeCode(code: string, verifier: string): Promise<EntraClaims> {
  const body = new URLSearchParams({
    client_id: config.entraClientId,
    client_secret: config.entraClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.entraRedirectUri,
    code_verifier: verifier,
    scope: "openid profile email",
  });
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json() as TokenResponse;
  if (!res.ok || !data.id_token) {
    throw new Error(data.error_description ?? "فشل تبادل رمز الدخول مع Entra ID");
  }
  const claims = decodeJwtPayload(data.id_token);
  const email = String(claims.preferred_username ?? claims.email ?? "").toLowerCase();
  if (!email) throw new Error("لم يرجع Entra ID بريداً إلكترونياً");
  return {
    email,
    name: String(claims.name ?? email),
    oid: String(claims.oid ?? claims.sub ?? ""),
  };
}

/**
 * يطابق هوية Entra مع مستخدم موجود بالبريد الإلكتروني.
 * سياسة أمنية مقصودة: لا يُنشأ مستخدم جديد تلقائياً — الأدوار تُمنح يدوياً أولاً.
 */
export async function resolveUser(repo: Repo, claims: EntraClaims): Promise<User> {
  const user = await repo.users.byEmail(claims.email);
  if (!user) {
    throw new Error(
      `الحساب ${claims.email} غير مسجّل في النظام. يرجى مراجعة مدير النظام لمنح الصلاحيات.`,
    );
  }
  if (!user.isActive) throw new Error("الحساب موقوف");
  if (user.externalId !== claims.oid) {
    await repo.users.put(user.id, {
      ...user,
      externalId: claims.oid,
      updatedAt: new Date().toISOString(),
      updatedBy: "entra",
    });
  }
  return user;
}
