# خطة تحويل MDR Daily Report إلى نظام إلكتروني متكامل

الهدف: الاستغناء عن Excel كمصدر بيانات، وجعل النظام هو المرجع الوحيد لإدخال وحفظ وتصدير التقرير اليومي (MDR) بنفس تصميم Excel الحالي.

## 1. قاعدة البيانات (Migration)

سنبني/نُوسّع الجداول التالية (بعضها موجود، سنستكمل الناقص):

- `stations` ✔️ موجود
- `pipelines` (جديد) — الخطوط: A, B, C, F, G, Al Hissi, Al Majmah, SLT, BUT
- `station_pipelines` (جديد) — ربط المحطة بخطوطها
- `pump_units` — ترحيل `station_equipment` مع إضافة `pipeline_id` و `unit_kind` (Main/Booster/Lifting)
- `mdr_reports` (جديد) — تقرير يومي واحد يجمع كل المحطات لتاريخ/شفت معين
  - `report_date, shift, operator_id, supervisor_id, status(draft/submitted/approved), created_at`
- `mdr_report_values` (جديد) — قيمة كل وحدة داخل التقرير
  - `report_id, pump_unit_id, status(enum), remark, problem_description, work_notification, work_center, notification_date, ets`
- `equipment_status_enum` توحيد على: `in_service, standby, not_available, maintenance, shutdown, testing`
  - عرض مختصر: `S/B`, `N/V` في الواجهة فقط، القيمة الكاملة في DB.
- `user_roles` ✔️ + إضافة دور `management`
- الحفاظ على: `incidents`, `reading_entries`, `shift_reports`

كل الجداول: GRANT + RLS + سياسات حسب الدور.

## 2. النموذج (Template)

- ثابت في الكود بناءً على الترتيب المطلوب (18 قسم/مجموعة محطات) — نفس ترتيب Excel.
- لكل محطة: خطوطها ووحداتها (Main + Booster) بالأكواد الفعلية (M.U-1A ... إلخ) كما أدخلناها سابقاً.
- بيانات الوحدات تُقرأ من `pump_units` وليس مكرّرة يدوياً.

## 3. صفحة MDR الجديدة

- زر **"New Daily Report"** → مودال يطلب: التاريخ، الشفت، المشغل، المشرف → ينشئ `mdr_reports` صف واحد.
- شاشة الإدخال: قائمة عمودية تجمع كل المحطات بالترتيب المطلوب، كل قسم بعنوان المحطة ووحداتها.
- لكل وحدة: قائمة منسدلة موحّدة (In Service / Standby / Not Available / Maintenance / Shutdown / Testing) + خانات (Remark, Problem, Notification, Work Center, Date, ETS).
- عرض `S/B` و `N/V` كاختصار في القائمة بعد الاختيار.
- **Auto-fill**: عند اختيار Standby أو Not Available على أول وحدة في مجموعة، تُعبَّأ باقي الوحدات الفارغة تلقائياً (قابل للتعديل يدوياً).
- **Auto-save**: كل تغيير يُحفظ فوراً (debounce 600ms) — لا فقدان للبيانات.

## 4. البحث والأرشفة

- شاشة قائمة التقارير مع فلاتر: تاريخ من/إلى، شفت، محطة، وحدة، مشغل، مشرف.
- كل تقرير قابل للفتح والتعديل (حسب الصلاحية) أو العرض فقط.

## 5. التصدير

- **Excel واحد** لكل تقرير: نفس التصميم الحالي (تم بناؤه) مع ألوان الحالات والليجند.
- **PDF** و **Print** بنفس التنسيق (عبر `export-utils`).

## 6. Dashboard

توسعة الداشبورد الحالي بـ:
- كروت: In Service / Standby / N/V / Maintenance / Shutdown.
- عدد الأعطال والحوادث اليوم/الأسبوع/الشهر.
- حالة كل خط (Pipeline health).
- (اختياري لاحقاً) ضغط دخول/خروج ومعدل تدفق — يحتاج مصدر بيانات من القراءات.

## 7. الصلاحيات

- **Admin**: كل شيء.
- **Management**: قراءة فقط لكل التقارير والداشبورد.
- **Supervisor**: إنشاء/تعديل/اعتماد.
- **Operations**: إدخال قراءات فقط + إنشاء MDR draft.

تُطبّق عبر RLS + إخفاء عناصر الواجهة.

## 8. الربط

- MDR ↔ Incidents ↔ Readings ↔ Shift Reports عبر `station_id` + `report_date` — روابط مباشرة بين الشاشات.

## التقنية (مختصر)

- Migration واحد يضيف: `pipelines`, `station_pipelines`, `pump_units` (أو ALTER على `station_equipment`), `mdr_reports`, `mdr_report_values`, تحديث enum الحالات، دور `management`.
- مكوّن `MDRReportEditor` جديد + `MDRReportList` + تحديث `availability.tsx` أو استبدالها.
- إعادة استخدام `export-utils.ts` الموجود.

## تنفيذ على مراحل (لتجنّب مخاطر تعديل ضخم مرة واحدة)

1. **المرحلة 1 (هذه الجلسة):** Migration الكامل + شاشة MDR الجديدة بديلة لـ `availability.tsx` مع Auto-fill و Auto-save و New Report modal و التصدير الموحّد.
2. **المرحلة 2:** توسعة الداشبورد + الصلاحيات الأربع بالكامل.
3. **المرحلة 3:** ربط MDR مع Incidents/Readings/Maintenance وشاشات إدارة الخطوط والوحدات من لوحة التحكم.

هل توافق على البدء بالمرحلة 1 كما هي؟ أم تريد تعديلاً على الترتيب أو دمج مراحل؟
