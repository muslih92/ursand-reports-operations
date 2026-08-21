import { useState } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { empEmail } from "@/lib/utils";

export function ChangePasswordButton({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const label = locale === "ar" ? "تغيير كلمة المرور" : "Change password";

  return (
    <>
      {compact ? (
        <button onClick={() => setOpen(true)} className="p-2 rounded hover:bg-accent" title={label}>
          <KeyRound className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent transition"
        >
          <KeyRound className="h-4 w-4" />
          <span>{label}</span>
        </button>
      )}
      {open && <ChangePasswordDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { locale, dir } = useI18n();
  const { profile } = useAuth();
  const ar = locale === "ar";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error(ar ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }
    if (next.trim() !== next || next.length < 6) {
      toast.error(ar ? "كلمة المرور قصيرة أو تحتوي مسافات" : "Password too short or has spaces");
      return;
    }
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: empEmail(profile?.employee_no ?? ""),
        password: current,
      });
      if (signErr) {
        toast.error(ar ? "كلمة المرور الحالية غير صحيحة" : "Current password is incorrect");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(ar ? "تم تغيير كلمة المرور" : "Password changed");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir={dir}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-card border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{ar ? "تغيير كلمة المرور" : "Change password"}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <PwField label={ar ? "كلمة المرور الحالية" : "Current password"} value={current} onChange={setCurrent} autoComplete="current-password" />
        <PwField label={ar ? "كلمة المرور الجديدة" : "New password"} value={next} onChange={setNext} autoComplete="new-password" />
        <PwField label={ar ? "تأكيد كلمة المرور" : "Confirm password"} value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <button
          disabled={busy}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {ar ? "حفظ" : "Save"}
        </button>
        <p className="text-xs text-muted-foreground text-center">
          {ar ? "إذا نسيت كلمة المرور تواصل مع المسؤول لإعادة تعيينها." : "Forgot it? Ask an admin to reset it."}
        </p>
      </form>
    </div>
  );
}

function PwField({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void;
  autoComplete: React.HTMLInputAutoCompleteAttribute;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required
        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
