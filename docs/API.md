<div dir="rtl">

# مرجع الواجهة البرمجية (REST API)

كل المسارات تحت `/api`. المصادقة بكوكي الجلسة نفسه المستخدم في الواجهة. للتكامل الآلي: سجّل الدخول عبر
`POST /login` واحتفظ بالكوكي.

الطلبات المُغيِّرة للحالة تحتاج ترويسة `content-type: application/json` (أو أصلاً مطابقاً). الأخطاء ترجع
`{ "error": "الرسالة", "fields": {...} }` مع رمز HTTP المناسب: `401` غير مصادَق · `403` بلا صلاحية ·
`404` غير موجود · `409` تعارض حالة · `422` بيانات غير صالحة.

---

## عام

| الطريقة | المسار                          | الوصف                                 |
| ------- | ------------------------------- | ------------------------------------- |
| `GET`   | `/healthz`                      | فحص الصحة (بلا مصادقة)                |
| `GET`   | `/api/me`                       | المستخدم الحالي وصلاحياته             |
| `GET`   | `/api/meta`                     | الثوابت: الأولويات، الحالات، الأدوار  |
| `GET`   | `/api/kpis`                     | مؤشرات لوحة الإدارة                   |
| `GET`   | `/api/audit?entity=&id=&limit=` | سجل التدقيق                           |
| `POST`  | `/api/seed`                     | إعادة بذر البيانات (`{"force":true}`) |

## الموردون والعقود

| الطريقة | المسار                       | الصلاحية                               |
| ------- | ---------------------------- | -------------------------------------- |
| `GET`   | `/api/suppliers`             | `supplier:read`                        |
| `POST`  | `/api/suppliers`             | `supplier:write`                       |
| `GET`   | `/api/contracts`             | `contract:read`                        |
| `GET`   | `/api/contracts/:id`         | `contract:read`                        |
| `POST`  | `/api/contracts`             | `contract:write`                       |
| `POST`  | `/api/contracts/:id/status`  | `contract:write`                       |
| `POST`  | `/api/contracts/:id/receive` | `asset:write` — ترحيل توريدات إلى أصول |

```jsonc
// POST /api/contracts
{
  "title": "عقد صيانة أجهزة التصوير ٢٠٢٦",
  "supplierId": "SUP-0001",
  "coveredTypes": ["COP", "PRN"],
  "coveredSites": [], // فارغ = كل المواقع
  "startDate": "2026-01-01",
  "expiryDate": "2026-12-31",
  "value": 48000,
  "billingBasis": "لكل أمر عمل", // أو "دفعات دورية" أو "مختلط"
  "responseHours": 8,
  "penaltyRatePerDay": 0.02,
  "budgetLineId": "BL-2026-MAINT"
}
```

## الأصول

| الطريقة | المسار                                       | الوصف                                |
| ------- | -------------------------------------------- | ------------------------------------ |
| `GET`   | `/api/asset-types`                           | أنواع الأصول وحقولها الديناميكية     |
| `GET`   | `/api/sites`                                 | المواقع                              |
| `GET`   | `/api/assets?typeCode=&siteCode=&status=&q=` | قائمة مصفّاة                          |
| `GET`   | `/api/assets/:tag`                           | الأصل + الإهلاك + TCO + QR + بلاغاته |
| `POST`  | `/api/assets`                                | تسجيل أصل                            |
| `POST`  | `/api/assets/:tag/status`                    | تغيير الحالة                         |

```jsonc
// POST /api/assets — القيم في attributes تُتحقَّق ضد تعريف النوع
{
  "typeCode": "CAM",
  "name": "كاميرا مدخل المبنى",
  "siteCode": "HQ-001",
  "serialNumber": "SN-CAM-90211",
  "acquisitionCost": 320,
  "attributes": { "resolution": "1080p", "cam_type": "قبّة" }
}
```

## البلاغات

| الطريقة | المسار                                     | الصلاحية                   |
| ------- | ------------------------------------------ | -------------------------- |
| `GET`   | `/api/tickets?status=&siteCode=&assetTag=` | `ticket:read`              |
| `GET`   | `/api/tickets/:ref`                        | `ticket:read`              |
| `POST`  | `/api/tickets`                             | `ticket:create`            |
| `POST`  | `/api/tickets/:ref/assign`                 | `ticket:assign`            |
| `POST`  | `/api/tickets/:ref/status`                 | `ticket:close` عند الإغلاق |

