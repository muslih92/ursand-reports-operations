import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useStationWatch } from "@/lib/station-watch";
import { cn } from "@/lib/utils";

interface Station { id: string; code: string; name_en: string; name_ar: string }

/** Lets admin / management narrow the whole app to a few stations they monitor. */
export function WatchStationsButton({ compact = false }: { compact?: boolean }) {
  const { isAdmin, hasRole } = useAuth();
  const { locale } = useI18n();
  const { watchIds, setWatchIds } = useStationWatch();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(watchIds);

  useEffect(() => { if (open) setDraft(watchIds); }, [open, watchIds]);

  const allowed = isAdmin || hasRole("management") || hasRole("viewer");

  const { data: stations = [] } = useQuery({
    queryKey: ["stations", "watch-picker"],
    enabled: allowed && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Station[];
    },
  });

  if (!allowed) return null;

  const label = locale === "ar" ? "محطات المراقبة" : "Monitored stations";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex items-center gap-2 rounded-lg text-sm transition",
          compact ? "p-2 hover:bg-accent" : "w-full px-3 py-2 hover:bg-sidebar-accent",
        )}
        title={label}
      >
        <Eye className="h-4 w-4" />
        {!compact && <span className="truncate flex-1 text-start">{label}</span>}
        {watchIds.length > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {watchIds.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold">{label}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {locale === "ar"
                ? "اختر المحطات التي تريد متابعتها. عند الاختيار سيقتصر النظام عليها فقط، ولإلغاء التخصيص امسح الاختيار."
                : "Pick the stations you want to follow. The whole app narrows to them; clear the selection to see all stations again."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1 max-h-72 overflow-y-auto rounded-lg border p-2">
              {stations.map((s) => {
                const checked = draft.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setDraft(e.target.checked ? [...draft, s.id] : draft.filter((x) => x !== s.id))
                      }
                    />
                    <span className="truncate">{locale === "ar" ? s.name_ar : s.name_en}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setWatchIds([]); setOpen(false); }} className="px-3 py-2 rounded-lg border text-sm hover:bg-accent">
                {locale === "ar" ? "كل المحطات" : "All stations"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg border text-sm hover:bg-accent">
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => { setWatchIds(draft); setOpen(false); }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
              >
                {locale === "ar" ? "حفظ" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
