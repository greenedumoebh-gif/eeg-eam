/**
 * بيانات البذر — تُنشئ نظاماً جاهزاً للتجربة خلال ثوانٍ.
 * أنواع الأصول وحقولها منقولة حرفياً من النظام القائم على SharePoint.
 */
import type { Repo } from "./data/repo.ts";
import { openRepo, setRepo } from "./data/index.ts";
import { config } from "./config.ts";
import type { AssetType, Role, Site, User } from "./domain/types.ts";
import { hashPassword, newSalt } from "./auth/password.ts";
import * as users from "./services/users.ts";
import * as contracts from "./services/contracts.ts";
import * as assets from "./services/assets.ts";
import * as budget from "./services/budget.ts";
import * as tickets from "./services/tickets.ts";
import * as workorders from "./services/workorders.ts";
import * as invoices from "./services/invoices.ts";
import * as approvals from "./services/approvals.ts";

function now() {
  return new Date().toISOString();
}
function stamp() {
  return { createdAt: now(), createdBy: "seed", updatedAt: now(), updatedBy: "seed" };
}

// ───────────────────────── أنواع الأصول ─────────────────────────

export const ASSET_TYPES: Omit<AssetType, keyof ReturnType<typeof stamp>>[] = [
  {
    code: "COP",
    name: "آلة تصوير",
    nature: "جهاز",
    tagPrefix: "COP",
    needsSerial: true,
    needsMeter: true,
    needsContract: true,
    usefulLifeYears: 5,
    maintCycleDays: 90,
    owningTeam: "فريق أجهزة المكاتب",
    isEnabled: true,
    sortOrder: 1,
    fields: [
      {
        key: "print_type",
        label: "نوع الطباعة",
        inputType: "قائمة",
        choices: ["أبيض وأسود", "ألوان"],
        required: true,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "copy_speed",
        label: "سرعة النسخ (صفحة/دقيقة)",
        inputType: "رقم",
        required: false,
        showInGrid: true,
        sortOrder: 2,
      },
      {
        key: "max_paper",
        label: "أقصى حجم ورق",
        inputType: "قائمة",
        choices: ["A4", "A3", "A2"],
        required: false,
        showInGrid: false,
        sortOrder: 3,
      },
      {
        key: "meter_at_install",
        label: "قراءة العداد عند التركيب",
        inputType: "رقم",
        required: false,
        showInGrid: false,
        sortOrder: 4,
      },
      {
        key: "toner_supplier",
        label: "مزوّد الحبر",
        inputType: "نص",
        required: false,
        showInGrid: false,
        sortOrder: 5,
      },
    ],
  },
  {
    code: "PRN",
    name: "نظام طباعة",
    nature: "جهاز",
    tagPrefix: "PRN",
    needsSerial: true,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 4,
    maintCycleDays: 180,
    owningTeam: "فريق أجهزة المكاتب",
    isEnabled: true,
    sortOrder: 2,
    fields: [
      {
        key: "print_speed",
        label: "سرعة الطباعة (صفحة/دقيقة)",
        inputType: "رقم",
        required: false,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "duplex",
        label: "طباعة على الوجهين",
        inputType: "نعم/لا",
        required: false,
        showInGrid: false,
        sortOrder: 2,
      },
      {
        key: "networked",
        label: "متصل بالشبكة",
        inputType: "نعم/لا",
        required: false,
        showInGrid: false,
        sortOrder: 3,
      },
      {
        key: "ip_address",
        label: "عنوان IP",
        inputType: "نص",
        required: false,
        showInGrid: false,
        sortOrder: 4,
      },
    ],
  },
  {
    code: "PLT",
    name: "آلة سحب (بلوتر)",
    nature: "جهاز",
    tagPrefix: "PLT",
    needsSerial: true,
    needsMeter: true,
    needsContract: true,
    usefulLifeYears: 6,
    maintCycleDays: 120,
    owningTeam: "فريق أجهزة المكاتب",
    isEnabled: true,
    sortOrder: 3,
    fields: [
      {
        key: "max_width",
        label: "أقصى عرض ورق",
        inputType: "نص",
        required: false,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "tech",
        label: "تقنية السحب",
        inputType: "قائمة",
        choices: ["نفث الحبر", "حراري", "قلم"],
        required: false,
        showInGrid: false,
        sortOrder: 2,
      },
      {
        key: "meter_at_install",
        label: "قراءة العداد عند التركيب",
        inputType: "رقم",
        required: false,
        showInGrid: false,
        sortOrder: 3,
      },
    ],
  },
  {
    code: "CAM",
    name: "كاميرا أمنية",
    nature: "جهاز",
    tagPrefix: "CAM",
    needsSerial: true,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 5,
    maintCycleDays: 180,
    owningTeam: "فريق الأنظمة الأمنية",
    isEnabled: true,
    sortOrder: 4,
    fields: [
      {
        key: "resolution",
        label: "دقة التصوير",
        inputType: "قائمة",
        choices: ["720p", "1080p", "2K", "4K"],
        required: true,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "cam_type",
        label: "نوع الكاميرا",
        inputType: "قائمة",
        choices: ["ثابتة", "دوّارة PTZ", "قبّة"],
        required: false,
        showInGrid: true,
        sortOrder: 2,
      },
      {
        key: "mount_position",
        label: "موضع التركيب",
        inputType: "نص",
        required: false,
        showInGrid: false,
        sortOrder: 3,
      },
      {
        key: "linked_nvr",
        label: "المسجّل المرتبط",
        inputType: "نص",
        required: false,
        showInGrid: false,
        sortOrder: 4,
      },
      {
        key: "ip_address",
        label: "عنوان IP",
        inputType: "نص",
        required: false,
        showInGrid: false,
        sortOrder: 5,
      },
      {
        key: "view_angle",
        label: "زاوية الرؤية",
        inputType: "رقم",
        required: false,
        showInGrid: false,
        sortOrder: 6,
      },
      {
        key: "last_lens_cal",
        label: "تاريخ آخر ضبط للعدسة",
        inputType: "تاريخ",
        required: false,
        showInGrid: false,
        sortOrder: 7,
      },
    ],
  },
  {
    code: "PBX",
    name: "بدالة هاتفية",
    nature: "نظام",
    tagPrefix: "PBX",
    needsSerial: true,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 8,
    maintCycleDays: 180,
    owningTeam: "فريق الاتصالات",
    isEnabled: true,
    sortOrder: 5,
    fields: [
      {
        key: "system_model",
        label: "طراز النظام",
        inputType: "نص",
        required: false,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "capacity",
        label: "السعة (عدد المنافذ)",
        inputType: "رقم",
        required: false,
        showInGrid: true,
        sortOrder: 2,
      },
      {
        key: "ports_used",
        label: "المنافذ المشغولة",
        inputType: "رقم",
        required: false,
        showInGrid: false,
        sortOrder: 3,
      },
    ],
  },
  {
    code: "TEL",
    name: "هاتف مكتبي",
    nature: "جهاز",
    tagPrefix: "TEL",
    needsSerial: false,
    needsMeter: false,
    needsContract: false,
    usefulLifeYears: 6,
    maintCycleDays: 0,
    owningTeam: "فريق الاتصالات",
    isEnabled: true,
    sortOrder: 6,
    fields: [
      {
        key: "phone_type",
        label: "نوع الهاتف",
        inputType: "قائمة",
        choices: ["تناظري", "رقمي", "IP"],
        required: false,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "extension",
        label: "التحويلة",
        inputType: "نص",
        required: false,
        showInGrid: true,
        sortOrder: 2,
      },
    ],
  },
  {
    code: "DID",
    name: "رقم مباشر",
    nature: "خدمة",
    tagPrefix: "DID",
    needsSerial: false,
    needsMeter: false,
    needsContract: false,
    usefulLifeYears: 0,
    maintCycleDays: 0,
    owningTeam: "فريق الاتصالات",
    isEnabled: true,
    sortOrder: 7,
    fields: [
      {
        key: "number",
        label: "الرقم",
        inputType: "نص",
        required: true,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "carrier",
        label: "المشغّل",
        inputType: "نص",
        required: false,
        showInGrid: true,
        sortOrder: 2,
      },
    ],
  },
  {
    code: "ACC",
    name: "حساب اتصالات",
    nature: "خدمة",
    tagPrefix: "ACC",
    needsSerial: false,
    needsMeter: false,
    needsContract: true,
    usefulLifeYears: 0,
    maintCycleDays: 0,
    owningTeam: "فريق الاتصالات",
    isEnabled: true,
    sortOrder: 8,
    fields: [
      {
        key: "account_no",
        label: "رقم الحساب",
        inputType: "نص",
        required: true,
        showInGrid: true,
        sortOrder: 1,
      },
      {
        key: "service",
        label: "الخدمة",
        inputType: "قائمة",
        choices: ["إنترنت", "هاتف ثابت", "خط مؤجَّر"],
        required: false,
        showInGrid: true,
        sortOrder: 2,
      },
    ],
  },
];

