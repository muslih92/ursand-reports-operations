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
