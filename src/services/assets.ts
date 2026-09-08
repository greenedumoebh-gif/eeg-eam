/** خدمات الأصول الثابتة — بما فيها الحقول الديناميكية والإهلاك ورمز QR. */
import type { Repo } from "../data/repo.ts";
import type { Asset, AssetStatus, AssetType, Site, TypeField, User } from "../domain/types.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { require_ } from "../domain/rbac.ts";
import { nextAssetTag } from "../domain/ids.ts";
import { log } from "./audit.ts";

function stamp(actor: string) {
  const now = new Date().toISOString();
  return { createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor };
}

export async function getAssetType(repo: Repo, code: string): Promise<AssetType> {
  const t = await repo.assetTypes.get(code);
  if (!t) throw new NotFoundError("نوع الأصل", code);
  return t;
}

export async function getSite(repo: Repo, code: string): Promise<Site> {
  const s = await repo.sites.get(code);
  if (!s) throw new NotFoundError("الموقع", code);
  return s;
}

export async function getAsset(repo: Repo, tag: string): Promise<Asset> {
  const a = await repo.assets.get(tag);
  if (!a) throw new NotFoundError("الأصل", tag);
  return a;
}

/** يتحقق من قيم الحقول الديناميكية مقابل تعريف النوع */
export function validateAttributes(
  fields: TypeField[],
  attrs: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = attrs[f.key];
    const empty = v === undefined || v === null || v === "";
    if (f.required && empty) {
      errors[f.key] = `${f.label} مطلوب`;
      continue;
    }
    if (empty) continue;
    switch (f.inputType) {
      case "رقم":
        if (typeof v !== "number" && isNaN(Number(v))) {
          errors[f.key] = `${f.label} يجب أن يكون رقماً`;
        }
        break;
      case "تاريخ":
        if (isNaN(Date.parse(String(v)))) errors[f.key] = `${f.label} يجب أن يكون تاريخاً صالحاً`;
        break;
      case "قائمة":
        if (f.choices && !f.choices.includes(String(v))) {
          errors[f.key] = `${f.label} يجب أن يكون أحد: ${f.choices.join("، ")}`;
        }
        break;
      case "نعم/لا":
        if (typeof v !== "boolean" && !["true", "false"].includes(String(v))) {
          errors[f.key] = `${f.label} يجب أن يكون نعم أو لا`;
        }
        break;
    }
  }
  return errors;
}

/** يحوّل القيم الواردة نصياً إلى أنواعها الصحيحة حسب تعريف الحقل */
export function coerceAttributes(
  fields: TypeField[],
  attrs: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const f of fields) {
    const v = attrs[f.key];
    if (v === undefined || v === null || v === "") continue;
    switch (f.inputType) {
      case "رقم":
        out[f.key] = Number(v);
        break;
      case "نعم/لا":
        out[f.key] = v === true || v === "true";
        break;
      default:
        out[f.key] = String(v);
    }
  }
  return out;
}

export async function createAsset(
  repo: Repo,
  actor: User,
  input: Omit<Partial<Asset>, "attributes"> & {
    typeCode: string;
    name: string;
    siteCode: string;
    attributes?: Record<string, unknown>;
  },
): Promise<Asset> {
  require_(actor, "asset:write");
  const type = await getAssetType(repo, input.typeCode);
  if (!type.isEnabled) throw new ConflictError(`نوع الأصل ${type.name} غير مفعّل`);
  await getSite(repo, input.siteCode);

  const errors: Record<string, string> = {};
  if (!input.name?.trim()) errors.name = "اسم الأصل مطلوب";
  if (type.needsSerial && !input.serialNumber?.trim()) {
    errors.serialNumber = "الرقم التسلسلي مطلوب لهذا النوع";
  }
  Object.assign(errors, validateAttributes(type.fields, input.attributes ?? {}));
  if (Object.keys(errors).length) throw new ValidationError(errors);

  if (input.serialNumber) {
    const dup = (await repo.assets.list()).find((a) =>
      a.serialNumber && a.serialNumber === input.serialNumber
    );
    if (dup) throw new ConflictError(`الرقم التسلسلي مسجّل مسبقاً على الأصل ${dup.tag}`);
  }

  const tag = input.tag ?? await nextAssetTag(repo, type.tagPrefix);
  const asset: Asset = {
    tag,
    typeCode: type.code,
    name: input.name.trim(),
    manufacturer: input.manufacturer ?? "",
    modelName: input.modelName ?? "",
    serialNumber: input.serialNumber ?? "",
    siteCode: input.siteCode,
    department: input.department ?? "",
    custodian: input.custodian ?? "",
    acquisitionDate: input.acquisitionDate ?? new Date().toISOString().slice(0, 10),
    acquisitionCost: input.acquisitionCost ?? 0,
    acquisitionSource: input.acquisitionSource ?? "شراء",
    warrantyEnd: input.warrantyEnd,
    status: input.status ?? "في الخدمة",
    sourceContractId: input.sourceContractId,
    attributes: coerceAttributes(type.fields, input.attributes ?? {}),
    notes: input.notes ?? "",
    ...stamp(actor.id),
  };
  await repo.assets.put(tag, asset);
  await log(repo, actor.id, "تسجيل أصل", "asset", tag, `${asset.name} @ ${asset.siteCode}`);
  return asset;
}