const SITES: Omit<Site, keyof ReturnType<typeof stamp>>[] = [
  {
    code: "HQ-001",
    name: "المبنى الرئيسي (نموذج)",
    buildingName: "المبنى الرئيسي",
    floorName: "الأرضي",
    governorate: "العاصمة",
    region: "1",
    responsibleDept: "الهندسة الإلكترونية",
    category: "إداري",
    isActive: true,
  },
  {
    code: "SCH-005",
    name: "المدرسة الابتدائية الأولى (نموذج)",
    buildingName: "المبنى أ",
    floorName: "الأول",
    governorate: "المحرق",
    region: "2",
    responsibleDept: "الهندسة الإلكترونية",
    category: "ابتدائي",
    isActive: true,
  },
  {
    code: "SCH-018",
    name: "المدرسة الثانوية الثانية (نموذج)",
    buildingName: "المبنى ب",
    floorName: "الثاني",
    governorate: "الشمالية",
    region: "3",
    responsibleDept: "الهندسة الإلكترونية",
    category: "ثانوي",
    isActive: true,
  },
  {
    code: "SCH-042",
    name: "المدرسة الإعدادية الثالثة (نموذج)",
    buildingName: "المبنى الرئيسي",
    floorName: "الأرضي",
    governorate: "الجنوبية",
    region: "4",
    responsibleDept: "الهندسة الإلكترونية",
    category: "إعدادي",
    isActive: true,
  },
  {
    code: "WH-001",
    name: "مستودع الهندسة الإلكترونية",
    buildingName: "المستودع",
    floorName: "الأرضي",
    governorate: "العاصمة",
    region: "1",
    responsibleDept: "الهندسة الإلكترونية",
    category: "مستودع",
    isActive: true,
  },
];

