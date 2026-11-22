import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { empEmail } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  BadgeCheck,
  Eye,
  EyeOff,
  Gauge,
  IdCard,
  Languages,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
const logo = { url: "/wtco-logo.png" };
// Deeper than --gradient-brand so white text keeps at least 4.5:1 contrast.
const BRAND_GRADIENT = "linear-gradient(135deg, oklch(0.42 0.09 215) 0%, oklch(0.5 0.1 205) 100%)";
import { hasAnyAdmin, ensureFirstAdmin } from "@/lib/users.functions";
import { useServerFn } from "@tanstack/react-start";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { t, locale, setLocale, dir } = useI18n();
  const ar = locale === "ar";
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [empNo, setEmpNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [setupName, setSetupName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkAdmin = useServerFn(hasAnyAdmin);
  const initFirst = useServerFn(ensureFirstAdmin);

  useEffect(() => {
    checkAdmin()
      .then((r) => setNeedsSetup(!r.exists))
      .catch(() => setNeedsSetup(false));
  }, [checkAdmin]);

  useEffect(() => {
    if (!loading && user) {
      const r = search.redirect;
      const safe = r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard";
      navigate({ href: safe, replace: true });
    }
  }, [user, loading, navigate, search.redirect]);

  // Clear a stale error as soon as the user edits a field.
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (error) setError(null);
  };

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empNo || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: empEmail(empNo.trim()),
        password,
      });
      if (error) {
        setError(t("auth.invalid"));
      } else {
        toast.success(t("auth.signin"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onFirstSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empNo || !password || !setupName) return;
    setSubmitting(true);
    setError(null);
    try {
      await initFirst({ data: { employee_no: empNo, full_name: setupName, password } });
      toast.success(
        ar ? "تم إنشاء حساب المسؤول. يمكنك الدخول الآن" : "Admin created. You can sign in now",
      );
      setNeedsSetup(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const highlights: { icon: LucideIcon; text: string }[] = ar
    ? [
        { icon: Gauge, text: "قراءات المحطات وتقارير الورديات في مكان واحد" },
        { icon: BadgeCheck, text: "قوائم الفحص والملاحظات تصل للمشرف لحظيًا" },
        { icon: ShieldCheck, text: "صلاحيات حسب المحطة والدور" },
      ]
    : [
        { icon: Gauge, text: "Station readings and shift reports in one place" },
        { icon: BadgeCheck, text: "Checklists and notes reach supervisors live" },
        { icon: ShieldCheck, text: "Access scoped by station and role" },
      ];

  return (
    <div
      className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[1.1fr_1fr]"
      dir={dir}
    >
      {/* Brand panel: full height on desktop, compact header on mobile. */}
      <aside
        className="relative overflow-hidden px-6 pb-10 pt-6 text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{ background: BRAND_GRADIENT }}
      >
        <WaterPattern />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/95 shadow-sm">
              <img
                src={logo.url}
                alt="WTCO"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">{t("app.name")}</div>
              <div className="text-xs opacity-80">URS</div>
            </div>
          </div>
          <LangToggle ar={ar} onToggle={() => setLocale(ar ? "en" : "ar")} className="lg:hidden" />
        </div>

        <div className="relative mt-8 max-w-lg lg:mt-0">
          <h1 className="text-2xl font-bold leading-snug sm:text-3xl lg:text-4xl">
            {t("app.short")}
          </h1>
          <ul className="mt-6 hidden space-y-4 lg:block">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-base leading-relaxed opacity-95">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-8 hidden text-xs opacity-75 lg:block">
          © {new Date().getFullYear()} {t("app.name")}
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-col px-4 pb-10 sm:px-6 lg:justify-center lg:px-12">
        <div className="absolute end-6 top-6 hidden lg:block">
          <LangToggle ar={ar} onToggle={() => setLocale(ar ? "en" : "ar")} variant="outline" />
        </div>

        <div className="mx-auto -mt-6 w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-8 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {needsSetup === null ? (
            <div className="flex justify-center py-16" role="status" aria-live="polite">
              <Loader2
                className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden
              />
              <span className="sr-only">{ar ? "جاري التحميل" : "Loading"}</span>
            </div>
          ) : needsSetup ? (
            <form onSubmit={onFirstSetup} className="space-y-5" noValidate={false}>
              <FormHeader
                title={ar ? "الإعداد الأولي" : "Initial setup"}
                subtitle={
                  ar ? "أنشئ حساب المسؤول الأول للنظام" : "Create the system's first admin account"
                }
              />
              <Field
                icon={UserRound}
                label={ar ? "الاسم الكامل" : "Full name"}
                value={setupName}
                onChange={edit(setSetupName)}
                autoComplete="name"
                autoFocus
              />
              <Field
                icon={IdCard}
                label={t("auth.employee_no")}
                value={empNo}
                onChange={edit(setEmpNo)}
                inputMode="numeric"
                autoComplete="username"
              />
              <PasswordField
                label={t("auth.password")}
                value={password}
                onChange={edit(setPassword)}
                autoComplete="new-password"
                ar={ar}
              />
              <ErrorBox message={error} />
              <SubmitButton submitting={submitting}>
                {ar ? "إنشاء الحساب" : "Create admin"}
              </SubmitButton>
            </form>
          ) : (
            <form onSubmit={onSignIn} className="space-y-5">
              <FormHeader title={t("auth.title")} subtitle={t("auth.subtitle")} />
              <Field
                icon={IdCard}
                label={t("auth.employee_no")}
                value={empNo}
                onChange={edit(setEmpNo)}
                inputMode="numeric"
                autoFocus
                name="employee-number"
                autoComplete="username"
                invalid={!!error}
              />
              <PasswordField
                label={t("auth.password")}
                value={password}
                onChange={edit(setPassword)}
                name="password"
                autoComplete="current-password"
                invalid={!!error}
                ar={ar}
              />
              <ErrorBox message={error} />
              <SubmitButton submitting={submitting}>{t("auth.signin")}</SubmitButton>
              <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {t("auth.contact_admin")}
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function FormHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function LangToggle({
  ar,
  onToggle,
  className = "",
  variant = "glass",
}: {
  ar: boolean;
  onToggle: () => void;
  className?: string;
  variant?: "glass" | "outline";
}) {
  const style =
    variant === "glass"
      ? "bg-white/15 text-primary-foreground hover:bg-white/25 focus-visible:ring-white"
      : "border bg-card text-foreground hover:bg-accent focus-visible:ring-ring";
  return (
    <button
      type="button"
      onClick={onToggle}
      lang={ar ? "en" : "ar"}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${style} ${className}`}
    >
      <Languages className="h-4 w-4" aria-hidden />
      {ar ? "English" : "العربية"}
    </button>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" className="min-h-0">
      {message ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}

function SubmitButton({
  submitting,
  children,
}: {
  submitting: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={submitting}
      aria-busy={submitting}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold text-primary-foreground shadow-lg transition-[filter,transform] hover:brightness-110 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      style={{ background: BRAND_GRADIENT }}
    >
      {submitting && (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
      )}
      {children}
    </button>
  );
}

const inputBase =
  "h-12 w-full rounded-xl border bg-background ps-11 text-base transition-colors placeholder:text-muted-foreground focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40";

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoFocus,
  name,
  autoComplete,
  invalid,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoFocus?: boolean;
  name?: string;
  autoComplete?: React.HTMLInputAutoCompleteAttribute;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id={id}
          type={type}
          name={name}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          autoFocus={autoFocus}
          required
          aria-invalid={invalid || undefined}
          className={`${inputBase} pe-4 ${invalid ? "border-destructive" : "border-input"}`}
        />
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  name,
  autoComplete,
  invalid,
  ar,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  name?: string;
  autoComplete?: React.HTMLInputAutoCompleteAttribute;
  invalid?: boolean;
  ar: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <LockKeyhole
          className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id={id}
          type={show ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={onKey}
          onKeyDown={onKey}
          onBlur={() => setCapsLock(false)}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={capsLock ? `${id}-caps` : undefined}
          className={`${inputBase} pe-12 ${invalid ? "border-destructive" : "border-input"}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={
            show
              ? ar
                ? "إخفاء كلمة السر"
                : "Hide password"
              : ar
                ? "إظهار كلمة السر"
                : "Show password"
          }
          aria-pressed={show}
          className="absolute end-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {show ? (
            <EyeOff className="h-5 w-5" aria-hidden />
          ) : (
            <Eye className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
      {capsLock ? (
        <p id={`${id}-caps`} className="text-xs text-amber-700 dark:text-amber-400">
          {ar ? "زر الأحرف الكبيرة (Caps Lock) مفعّل" : "Caps Lock is on"}
        </p>
      ) : null}
    </div>
  );
}

/** Decorative wave lines for the brand panel. */
function WaterPattern() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-15"
      preserveAspectRatio="none"
      viewBox="0 0 400 400"
    >
      {Array.from({ length: 7 }, (_, i) => (
        <path
          key={i}
          d={`M0 ${250 + i * 22} C 100 ${220 + i * 22}, 200 ${290 + i * 22}, 400 ${245 + i * 22}`}
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        />
      ))}
      <circle cx="360" cy="40" r="90" fill="white" opacity="0.25" />
    </svg>
  );
}