```jsonc
// POST /api/tickets — النوع والموقع والعقد والمورد تُشتق آلياً
{ "assetTag": "COP-000001", "description": "لا يسحب الورق", "priority": "مرتفع" }
```

## أوامر العمل

| الطريقة | المسار                                           | الصلاحية                                               |
| ------- | ------------------------------------------------ | ------------------------------------------------------ |
| `GET`   | `/api/work-orders?status=&supplierId=&assetTag=` | `workorder:read`                                       |
| `GET`   | `/api/work-orders/:ref`                          | `workorder:read`                                       |
| `POST`  | `/api/work-orders`                               | `workorder:write`                                      |
| `POST`  | `/api/work-orders/:ref/complete`                 | `workorder:complete` (+ `workorder:price` عند التسعير) |

```jsonc
// POST /api/work-orders/WO-2026-00001/complete
{
  "outcome": "استُبدلت بكرة السحب",
  "partsUsed": "بكرة سحب × ١",
  "laborHours": 2,
  "billableAmount": 120 // يُتجاهل إذا كان العقد بدفعات دورية
}
```

## الفواتير والاعتماد والصرف

| الطريقة | المسار                              | الصلاحية                              |
| ------- | ----------------------------------- | ------------------------------------- |
| `GET`   | `/api/invoices?status=&supplierId=` | `invoice:read`                        |
| `GET`   | `/api/invoices/inbox`               | الفواتير المنتظرة تصرّفك               |
| `GET`   | `/api/invoices/:ref`                | الفاتورة + المسار + المطابقة + الصرف  |
| `GET`   | `/api/invoices/:ref/match`          | تشغيل المطابقة الثلاثية               |
| `POST`  | `/api/invoices`                     | `invoice:create`                      |
| `POST`  | `/api/invoices/auto`                | فوترة آلية لكل المنجز                 |
| `POST`  | `/api/invoices/:ref/submit`         | `invoice:submit`                      |
| `POST`  | `/api/invoices/:ref/approve`        | `invoice:review` أو `invoice:approve` |
| `POST`  | `/api/invoices/:ref/reject`         | كسابقه                                |
| `POST`  | `/api/invoices/:ref/pay`            | `payment:execute`                     |

```jsonc
// POST /api/invoices — المبلغ يُحسب من أوامر العمل، لا يُرسَل
{
  "supplierId": "SUP-0001",
  "workOrderRefs": ["WO-2026-00001", "WO-2026-00002"],
  "supplierInvoiceNo": "V-9001"
}
```

## الميزانية والمستخدمون

| الطريقة | المسار                    | الصلاحية                           |
| ------- | ------------------------- | ---------------------------------- |
| `GET`   | `/api/budget`             | `budget:read` — مع حقل `available` |
| `POST`  | `/api/budget`             | `budget:write`                     |
| `GET`   | `/api/users`              | `user:manage`                      |
| `POST`  | `/api/users`              | `user:manage`                      |
| `POST`  | `/api/users/:id/password` | صاحب الحساب أو `user:manage`       |

---

## مثال كامل بـ curl

```bash
BASE=http://localhost:8000
J='content-type: application/json'

# دخول
curl -s -c jar.txt -X POST $BASE/login \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'email=engineer@demo.eeg&password=Demo@12345'

# فتح بلاغ
curl -s -b jar.txt -X POST $BASE/api/tickets -H "$J" \
  -d '{"assetTag":"COP-000001","description":"لا يطبع","priority":"عاجل"}'

# فتح أمر عمل ثم إنجازه
curl -s -b jar.txt -X POST $BASE/api/work-orders -H "$J" \
  -d '{"ticketRef":"TK-2026-00001"}'
curl -s -b jar.txt -X POST $BASE/api/work-orders/WO-2026-00001/complete -H "$J" \
  -d '{"outcome":"تنظيف رأس الطباعة","laborHours":1,"billableAmount":75}'
```

</div>