interface SeedAccount {
  email: string;
  /** الاسم المعروض = مسمّى الدور، لا اسم شخص — بيانات العرض افتراضية بالكامل */
  name: string;
  password: string;
  roles: Role[];
  dept: string;
  /** للمورد فقط: يُربط بأول مورد في بيانات البذر */
  linkFirstSupplier?: boolean;
}

/** كلمة مرور موحّدة لحسابات العرض — لتسهيل التنقل بين الأدوار أثناء التجربة */
const DEMO_PASSWORD = "Demo@12345";

export const ACCOUNTS: SeedAccount[] = [
  {
    email: config.bootstrapAdminEmail,
    name: "مدير النظام",
    password: config.bootstrapAdminPassword,
    roles: ["admin"],
    dept: "الهندسة الإلكترونية",
  },
  {
    email: "engineer@demo.eeg",
    name: "مهندس صيانة",
    password: DEMO_PASSWORD,
    roles: ["engineer"],
    dept: "الهندسة الإلكترونية",
  },
  {
    email: "technician@demo.eeg",
    name: "فني صيانة",
    password: DEMO_PASSWORD,
    roles: ["technician"],
    dept: "الهندسة الإلكترونية",
  },
  {
    email: "storekeeper@demo.eeg",
    name: "أمين عهدة",
    password: DEMO_PASSWORD,
    roles: ["storekeeper"],
    dept: "الهندسة الإلكترونية",
  },
  {
    email: "accountant@demo.eeg",
    name: "محاسب — صانع الطلب",
    password: DEMO_PASSWORD,
    roles: ["accountant"],
    dept: "الشؤون المالية",
  },
  {
    email: "reviewer@demo.eeg",
    name: "مراجع مالي",
    password: DEMO_PASSWORD,
    roles: ["finance_reviewer"],
    dept: "الشؤون المالية",
  },
  {
    email: "approver@demo.eeg",
    name: "معتمد مالي",
    password: DEMO_PASSWORD,
    roles: ["finance_approver"],
    dept: "الشؤون المالية",
  },
  {
    email: "payer@demo.eeg",
    name: "أمين الصرف",
    password: DEMO_PASSWORD,
    roles: ["finance_approver"],
    dept: "الشؤون المالية",
  },
  {
    email: "supplier@demo.eeg",
    name: "مورد خارجي",
    password: DEMO_PASSWORD,
    roles: ["supplier"],
    dept: "جهة خارجية",
    linkFirstSupplier: true,
  },
  {
    email: "requester@demo.eeg",
    name: "طالب خدمة",
    password: DEMO_PASSWORD,
    roles: ["requester"],
    dept: "إدارة المدارس",
  },
];

