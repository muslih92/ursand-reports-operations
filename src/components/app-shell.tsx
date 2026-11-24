import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  Building2,
  FileText,
  Users,
  LogOut,
  Languages,
  FileSpreadsheet,
  Activity,
  Flame,
  Zap,
  ClipboardCheck,
  TrendingUp,
  MessageSquare,
  Radio,
  ShieldCheck,
  BarChart3,
  ShieldAlert,
  ListChecks,
  AlertOctagon,
  Trash2,
  MonitorCheck,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
const logo = { url: "/wtco-logo.png" };
import { useEffect, useState, type ReactNode } from "react";
import { ChangePasswordButton } from "@/components/change-password-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { WatchStationsButton } from "@/components/watch-stations-dialog";
import { useNotifications } from "@/lib/notifications";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type NavGroup = "ops" | "tests" | "insights" | "admin";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  key: string;
  group: NavGroup;
  adminOnly?: boolean;
  hideForOperator?: boolean;
  hideForManagement?: boolean;
}
const NAV: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard", group: "ops" },
  {
    to: "/station-status",
    icon: MonitorCheck,
    key: "nav.stationStatus",
    group: "ops",
    hideForOperator: true,
  },
  { to: "/readings", icon: ClipboardList, key: "nav.readings", group: "ops" },
  { to: "/availability", icon: Activity, key: "nav.availability", group: "ops" },
  { to: "/reports", icon: FileText, key: "nav.reports", group: "ops" },
  { to: "/checklist", icon: ListChecks, key: "nav.checklist", group: "ops" },
  { to: "/station-notes", icon: AlertOctagon, key: "nav.stationNotes", group: "ops" },
  {
    to: "/routine",
    icon: ClipboardCheck,
    key: "nav.routine",
    group: "tests",
    hideForOperator: true,
  },
  { to: "/defeat", icon: ShieldAlert, key: "nav.defeat", group: "tests" },
  { to: "/firepump", icon: Flame, key: "nav.firepump", group: "tests" },
  { to: "/generator", icon: Zap, key: "nav.generator", group: "tests" },
  {
    to: "/incidents",
    icon: AlertTriangle,
    key: "nav.incidents",
    group: "tests",
    hideForOperator: true,
  },
  { to: "/trends", icon: TrendingUp, key: "nav.trends", group: "insights" },
  {
    to: "/control-center",
    icon: Radio,
    key: "nav.controlCenter",
    group: "insights",
    hideForOperator: true,
  },
  { to: "/powerbi", icon: BarChart3, key: "nav.powerbi", group: "insights", hideForOperator: true },
  {
    to: "/messages",
    icon: MessageSquare,
    key: "nav.messages",
    group: "insights",
    hideForOperator: true,
  },
  { to: "/stations", icon: Building2, key: "nav.stations", group: "admin", adminOnly: true },
  {
    to: "/templates",
    icon: FileSpreadsheet,
    key: "nav.templates",
    group: "admin",
    adminOnly: true,
  },
  {
    to: "/users",
    icon: Users,
    key: "nav.users",
    group: "admin",
    adminOnly: true,
    hideForManagement: true,
  },
  {
    to: "/audit",
    icon: ShieldCheck,
    key: "nav.audit",
    group: "admin",
    adminOnly: true,
    hideForManagement: true,
  },
  { to: "/trash", icon: Trash2, key: "nav.trash", group: "admin" },
];
const GROUPS: NavGroup[] = ["ops", "tests", "insights", "admin"];

/** Shown in the phone bottom bar (first four the user can open); everything else is under "More". */
const MOBILE_PRIMARY = ["/dashboard", "/station-status", "/readings", "/reports", "/checklist"];

