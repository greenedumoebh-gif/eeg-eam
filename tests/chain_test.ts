/**
 * الاختبار المحوري: السلسلة الكاملة من الطرف للطرف
 *   عقد ← أصل ← بلاغ ← أمر عمل ← فاتورة ← اعتماد ← صرف
 */
import { assert, assertAlmost, assertEquals, assertThrows, fixture } from "./helpers.ts";
import * as contractsSvc from "../src/services/contracts.ts";
import * as assetsSvc from "../src/services/assets.ts";
import * as ticketsSvc from "../src/services/tickets.ts";
import * as woSvc from "../src/services/workorders.ts";
import * as invSvc from "../src/services/invoices.ts";
import * as apprSvc from "../src/services/approvals.ts";
import * as budgetSvc from "../src/services/budget.ts";
import { VAT_RATE } from "../src/domain/types.ts";

Deno.test("السلسلة الكاملة: عقد ← أصل ← بلاغ ← أمر عمل ← فاتورة ← اعتماد ← صرف", async () => {
  const f = await fixture();
  const { repo, admin, engineer, accountant, reviewer, approver, payer } = f;

  try {
    // ── ١) العقد ──
    const supplier = await contractsSvc.createSupplier(repo, admin, {
      name: "مؤسسة الاختبار الفني",
      email: "test@vendor.bh",
    });
    const today = new Date();
    const contract = await contractsSvc.createContract(repo, admin, {
      title: "عقد صيانة اختباري",
      supplierId: supplier.id,
      coveredTypes: ["COP"],
      startDate: new Date(today.getTime() - 10 * 86400_000).toISOString().slice(0, 10),
      expiryDate: new Date(today.getTime() + 200 * 86400_000).toISOString().slice(0, 10),
      value: 10_000,
      billingBasis: "لكل أمر عمل",
      responseHours: 8,
      budgetLineId: "BL-2026-MAINT",
    });
    await contractsSvc.setContractStatus(repo, admin, contract.id, "ساري");

    // ── ٢) الأصل يُرحَّل من العقد ──
    const [asset] = await assetsSvc.receiveFromContract(repo, admin, contract.id, [{
      typeCode: "COP",
      name: "آلة تصوير الاختبار",
      siteCode: "HQ-001",
      serialNumber: "SN-TEST-0001",
      cost: 3000,
      attributes: { print_type: "ألوان", copy_speed: 40 },
    }]);
    assertEquals(asset.sourceContractId, contract.id, "الأصل يجب أن يحمل مرجع العقد");
    assert(asset.tag.startsWith("COP-"), "رقم الأصل يتبع بادئة النوع");

    // ── ٣) البلاغ يُوجَّه آلياً للعقد الساري ──
    const ticket = await ticketsSvc.createTicket(repo, engineer, {
      assetTag: asset.tag,
      description: "الجهاز لا يسحب الورق",
      priority: "مرتفع",
    });
    assertEquals(ticket.contractId, contract.id, "البلاغ يجب أن يُربط بالعقد الساري تلقائياً");
    assertEquals(ticket.supplierId, supplier.id, "المورد يُشتق من العقد");
    // زمن الاستجابة من العقد (٨ ساعات) لا من الأولوية (٢٤)
    const slaHours = (new Date(ticket.dueDate).getTime() - new Date(ticket.createdAt).getTime()) /
      3600_000;
    assertAlmost(slaHours, 8, 0.1);

    // ── ٤) أمر العمل ──
    const wo = await woSvc.openWorkOrder(repo, engineer, { ticketRef: ticket.ref });
    assertEquals((await repo.assets.get(asset.tag))!.status, "تحت الصيانة");
    assertEquals((await repo.tickets.get(ticket.ref))!.status, "قيد التنفيذ");

    await woSvc.completeWorkOrder(repo, engineer, wo.ref, {
      outcome: "استُبدلت بكرة السحب وأُجري اختبار طباعة ناجح",
      partsUsed: "بكرة سحب × ١",
      laborHours: 2,
      billableAmount: 120,
    });
    const doneWo = await woSvc.getWorkOrder(repo, wo.ref);
    assertEquals(doneWo.status, "منجز فنياً");
    assertEquals(doneWo.underContract, false, "عقد لكل أمر عمل ← قابل للفوترة منفرداً");
    assertEquals(doneWo.billableAmount, 120);

    // ── ٥) إغلاق البلاغ يعيد الأصل للخدمة ──
    await ticketsSvc.setTicketStatus(repo, engineer, ticket.ref, "مغلق");
    assertEquals((await repo.assets.get(asset.tag))!.status, "في الخدمة");

    // ── ٦) الفاتورة تُحسب من أمر العمل لا يدوياً ──
    const invoice = await invSvc.draftFromWorkOrders(repo, accountant, {
      supplierId: supplier.id,
      workOrderRefs: [wo.ref],
      supplierInvoiceNo: "V-9001",
    });
    assertEquals(invoice.amount, 120);
    assertAlmost(invoice.vatAmount, 120 * VAT_RATE);
    assertAlmost(invoice.grandTotal, 120 * (1 + VAT_RATE));
    assertEquals(invoice.budgetLineId, "BL-2026-MAINT", "بند الميزانية يُورَث من العقد");

    // أمر العمل صار مقفلاً ومربوطاً بالفاتورة — لا فوترة مكررة
    assertEquals((await repo.workOrders.get(wo.ref))!.invoiceRef, invoice.ref);
    await assertThrows(
      () =>
        invSvc.draftFromWorkOrders(repo, accountant, {
          supplierId: supplier.id,
          workOrderRefs: [wo.ref],
        }),
      "مفوتَر مسبقاً",
    );

    // ── ٧) المطابقة الثلاثية ──
    const match = await invSvc.threeWayMatch(repo, invoice.ref);
    assert(match.matched, `المطابقة يجب أن تنجح: ${JSON.stringify(match.checks)}`);
    assertEquals(match.checks.length, 4);

    // ── ٨) مسار الاعتماد ──
    const { chain } = await apprSvc.submitForApproval(repo, accountant, invoice.ref);
    assertEquals(chain.length, 3);
    assertEquals(chain[0].status, "معتمد", "خطوة الصانع تُعتمد بالتقديم");
    assertEquals(chain[1].status, "بانتظار");
    assertEquals((await invSvc.getInvoice(repo, invoice.ref)).status, "قيد الاعتماد");

    // المراجع يعتمد
    await apprSvc.act(repo, reviewer, invoice.ref, "معتمد", "روجعت المستندات");
    assertEquals((await invSvc.getInvoice(repo, invoice.ref)).status, "قيد الاعتماد");

    // الميزانية لم تُحجز بعد
    assertEquals((await budgetSvc.getBudgetLine(repo, "BL-2026-MAINT")).committed, 0);

    // المعتمد يعتمد ← حجز على الميزانية
    await apprSvc.act(repo, approver, invoice.ref, "معتمد", "معتمد للصرف");
    const approved = await invSvc.getInvoice(repo, invoice.ref);
    assertEquals(approved.status, "معتمدة");
    const lineAfterApproval = await budgetSvc.getBudgetLine(repo, "BL-2026-MAINT");
    assertAlmost(lineAfterApproval.committed, approved.grandTotal);
    assertEquals(lineAfterApproval.spent, 0);

    // ── ٩) الصرف ──
    const { payment } = await apprSvc.pay(repo, payer, invoice.ref, {
      method: "تحويل بنكي",
      bankReference: "BRF-778899",
    });
    const paid = await invSvc.getInvoice(repo, invoice.ref);
    assertEquals(paid.status, "مصروفة");
    assertEquals(paid.paymentRef, payment.ref);

    const lineAfterPayment = await budgetSvc.getBudgetLine(repo, "BL-2026-MAINT");
    assertEquals(lineAfterPayment.committed, 0, "الحجز يتحوّل إلى صرف");
    assertAlmost(lineAfterPayment.spent, paid.grandTotal);
    assertAlmost(
      budgetSvc.available(lineAfterPayment),
      lineAfterPayment.allocated - paid.grandTotal,
    );

    // ── ١٠) التكلفة الإجمالية للتملّك تعكس الصيانة ──
    const tco = await assetsSvc.totalCostOfOwnership(repo, asset.tag);
    assertEquals(tco.acquisition, 3000);
    assertEquals(tco.maintenance, 120);
    assertEquals(tco.total, 3120);
    assertEquals(tco.workOrders, 1);
  } finally {
    await f.close();
  }
});