/**
 * ترحيل بنود عقد توريد إلى سجلات أصول — الربط الآلي:
 * «المناقصات والعقود ← الأصول الثابتة».
 */
export async function receiveFromContract(
  repo: Repo,
  actor: User,
  contractId: string,
  items: {
    typeCode: string;
    name: string;
    siteCode: string;
    serialNumber?: string;
    cost?: number;
    attributes?: Record<string, unknown>;
  }[],
): Promise<Asset[]> {
  require_(actor, "asset:write");
  const contract = await repo.contracts.get(contractId);
  if (!contract) throw new NotFoundError("العقد", contractId);
  const created: Asset[] = [];
  for (const it of items) {
    created.push(
      await createAsset(repo, actor, {
        typeCode: it.typeCode,
        name: it.name,
        siteCode: it.siteCode,
        serialNumber: it.serialNumber,
        attributes: it.attributes,
        acquisitionCost: it.cost ?? 0,
        acquisitionSource: "شراء",
        sourceContractId: contractId,
      }),
    );
  }
  await log(
    repo,
    actor.id,
    "ترحيل توريدات العقد إلى أصول",
    "contract",
    contractId,
    `${created.length} أصل`,
  );
  return created;
}

export async function setAssetStatus(
  repo: Repo,
  actor: User,
  tag: string,
  status: AssetStatus,
): Promise<Asset> {
  require_(actor, "asset:write");
  const a = await getAsset(repo, tag);
  const updated = { ...a, status, updatedAt: new Date().toISOString(), updatedBy: actor.id };
  await repo.assets.put(tag, updated);
  await log(repo, actor.id, `تغيير حالة الأصل إلى ${status}`, "asset", tag);
  return updated;
}

// ───────────────────────── الإهلاك والقيمة الدفترية ─────────────────────────

export interface Depreciation {
  method: "قسط ثابت";
  cost: number;
  usefulLifeYears: number;
  annualDepreciation: number;
  elapsedYears: number;
  accumulated: number;
  bookValue: number;
}

/** إهلاك بالقسط الثابت حتى تاريخ محدد */
export function depreciation(asset: Asset, type: AssetType, at = new Date()): Depreciation {
  const cost = asset.acquisitionCost ?? 0;
  const life = type.usefulLifeYears || 0;
  if (life <= 0 || cost <= 0) {
    return {
      method: "قسط ثابت",
      cost,
      usefulLifeYears: life,
      annualDepreciation: 0,
      elapsedYears: 0,
      accumulated: 0,
      bookValue: cost,
    };
  }
  const start = new Date(asset.acquisitionDate);
  const years = Math.max(0, (at.getTime() - start.getTime()) / (365.25 * 24 * 3600_000));
  const annual = cost / life;
  const accumulated = Math.min(cost, annual * years);
  return {
    method: "قسط ثابت",
    cost,
    usefulLifeYears: life,
    annualDepreciation: round2(annual),
    elapsedYears: round2(years),
    accumulated: round2(accumulated),
    bookValue: round2(cost - accumulated),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * التكلفة الإجمالية للتملّك (TCO) لأصل = ثمن الاقتناء + كل ما صُرف على صيانته.
 * هذا ما يجعل فتح البلاغات على «رقم الأصل» ذا قيمة.
 */
export async function totalCostOfOwnership(repo: Repo, tag: string): Promise<{
  acquisition: number;
  maintenance: number;
  total: number;
  workOrders: number;
}> {
  const asset = await getAsset(repo, tag);
  const wos = (await repo.workOrders.list()).filter((w) =>
    w.assetTag === tag && w.status !== "ملغى"
  );
  const maintenance = wos.reduce((s, w) => s + (w.billableAmount ?? 0), 0);
  return {
    acquisition: round2(asset.acquisitionCost ?? 0),
    maintenance: round2(maintenance),
    total: round2((asset.acquisitionCost ?? 0) + maintenance),
    workOrders: wos.length,
  };
}

/** حمولة رمز QR المطبوع على ملصق الأصل */
export function qrPayload(baseUrl: string, tag: string): string {
  return `${baseUrl.replace(/\/$/, "")}/a/${encodeURIComponent(tag)}`;
}

export async function listAssets(
  repo: Repo,
  filter?: { typeCode?: string; siteCode?: string; status?: string; q?: string },
): Promise<Asset[]> {
  let items = await repo.assets.list();
  if (filter?.typeCode) items = items.filter((a) => a.typeCode === filter.typeCode);
  if (filter?.siteCode) items = items.filter((a) => a.siteCode === filter.siteCode);
  if (filter?.status) items = items.filter((a) => a.status === filter.status);
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    items = items.filter((a) =>
      a.tag.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.serialNumber.toLowerCase().includes(q)
    );
  }
  return items.sort((a, b) => a.tag.localeCompare(b.tag));
}
