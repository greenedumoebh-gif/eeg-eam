/** أدوات اختبار مشتركة — بلا تبعيات خارجية (JSR غير مطلوب). */
import { KvRepo } from "../src/data/kv.ts";
import type { Repo } from "../src/data/repo.ts";
import type { User } from "../src/domain/types.ts";
import { seed } from "../src/seed.ts";

export function assert(cond: unknown, msg = "فشل التحقق"): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg ?? `توقعت ${b} فحصلت على ${a}`);
}

export function assertAlmost(actual: number, expected: number, eps = 0.005): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`توقعت ${expected} ± ${eps} فحصلت على ${actual}`);
  }
}

export async function assertThrows(
  fn: () => Promise<unknown>,
  contains?: string,
): Promise<Error> {
  try {
    await fn();
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (contains && !e.message.includes(contains)) {
      throw new Error(`توقعت خطأ يحتوي «${contains}» فحصلت على «${e.message}»`);
    }
    return e;
  }
  throw new Error("توقعت خطأً ولم يقع");
}

export interface Fixture {
  repo: Repo;
  admin: User;
  engineer: User;
  technician: User;
  accountant: User;
  reviewer: User;
  approver: User;
  payer: User;
  requester: User;
  supplier: User;
  storekeeper: User;
  close(): Promise<void>;
}

/** قاعدة بيانات في الذاكرة لكل اختبار — معزولة تماماً */
export async function fixture(): Promise<Fixture> {
  const repo = await KvRepo.open(":memory:");
  await seed(repo, { wipe: true });
  const by = async (email: string) => {
    const u = await repo.users.byEmail(email);
    if (!u) throw new Error(`مستخدم البذر مفقود: ${email}`);
    return u;
  };
  return {
    repo,
    admin: await by("admin@demo.eeg"),
    engineer: await by("engineer@demo.eeg"),
    technician: await by("technician@demo.eeg"),
    accountant: await by("accountant@demo.eeg"),
    reviewer: await by("reviewer@demo.eeg"),
    approver: await by("approver@demo.eeg"),
    payer: await by("payer@demo.eeg"),
    requester: await by("requester@demo.eeg"),
    supplier: await by("supplier@demo.eeg"),
    storekeeper: await by("storekeeper@demo.eeg"),
    close: () => repo.close(),
  };
}
