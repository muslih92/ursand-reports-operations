import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { ShieldAlert, Loader2 } from "lucide-react";

/** Renders children only for admins; everyone else sees an access-denied notice. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const { locale } = useI18n();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
        <h1 className="mt-4 text-xl font-bold">
          {locale === "ar" ? "غير مصرح بالدخول" : "Access denied"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {locale === "ar"
            ? "هذه الصفحة متاحة لمسؤول النظام فقط."
            : "This page is available to system administrators only."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
