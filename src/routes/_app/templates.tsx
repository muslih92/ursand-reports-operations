import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { AdminOnly } from "@/components/admin-only";
import { supabase } from "@/integrations/supabase/client";

const logo = { url: "/wtco-logo.png" };

type Template = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  station_id: string | null;
  time_slots: string[];
  active: boolean;
};
type Section = { id: string; template_id: string; name_en: string; name_ar: string | null; sort_order: number };
type Field = {
  id: string;
  template_id: string;
  section_id: string | null;
  label_en: string;
  label_ar: string | null;
  unit: string | null;
  sort_order: number;
};

export const Route = createFileRoute("/_app/templates")({
  component: () => (
    <AdminOnly>
      <TemplatesPage />
    </AdminOnly>
  ),
});

function TemplatesPage() {
  const { locale, dir } = useI18n();
  const ar = locale === "ar";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  const { data: stations } = useQuery({
    queryKey: ["stations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("id, code, name_ar").order("code");
      if (error) throw error;
      return data as { id: string; code: string; name_ar: string | null }[];
    },
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", "admin-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_templates")
        .select("id, code, name_en, name_ar, station_id, time_slots, active")
        .order("code");
      if (error) throw error;
      return data as Template[];
    },
  });

  const stationCode = (id: string | null) =>
    (stations ?? []).find((s) => s.id === id)?.code ?? (ar ? "عام" : "Global");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates ?? [];
    return (templates ?? []).filter((t) =>
      [t.code, t.name_en, t.name_ar, stationCode(t.station_id)].join(" ").toLowerCase().includes(q),
    );
  }, [templates, search, stations, ar]);

  const selected = (templates ?? []).find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-4" dir={dir}>
      {/* Header with company logo */}
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <img src={logo.url} alt="WTCO" className="h-12 w-12 object-contain" />
        <div>
          <h1 className="text-xl font-bold">{ar ? "قوالب القراءات" : "Reading Templates"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "بناء وتوحيد قوالب القراءات لجميع المحطات"
              : "Build and unify reading templates across all stations"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Templates list */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b p-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={ar ? "بحث عن قالب أو محطة" : "Search template or station"}
              className="h-8 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`block w-full border-b px-3 py-2 text-start text-sm hover:bg-accent ${
                  t.id === selectedId ? "bg-accent font-semibold" : ""
                }`}
              >
                <div className="truncate">{ar ? t.name_ar : t.name_en}</div>
                <div className="text-xs text-muted-foreground">
                  {stationCode(t.station_id)} · {t.code}
                  {!t.active && ` · ${ar ? "غير مفعّل" : "inactive"}`}
                </div>
              </button>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {ar ? "لا توجد قوالب" : "No templates"}
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        {selected ? (
          <TemplateEditor
            key={selected.id}
            template={selected}
            templates={templates ?? []}
            stationCode={stationCode}
            onChanged={() => qc.invalidateQueries({ queryKey: ["templates"] })}
          />
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed p-16 text-sm text-muted-foreground">
            {ar ? "اختر قالباً من القائمة" : "Select a template from the list"}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  templates,
  stationCode,
  onChanged,
}: {
  template: Template;
  templates: Template[];
  stationCode: (id: string | null) => string;
  onChanged: () => void;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const qc = useQueryClient();
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [slots, setSlots] = useState(template.time_slots.join(", "));

  const { data, isLoading } = useQuery({
    queryKey: ["template-structure", template.id],
    queryFn: async () => {
      const [s, f] = await Promise.all([
        supabase
          .from("reading_sections")
          .select("id, template_id, name_en, name_ar, sort_order")
          .eq("template_id", template.id)
          .order("sort_order"),
        supabase
          .from("reading_fields")
          .select("id, template_id, section_id, label_en, label_ar, unit, sort_order")
          .eq("template_id", template.id)
          .order("sort_order"),
      ]);
      if (s.error) throw s.error;
      if (f.error) throw f.error;
      return { sections: (s.data ?? []) as Section[], fields: (f.data ?? []) as Field[] };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["template-structure", template.id] });

  const saveHeader = useMutation({
    mutationFn: async (patch: Partial<Template>) => {
      const { error } = await supabase.from("reading_templates").update(patch).eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تم الحفظ" : "Saved");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSection = useMutation({
    mutationFn: async () => {
      const order = Math.max(0, ...(data?.sections ?? []).map((s) => s.sort_order)) + 10;
      const { error } = await supabase.from("reading_sections").insert({
        template_id: template.id,
        name_en: "New Section",
        name_ar: "قسم جديد",
        sort_order: order,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSection = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Section> }) => {
      const { error } = await supabase.from("reading_sections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const delSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reading_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تم حذف القسم" : "Section deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addField = useMutation({
    mutationFn: async (sectionId: string | null) => {
      const order = Math.max(0, ...(data?.fields ?? []).map((f) => f.sort_order)) + 10;
      const { error } = await supabase.from("reading_fields").insert({
        template_id: template.id,
        section_id: sectionId,
        label_en: "New Reading",
        label_ar: "قراءة جديدة",
        sort_order: order,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Field> }) => {
      const { error } = await supabase.from("reading_fields").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const delField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reading_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تم حذف القراءة" : "Reading deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const swapOrder = async (
    table: "reading_sections" | "reading_fields",
    a: { id: string; sort_order: number },
    b: { id: string; sort_order: number },
  ) => {
    const r1 = await supabase.from(table).update({ sort_order: b.sort_order }).eq("id", a.id);
    const r2 = await supabase.from(table).update({ sort_order: a.sort_order }).eq("id", b.id);
    if (r1.error || r2.error) toast.error((r1.error ?? r2.error)!.message);
    refresh();
  };

  const unify = useMutation({
    mutationFn: async () => {
      if (targets.length === 0) throw new Error(ar ? "اختر القوالب المستهدفة" : "Select target templates");
      const sections = data?.sections ?? [];
      const fields = data?.fields ?? [];

      for (const tid of targets) {
        // Non-destructive merge: existing sections/fields are matched by name and
        // updated in place so historical reading_values are never cascade-deleted.
        const [{ data: exSections }, { data: exFields }] = await Promise.all([
          supabase.from("reading_sections").select("id, name_en, name_ar, sort_order").eq("template_id", tid),
          supabase
            .from("reading_fields")
            .select("id, section_id, label_en, label_ar, unit, sort_order")
            .eq("template_id", tid),
        ]);

        // ---- sections ----
        const map: Record<string, string> = {};
        const usedSectionIds = new Set<string>();
        for (const s of sections) {
          const hit = (exSections ?? []).find(
            (x) => x.name_en.trim().toLowerCase() === s.name_en.trim().toLowerCase(),
          );
          if (hit) {
            map[s.id] = hit.id;
            usedSectionIds.add(hit.id);
            await supabase
              .from("reading_sections")
              .update({ name_ar: s.name_ar, sort_order: s.sort_order })
              .eq("id", hit.id);
          } else {
            const { data: ins, error } = await supabase
              .from("reading_sections")
              .insert({ template_id: tid, name_en: s.name_en, name_ar: s.name_ar, sort_order: s.sort_order })
              .select("id")
              .single();
            if (error) throw error;
            map[s.id] = ins!.id;
            usedSectionIds.add(ins!.id);
          }
        }

        // ---- fields ----
        const keyOf = (label: string, sectionId: string | null) =>
          `${sectionId ?? "none"}::${label.trim().toLowerCase()}`;
        const existingByKey = new Map(
          (exFields ?? []).map((f) => [keyOf(f.label_en, f.section_id ?? null), f]),
        );
        const looseByLabel = new Map(
          (exFields ?? []).map((f) => [f.label_en.trim().toLowerCase(), f]),
        );
        const usedFieldIds = new Set<string>();
        const toInsert: Array<{
          template_id: string;
          section_id: string | null;
          label_en: string;
          label_ar: string | null;
          unit: string | null;
          sort_order: number;
        }> = [];


        for (const f of fields) {
          const targetSection = f.section_id ? (map[f.section_id] ?? null) : null;
          const hit =
            existingByKey.get(keyOf(f.label_en, targetSection)) ??
            looseByLabel.get(f.label_en.trim().toLowerCase());
          if (hit && !usedFieldIds.has(hit.id)) {
            usedFieldIds.add(hit.id);
            await supabase
              .from("reading_fields")
              .update({
                section_id: targetSection,
                label_ar: f.label_ar,
                unit: f.unit,
                sort_order: f.sort_order,
              })
              .eq("id", hit.id);
          } else {
            toInsert.push({
              template_id: tid,
              section_id: targetSection,
              label_en: f.label_en,
              label_ar: f.label_ar,
              unit: f.unit,
              sort_order: f.sort_order,
            });
          }
        }
        if (toInsert.length > 0) {
          const { error } = await supabase.from("reading_fields").insert(toInsert);
          if (error) throw error;
        }

        // ---- clean up leftovers that carry no history ----
        const leftoverFields = (exFields ?? []).filter((f) => !usedFieldIds.has(f.id));
        for (const f of leftoverFields) {
          const { count } = await supabase
            .from("reading_values")
            .select("id", { count: "exact", head: true })
            .eq("field_id", f.id);
          if ((count ?? 0) === 0) {
            await supabase.from("reading_fields").delete().eq("id", f.id);
          } else {
            usedFieldIds.add(f.id);
            if (f.section_id) usedSectionIds.add(f.section_id);
          }
        }
        const leftoverSections = (exSections ?? []).filter((s) => !usedSectionIds.has(s.id));
        for (const s of leftoverSections) {
          await supabase.from("reading_sections").delete().eq("id", s.id);
        }

        await supabase.from("reading_templates").update({ time_slots: template.time_slots }).eq("id", tid);
      }
    },

    onSuccess: () => {
      toast.success(ar ? "تم توحيد القوالب" : "Templates unified");
      setCopyOpen(false);
      setTargets([]);
      qc.invalidateQueries({ queryKey: ["template-structure"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sections = data?.sections ?? [];
  const fields = data?.fields ?? [];
  const unsectioned = fields.filter((f) => !f.section_id);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">{ar ? "الاسم بالعربي" : "Arabic name"}</span>
            <input
              defaultValue={template.name_ar}
              onBlur={(e) =>
                e.target.value !== template.name_ar && saveHeader.mutate({ name_ar: e.target.value })
              }
              className="h-10 w-full rounded-lg border bg-background px-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{ar ? "الاسم بالإنجليزي" : "English name"}</span>
            <input
              defaultValue={template.name_en}
              onBlur={(e) =>
                e.target.value !== template.name_en && saveHeader.mutate({ name_en: e.target.value })
              }
              className="h-10 w-full rounded-lg border bg-background px-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{ar ? "أوقات القراءة" : "Reading times"}</span>
            <div className="flex gap-2">
              <input
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
                placeholder="04:00, 08:00, 16:00, 20:00"
                className="h-10 w-full rounded-lg border bg-background px-2 font-mono"
              />
              <button
                onClick={() =>
                  saveHeader.mutate({
                    time_slots: slots
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <Save className="h-4 w-4" />
              </button>
            </div>
          </label>
          <div className="flex items-end gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                defaultChecked={template.active}
                onChange={(e) => saveHeader.mutate({ active: e.target.checked })}
                className="h-4 w-4"
              />
              {ar ? "مفعّل" : "Active"}
            </label>
            <span className="ms-auto text-muted-foreground">
              {stationCode(template.station_id)} · {template.code}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => addSection.mutate()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            {ar ? "إضافة قسم" : "Add section"}
          </button>
          <button
            onClick={() => addField.mutate(null)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {ar ? "إضافة قراءة عامة" : "Add general reading"}
          </button>
          <button
            onClick={() => setCopyOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent"
          >
            <Copy className="h-4 w-4" />
            {ar ? "توحيد هذا القالب مع محطات أخرى" : "Unify with other templates"}
          </button>
        </div>

        {copyOpen && (
          <div className="mt-3 rounded-lg border p-3">
            <div className="mb-2 text-sm font-semibold text-destructive">
              {ar
                ? "سيتم مطابقة أقسام وقراءات القوالب المختارة مع هذا القالب. القراءات التاريخية محفوظة ولن تُحذف؛ تُحذف فقط الحقول غير المستخدمة."
                : "Selected templates will be aligned with this template. Historical readings are preserved — only unused fields are removed."}
            </div>

            <div className="grid max-h-56 gap-1 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
              {templates
                .filter((t) => t.id !== template.id)
                .map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={targets.includes(t.id)}
                      onChange={(e) =>
                        setTargets((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))
                      }
                      className="h-4 w-4"
                    />
                    <span className="truncate">
                      {stationCode(t.station_id)} · {t.code}
                    </span>
                  </label>
                ))}
            </div>
            <button
              onClick={() => unify.mutate()}
              disabled={unify.isPending}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {unify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              {ar ? `توحيد (${targets.length})` : `Unify (${targets.length})`}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {unsectioned.length > 0 && (
            <SectionCard
              title={ar ? "قراءات عامة (بدون قسم)" : "General readings (no section)"}
              fields={unsectioned}
              allFields={fields}
              ar={ar}
              onSaveField={(id, patch) => saveField.mutate({ id, patch })}
              onDeleteField={(id) => delField.mutate(id)}
              onMoveField={(a, b) => swapOrder("reading_fields", a, b)}
            />
          )}

          {sections.map((s, i) => {
            const sFields = fields.filter((f) => f.section_id === s.id);
            return (
              <div key={s.id} className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-2 border-b p-3">
                  <input
                    defaultValue={s.name_en}
                    onBlur={(e) =>
                      e.target.value !== s.name_en &&
                      saveSection.mutate({ id: s.id, patch: { name_en: e.target.value } })
                    }
                    className="h-9 w-48 rounded-lg border bg-background px-2 text-sm font-bold"
                  />
                  <input
                    defaultValue={s.name_ar ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (s.name_ar ?? "") &&
                      saveSection.mutate({ id: s.id, patch: { name_ar: e.target.value } })
                    }
                    className="h-9 w-48 rounded-lg border bg-background px-2 text-sm font-bold"
                  />
                  <div className="ms-auto flex items-center gap-1">
                    <button
                      disabled={i === 0}
                      onClick={() => swapOrder("reading_sections", s, sections[i - 1]!)}
                      className="rounded border p-1 disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      disabled={i === sections.length - 1}
                      onClick={() => swapOrder("reading_sections", s, sections[i + 1]!)}
                      className="rounded border p-1 disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => addField.mutate(s.id)}
                      className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs hover:bg-accent"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {ar ? "قراءة" : "Reading"}
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            ar
                              ? "حذف القسم وكل قراءاته؟"
                              : "Delete this section and all its readings?",
                          )
                        )
                          delSection.mutate(s.id);
                      }}
                      className="rounded border p-1 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <FieldRows
                  fields={sFields}
                  ar={ar}
                  onSaveField={(id, patch) => saveField.mutate({ id, patch })}
                  onDeleteField={(id) => delField.mutate(id)}
                  onMoveField={(a, b) => swapOrder("reading_fields", a, b)}
                />
              </div>
            );
          })}

          {sections.length === 0 && unsectioned.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {ar ? "لا توجد أقسام أو قراءات بعد" : "No sections or readings yet"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard(props: {
  title: string;
  fields: Field[];
  allFields: Field[];
  ar: boolean;
  onSaveField: (id: string, patch: Partial<Field>) => void;
  onDeleteField: (id: string) => void;
  onMoveField: (a: Field, b: Field) => void;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-3 text-sm font-bold">{props.title}</div>
      <FieldRows
        fields={props.fields}
        ar={props.ar}
        onSaveField={props.onSaveField}
        onDeleteField={props.onDeleteField}
        onMoveField={props.onMoveField}
      />
    </div>
  );
}

function FieldRows({
  fields,
  ar,
  onSaveField,
  onDeleteField,
  onMoveField,
}: {
  fields: Field[];
  ar: boolean;
  onSaveField: (id: string, patch: Partial<Field>) => void;
  onDeleteField: (id: string) => void;
  onMoveField: (a: Field, b: Field) => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {ar ? "لا توجد قراءات في هذا القسم" : "No readings in this section"}
      </div>
    );
  }
  return (
    <div className="divide-y">
      {fields.map((f, i) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 p-2">
          <input
            defaultValue={f.label_en}
            onBlur={(e) => e.target.value !== f.label_en && onSaveField(f.id, { label_en: e.target.value })}
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
          />
          <input
            defaultValue={f.label_ar ?? ""}
            onBlur={(e) =>
              e.target.value !== (f.label_ar ?? "") && onSaveField(f.id, { label_ar: e.target.value })
            }
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
          />
          <input
            defaultValue={f.unit ?? ""}
            placeholder={ar ? "الوحدة" : "Unit"}
            onBlur={(e) =>
              e.target.value !== (f.unit ?? "") &&
              onSaveField(f.id, { unit: e.target.value === "" ? null : e.target.value })
            }
            className="h-9 w-24 rounded-lg border bg-background px-2 text-sm"
          />
          <button
            disabled={i === 0}
            onClick={() => onMoveField(f, fields[i - 1]!)}
            className="rounded border p-1 disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            disabled={i === fields.length - 1}
            onClick={() => onMoveField(f, fields[i + 1]!)}
            className="rounded border p-1 disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(ar ? "حذف هذه القراءة؟" : "Delete this reading?")) onDeleteField(f.id);
            }}
            className="rounded border p-1 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
