import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { toast } from "sonner";
import { ShieldAlert, Printer, Plus, Trash2, FileSpreadsheet } from "lucide-react";
import { createExcelBlob, safeFilePart, triggerBlobDownload } from "@/lib/export-utils";

export const Route = createFileRoute("/_app/defeat")({
  head: () => ({
    meta: [
      { title: "Defeat Issue Record | WTCO" },
      {
        name: "description",
        content:
          "Control room defeat issue record: log defeat numbers, affected systems, duration, issue and release dates per station.",
      },
      { property: "og:title", content: "Defeat Issue Record" },
      {
        property: "og:description",
        content: "Permanent per-station log of issued and released protection defeats with Excel export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DefeatPage,
});

interface DefeatRow {
  id: string;
  station_id: string;
  sl_no: number;
  defeat_number: string | null;
  area_system: string | null;
  defeat_duration: string | null;
  date_issued: string | null;
  issued_signature: string | null;
  date_released: string | null;
  released_signature: string | null;
  remarks: string | null;
}

type Draft = Omit<DefeatRow, "id" | "station_id" | "sl_no">;

const emptyDraft: Draft = {
  defeat_number: "",
  area_system: "",
  defeat_duration: "",
  date_issued: "",
  issued_signature: "",
  date_released: "",
  released_signature: "",
  remarks: "",
};

function DefeatPage() {
  const { locale, dir } = useI18n();
  const ar = locale === "ar";
  const { profile, user, isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("supervisor");
  const qc = useQueryClient();
  const { scopedStationId, canPickStation } = useStationScope();
  const { data: stations } = useScopedStations();

  const [stationId, setStationId] = useState<string>("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (scopedStationId) setStationId(scopedStationId);
    else if (!stationId && stations && stations.length > 0) setStationId(stations[0]!.id);
  }, [scopedStationId, stations]);

  const station = stations?.find((s) => s.id === stationId);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["defeat-records", stationId],
    enabled: !!stationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("defeat_records")
        .select(
          "id, station_id, sl_no, defeat_number, area_system, defeat_duration, date_issued, issued_signature, date_released, released_signature, remarks",
        )
        .eq("station_id", stationId)
        .order("sl_no", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DefeatRow[];
    },
  });

  // Overview across all stations the user can see
  const { data: allRows = [] } = useQuery({
    queryKey: ["defeat-records", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("defeat_records")
        .select("id, station_id, defeat_number, area_system, date_issued, date_released")
        .order("date_issued", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<
        DefeatRow,
        "id" | "station_id" | "defeat_number" | "area_system" | "date_issued" | "date_released"
      >[];
    },
  });

  const overview = (stations ?? [])
    .map((s) => {
      const list = allRows.filter((r) => r.station_id === s.id);
      const open = list.filter((r) => !r.date_released || !String(r.date_released).trim());
      const last = list
        .map((r) => r.date_issued)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];
      return { station: s, total: list.length, open: open.length, last: last ?? null };
    })
    .filter((o) => o.total > 0)
    .sort((a, b) => b.open - a.open || b.total - a.total);

  const totals = overview.reduce(
    (acc, o) => ({ total: acc.total + o.total, open: acc.open + o.open }),
    { total: 0, open: 0 },
  );


  const add = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(ar ? "اختر المحطة" : "Select a station");
      if (!draft.defeat_number?.trim() && !draft.area_system?.trim())
        throw new Error(ar ? "أدخل رقم الإبطال أو النظام" : "Enter a defeat number or system");
      const nextSl = rows.reduce((m, r) => Math.max(m, r.sl_no), 0) + 1;
      const { error } = await supabase.from("defeat_records").insert({
        station_id: stationId,
        sl_no: nextSl,
        defeat_number: draft.defeat_number || null,
        area_system: draft.area_system || null,
        defeat_duration: draft.defeat_duration || null,
        date_issued: draft.date_issued || null,
        issued_signature: draft.issued_signature || profile?.employee_no || null,
        date_released: draft.date_released || null,
        released_signature: draft.released_signature || null,
        remarks: draft.remarks || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تمت الإضافة" : "Record added");
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ["defeat-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DefeatRow> }) => {
      const { error } = await supabase.from("defeat_records").update(patch).eq("id", id);
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["defeat-records"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("defeat_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["defeat-records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "WTCO";
    const ws = wb.addWorksheet("Defeat Issue Record", {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
      headerFooter: {
        oddFooter: "&L&F&CPage &P of &N&R&D",
      },
      views: [{ state: "frozen", ySplit: 5 }],
    });

    const thin = { style: "thin" as const };
    const box = { top: thin, left: thin, bottom: thin, right: thin };

    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = "KINGDOM OF SAUDI ARABIA";
    ws.mergeCells("A2:D2");
    ws.getCell("A2").value = "WATER TRANSMISSION COMPANY";
    ws.mergeCells("E1:I1");
    ws.getCell("E1").value = "DEFEAT ISSUE RECORD";
    ws.mergeCells("E2:I2");
    ws.getCell("E2").value = "CONTROL ROOM";
    ["A1", "A2", "E1", "E2"].forEach((c) => {
      ws.getCell(c).font = { bold: true, size: 12 };
      ws.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(c).border = box;
    });
    ws.mergeCells("A3:F3");
    ws.getCell("A3").value = `STATION: ${station?.code ?? ""}${station?.name_en ? ` - ${station.name_en}` : ""}`;
    ws.getCell("A3").font = { bold: true };
    ws.mergeCells("G3:I3");
    ws.getCell("G3").value = `PRINTED: ${new Date().toISOString().slice(0, 10)}`;
    ws.getCell("G3").alignment = { horizontal: "right" };
    ws.getRow(4).height = 6;

    const header = [
      "Sl#",
      "Defeat Number",
      "Defeat Issued to, Area /System",
      "Defeat Duration",
      "Date Issued",
      "Supervisor Signature",
      "Date Released",
      "Supervisor Signature",
      "Remarks",
    ];
    const hr = ws.addRow(header);
    hr.height = 32;
    hr.font = { bold: true };
    hr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    hr.eachCell((c) => {
      c.border = box;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    });
    const headerRowNumber = hr.number;
    ws.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;

    rows.forEach((r) => {
      const row = ws.addRow([
        r.sl_no,
        r.defeat_number ?? "",
        r.area_system ?? "",
        r.defeat_duration ?? "",
        r.date_issued ?? "",
        r.issued_signature ?? "",
        r.date_released ?? "",
        r.released_signature ?? "",
        r.remarks ?? "",
      ]);
      row.alignment = { vertical: "middle", wrapText: true };
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      [5, 7].forEach((i) => {
        row.getCell(i).alignment = { horizontal: "center", vertical: "middle" };
      });
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = box;
      });
    });

    // keep a printable frame even with few records
    for (let i = rows.length; i < 12; i++) {
      const row = ws.addRow(["", "", "", "", "", "", "", "", ""]);
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = box;
      });
    }

    const widths = [6, 20, 44, 16, 14, 20, 14, 20, 30];
    ws.columns.forEach((c, i) => {
      c.width = widths[i] ?? 16;
    });
    ws.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: header.length },
    };

    const blob = createExcelBlob(await wb.xlsx.writeBuffer());
    await triggerBlobDownload(blob, `Defeat_Record_${safeFilePart(station?.code, "Station")}.xlsx`);
  };


  const cell =
    (canEdit ? "" : "pointer-events-none opacity-80 ") +
    "w-full rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div dir={dir} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold flex-1">
          {ar ? "سجل إبطال الحماية" : "Defeat Issue Record"}
        </h1>
        <button
          onClick={() => exportExcel()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-sm hover:bg-accent"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {ar ? "تصدير إكسل" : "Export Excel"}
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-sm hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          {ar ? "طباعة" : "Print"}
        </button>
      </div>

      <section className="rounded-xl border bg-card p-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold flex-1">
            {ar ? "ملخص جميع المحطات" : "All stations overview"}
          </h2>
          <span className="text-xs rounded-full border px-2 py-0.5">
            {ar ? "محطات" : "Stations"}: {overview.length}
          </span>
          <span className="text-xs rounded-full border px-2 py-0.5">
            {ar ? "إجمالي السجلات" : "Total records"}: {totals.total}
          </span>
          <span className="text-xs rounded-full border px-2 py-0.5 border-destructive text-destructive">
            {ar ? "غير مُعادة" : "Not released"}: {totals.open}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-2 text-start">{ar ? "المحطة" : "Station"}</th>
                <th className="p-2 text-start w-28">{ar ? "السجلات" : "Records"}</th>
                <th className="p-2 text-start w-32">{ar ? "غير مُعادة" : "Open"}</th>
                <th className="p-2 text-start w-36">{ar ? "آخر إصدار" : "Last issued"}</th>
              </tr>
            </thead>
            <tbody>
              {overview.map((o) => (
                <tr
                  key={o.station.id}
                  onClick={() => setStationId(o.station.id)}
                  className={`border-t cursor-pointer hover:bg-accent/60 ${
                    o.station.id === stationId ? "bg-accent/40" : ""
                  }`}
                >
                  <td className="p-2 font-medium">
                    {o.station.code} — {ar ? o.station.name_ar : o.station.name_en}
                  </td>
                  <td className="p-2">{o.total}</td>
                  <td className={`p-2 ${o.open > 0 ? "text-destructive font-semibold" : ""}`}>
                    {o.open}
                  </td>
                  <td className="p-2">{o.last ?? "—"}</td>
                </tr>
              ))}
              {overview.length === 0 && (
                <tr className="border-t">
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    {ar ? "لا توجد سجلات في أي محطة" : "No records in any station"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>



      <div className="rounded-xl border bg-card p-4 grid gap-3 sm:grid-cols-3 print:hidden">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">{ar ? "المحطة" : "Station"}</span>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!canPickStation}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm disabled:opacity-70"
          >
            <option value="">—</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {ar ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        </label>
        <div className="text-sm space-y-1 sm:col-span-2">
          <span className="text-muted-foreground">{ar ? "عدد السجلات" : "Records"}</span>
          <div className="h-9 flex items-center rounded-lg border bg-muted/40 px-2 font-semibold">
            {rows.length}
            {isFetching ? ` · ${ar ? "جارٍ التحميل..." : "Loading..."}` : ""}
          </div>
        </div>
      </div>

      <div className="hidden print:block text-center space-y-1 mb-3">
        <img src="/wtco-logo.png" alt="WTCO" className="h-12 mx-auto object-contain" />
        <div className="text-lg font-bold uppercase">Defeat Issue Record — Control Room</div>
        <div className="text-sm">STATION: {station?.code ?? ""}</div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead className="bg-muted/60">
            <tr>
              <th className="p-2 w-12 text-start">Sl#</th>
              <th className="p-2 w-32 text-start">Defeat Number</th>
              <th className="p-2 text-start">Defeat Issued to, Area /System</th>
              <th className="p-2 w-32 text-start">Defeat Duration</th>
              <th className="p-2 w-36 text-start">Date Issued</th>
              <th className="p-2 w-28 text-start">Supervisor Signature</th>
              <th className="p-2 w-40 text-start">Date Released</th>
              <th className="p-2 w-28 text-start">Supervisor Signature</th>
              <th className="p-2 w-48 text-start">Remarks</th>
              {canEdit && isAdmin && <th className="p-2 w-10 print:hidden" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2">{r.sl_no}</td>
                <td className="p-2">
                  <input
                    className={cell}
                    defaultValue={r.defeat_number ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.defeat_number ?? "") &&
                      update.mutate({ id: r.id, patch: { defeat_number: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <textarea
                    rows={2}
                    className={cell}
                    defaultValue={r.area_system ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.area_system ?? "") &&
                      update.mutate({ id: r.id, patch: { area_system: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={cell}
                    defaultValue={r.defeat_duration ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.defeat_duration ?? "") &&
                      update.mutate({ id: r.id, patch: { defeat_duration: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    type="date"
                    className={cell}
                    defaultValue={r.date_issued ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.date_issued ?? "") &&
                      update.mutate({ id: r.id, patch: { date_issued: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={cell}
                    defaultValue={r.issued_signature ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.issued_signature ?? "") &&
                      update.mutate({ id: r.id, patch: { issued_signature: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={cell}
                    defaultValue={r.date_released ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.date_released ?? "") &&
                      update.mutate({ id: r.id, patch: { date_released: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={cell}
                    defaultValue={r.released_signature ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.released_signature ?? "") &&
                      update.mutate({ id: r.id, patch: { released_signature: e.target.value || null } })
                    }
                  />
                </td>
                <td className="p-2">
                  <textarea
                    rows={2}
                    className={cell}
                    defaultValue={r.remarks ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (r.remarks ?? "") &&
                      update.mutate({ id: r.id, patch: { remarks: e.target.value || null } })
                    }
                  />
                </td>
                {canEdit && isAdmin && (
                  <td className="p-2 print:hidden">
                    <button
                      onClick={() => remove.mutate(r.id)}
                      className="text-destructive hover:opacity-70"
                      aria-label={ar ? "حذف" : "Delete"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="border-t">
                <td colSpan={canEdit && isAdmin ? 10 : 9} className="p-6 text-center text-muted-foreground">
                  {ar ? "لا توجد سجلات بعد" : "No records yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
      <div className="rounded-xl border bg-card p-4 space-y-3 print:hidden">
        <div className="font-semibold">{ar ? "إضافة سجل جديد" : "Add new record"}</div>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className={cell}
            placeholder="Defeat Number"
            value={draft.defeat_number ?? ""}
            onChange={(e) => setDraft({ ...draft, defeat_number: e.target.value })}
          />
          <input
            className={`${cell} md:col-span-3`}
            placeholder="Defeat Issued to, Area /System"
            value={draft.area_system ?? ""}
            onChange={(e) => setDraft({ ...draft, area_system: e.target.value })}
          />
          <input
            className={cell}
            placeholder="Defeat Duration"
            value={draft.defeat_duration ?? ""}
            onChange={(e) => setDraft({ ...draft, defeat_duration: e.target.value })}
          />
          <input
            type="date"
            className={cell}
            value={draft.date_issued ?? ""}
            onChange={(e) => setDraft({ ...draft, date_issued: e.target.value })}
          />
          <input
            className={cell}
            placeholder="Supervisor Signature"
            value={draft.issued_signature ?? ""}
            onChange={(e) => setDraft({ ...draft, issued_signature: e.target.value })}
          />
          <input
            className={cell}
            placeholder="Date Released"
            value={draft.date_released ?? ""}
            onChange={(e) => setDraft({ ...draft, date_released: e.target.value })}
          />
          <textarea
            rows={2}
            className={`${cell} md:col-span-4`}
            placeholder={ar ? "ملاحظات / Remarks" : "Remarks"}
            value={draft.remarks ?? ""}
            onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
          />
        </div>
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending || !stationId}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 h-9 text-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {ar ? "إضافة" : "Add"}
        </button>
      </div>
      )}
    </div>
  );
}
