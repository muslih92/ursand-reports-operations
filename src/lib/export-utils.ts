export interface ExportFile {
  blob: Blob;
  filename: string;
}

export interface DownloadLink {
  url: string;
  filename: string;
}

export const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_MIME = "application/pdf";

export function safeFilePart(value: string | null | undefined, fallback = "Report") {
  const cleaned = (value || fallback).replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

export function ensureFileExtension(filename: string, extension: string) {
  const cleanExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return filename.toLowerCase().endsWith(cleanExtension.toLowerCase()) ? filename : `${filename}${cleanExtension}`;
}

export function createTypedBlob(data: BlobPart | BlobPart[], mimeType: string) {
  const parts = Array.isArray(data) ? data : [data];
  return new Blob(parts, { type: mimeType });
}

export function createExcelBlob(buffer: unknown) {
  if (buffer instanceof ArrayBuffer) return createTypedBlob(buffer, EXCEL_MIME);
  if (ArrayBuffer.isView(buffer)) {
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength));
    return createTypedBlob(copy.buffer as ArrayBuffer, EXCEL_MIME);
  }
  if (buffer instanceof Blob) return createTypedBlob(buffer, EXCEL_MIME);
  throw new Error("Excel file buffer is invalid");
}

function withMimeType(blob: Blob, mimeType: string) {
  return blob.type === mimeType ? blob : createTypedBlob(blob, mimeType);
}

function fallbackDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
}

export async function triggerBlobDownload(blob: Blob, filename: string): Promise<DownloadLink> {
  const lower = filename.toLowerCase();
  const mimeType = lower.endsWith(".pdf") ? PDF_MIME : lower.endsWith(".xlsx") ? EXCEL_MIME : blob.type || "application/octet-stream";
  const typedBlob = withMimeType(blob, mimeType);
  const safeFilename = lower.endsWith(".pdf")
    ? ensureFileExtension(filename, ".pdf")
    : lower.endsWith(".xlsx")
      ? ensureFileExtension(filename, ".xlsx")
      : filename;
  const url = URL.createObjectURL(typedBlob);
  try {
    const file = new File([typedBlob], safeFilename, { type: mimeType, lastModified: Date.now() });
    const mod = await import("file-saver");
    const saveAs = mod.saveAs ?? mod.default?.saveAs ?? mod.default;
    if (typeof saveAs === "function") {
      saveAs(file, safeFilename);
    } else {
      fallbackDownload(url, safeFilename);
    }
  } catch {
    fallbackDownload(url, safeFilename);
  }
  return { url, filename: safeFilename };
}

function formValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (control instanceof HTMLSelectElement) {
    return control.selectedOptions[0]?.textContent?.trim() || control.value || "—";
  }
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return control.checked ? "✓" : "—";
  }
  return control.value || control.getAttribute("placeholder") || "—";
}

function replaceFormControls(root: HTMLElement) {
  const controls = Array.from(root.querySelectorAll("input, textarea, select")) as Array<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  for (const control of controls) {
    const replacement = document.createElement("div");
    replacement.textContent = formValue(control);
    replacement.dir = control.dir || "auto";
    replacement.style.cssText = [
      "box-sizing:border-box",
      "width:100%",
      "min-height:28px",
      "padding:5px 7px",
      "border:1px solid #d1d5db",
      "border-radius:4px",
      "background:#ffffff",
      "color:#111827",
      "font:inherit",
      "white-space:pre-wrap",
      "overflow-wrap:anywhere",
    ].join(";");
    if (control instanceof HTMLTextAreaElement) {
      replacement.style.minHeight = `${Math.max(control.scrollHeight, 80)}px`;
    }
    control.replaceWith(replacement);
  }
}

function forceCanvasSafeColors(root: HTMLElement) {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const element of elements) {
    const isRoot = element === root;
    element.removeAttribute("style");
    const tag = element.tagName.toLowerCase();
    const isTableHead = Boolean(element.closest("thead"));
    const isSectionHeader = element.className.toString().includes("pdf-title-band");
    const isCell = tag === "td" || tag === "th" || tag === "table";
    element.style.setProperty("color", isTableHead || isSectionHeader ? "#0f4c75" : "#111827", "important");
    element.style.setProperty("background-color", isTableHead || isSectionHeader ? "#eaf4fb" : "#ffffff", "important");
    element.style.setProperty("border-color", isCell ? "#9ca3af" : "#d1d5db", "important");
    element.style.setProperty("box-shadow", "none", "important");
    element.style.setProperty("text-shadow", "none", "important");
    element.style.setProperty("caret-color", "transparent", "important");
    if (isRoot) {
      element.style.setProperty("box-sizing", "border-box", "important");
      element.style.setProperty("width", "100%", "important");
      element.style.setProperty("padding", "24px", "important");
      element.style.setProperty("border", "1px solid #d1d5db", "important");
      element.style.setProperty("border-radius", "8px", "important");
    }
    if (tag === "table") {
      element.style.setProperty("width", "100%", "important");
      element.style.setProperty("border-collapse", "collapse", "important");
    }
    if (tag === "th" || tag === "td") {
      element.style.setProperty("padding", "6px", "important");
      element.style.setProperty("border", "1px solid #9ca3af", "important");
    }
  }
}