const isActive = (pathname: string, to: string) => pathname === to || pathname.startsWith(to + "/");

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut, roles } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: notifications = [] } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const unreadMessages = notifications.filter(
    (n) => !n.read && (n.kind === "message_new" || n.kind === "message_reply"),
  ).length;

  // Close the phone menu after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  const isManagement = !isAdmin && (roles.includes("management") || roles.includes("supervisor"));
  const isOperator = !isAdmin && !isManagement && roles.includes("operator");
  const items = NAV.filter(
    (n) =>
      (!n.adminOnly || isAdmin) &&
      !(isOperator && n.hideForOperator) &&
      !(isManagement && n.hideForManagement),
  );
  const roleLabel = roles[0] ? t(`role.${roles[0]}`) : "";
  const initials =
    (profile?.full_name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "؟";
  const primary = MOBILE_PRIMARY.map((to) => items.find((n) => n.to === to))
    .filter(Boolean)
    .slice(0, 4) as NavItem[];
  const moreActive = !primary.some((n) => isActive(pathname, n.to));
  const toggleLocale = () => setLocale(locale === "ar" ? "en" : "ar");

  const navList = (variant: "sidebar" | "sheet") => (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const groupItems = items.filter((n) => n.group === g);
        if (groupItems.length === 0) return null;
        return (
          <div key={g}>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`nav.group.${g}`)}
            </div>
            <div className="space-y-0.5">
              {groupItems.map((n) => {
                const Icon = n.icon;
                const active = isActive(pathname, n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      variant === "sheet" ? "min-h-11" : "min-h-9 py-1.5",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1">{t(n.key)}</span>
                    {n.to === "/messages" && <CountBadge count={unreadMessages} />}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-2.5">
      <div
        aria-hidden
        className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{profile?.full_name}</div>
        <div className="text-xs text-muted-foreground truncate">
          #{profile?.employee_no} · {roleLabel}
        </div>
      </div>
    </div>
  );

  const isDark = theme === "dark";
  const themeLabel = t(isDark ? "nav.theme.toLight" : "nav.theme.toDark");

  const iconButton =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      className="min-h-screen bg-background flex print:block print:min-h-0 print:bg-white"
      dir={dir}
    >
      <aside className="hidden md:flex print:!hidden w-64 flex-col border-e bg-sidebar text-sidebar-foreground sticky top-0 h-screen self-start">
        <div className="px-4 py-4 flex items-center gap-3 border-b">
          <img src={logo.url} alt="WTCO" className="h-10 w-10 object-contain dark:rounded-lg dark:bg-white dark:p-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{t("app.name")}</div>
            <div className="text-xs text-muted-foreground truncate">{t("app.short")}</div>
          </div>
        </div>
        <nav aria-label={t("nav.menu")} className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
          {navList("sidebar")}
        </nav>
        <div className="shrink-0 p-3 border-t space-y-2 bg-sidebar">
          <NotificationBell />
          {userCard}
          <div className="flex items-center justify-between">
            <WatchStationsButton compact />
            <button
              type="button"
              onClick={toggleLocale}
              className={iconButton}
              title={t("nav.language")}
              aria-label={t("nav.language")}
            >
              <Languages className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className={iconButton}
              title={themeLabel}
              aria-label={themeLabel}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <ChangePasswordButton compact />
            <button
              type="button"
              onClick={() => void signOut()}
              className={cn(iconButton, "text-destructive hover:bg-destructive/10")}
              title={t("nav.signout")}
              aria-label={t("nav.signout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden print:hidden sticky top-0 z-40 flex items-center gap-2 px-3 py-2 border-b bg-card/95 backdrop-blur">
          <img src={logo.url} alt="WTCO" className="h-8 w-8 object-contain dark:rounded-lg dark:bg-white dark:p-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{t("app.name")}</div>
            <div className="text-[11px] text-muted-foreground truncate">{t("app.short")}</div>
          </div>
          <NotificationBell compact />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={iconButton}
            aria-label={t("nav.menu")}
            title={t("nav.menu")}
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-auto pb-24 md:pb-8 print:p-0 print:overflow-visible">
          {children}
        </main>
        <nav
          aria-label={t("nav.menu")}
          className="md:hidden print:hidden sticky bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 backdrop-blur px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        >
          {primary.map((n) => {
            const Icon = n.icon;
            const active = isActive(pathname, n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] text-center transition-colors",
                  active ? "text-primary font-semibold" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="leading-tight line-clamp-1">{t(n.key)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] transition-colors",
              moreActive ? "text-primary font-semibold" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "relative flex h-7 w-12 items-center justify-center rounded-full",
                moreActive && "bg-primary/10",
              )}
            >
              <Menu className="h-5 w-5" />
              <CountBadge count={unreadMessages} className="absolute -top-1 end-1" />
            </span>
            <span className="leading-tight">{t("nav.more")}</span>
          </button>
        </nav>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          dir={dir}
          className="md:hidden flex w-[85vw] max-w-sm flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground"
        >
          <div className="flex items-center gap-3 border-b px-4 py-4 pe-12">
            <img src={logo.url} alt="" className="h-9 w-9 object-contain dark:rounded-lg dark:bg-white dark:p-0.5" />
            <SheetTitle className="text-sm font-bold">{t("app.name")}</SheetTitle>
          </div>
          <nav aria-label={t("nav.menu")} className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
            {navList("sheet")}
          </nav>
          <div className="shrink-0 space-y-1 border-t p-3">
            {userCard}
            <WatchStationsButton />
            <button
              type="button"
              onClick={toggleLocale}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent transition"
            >
              <Languages className="h-4 w-4" />
              <span>{t("nav.language")}</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent transition"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{themeLabel}</span>
            </button>
            <ChangePasswordButton />
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("nav.signout")}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
