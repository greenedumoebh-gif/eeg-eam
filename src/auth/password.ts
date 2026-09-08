/**
 * تجزئة كلمات المرور — PBKDF2-SHA256 عبر WebCrypto القياسي.
 * لا تبعيات خارجية، ويعمل بلا تغيير على Deno Deploy.
 */

const ITERATIONS = 210_000; // توصية OWASP لـ PBKDF2-SHA256
const KEY_LEN = 32;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromB64(saltB64) as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_LEN * 8,
  );
  return toB64(bits);
}

/** مقارنة بزمن ثابت لمنع هجمات التوقيت */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  saltB64: string,
  expectedHash: string,
): Promise<boolean> {
  if (!saltB64 || !expectedHash) return false;
  const actual = await hashPassword(password, saltB64);
  return timingSafeEqual(actual, expectedHash);
}

/** سياسة كلمة المرور الدنيا */
export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "كلمة المرور يجب ألا تقل عن ١٠ محارف";
  if (!/[A-Za-z]/.test(pw)) return "كلمة المرور يجب أن تحتوي حرفاً واحداً على الأقل";
  if (!/[0-9]/.test(pw)) return "كلمة المرور يجب أن تحتوي رقماً واحداً على الأقل";
  return null;
}