export async function buildElementPdf(opts: {
  elementId: string;
  filename: string;
  orientation?: "p" | "l";
  minWidth?: number;
}): Promise<ExportFile> {
  const source = document.getElementById(opts.elementId);
  if (!source) throw new Error("Report container not found");

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const sourceRect = source.getBoundingClientRect();
  const width = Math.max(Math.ceil(source.scrollWidth || sourceRect.width), opts.minWidth ?? 794);
  const clone = source.cloneNode(true) as HTMLElement;
  clone.id = `${opts.elementId}-pdf-clone`;
  clone.classList.add("pdf-export-root");
  clone.style.width = `${width}px`;
  clone.style.maxWidth = "none";
  clone.style.backgroundColor = "#ffffff";
  clone.style.color = "#111827";
  clone.style.borderColor = "#d1d5db";
  replaceFormControls(clone);
  forceCanvasSafeColors(clone);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${width}px`,
    "height:1400px",
    "background:#ffffff",
    "border:0",
    "visibility:hidden",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(frame);
  const frameDoc = frame.contentDocument;
  if (!frameDoc) throw new Error("PDF frame not available");
  frameDoc.open();
  frameDoc.write(`<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`);
  frameDoc.close();

  const style = frameDoc.createElement("style");
  style.textContent = `
    html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; font-family: Arial, sans-serif; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border-color: #9ca3af !important; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
    .pdf-export-root, .pdf-export-root * {
      color: #111827 !important;
      background-color: #ffffff !important;
      border-color: #d1d5db !important;
      box-shadow: none !important;
      text-shadow: none !important;
      caret-color: transparent !important;
      line-height: 1.45 !important;
      letter-spacing: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: normal !important;
      max-height: none !important;
      position: static !important;
      transform: none !important;
      float: none !important;
ammer: 0;
    }
    .pdf-export-root thead, .pdf-export-root thead *,
    .pdf-export-root .pdf-title-band, .pdf-export-root .pdf-title-band * {
      background-color: #eaf4fb !important;
      color: #0f4c75 !important;
    }
    .pdf-export-root svg, .pdf-export-root svg * {
      stroke: #111827 !important;
      fill: none !important;
    }
  `.replace("ammer: 0;\n", "");
  frameDoc.head.appendChild(style);
  frameDoc.body.appendChild(frameDoc.importNode(clone, true));
  const frameClone = frameDoc.getElementById(clone.id) as HTMLElement | null;
  if (!frameClone) throw new Error("PDF clone not available");

  try {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    if (frameDoc.fonts?.ready) {
      try {
        await frameDoc.fonts.ready;
      } catch {
        /* ignore font loading issues */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
    frame.style.height = `${Math.max(frameClone.scrollHeight + 40, 1400)}px`;
    const canvas = await html2canvas(frameClone, {
      scale: Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.5)),
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: width,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF(opts.orientation ?? "p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    // how many canvas pixels fit on one PDF page
    const pxPerPage = Math.floor((usableH * canvas.width) / imgW);

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // Detect rows that are visually "empty" so we never cut through a line of text.
    const isBlankRow = (y: number) => {
      if (!ctx) return true;
      try {
        const data = ctx.getImageData(0, y, canvas.width, 1).data;
        for (let i = 0; i < data.length; i += 4 * 4) {
          if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false;
        }
        return true;
      } catch {
        return true;
      }
    };

    const findBreak = (start: number, ideal: number) => {
      const limit = Math.min(canvas.height, ideal);
      const minAllowed = start + Math.floor(pxPerPage * 0.45);
      for (let y = limit; y > minAllowed; y -= 1) {
        if (isBlankRow(y)) return y;
      }
      return limit;
    };

    let offset = 0;
    let first = true;
    while (offset < canvas.height) {
      const remaining = canvas.height - offset;
      const sliceH = remaining <= pxPerPage ? remaining : findBreak(offset, offset + pxPerPage) - offset;
      const safeSliceH = Math.max(1, Math.min(sliceH, remaining));

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = safeSliceH;
      const pageCtx = pageCanvas.getContext("2d");
      if (pageCtx) {
        pageCtx.fillStyle = "#ffffff";
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(canvas, 0, offset, canvas.width, safeSliceH, 0, 0, canvas.width, safeSliceH);
      }

      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(
        pageCanvas.toDataURL("image/png"),
        "PNG",
        margin,
        margin,
        imgW,
        (safeSliceH * imgW) / canvas.width,
        undefined,
        "FAST",
      );
      offset += safeSliceH;
    }

    return { blob: withMimeType(pdf.output("blob"), PDF_MIME), filename: ensureFileExtension(opts.filename, ".pdf") };
  } finally {
    frame.remove();
  }
}