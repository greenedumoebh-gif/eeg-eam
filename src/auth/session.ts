/** إدارة الجلسات — كوكي HttpOnly موقّع بـ HMAC-SHA256 + سجل جلسة في المستودع. */
import { config } from "../config.ts";
import type { Repo } from "../data/repo.ts";
import type { Session, User } from "../domain/types.ts";

export const COOKIE_NAME = "eeg_session";

async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(value: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(value));
  return `${value}.${b64url(new Uint8Array(sig))}`;
}

async function unsign(signed: string): Promise<string | null> {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = await sign(value);
  if (expected.length !== signed.length) return null;
  let diff = 0;
  for (let k = 0; k < expected.length; k++) diff |= expected.charCodeAt(k) ^ signed.charCodeAt(k);
  return diff === 0 ? value : null;
}

export async function createSession(repo: Repo, user: User): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionHours * 3600_000);
  const session: Session = {
    id,
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  await repo.sessions.put(id, session);
  return await sign(id);
}

export async function readSession(repo: Repo, req: Request): Promise<User | null> {
  const raw = getCookie(req, COOKIE_NAME);
  if (!raw) return null;
  const id = await unsign(raw);
  if (!id) return null;
  const session = await repo.sessions.get(id);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await repo.sessions.delete(id);
    return null;
  }
  const user = await repo.users.get(session.userId);
  if (!user || !user.isActive) return null;
  return user;
}

export async function destroySession(repo: Repo, req: Request): Promise<void> {
  const raw = getCookie(req, COOKIE_NAME);
  if (!raw) return;
  const id = await unsign(raw);
  if (id) await repo.sessions.delete(id);
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(value: string, secure: boolean): string {
  const maxAge = config.sessionHours * 3600;
  const flags = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}

export function clearCookie(secure: boolean): string {
  const flags = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) flags.push("Secure");
  return flags.join("; ");
}
