/** اختبارات الحوكمة: الصلاحيات، فصل المهام، الرقابة على الميزانية، آلة الحالة. */
import { assert, assertAlmost, assertEquals, assertThrows, fixture } from "./helpers.ts";
import * as contractsSvc from "../src/services/contracts.ts";
import * as assetsSvc from "../src/services/assets.ts";
import * as ticketsSvc from "../src/services/tickets.ts";
import * as woSvc from "../src/services/workorders.ts";
import * as invSvc from "../src/services/invoices.ts";
import * as apprSvc from "../src/services/approvals.ts";
import * as budgetSvc from "../src/services/budget.ts";
import { can } from "../src/domain/rbac.ts";

/** يبني فاتورة جاهزة للاعتماد ويعيد مراجعها */
async function readyInvoice(f: Awaited<ReturnType<typeof fixture>>, amount = 100) {
  const { repo, engineer, accountant } = f;
  const asset = (await repo.assets.list()).find((a) => a.typeCode === "COP")!;
  const t = await ticketsSvc.createTicket(repo, engineer, {
    assetTag: asset.tag,
    description: "عطل اختباري",
  });
  const wo = await woSvc.openWorkOrder(repo, engineer, { ticketRef: t.ref });
  await woSvc.completeWorkOrder(repo, engineer, wo.ref, { outcome: "تم", billableAmount: amount });
  const inv = await invSvc.draftFromWorkOrders(repo, accountant, {
    supplierId: wo.supplierId!,
    workOrderRefs: [wo.ref],
  });
  return { asset, ticket: t, wo, inv };
}

Deno.test("الصلاحيات: كل دور محصور بما يخصه", async () => {
  const f = await fixture();
  try {
    assert(can(f.requester, "ticket:create"));
    assert(!can(f.requester, "invoice:approve"));
    assert(!can(f.technician, "workorder:price"));
    assert(can(f.technician, "workorder:complete"));
    assert(!can(f.accountant, "invoice:approve"));
    assert(can(f.accountant, "invoice:submit"));
    assert(!can(f.reviewer, "payment:execute"));
    assert(can(f.approver, "payment:execute"));
    assert(can(f.admin, "user:manage"));

    await assertThrows(
      () => contractsSvc.createSupplier(f.repo, f.requester, { name: "مورد" }),
      "الصلاحية",
    );
    await assertThrows(
      () =>
        budgetSvc.createBudgetLine(f.repo, f.accountant, {
          id: "BL-X",
          name: "x",
          fiscalYear: 2026,
          allocated: 1,
        }),
      "الصلاحية",
    );
  } finally {
    await f.close();
  }
});

Deno.test("الفني لا يستطيع تسعير أمر العمل", async () => {
  const f = await fixture();
  try {
    const asset = (await f.repo.assets.list()).find((a) => a.typeCode === "COP")!;
    const t = await ticketsSvc.createTicket(f.repo, f.engineer, {
      assetTag: asset.tag,
      description: "عطل",
    });
    const wo = await woSvc.openWorkOrder(f.repo, f.engineer, { ticketRef: t.ref });

    await assertThrows(
      () =>
        woSvc.completeWorkOrder(f.repo, f.technician, wo.ref, {
          outcome: "أصلحته",
          billableAmount: 500,
        }),
      "workorder:price",
    );
    // بلا تسعير: مسموح
    const done = await woSvc.completeWorkOrder(f.repo, f.technician, wo.ref, { outcome: "أصلحته" });
    assertEquals(done.billableAmount, 0);
  } finally {
    await f.close();
  }
});

