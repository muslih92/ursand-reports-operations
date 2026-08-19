import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PartyPopper, ShieldCheck, Sun, Sunrise, Moon } from "lucide-react";

interface Msg {
  ar: string;
  en: string;
}

/* ----------------------- الرسائل ----------------------- */

const SAFETY_TIPS: Msg[] = [
  { ar: "سلامتك أولاً؛ لا تبدأ أي عمل قبل التأكد من فهم المخاطر وطريقة العمل الآمنة.", en: "Your safety first — never start a job before understanding the hazards and the safe method." },
  { ar: "استخدم معدات الوقاية الشخصية المناسبة لطبيعة العمل، ولا تعتبرها خيارًا.", en: "Use the PPE suited to the job; it is not optional." },
  { ar: "لا تتعامل مع أي معدة قبل التأكد من أنها معزولة وآمنة للعمل عليها.", en: "Do not touch any equipment before confirming it is isolated and safe to work on." },
  { ar: "إذا شككت في سلامة أي إجراء، توقف واسأل قبل أن تبدأ.", en: "If you doubt the safety of any step, stop and ask before you start." },
  { ar: "حافظ على موقع العمل مرتبًا؛ الفوضى قد تسبب حادثًا بسيطًا بنتائج كبيرة.", en: "Keep the worksite tidy; clutter can cause a small incident with big consequences." },
  { ar: "لا تقف بالقرب من الأجزاء المتحركة للمعدات أثناء تشغيلها.", en: "Never stand near moving parts while equipment is running." },
  { ar: "تأكد دائمًا من حالة الصمامات والمعدات قبل التشغيل، ولا تعتمد على الافتراض.", en: "Always verify valve and equipment status before start-up — never assume." },
  { ar: "لا تتجاوز أي إجراء سلامة لتوفير الوقت؛ دقيقة تأخير أفضل من حادث.", en: "Never skip a safety step to save time; a minute's delay beats an incident." },
  { ar: "أبلغ عن أي تسريب أو خلل أو خطر تلاحظه فورًا، حتى لو بدا بسيطًا.", en: "Report any leak, defect or hazard immediately, however minor it looks." },
  { ar: "لا تستخدم معدة أو أداة إذا كانت حالتها غير آمنة أو بها عطل.", en: "Do not use any tool or equipment that is unsafe or defective." },
  { ar: "قبل بدء العمل، تأكد من وجود التصريح المطلوب وفهم جميع شروطه.", en: "Before starting, make sure the required permit exists and all its conditions are understood." },
  { ar: "لا تعتمد على الذاكرة فقط؛ اتبع الإجراءات والتعليمات المعتمدة في كل عملية.", en: "Do not rely on memory; follow the approved procedures every time." },
  { ar: "انتبه لمحيطك أثناء الحركة داخل الموقع، خصوصًا بالقرب من المركبات والمعدات الثقيلة.", en: "Watch your surroundings while moving on site, especially near vehicles and heavy equipment." },
  { ar: "التواصل الواضح بين أفراد الفريق جزء أساسي من السلامة.", en: "Clear communication within the team is a core part of safety." },
  { ar: "لا تبدأ أي عمل صيانة قبل التأكد من عزل جميع مصادر الطاقة.", en: "Do not begin maintenance before all energy sources are isolated." },
  { ar: "الضغط والطاقة المخزنة قد تكون غير مرئية؛ تعامل معها دائمًا على أنها خطر محتمل.", en: "Pressure and stored energy may be invisible — always treat them as a hazard." },
  { ar: "لا تقترب من أي خط أو معدة تحت الضغط قبل التأكد من عزلها وتفريغ الضغط.", en: "Stay clear of pressurised lines or equipment until isolated and depressurised." },
  { ar: "إذا رأيت تصرفًا غير آمن، نبّه زميلك بطريقة محترمة؛ السلامة مسؤولية الجميع.", en: "If you see an unsafe act, respectfully warn your colleague; safety is everyone's duty." },
  { ar: "لا تستخدم الهاتف أثناء القيادة أو تشغيل المعدات؛ انتباهك قد يمنع حادثًا.", en: "No phone while driving or operating equipment; your attention can prevent an incident." },
  { ar: "خذ وقتك في صعود ونزول السلالم والممرات، واستخدم الدرابزين عند الحاجة.", en: "Take your time on stairs and walkways, and use the handrail." },
  { ar: "احرص على شرب الماء وأخذ فترات الراحة المناسبة، خصوصًا أثناء العمل في الأجواء الحارة.", en: "Drink water and take proper breaks, especially in hot conditions." },
  { ar: "لا تدخل مكانًا مغلقًا أو محدود التهوية قبل التأكد من متطلبات السلامة والتصريح والفحص اللازم.", en: "Do not enter a confined or poorly ventilated space without the permit, checks and safety requirements." },
  { ar: "لا تتجاهل الإنذارات أو إشارات التحذير؛ كل إنذار له سبب ويجب التعامل معه بجدية.", en: "Never ignore alarms or warning signs; every alarm has a reason." },
  { ar: "قبل تشغيل أي معدة، تأكد من عدم وجود أشخاص في منطقة الخطر.", en: "Before starting any equipment, confirm nobody is in the danger zone." },
  { ar: "إذا حدثت حالة طارئة، حافظ على هدوئك واتبع خطة الطوارئ والتعليمات المعتمدة.", en: "In an emergency, stay calm and follow the emergency plan and instructions." },
  { ar: "تعلم من الأخطاء والحوادث السابقة؛ أفضل حادث هو الذي لا يتكرر.", en: "Learn from past mistakes and incidents; the best incident is the one never repeated." },
  { ar: "لا تتردد في إيقاف العمل إذا لاحظت خطرًا مباشرًا؛ إيقاف العمل الآمن قرار صحيح.", en: "Do not hesitate to stop work on seeing an immediate hazard; stopping work is the right call." },
  { ar: "قبل مغادرة موقع العمل، تأكد من ترك المكان في حالة آمنة ومرتبة.", en: "Before leaving the worksite, leave it safe and tidy." },
  { ar: "السلامة ليست مسؤولية قسم السلامة فقط؛ كل شخص في الموقع مسؤول عن سلامته وسلامة زملائه.", en: "Safety is not only the safety department's job; everyone is responsible for themselves and their colleagues." },
  { ar: "ارجع إلى منزلك بنفس الحالة التي حضرت بها؛ الهدف من العمل أن ننجز المهمة ونعود سالمين.", en: "Go home the same way you came; the goal is to finish the job and return safely." },
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
  const tip = SAFETY_TIPS[(now.getDate() - 1) % SAFETY_TIPS.length]!;

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
