import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { notifyStation } from "@/lib/notifications";
import { toast } from "sonner";
import { MessageSquare, Send, Reply } from "lucide-react";

export const Route = createFileRoute("/_app/messages")({
  head: () => ({
    meta: [
      { title: "Station Communication | WTCO" },
      {
        name: "description",
        content:
          "Management requests and station replies: ask for reports, follow up on faults and get notified on every answer.",
      },
      { property: "og:title", content: "Station Communication" },
      {
        property: "og:description",
        content: "Two-way messaging between management and station supervisors with instant in-app notifications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesPage,
});

const sb = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

interface Recipient {
  user_id: string;
  full_name: string;
  employee_no: string;
  role: string;
  station_id: string | null;
}

interface Msg {
  id: string;
  station_id: string;
  parent_id: string | null;
  subject: string | null;
  body: string;
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
}

function MessagesPage() {
  const { locale, dir } = useI18n();
  const { profile, isAdmin, hasRole } = useAuth();
  const { data: stations = [] } = useScopedStations();
  const { scopedStationId, canPickStation } = useStationScope();
  const qc = useQueryClient();

  const isManagement = isAdmin || hasRole("management");
  const isSupervisor = hasRole("supervisor");
  const [stationId, setStationId] = useState<string>(scopedStationId ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  type Audience = "all" | "management" | "supervisors" | "operators";
  const [audience, setAudience] = useState<Audience>(
    isManagement ? "all" : isSupervisor ? "operators" : "management",
  );
  const audienceRoles: Record<Audience, string[]> = {
    all: ["admin", "management", "supervisor", "operator"],
    management: ["admin", "management"],
    supervisors: ["admin", "management", "supervisor"],
    operators: ["supervisor", "operator"],
  };
  const audienceLabel: Record<Audience, string> = {
    all: locale === "ar" ? "الجميع" : "Everyone",
    management: locale === "ar" ? "الإدارة" : "Management",
    supervisors: locale === "ar" ? "المشرفين" : "Supervisors",
    operators: locale === "ar" ? "المشغلين" : "Operators",
  };

  const effectiveStation = canPickStation ? stationId : (scopedStationId ?? "");

  // Extra stations allowed to view/reply to the thread, and named recipients.
  const [shareStations, setShareStations] = useState<string[]>([]);
  const [targetUsers, setTargetUsers] = useState<string[]>([]);
  const canTarget = isManagement || isSupervisor;

  const stationMap = useMemo(
    () => Object.fromEntries(stations.map((s) => [s.id, s])),
    [stations],
  );

  const { data: recipients = [] } = useQuery({
    queryKey: ["message-recipients"],
    enabled: canTarget,
    queryFn: async (): Promise<Recipient[]> => {
      const { data, error } = await sb.rpc("list_message_recipients");
      if (error) throw error;
      return (data ?? []) as Recipient[];
    },
  });

  const eligibleRecipients = useMemo(() => {
    const wanted =
      audience === "operators" ? ["operator"]
      : audience === "supervisors" ? ["supervisor"]
      : audience === "management" ? ["management", "admin"]
      : ["operator", "supervisor", "management", "admin"];
    const allowedStations = new Set([effectiveStation, ...shareStations].filter(Boolean));
    return recipients.filter(
      (r) =>
        wanted.includes(r.role) &&
        (allowedStations.size === 0 || !r.station_id || allowedStations.has(r.station_id)),
    );
  }, [recipients, audience, effectiveStation, shareStations]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["station-messages", stationId || "all"],
    queryFn: async (): Promise<Msg[]> => {
      let q = sb.from("station_messages").select("*").order("created_at", { ascending: false }).limit(200);
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  const threads = useMemo(() => {
    const roots = messages.filter((m) => !m.parent_id);
    const byParent: Record<string, Msg[]> = {};
    for (const m of messages) {
      if (!m.parent_id) continue;
      (byParent[m.parent_id] ??= []).push(m);
    }
    for (const k of Object.keys(byParent)) {
      byParent[k].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return roots.map((r) => ({ root: r, replies: byParent[r.id] ?? [] }));
  }, [messages]);

  const roleLabel = isAdmin ? "admin" : hasRole("management") ? "management" : hasRole("supervisor") ? "supervisor" : "operator";

  const post = useMutation({
    mutationFn: async (input: {
      stationId: string;
      body: string;
      subject?: string;
      parentId?: string | null;
      audience?: Audience;
      shareStations?: string[];
      targetUsers?: string[];
    }) => {
      const isReply = !!input.parentId;
      const target = input.audience ?? "all";
      const extraStations = input.shareStations ?? [];
      const named = input.targetUsers ?? [];

      const { error } = await sb.from("station_messages").insert({
        station_id: input.stationId,
        parent_id: input.parentId ?? null,
        subject: input.subject || null,
        body: input.body,
        author_id: profile?.id ?? null,
        author_name: profile?.full_name ?? null,
        author_role: roleLabel,
        // Replies inherit the parent's targeting on the database side.
        audience_roles: isReply ? null : audienceRoles[target],
        target_station_ids: isReply ? null : [input.stationId, ...extraStations],
        target_user_ids: isReply || named.length === 0 ? null : named,
      });
      if (error) throw error;

      const st = stationMap[input.stationId];
      const stName = st ? (locale === "ar" ? st.name_ar : st.name_en) : "";
      const title = isReply
        ? locale === "ar"
          ? `رد جديد من ${profile?.full_name ?? ""} — ${stName}`
          : `New reply from ${profile?.full_name ?? ""} — ${stName}`
        : locale === "ar"
          ? `رسالة جديدة إلى ${audienceLabel[target]} — ${stName}`
          : `New message to ${audienceLabel[target]} — ${stName}`;
      const notifBody = (input.subject ? `${input.subject}\n` : "") + input.body.slice(0, 220);

      if (!isReply && named.length > 0) {
        await notifyUsers({
          userIds: named,
          stationId: input.stationId,
          kind: "message_new",
          title,
          body: notifBody,
          link: "/messages",
        });
      } else if (!isReply && extraStations.length > 0) {
        await notifyStations({
          stationIds: [input.stationId, ...extraStations],
          kind: "message_new",
          title,
          body: notifBody,
          link: "/messages",
          roles: audienceRoles[target],
        });
      } else {
        await notifyStation({
          stationId: input.stationId,
          kind: isReply ? "message_reply" : "message_new",
          title,
          body: notifBody,
          link: "/messages",
          roles: audienceRoles[target],
        });
      }
    },

    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الإرسال" : "Sent");
      setSubject("");
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      setShareStations([]);
      setTargetUsers([]);
      qc.invalidateQueries({ queryKey: ["station-messages"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-5" dir={dir}>
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">
            {locale === "ar" ? "التواصل مع المحطات" : "Station Communication"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "ar"
              ? "طلبات الإدارة واستفسارات الأعطال وردود المشرفين مع إشعار فوري لكل طرف"
              : "Management requests, fault enquiries and supervisor replies with instant notifications"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{locale === "ar" ? "المحطة" : "Station"}</label>
            <select
              value={effectiveStation}
              disabled={!canPickStation}
              onChange={(e) => setStationId(e.target.value)}
              className="h-10 px-3 rounded-lg border bg-background text-sm disabled:opacity-60"
            >
              <option value="">{locale === "ar" ? "— اختر المحطة —" : "— Select station —"}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {locale === "ar" ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{locale === "ar" ? "إرسال إلى" : "Send to"}</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="h-10 px-3 rounded-lg border bg-background text-sm"
            >
              {(isManagement
                ? (["all", "supervisors", "operators"] as Audience[])
                : isSupervisor
                  ? (["operators", "management", "all"] as Audience[])
                  : (["management", "supervisors"] as Audience[])
              ).map((a) => (
                <option key={a} value={a}>
                  {audienceLabel[a]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">{locale === "ar" ? "الموضوع" : "Subject"}</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={locale === "ar" ? "مثال: طلب تقرير أو استفسار عن عطل" : "e.g. report request or fault enquiry"}
              className="h-10 px-3 rounded-lg border bg-background text-sm"
            />
          </div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={locale === "ar" ? "اكتب الرسالة…" : "Write your message…"}
          className="w-full p-3 rounded-lg border bg-background text-sm"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!effectiveStation || !body.trim() || post.isPending}
            onClick={() => post.mutate({ stationId: effectiveStation, body: body.trim(), subject, audience })}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {locale === "ar" ? `إرسال إلى ${audienceLabel[audience]}` : `Send to ${audienceLabel[audience]}`}
          </button>
        </div>

      </div>

      {isLoading && <div className="text-sm text-muted-foreground">{locale === "ar" ? "جارٍ التحميل…" : "Loading…"}</div>}

      <div className="space-y-3">
        {threads.map(({ root, replies }) => {
          const st = stationMap[root.station_id];
          return (
            <div key={root.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                  {st ? st.code : ""}
                </span>
                <span className="font-medium text-foreground">{root.author_name}</span>
                <span>· {root.author_role}</span>
                <span dir="ltr">· {new Date(root.created_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")}</span>
              </div>
              {root.subject && <div className="font-semibold text-sm">{root.subject}</div>}
              <div className="text-sm whitespace-pre-line">{root.body}</div>

              {replies.length > 0 && (
                <div className="space-y-2 ps-4 border-s">
                  {replies.map((r) => (
                    <div key={r.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{r.author_name}</span> · {r.author_role} ·{" "}
                        <span dir="ltr">{new Date(r.created_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")}</span>
                      </div>
                      <div className="text-sm mt-1 whitespace-pre-line">{r.body}</div>
                    </div>
                  ))}
                </div>
              )}

              {replyTo === root.id ? (
                <div className="space-y-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={2}
                    className="w-full p-3 rounded-lg border bg-background text-sm"
                    placeholder={locale === "ar" ? "اكتب الرد…" : "Write a reply…"}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setReplyTo(null); setReplyBody(""); }}
                      className="px-3 h-9 rounded-lg border text-sm"
                    >
                      {locale === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="button"
                      disabled={!replyBody.trim() || post.isPending}
                      onClick={() =>
                        post.mutate({
                          stationId: root.station_id,
                          body: replyBody.trim(),
                          subject: root.subject ?? undefined,
                          parentId: root.id,
                          audience: "all",
                        })

                      }
                      className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {locale === "ar" ? "إرسال الرد" : "Send reply"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyTo(root.id)}
                  className="inline-flex items-center gap-2 text-xs text-primary"
                >
                  <Reply className="h-3.5 w-3.5" />
                  {locale === "ar" ? "رد" : "Reply"}
                </button>
              )}
            </div>
          );
        })}
        {!isLoading && threads.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {locale === "ar" ? "لا توجد رسائل بعد" : "No messages yet"}
          </div>
        )}
      </div>
    </div>
  );
}