Deno.test("فصل المهام: المُقدِّم لا يراجع، والمعتمد لا يصرف", async () => {
  const f = await fixture();
  try {
    const { inv } = await readyInvoice(f);
    await apprSvc.submitForApproval(f.repo, f.accountant, inv.ref);

    // نمنح المحاسب دور المراجع مؤقتاً لاختبار الفصل نفسه لا الصلاحية
    const dual = { ...f.accountant, roles: [...f.accountant.roles, "finance_reviewer" as const] };
    await assertThrows(() => apprSvc.act(f.repo, dual, inv.ref, "معتمد"), "فصل المهام");

    await apprSvc.act(f.repo, f.reviewer, inv.ref, "معتمد");
    await apprSvc.act(f.repo, f.approver, inv.ref, "معتمد");

    // المعتمد نفسه لا يصرف
    await assertThrows(() => apprSvc.pay(f.repo, f.approver, inv.ref), "فصل المهام");
    const { payment } = await apprSvc.pay(f.repo, f.payer, inv.ref);
    assert(payment.ref.startsWith("PAY-"));
  } finally {
    await f.close();
  }
});

Deno.test("الرفض يوقف المسار ويعيد الفاتورة قابلة للتعديل", async () => {
  const f = await fixture();
  try {
    const { inv } = await readyInvoice(f);
    await apprSvc.submitForApproval(f.repo, f.accountant, inv.ref);
    await apprSvc.act(f.repo, f.reviewer, inv.ref, "مرفوض", "المبلغ غير مبرر");

    const after = await invSvc.getInvoice(f.repo, inv.ref);
    assertEquals(after.status, "مرفوضة");
    const chain = await apprSvc.chainOf(f.repo, inv.ref);
    assertEquals(chain[1].status, "مرفوض");
    assertEquals(chain[2].status, "متجاوَز");
    // لا حجز على الميزانية عند الرفض
    assertEquals((await budgetSvc.getBudgetLine(f.repo, "BL-2026-MAINT")).committed, 0);

    // يمكن إعادة التقديم
    await apprSvc.submitForApproval(f.repo, f.accountant, inv.ref);
    assertEquals((await invSvc.getInvoice(f.repo, inv.ref)).status, "قيد الاعتماد");
  } finally {
    await f.close();
  }
});

Deno.test("الرقابة على الميزانية تمنع تجاوز المخصص", async () => {
  const f = await fixture();
  try {
    await budgetSvc.createBudgetLine(f.repo, f.admin, {
      id: "BL-SMALL",
      name: "بند صغير",
      fiscalYear: 2026,
      allocated: 50,
    });
    const line = await budgetSvc.getBudgetLine(f.repo, "BL-SMALL");
    assertEquals(budgetSvc.available(line), 50);

    await assertThrows(
      () => budgetSvc.assertAvailable(f.repo, "BL-SMALL", 500),
      "السيولة غير كافية",
    );
  } finally {
    await f.close();
  }
});

Deno.test("لا فاتورة على مبلغ يتجاوز الميزانية", async () => {
  const f = await fixture();
  try {
    const asset = (await f.repo.assets.list()).find((a) => a.typeCode === "COP")!;
    const t = await ticketsSvc.createTicket(f.repo, f.engineer, {
      assetTag: asset.tag,
      description: "عطل ضخم",
    });
    const wo = await woSvc.openWorkOrder(f.repo, f.engineer, { ticketRef: t.ref });
    await woSvc.completeWorkOrder(f.repo, f.engineer, wo.ref, {
      outcome: "استبدال كامل",
      billableAmount: 900_000, // المخصص ٢٥٠ ألف
    });
    await assertThrows(
      () =>
        invSvc.draftFromWorkOrders(f.repo, f.accountant, {
          supplierId: wo.supplierId!,
          workOrderRefs: [wo.ref],
        }),
      "السيولة غير كافية",
    );
  } finally {
    await f.close();
  }
});