Deno.test("عقد بدفعات دورية: أمر العمل لا يُفوتَر منفرداً", async () => {
  const f = await fixture();
  const { repo, admin, engineer, accountant } = f;
  try {
    const asset = await assetsSvc.createAsset(repo, admin, {
      typeCode: "CAM",
      name: "كاميرا اختبار",
      siteCode: "SCH-005",
      serialNumber: "SN-CAM-TEST",
      acquisitionCost: 400,
      attributes: { resolution: "1080p" },
    });
    // عقد الكاميرات في بيانات البذر أساسه «دفعات دورية»
    const ticket = await ticketsSvc.createTicket(repo, engineer, {
      assetTag: asset.tag,
      description: "الكاميرا خارج الخدمة",
    });
    assert(ticket.contractId, "يجب أن يُغطى البلاغ بعقد الكاميرات");

    const wo = await woSvc.openWorkOrder(repo, engineer, { ticketRef: ticket.ref });
    const done = await woSvc.completeWorkOrder(repo, engineer, wo.ref, {
      outcome: "أُعيد ضبط المغذّي",
      billableAmount: 300, // يجب أن يُتجاهل
    });
    assertEquals(done.underContract, true);
    assertEquals(done.billableAmount, 0, "الدفعات الدورية تلغي المبلغ المنفرد");

    await assertThrows(
      () =>
        invSvc.draftFromWorkOrders(repo, accountant, {
          supplierId: done.supplierId!,
          workOrderRefs: [wo.ref],
        }),
      "دفعات العقد الدورية",
    );

    const billable = await woSvc.billableWorkOrders(repo);
    assertEquals(billable.length, 0);
  } finally {
    await f.close();
  }
});

Deno.test("الفوترة الآلية تجمع أوامر العمل حسب المورد والعقد", async () => {
  const f = await fixture();
  const { repo, admin, engineer, accountant } = f;
  try {
    const assets = (await repo.assets.list()).filter((a) => a.typeCode === "COP");
    assert(assets.length >= 2);
    for (const a of assets) {
      const t = await ticketsSvc.createTicket(repo, engineer, {
        assetTag: a.tag,
        description: `عطل في ${a.name}`,
      });
      const wo = await woSvc.openWorkOrder(repo, engineer, { ticketRef: t.ref });
      await woSvc.completeWorkOrder(repo, engineer, wo.ref, {
        outcome: "تم الإصلاح",
        billableAmount: 50,
      });
    }
    const invoices = await invSvc.autoInvoice(repo, accountant);
    assertEquals(invoices.length, 1, "أوامر نفس المورد والعقد تُجمع في فاتورة واحدة");
    assertEquals(invoices[0].workOrderRefs.length, assets.length);
    assertAlmost(invoices[0].amount, 50 * assets.length);
    assertEquals((await woSvc.billableWorkOrders(repo)).length, 0);
    void admin;
  } finally {
    await f.close();
  }
});