export interface SeedResult {
  users: number;
  sites: number;
  assetTypes: number;
  suppliers: number;
  contracts: number;
  assets: number;
  budgetLines: number;
  tickets: number;
  workOrders: number;
  invoices: number;
}

/** يُنشئ مورداً بمعرّف ثابت ويحجز رقمه في العدّاد */
async function createSeedSupplier(
  repo: Repo,
  admin: User,
  input: Parameters<typeof contracts.createSupplier>[2],
) {
  const s = await contracts.createSupplier(repo, admin, input);
  await repo.nextSequence("SUP");
  return s;
}

/** يُنشئ عقداً بمعرّف ثابت ويحجز رقمه في عدّاد السنة */
async function createSeedContract(
  repo: Repo,
  admin: User,
  year: number,
  input: Parameters<typeof contracts.createContract>[2],
) {
  const c = await contracts.createContract(repo, admin, input);
  await repo.nextSequence(`CN-${year}`);
  return c;
}

export async function seed(
  repo: Repo,
  opts: { wipe?: boolean; withActivity?: boolean } = {},
): Promise<SeedResult> {
  if (opts.wipe) await repo.wipe();

  // مدير النظام يُنشأ مباشرة (لا يوجد فاعل بعد). إن كان موجوداً يُعاد استخدامه،
  // فالبذر آمن للتكرار: يملأ الناقص ولا يُنشئ مكرراً.
  const existingAdmin = await repo.users.byEmail(ACCOUNTS[0].email);
  let admin: User;
  if (existingAdmin) {
    admin = existingAdmin;
  } else {
    const salt = newSalt();
    admin = {
      id: "USR-0001",
      email: ACCOUNTS[0].email.toLowerCase(),
      displayName: ACCOUNTS[0].name,
      passwordSalt: salt,
      passwordHash: await hashPassword(ACCOUNTS[0].password, salt),
      roles: ["admin"],
      department: ACCOUNTS[0].dept,
      isActive: true,
      ...stamp(),
    };
    await repo.users.put(admin.id, admin);
    await repo.nextSequence("USR"); // يحجز الرقم ١
  }

  for (const t of ASSET_TYPES) await repo.assetTypes.put(t.code, { ...t, ...stamp() });
  for (const s of SITES) await repo.sites.put(s.code, { ...s, ...stamp() });

  // معرّفات ثابتة للبذر مشتقة من السنة الجارية، مع تقديم العدّاد عند الإنشاء
  // حتى لا يصطدم بها أول سجل يُنشئه المستخدم لاحقاً.
  const YEAR = new Date().getUTCFullYear();
  const SUP_1 = "SUP-0001", SUP_2 = "SUP-0002";
  const CN_1 = `CN-${YEAR}-001`, CN_2 = `CN-${YEAR}-002`;

  if (!(await repo.budgetLines.get("BL-2026-MAINT"))) {
    await budget.createBudgetLine(repo, admin, {
      id: "BL-2026-MAINT",
      name: "صيانة الأجهزة المكتبية والأنظمة",
      fiscalYear: 2026,
      allocated: 250_000,
    });
  }
  if (!(await repo.budgetLines.get("BL-2026-CAPEX"))) {
    await budget.createBudgetLine(repo, admin, {
      id: "BL-2026-CAPEX",
      name: "توريد أجهزة ومعدات",
      fiscalYear: 2026,
      allocated: 500_000,
    });
  }

  const supplier = await repo.suppliers.get(SUP_1) ??
    await createSeedSupplier(repo, admin, {
      id: SUP_1,
      name: "شركة النموذج لأنظمة المكاتب (مورد افتراضي)",
      commercialReg: "CR-DEMO-0001",
      contactName: "ممثل المورد",
      email: "supplier@demo.eeg",
      phone: "+973 0000 0001",
      supplyScope: "أجهزة تصوير وطباعة وصيانتها",
    });
  const supplier2 = await repo.suppliers.get(SUP_2) ??
    await createSeedSupplier(repo, admin, {
      id: SUP_2,
      name: "مؤسسة النموذج للأنظمة الأمنية (مورد افتراضي)",
      commercialReg: "CR-DEMO-0002",
      contactName: "ممثل المورد",
      email: "supplier2@demo.eeg",
      phone: "+973 0000 0002",
      supplyScope: "كاميرات مراقبة وأنظمة أمنية",
    });

  // بقية الحسابات تُنشأ بعد الموردين حتى يُربط حساب المورد بسجله
  for (const a of ACCOUNTS.slice(1)) {
    if (await repo.users.byEmail(a.email)) continue;
    await users.createUser(repo, admin, {
      email: a.email,
      displayName: a.name,
      password: a.password,
      roles: a.roles,
      department: a.dept,
      supplierId: a.linkFirstSupplier ? supplier.id : undefined,
    });
  }

  const today = new Date();
  const start = new Date(today.getTime() - 60 * 24 * 3600_000).toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 300 * 24 * 3600_000).toISOString().slice(0, 10);

  const c1 = await repo.contracts.get(CN_1) ??
    await createSeedContract(repo, admin, YEAR, {
      id: CN_1,
      title: "عقد صيانة أجهزة التصوير والطباعة ٢٠٢٦",
      supplierId: supplier.id,
      coveredTypes: ["COP", "PRN", "PLT"],
      coveredSites: [],
      startDate: start,
      expiryDate: end,
      value: 48_000,
      billingBasis: "لكل أمر عمل",
      responseHours: 8,
      penaltyRatePerDay: 0.02,
      budgetLineId: "BL-2026-MAINT",
    });
  if (c1.status !== "ساري") await contracts.setContractStatus(repo, admin, c1.id, "ساري");

  const c2 = await repo.contracts.get(CN_2) ??
    await createSeedContract(repo, admin, YEAR, {
      id: CN_2,
      title: "عقد صيانة أنظمة المراقبة ٢٠٢٦ (دفعات ربعية)",
      supplierId: supplier2.id,
      coveredTypes: ["CAM"],
      coveredSites: [],
      startDate: start,
      expiryDate: end,
      value: 36_000,
      billingBasis: "دفعات دورية",
      billingCycle: "ربعي",
      responseHours: 24,
      penaltyRatePerDay: 0.01,
      budgetLineId: "BL-2026-MAINT",
    });
  if (c2.status !== "ساري") await contracts.setContractStatus(repo, admin, c2.id, "ساري");

  const alreadyHasAssets = (await repo.assets.list({ limit: 1 })).length > 0;
  if (!alreadyHasAssets) {
    await assets.receiveFromContract(repo, admin, c1.id, [
      {
        typeCode: "COP",
        name: "آلة تصوير — إدارة شؤون الطلبة",
        siteCode: "HQ-001",
        serialNumber: "SN-COP-77120",
        cost: 2400,
        attributes: { print_type: "ألوان", copy_speed: 45, max_paper: "A3", meter_at_install: 0 },
      },
      {
        typeCode: "COP",
        name: "آلة تصوير — مكتبة المدرسة الأولى",
        siteCode: "SCH-005",
        serialNumber: "SN-COP-77121",
        cost: 2200,
        attributes: {
          print_type: "أبيض وأسود",
          copy_speed: 30,
          max_paper: "A4",
          meter_at_install: 1250,
        },
      },
      {
        typeCode: "PRN",
        name: "طابعة شبكية — غرفة المعلمين",
        siteCode: "SCH-018",
        serialNumber: "SN-PRN-31004",
        cost: 850,
        attributes: { print_speed: 28, duplex: true, networked: true, ip_address: "10.20.18.41" },
      },
    ]);
    await assets.createAsset(repo, admin, {
      typeCode: "CAM",
      name: "كاميرا مدخل المبنى الرئيسي",
      siteCode: "HQ-001",
      serialNumber: "SN-CAM-90211",
      acquisitionCost: 320,
      sourceContractId: c2.id,
      attributes: { resolution: "1080p", cam_type: "قبّة", mount_position: "المدخل الشمالي" },
    });
    await assets.createAsset(repo, admin, {
      typeCode: "PBX",
      name: "بدالة المبنى الرئيسي",
      siteCode: "HQ-001",
      serialNumber: "SN-PBX-10001",
      acquisitionCost: 9800,
      attributes: { system_model: "OmniPCX", capacity: 240, ports_used: 187 },
    });
  }

  const result: SeedResult = {
    users: ACCOUNTS.length,
    sites: SITES.length,
    assetTypes: ASSET_TYPES.length,
    suppliers: (await repo.suppliers.list()).length,
    contracts: (await repo.contracts.list()).length,
    assets: (await repo.assets.list()).length,
    budgetLines: 2,
    tickets: 0,
    workOrders: 0,
    invoices: 0,
  };

  // الحركة التمهيدية لا تُنشأ إلا مرة واحدة
  if (opts.withActivity && (await repo.tickets.list({ limit: 1 })).length === 0) {
    Object.assign(result, await seedActivity(repo));
  } else {
    result.tickets = (await repo.tickets.list()).length;
    result.workOrders = (await repo.workOrders.list()).length;
    result.invoices = (await repo.invoices.list()).length;
  }

  return result;
}