Deno.test("آلة حالة البلاغ ترفض الانتقالات غير المنطقية", async () => {
  const f = await fixture();
  try {
    const asset = (await f.repo.assets.list())[0];
    const t = await ticketsSvc.createTicket(f.repo, f.engineer, {
      assetTag: asset.tag,
      description: "عطل",
    });
    // إغلاق مباشر من «جديد» مرفوض بآلة الحالة
    await assertThrows(
      () => ticketsSvc.setTicketStatus(f.repo, f.engineer, t.ref, "مغلق"),
      "انتقال غير مسموح",
    );
    assert(!ticketsSvc.canTransition("جديد", "مغلق"));
    assert(ticketsSvc.canTransition("جديد", "معيّن"));
    assert(!ticketsSvc.canTransition("مغلق", "قيد التنفيذ"));

    // أمر عمل مفتوح غير منجز ← لا إغلاق (الحالة الآن «قيد التنفيذ» فيمر فحص الانتقال)
    await woSvc.openWorkOrder(f.repo, f.engineer, { ticketRef: t.ref });
    await assertThrows(
      () => ticketsSvc.setTicketStatus(f.repo, f.engineer, t.ref, "مغلق"),
      "لم يُنجَز فنياً",
    );
  } finally {
    await f.close();
  }
});

Deno.test("المطابقة الثلاثية ترفض الفاتورة بلا تقرير إنجاز", async () => {
  const f = await fixture();
  try {
    const { inv, wo } = await readyInvoice(f);
    // نفسد ضلع الإنجاز
    const bad = await f.repo.workOrders.get(wo.ref);
    await f.repo.workOrders.put(wo.ref, { ...bad!, outcome: "" });

    const match = await invSvc.threeWayMatch(f.repo, inv.ref);
    assert(!match.matched);
    const delivery = match.checks.find((c) => c.name === "تقرير الإنجاز")!;
    assert(!delivery.ok);
    assert(delivery.detail.includes("بلا تقرير إنجاز"));

    await assertThrows(
      () => apprSvc.submitForApproval(f.repo, f.accountant, inv.ref),
      "فشلت المطابقة الثلاثية",
    );
  } finally {
    await f.close();
  }
});

Deno.test("غرامة التأخير تُحسم عند تجاوز زمن الاستجابة", async () => {
  const f = await fixture();
  const { repo, admin, engineer } = f;
  try {
    const supplier = await contractsSvc.createSupplier(repo, admin, { name: "مورد الغرامة" });
    const c = await contractsSvc.createContract(repo, admin, {
      title: "عقد بغرامة",
      supplierId: supplier.id,
      coveredTypes: ["PBX"],
      startDate: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
      expiryDate: new Date(Date.now() + 300 * 86400_000).toISOString().slice(0, 10),
      billingBasis: "لكل أمر عمل",
      responseHours: 4,
      penaltyRatePerDay: 0.10,
      budgetLineId: "BL-2026-MAINT",
    });
    await contractsSvc.setContractStatus(repo, admin, c.id, "ساري");

    const asset = (await repo.assets.list()).find((a) => a.typeCode === "PBX")!;
    const t = await ticketsSvc.createTicket(repo, engineer, {
      assetTag: asset.tag,
      description: "البدالة متوقفة",
    });
    // نؤخّر الاستحقاق يومين في الماضي
    await repo.tickets.put(t.ref, {
      ...t,
      dueDate: new Date(Date.now() - 2 * 86400_000).toISOString(),
    });

    const wo = await woSvc.openWorkOrder(repo, engineer, { ticketRef: t.ref });
    const done = await woSvc.completeWorkOrder(repo, engineer, wo.ref, {
      outcome: "أُعيد تشغيل النظام",
      billableAmount: 1000,
    });
    assertAlmost(done.penaltyAmount, 200, 1); // ١٠٪ × يومان × ١٠٠٠
  } finally {
    await f.close();
  }
});

