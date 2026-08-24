# نشر النظام على Hostinger VPS

## 1) متطلبات الخادم
- Ubuntu 22.04 / 24.04
- 2 vCPU / 4 GB RAM / 50 GB SSD (موصى به: 4 vCPU / 8 GB)
- الدومين `jrwts-urs-operation.com` يشير بسجل A إلى IP الخاص بالـ VPS

## 2) تجهيز الخادم
```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y git certbot
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

## 3) جلب الكود
```bash
mkdir -p /opt/ursand && cd /opt/ursand
git clone <رابط مستودع GitHub الخاص بالمشروع> .
```
(اربط المشروع بـ GitHub من Lovable أولاً: GitHub → Connect)

## 4) متغيرات البيئة
```bash
cp deploy/.env.example deploy/.env
nano deploy/.env     # ضع القيم الحقيقية
```

## 5) شهادة SSL
```bash
mkdir -p deploy/certbot/www deploy/certbot/conf
certbot certonly --standalone \
  -d jrwts-urs-operation.com -d www.jrwts-urs-operation.com \
  --config-dir deploy/certbot/conf --agree-tos -m you@example.com
```

## 6) التشغيل
```bash
bash deploy/deploy.sh
```
النظام يعمل الآن على https://jrwts-urs-operation.com

## 7) النسخ الاحتياطي اليومي
```bash
export DATABASE_URL="postgresql://..."
crontab -e
# 0 2 * * * DATABASE_URL="postgresql://..." /bin/bash /opt/ursand/deploy/backup.sh
```

## أوامر مفيدة
```bash
docker compose -f deploy/docker-compose.yml logs -f app   # السجلات
docker compose -f deploy/docker-compose.yml restart app   # إعادة تشغيل
bash deploy/deploy.sh                                     # تحديث بعد أي تعديل
```

## ملاحظة عن قاعدة البيانات
الافتراضي أن قاعدة البيانات والمصادقة والتخزين تبقى على السحابة الحالية —
هذا أسرع وأأمن ويحتفظ بالنسخ الاحتياطي التلقائي. إن أردت تشغيلها داخل الـ VPS
أيضاً فهي خطوة منفصلة (Supabase self-hosted) تتطلب صيانة مستمرة.

## 8) النشر الآمن: فحص أمني + Rollback تلقائي
`deploy/deploy.sh` صار ينفذ التسلسل التالي تلقائياً:
1. **فحص أمني قبل النشر** (`deploy/security-check.sh`): أسرار مسربة، `deploy/.env` غير مرفوع، نجاح البناء،
   وتشغيل مجموعة اختبارات الصلاحيات `public.security_test_report()` إذا كان `DATABASE_URL` و`psql` متوفرين.
   يطبع ملخصاً واضحاً وينتهي بـ `RESULT: APPROVED` أو `RESULT: BLOCKED` — عند BLOCKED يتوقف النشر ولا يتغير شيء.
2. `git pull` + إعادة البناء والتشغيل.
3. **فحص صحي** على `http://127.0.0.1:3000/` لمدة تصل إلى 60 ثانية.
4. **Rollback تلقائي** للـ commit السابق مع إعادة بناء وتحقق صحي إن فشل البناء أو الفحص الصحي.

كل الخطوات تُسجَّل في `deploy/deploy.log` مع سبب أي فشل (`FAILURE: ...`).

```bash
bash deploy/deploy.sh                 # الوضع الكامل (موصى به)
SKIP_SECURITY=1 bash deploy/deploy.sh # تخطي الفحص الأمني عند الضرورة
bash deploy/security-check.sh         # الفحص الأمني وحده قبل اعتماد التعميم
bash deploy/rollback.sh               # رجوع يدوي خطوة للخلف
bash deploy/rollback.sh <commit>      # رجوع لنسخة محددة
```

## 9) المراقبة والتنبيهات بعد التعميم
`deploy/monitor.sh` يفحص كل 5 دقائق: حالة الحاويات، 6 مسارات رئيسية، وعدد أخطاء التطبيق في آخر 5 دقائق.
يسجّل كل حدث في `deploy/events.log` ويرسل تنبيهاً عند أول فشل وعند التعافي.

```bash
# في deploy/.env
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL=ops@example.com
BASE_URL=https://jrwts-urs-operation.com

crontab -e
*/5 * * * * /bin/bash /opt/ursand/deploy/monitor.sh >> /var/log/ursand-monitor.log 2>&1
```