/**
 * حركة تشغيلية تمهيدية — لتبدو لوحة المؤشرات حيّة عند أول فتح.
 * تُنشئ ثلاث حالات تمثّل مراحل السلسلة المختلفة:
 *   ١) بلاغ مفتوح بانتظار أمر عمل
 *   ٢) أمر عمل منجز بانتظار الفوترة
 *   ٣) فاتورة مرّت المسار كاملاً وصُرفت
 * تُستدعى فقط في وضع العرض، ولا تعمل في الاختبارات.
 */
async function seedActivity(
  repo: Repo,
): Promise<{ tickets: number; workOrders: number; invoices: number }> {
  const by = async (email: string): Promise<User> => {
    const u = await repo.users.byEmail(email);
    if (!u) throw new Error(`حساب البذر مفقود: ${email}`);
    return u;
  };
  const engineer = await by("engineer@demo.eeg");
  const accountant = await by("accountant@demo.eeg");
  const reviewer = await by("reviewer@demo.eeg");
  const approver = await by("approver@demo.eeg");
  const payer = await by("payer@demo.eeg");

  const all = await repo.assets.list();
  const cop = all.filter((a) => a.typeCode === "COP").sort((a, b) => a.tag.localeCompare(b.tag));
  const prn = all.find((a) => a.typeCode === "PRN");
  const cam = all.find((a) => a.typeCode === "CAM");

  // ① بلاغ جديد ما زال مفتوحاً — ليجربه المستخدم من بدايته
  await tickets.createTicket(repo, engineer, {
    assetTag: cop[0].tag,
    description: "تظهر خطوط عمودية على النسخ المطبوعة، ويُرجَّح اتساخ وحدة التصوير.",
    priority: "متوسط",
  });

  // ② أمر عمل منجز بانتظار الفوترة — ليجرب المحاسب إنشاء الفاتورة
  if (prn) {
    const t2 = await tickets.createTicket(repo, engineer, {
      assetTag: prn.tag,
      description: "الطابعة لا تستجيب لطلبات الطباعة عبر الشبكة.",
      priority: "مرتفع",
    });
    const w2 = await workorders.openWorkOrder(repo, engineer, { ticketRef: t2.ref });
    await workorders.completeWorkOrder(repo, engineer, w2.ref, {
      outcome: "أُعيد ضبط إعدادات الشبكة وحُدِّث برنامج التشغيل، واختُبرت الطباعة بنجاح.",
      partsUsed: "لا يوجد",
      laborHours: 1.5,
      billableAmount: 45,
    });
    await tickets.setTicketStatus(repo, engineer, t2.ref, "مغلق");
  }

  // ③ دورة كاملة: بلاغ ← أمر عمل ← فاتورة ← اعتماد ← صرف
  const t3 = await tickets.createTicket(repo, engineer, {
    assetTag: cop[1]?.tag ?? cop[0].tag,
    description: "الجهاز يسحب أكثر من ورقة في المرة الواحدة ويتوقف.",
    priority: "عاجل",
  });
  const w3 = await workorders.openWorkOrder(repo, engineer, { ticketRef: t3.ref });
  await workorders.completeWorkOrder(repo, engineer, w3.ref, {
    outcome: "استُبدلت بكرة السحب ووسادة الفصل، وأُجري اختبار سحب لـ ٥٠٠ ورقة دون تكرار العطل.",
    partsUsed: "بكرة سحب × ١، وسادة فصل × ١",
    laborHours: 2,
    billableAmount: 135,
  });
  await tickets.setTicketStatus(repo, engineer, t3.ref, "مغلق");

  const inv = await invoices.draftFromWorkOrders(repo, accountant, {
    supplierId: w3.supplierId!,
    workOrderRefs: [w3.ref],
    supplierInvoiceNo: "DEMO-INV-001",
  });
  await approvals.submitForApproval(repo, accountant, inv.ref);
  await approvals.act(repo, reviewer, inv.ref, "معتمد", "روجعت المستندات وأوامر العمل المرفقة.");
  await approvals.act(repo, approver, inv.ref, "معتمد", "معتمدة للصرف ضمن المخصص.");
  await approvals.pay(repo, payer, inv.ref, {
    method: "تحويل بنكي",
    bankReference: "DEMO-TRF-0001",
  });

  // ④ بلاغ على عقد بدفعات دورية — يوضّح أنه لا يُفوتَر منفرداً
  if (cam) {
    await tickets.createTicket(repo, engineer, {
      assetTag: cam.tag,
      description: "الصورة غير واضحة ليلاً ويلزم ضبط الإضاءة تحت الحمراء.",
      priority: "منخفض",
    });
  }

  const t = await repo.tickets.list();
  const w = await repo.workOrders.list();
  const i = await repo.invoices.list();
  return { tickets: t.length, workOrders: w.length, invoices: i.length };
}

if (import.meta.main) {
  const repo = await openRepo();
  setRepo(repo);
  const result = await seed(repo, { wipe: true, withActivity: true });
  console.log("تم بذر البيانات:", result);
  console.log("\nحسابات العرض (الاسم = الدور، لا اسم شخص):");
  for (const a of ACCOUNTS) {
    console.log(`  ${a.email.padEnd(24)} ${a.password.padEnd(14)} ${a.roles.join(",")}`);
  }
  await repo.close();
}