Deno.test("الإهلاك بالقسط الثابت", async () => {
  const f = await fixture();
  try {
    const type = (await f.repo.assetTypes.get("COP"))!;
    const asset = await assetsSvc.createAsset(f.repo, f.admin, {
      typeCode: "COP",
      name: "آلة قديمة",
      siteCode: "HQ-001",
      serialNumber: "SN-OLD-1",
      acquisitionCost: 5000,
      acquisitionDate: new Date(Date.now() - 2 * 365.25 * 86400_000).toISOString().slice(0, 10),
      attributes: { print_type: "ألوان" },
    });
    const d = assetsSvc.depreciation(asset, type); // عمر ٥ سنوات
    assertAlmost(d.annualDepreciation, 1000, 1);
    assertAlmost(d.accumulated, 2000, 20);
    assertAlmost(d.bookValue, 3000, 20);
  } finally {
    await f.close();
  }
});

Deno.test("لا بلاغ على أصل مشطوب، ولا رقم تسلسلي مكرر", async () => {
  const f = await fixture();
  try {
    const asset = (await f.repo.assets.list()).find((a) => a.typeCode === "COP")!;
    await assetsSvc.setAssetStatus(f.repo, f.admin, asset.tag, "مشطوب");
    await assertThrows(
      () =>
        ticketsSvc.createTicket(f.repo, f.engineer, {
          assetTag: asset.tag,
          description: "عطل",
        }),
      "مشطوب",
    );
    await assertThrows(
      () =>
        assetsSvc.createAsset(f.repo, f.admin, {
          typeCode: "COP",
          name: "نسخة",
          siteCode: "HQ-001",
          serialNumber: asset.serialNumber,
          attributes: { print_type: "ألوان" },
        }),
      "مسجّل مسبقاً",
    );
  } finally {
    await f.close();
  }
});

Deno.test("الحقول الديناميكية: التحقق والتحويل حسب تعريف النوع", async () => {
  const f = await fixture();
  try {
    // حقل مطلوب مفقود
    await assertThrows(
      () =>
        assetsSvc.createAsset(f.repo, f.admin, {
          typeCode: "CAM",
          name: "كاميرا بلا دقة",
          siteCode: "HQ-001",
          serialNumber: "SN-C-1",
          attributes: {},
        }),
      "دقة التصوير مطلوب",
    );
    // قيمة خارج القائمة
    await assertThrows(
      () =>
        assetsSvc.createAsset(f.repo, f.admin, {
          typeCode: "CAM",
          name: "كاميرا",
          siteCode: "HQ-001",
          serialNumber: "SN-C-2",
          attributes: { resolution: "8K" },
        }),
      "يجب أن يكون أحد",
    );
    // التحويل: النص "42" ← رقم، و"true" ← منطقي
    const prn = await assetsSvc.createAsset(f.repo, f.admin, {
      typeCode: "PRN",
      name: "طابعة",
      siteCode: "HQ-001",
      serialNumber: "SN-P-9",
      attributes: { print_speed: "42", duplex: "true" },
    });
    assertEquals(prn.attributes.print_speed, 42);
    assertEquals(prn.attributes.duplex, true);
  } finally {
    await f.close();
  }
});

Deno.test("اختيار العقد الأدق عند تداخل التغطية", async () => {
  const f = await fixture();
  const { repo, admin } = f;
  try {
    const s = await contractsSvc.createSupplier(repo, admin, { name: "مورد الموقع" });
    const start = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 100 * 86400_000).toISOString().slice(0, 10);
    const specific = await contractsSvc.createContract(repo, admin, {
      title: "عقد موقع محدد",
      supplierId: s.id,
      coveredTypes: ["COP"],
      coveredSites: ["SCH-005"],
      startDate: start,
      expiryDate: end,
      budgetLineId: "BL-2026-MAINT",
    });
    await contractsSvc.setContractStatus(repo, admin, specific.id, "ساري");

    const found = await contractsSvc.findCoveringContract(repo, "COP", "SCH-005");
    assertEquals(found?.id, specific.id, "العقد المحدد بالموقع يسبق العقد الشامل");

    const general = await contractsSvc.findCoveringContract(repo, "COP", "HQ-001");
    assert(general && general.id !== specific.id);
  } finally {
    await f.close();
  }
});
