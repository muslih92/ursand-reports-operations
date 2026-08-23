import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useNotifications, useNotificationActions } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useNotifications();
  const { markRead, markAllRead } = useNotificationActions();
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex items-center gap-2 rounded-lg text-sm transition",
          compact ? "p-2 hover:bg-accent" : "w-full px-3 py-2 hover:bg-sidebar-accent",
        )}
      >
        <Bell className="h-4 w-4" />
        {!compact && <span>{locale === "ar" ? "الإشعارات" : "Notifications"}</span>}
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 end-0 w-[320px] max-h-[420px] overflow-auto rounded-xl border bg-card shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">
                {locale === "ar" ? "الإشعارات" : "Notifications"}
              </span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  className="inline-flex items-center gap-1 text-xs text-primary"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {locale === "ar" ? "تحديد الكل كمقروء" : "Mark all read"}
                </button>
              )}
            </div>
            {items.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {locale === "ar" ? "لا توجد إشعارات" : "No notifications"}
              </div>
            )}
            <ul className="divide-y">
              {items.map((n) => {
                const inner = (
                  <div className={cn("px-3 py-2.5", !n.read && "bg-primary/5")}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-snug">{n.title}</div>
                        {n.body && (
                          <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                            {n.body}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-1" dir="ltr">
                          {new Date(n.created_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")}
                        </div>
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => { if (!n.read) markRead.mutate(n.id); }}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => setOpen(false)} className="block hover:bg-accent">
                        {inner}
                      </Link>
                    ) : (
                      <div className="hover:bg-accent cursor-default">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
