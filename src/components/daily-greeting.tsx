import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PartyPopper, ShieldCheck, Sun, Sunrise, Moon } from "lucide-react";

interface Msg {
  ar: string;
  en: string;
}

/* ----------------------- الرسائل ----------------------- */

const SAFETY_TIPS: Msg[] = [
  { ar: "ارتدِ معدات الوقاية الشخصية كاملة قبل دخول موقع التشغيل.", en: "Wear full PPE before entering the operating area." },
  { ar: "تأكد من عزل الطاقة (LOTO) قبل أي عمل على المعدات.", en: "Verify energy isolation (LOTO) before working on any equipment." },
  { ar: "لا تتجاوز أي إنذار أو حماية دون تصريح رسمي.", en: "Never bypass an alarm or protection without a formal permit." },
  { ar: "أبلغ فوراً عن أي تسريب زيت أو ماء مهما كان بسيطاً.", en: "Report any oil or water leak immediately, however small." },
  { ar: "تحقق من سلامة طفايات الحريق ومخارج الطوارئ في بداية الوردية.", en: "Check fire extinguishers and emergency exits at shift start." },
  { ar: "حافظ على نظافة وترتيب الموقع — معظم الحوادث سببها الإهمال البسيط.", en: "Keep the site clean and tidy — most incidents start with small neglect." },
  { ar: "لا تعمل منفرداً في الأماكن المغلقة أو المرتفعة.", en: "Never work alone in confined spaces or at height." },
  { ar: "راجع قراءات الاهتزاز والحرارة قبل تشغيل أي وحدة.", en: "Review vibration and temperature readings before starting any unit." },
  { ar: "تأكد من صلاحية تصريح العمل قبل بدء أي مهمة صيانة.", en: "Confirm the work permit is valid before starting any maintenance task." },
  { ar: "السلامة مسؤولية الجميع — أوقف أي عمل غير آمن فوراً.", en: "Safety is everyone's duty — stop any unsafe act immediately." },
];

interface Occasion {
  ar: string;
  en: string;
}

function hijri(date: Date): { m: number; d: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Riyadh",
    }).formatToParts(date);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (!m || !d) return null;
    return { m, d };
  } catch {
    return null;
  }
}

function getOccasion(date: Date): Occasion | null {
  const g = { m: date.getMonth() + 1, d: date.getDate() };

  if (g.m === 9 && g.d === 23)
    return { ar: "كل عام والوطن بخير 🇸🇦 — اليوم الوطني للمملكة العربية السعودية", en: "Happy Saudi National Day 🇸🇦" };
  if (g.m === 2 && g.d === 22)
    return { ar: "يوم التأسيس — يومٌ بدينا 🇸🇦", en: "Saudi Founding Day 🇸🇦" };

  const h = hijri(date);
  if (h) {
    if (h.m === 10 && h.d >= 1 && h.d <= 3)
      return { ar: "عيد الفطر المبارك — كل عام وأنتم بخير 🌙", en: "Eid Al-Fitr Mubarak 🌙" };
    if (h.m === 12 && h.d >= 10 && h.d <= 13)
      return { ar: "عيد الأضحى المبارك — تقبل الله منا ومنكم 🐑", en: "Eid Al-Adha Mubarak 🐑" };
    if (h.m === 9 && h.d === 1)
      return { ar: "رمضان مبارك — كل عام وأنتم بخير 🌙", en: "Ramadan Mubarak 🌙" };
    if (h.m === 1 && h.d === 1)
      return { ar: "عام هجري جديد مبارك", en: "Happy Islamic New Year" };
  }
  return null;
}

function greetingFor(hour: number): { msg: Msg; Icon: typeof Sun } {
  if (hour < 12) return { msg: { ar: "صباح الخير", en: "Good morning" }, Icon: Sunrise };
  if (hour < 17) return { msg: { ar: "طاب يومك", en: "Good afternoon" }, Icon: Sun };
  return { msg: { ar: "مساء الخير", en: "Good evening" }, Icon: Moon };
}

export function DailyGreeting({ name }: { name?: string | null }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const { msg, Icon } = greetingFor(now.getHours());
  const occasion = getOccasion(now);
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const tip = SAFETY_TIPS[dayIndex % SAFETY_TIPS.length]!;

  return (
    <div className="space-y-3 print:hidden">
      <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
        <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="space-y-1">
          <div className="font-semibold">
            {ar ? msg.ar : msg.en}
            {name ? ` — ${name}` : ""}
          </div>
          <div className="text-sm text-muted-foreground">
            {now.toLocaleDateString(ar ? "ar-SA" : "en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
      </div>

      {occasion && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 flex items-center gap-3">
          <PartyPopper className="h-5 w-5 text-primary shrink-0" />
          <div className="font-semibold">{ar ? occasion.ar : occasion.en}</div>
        </div>
      )}

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            {ar ? "رسالة السلامة اليومية" : "Daily safety message"}
          </div>
          <div className="text-sm">{ar ? tip.ar : tip.en}</div>
        </div>
      </div>
    </div>
  );
}
