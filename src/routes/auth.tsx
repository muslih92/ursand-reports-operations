import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { empEmail } from "@/lib/utils";
import { toast } from "sonner";
import { Languages, Loader2 } from "lucide-react";
const logo = { url: "/wtco-logo.png" };
import { hasAnyAdmin, ensureFirstAdmin } from "@/lib/users.functions";
import { useServerFn } from "@tanstack/react-start";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { t, locale, setLocale, dir } = useI18n();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [empNo, setEmpNo] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [setupName, setSetupName] = useState("");

  const checkAdmin = useServerFn(hasAnyAdmin);
  const initFirst = useServerFn(ensureFirstAdmin);

  useEffect(() => {
    checkAdmin().then((r) => setNeedsSetup(!r.exists)).catch(() => setNeedsSetup(false));
  }, [checkAdmin]);

  useEffect(() => {
    if (!loading && user) navigate({ to: search.redirect ?? "/dashboard", replace: true });
  }, [user, loading, navigate, search.redirect]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empNo || !password) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: empEmail(empNo),
        password,
      });
      if (error) {
        toast.error(t("auth.invalid"));
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
    try {
      await initFirst({ data: { employee_no: empNo, full_name: setupName, password } });
      toast.success(locale === "ar" ? "تم إنشاء حساب المسؤول. يمكنك الدخول الآن" : "Admin created. You can sign in now");
      setNeedsSetup(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      dir={dir}
      style={{ background: "linear-gradient(135deg, oklch(0.95 0.02 210) 0%, oklch(0.9 0.06 200) 100%)" }}
    >
      <div className="absolute top-4 end-4">
        <button
          onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          className="flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-3 py-2 text-sm shadow hover:bg-white"
        >
          <Languages className="h-4 w-4" />
          {locale === "ar" ? "English" : "العربية"}
        </button>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={logo.url} alt="WTCO" className="mx-auto h-24 w-24 object-contain" />
          <h1 className="mt-3 text-2xl font-bold text-foreground">{t("app.name")}</h1>
          <p className="text-sm text-muted-foreground">{t("app.short")}</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-6 md:p-8">
          {needsSetup === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : needsSetup ? (
            <form onSubmit={onFirstSetup} className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold">{locale === "ar" ? "الإعداد الأولي" : "Initial Setup"}</h2>
                <p className="text-sm text-muted-foreground">{locale === "ar" ? "أنشئ حساب المسؤول الأول" : "Create the first admin account"}</p>
              </div>
              <Field label={locale === "ar" ? "الاسم الكامل" : "Full Name"} value={setupName} onChange={setSetupName} />
              <Field label={t("auth.employee_no")} value={empNo} onChange={setEmpNo} inputMode="numeric" />
              <Field label={t("auth.password")} value={password} onChange={setPassword} type="password" />
              <button disabled={submitting} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {locale === "ar" ? "إنشاء الحساب" : "Create Admin"}
              </button>
            </form>
          ) : (
            <form onSubmit={onSignIn} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold">{t("auth.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
              </div>
              <Field label={t("auth.employee_no")} value={empNo} onChange={setEmpNo} inputMode="numeric" autoFocus />
              <Field label={t("auth.password")} value={password} onChange={setPassword} type="password" />
              <button disabled={submitting} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg" style={{ background: "var(--gradient-brand)" }}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("auth.signin")}
              </button>
              <p className="text-xs text-center text-muted-foreground pt-2">{t("auth.contact_admin")}</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", inputMode, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoFocus={autoFocus}
        required
        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
