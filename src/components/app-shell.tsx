import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ClipboardList, AlertTriangle, Building2, FileText, Users, LogOut, Languages, FileSpreadsheet, Activity } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import logo from "@/assets/wtco-logo.png.asset.json";
import type { ReactNode } from "react";

interface NavItem { to: string; icon: React.ComponentType<{ className?: string }>; key: string; adminOnly?: boolean; }
const NAV: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { to: "/readings", icon: ClipboardList, key: "nav.readings" },
  { to: "/availability", icon: Activity, key: "nav.availability" },
  { to: "/incidents", icon: AlertTriangle, key: "nav.incidents" },
  { to: "/reports", icon: FileText, key: "nav.reports" },
  { to: "/stations", icon: Building2, key: "nav.stations", adminOnly: true },
  { to: "/templates", icon: FileSpreadsheet, key: "nav.templates", adminOnly: true },
  { to: "/users", icon: Users, key: "nav.users", adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut, roles } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const roleLabel = roles[0] ? t(`role.${roles[0]}`) : "";

  return (
    <div className="min-h-screen bg-background flex" dir={dir}>
      <aside className="hidden md:flex w-64 flex-col border-e bg-sidebar text-sidebar-foreground sticky top-0 h-screen self-start">
        <div className="p-5 flex items-center gap-3 border-b">
          <img src={logo.url} alt="WTCO" className="h-10 w-10 object-contain" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{t("app.name")}</div>
            <div className="text-xs text-muted-foreground truncate">{t("app.short")}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(n.key)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-2">
          <button
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent transition"
          >
            <Languages className="h-4 w-4" />
            <span>{locale === "ar" ? "English" : "العربية"}</span>
          </button>
          <div className="rounded-lg bg-sidebar-accent/50 p-3">
            <div className="text-sm font-medium truncate">{profile?.full_name}</div>
            <div className="text-xs text-muted-foreground">#{profile?.employee_no} · {roleLabel}</div>
          </div>
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>{t("nav.signout")}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b bg-card">
          <img src={logo.url} alt="WTCO" className="h-8 w-8" />
          <div className="flex-1 font-semibold text-sm truncate">{t("app.name")}</div>
          <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className="p-2 rounded hover:bg-accent">
            <Languages className="h-4 w-4" />
          </button>
          <button onClick={() => void signOut()} className="p-2 rounded hover:bg-accent text-destructive">
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-auto pb-24 md:pb-8">{children}</main>
        <nav className="md:hidden sticky bottom-0 z-40 flex justify-around border-t bg-card p-2">

          {items.slice(0, 5).map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-1 p-2 rounded text-xs", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="h-5 w-5" />
                <span>{t(n.key)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
