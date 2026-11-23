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
  return filename.toLowerCase().endsWith(cleanExtension.toLowerCase())
    ? filename
    : `${filename}${cleanExtension}`;
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
  const mimeType = lower.endsWith(".pdf")
    ? PDF_MIME
    : lower.endsWith(".xlsx")
      ? EXCEL_MIME
      : blob.type || "application/octet-stream";
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

const CONTROL_SELECTOR = "input, textarea, select";

/**
 * Replaces form controls with plain text blocks.
 * Heights are measured on the LIVE source controls (a detached clone reports 0),
 * so long text never gets clipped or overlaps the content below it.
 */
function replaceFormControls(root: HTMLElement, source: HTMLElement) {
  const clones = Array.from(root.querySelectorAll(CONTROL_SELECTOR)) as Array<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;
  const originals = Array.from(source.querySelectorAll(CONTROL_SELECTOR)) as Array<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >;

  clones.forEach((control, index) => {
    const original = originals[index] ?? control;
    const replacement = document.createElement("div");
    replacement.setAttribute("data-pdf-value", "1");
    replacement.textContent = formValue(original);
    replacement.dir = control.dir || "auto";
    const isTextarea = control instanceof HTMLTextAreaElement;
    const measured = isTextarea
      ? Math.max(original.scrollHeight, original.getBoundingClientRect().height, 90)
      : 28;
    replacement.style.cssText = [
      "box-sizing:border-box",
      "display:block",
      "width:100%",
      `min-height:${Math.ceil(measured)}px`,
      "height:auto",
      "max-height:none",
      "padding:7px 8px 10px",
      "border:1px solid #d1d5db",
      "border-radius:4px",
      "background:#ffffff",
      "color:#111827",
      "font:inherit",
      "line-height:1.6",
      "white-space:pre-wrap",
      "overflow:visible",
      "overflow-wrap:anywhere",
    ].join(";");
    control.replaceWith(replacement);
  });
}

function forceCanvasSafeColors(root: HTMLElement) {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const element of elements) {
    const isRoot = element === root;
    // Leave chart internals untouched so recharts keeps its line colors and text fills.
    if (!isRoot && element.closest?.(".recharts-wrapper")) continue;
    const isValueBlock = element.hasAttribute("data-pdf-value");
    const keepStyle = isValueBlock ? element.getAttribute("style") : null;
    element.removeAttribute("style");
    if (keepStyle) element.setAttribute("style", keepStyle);
    const tag = element.tagName.toLowerCase();
    const isTableHead = Boolean(element.closest("thead"));
    const isSectionHeader = element.className.toString().includes("pdf-title-band");
    const isCell = tag === "td" || tag === "th" || tag === "table";
    element.style.setProperty(
      "color",
      isTableHead || isSectionHeader ? "#0f4c75" : "#111827",
      "important",
    );
    // Only the sheet itself is painted white. Painting every element white let
    // each block cover the descenders of the line above it in the canvas.
    element.style.setProperty(
      "background-color",
      isTableHead || isSectionHeader ? "#eaf4fb" : isRoot ? "#ffffff" : "transparent",
      "important",
    );
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

/** Widest content inside the sheet (wide readings tables overflow their scroll box). */
function measureContentWidth(source: HTMLElement) {
  let widest = Math.max(source.scrollWidth, source.getBoundingClientRect().width);
  for (const el of Array.from(source.querySelectorAll<HTMLElement>("table"))) {
    widest = Math.max(widest, el.scrollWidth + 60);
  }
  return Math.ceil(widest);
}

/**
 * Bundled font for PDF rendering. One family covers Arabic and Latin with
 * matching metrics, so html2canvas never mixes in a fallback font whose
 * ascent/descent differ (the cause of clipped and overlapping lines).
 * Served from /public, so it works on the VPS and in Lovable alike.
 */
export const PDF_FONT_FAMILY = "URS PDF";
const PDF_FONT_DIR = "/fonts/ibm-plex-sans-arabic";
const ARABIC_RANGE =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC";
const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export function pdfFontFaceCss(origin: string) {
  const faces: string[] = [];
  for (const weight of [400, 700]) {
    for (const [subset, range] of [
      ["arabic", ARABIC_RANGE],
      ["latin", LATIN_RANGE],
    ] as const) {
      faces.push(
        `@font-face{font-family:"${PDF_FONT_FAMILY}";font-style:normal;font-weight:${weight === 400 ? "100 500" : "600 900"};font-display:block;` +
          `src:url("${origin}${PDF_FONT_DIR}/ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2") format("woff2");unicode-range:${range};}`,
      );
    }
  }
  return faces.join("\n");
}

/** Copy the app's stylesheets so Tailwind classes (widths, alignment, sizes) still apply. */
async function copyStylesheets(target: Document) {
  const loads: Promise<void>[] = [];
  for (const node of Array.from(
    document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'),
  )) {
    const copy = target.importNode(node, true) as HTMLLinkElement | HTMLStyleElement;
    if (copy instanceof HTMLLinkElement || copy.tagName === "LINK") {
      loads.push(
        new Promise<void>((resolve) => {
          copy.addEventListener("load", () => resolve(), { once: true });
          copy.addEventListener("error", () => resolve(), { once: true });
          setTimeout(resolve, 4000);
        }),
      );
    }
    target.head.appendChild(copy);
  }
  await Promise.all(loads);
}

async function loadPdfFonts(target: Document) {
  const fonts = target.fonts;
  if (!fonts?.load) return;
  const samples = ["أبجد هوز 123 ABC", "ABC abc 0123456789"];
  try {
    await Promise.all(
      ["400", "700"].flatMap((w) =>
        samples.map((t) => fonts.load(`${w} 16px "${PDF_FONT_FAMILY}"`, t)),
      ),
    );
    await fonts.ready;
  } catch {
    /* fall back to system fonts rather than failing the export */
  }
}

/** Thin rule plus "Page i / n" and the export time at the bottom of every page. */
function addPageFooters(pdf: import("jspdf").jsPDF, margin: number) {
  const total = pdf.getNumberOfPages();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const y = pageH - margin + 1;
  const stamp = new Date().toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.2);
    pdf.line(margin, y - 4, pageW - margin, y - 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Generated ${stamp}`, margin, y);
    pdf.text(`Page ${i} / ${total}`, pageW - margin, y, { align: "right" });
  }
}

/**
 * html2canvas paints each word with an LTR canvas, so brackets around Latin
 * text inside Arabic sentences come out reversed, e.g. ")P-101(". Isolating
 * those runs as LTR keeps the brackets the right way round.
 */
const ARABIC_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_IN_BRACKETS = /\([^()\u0600-\u06FF]*[A-Za-z0-9][^()\u0600-\u06FF]*\)/g;

function isolateLatinBrackets(root: HTMLElement) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? "";
    if (ARABIC_CHAR.test(text) && LATIN_IN_BRACKETS.test(text)) nodes.push(n as Text);
    LATIN_IN_BRACKETS.lastIndex = 0;
  }
  for (const node of nodes) {
    const text = node.nodeValue ?? "";
    const frag = doc.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(LATIN_IN_BRACKETS)) {
      const at = m.index ?? 0;
      if (at > last) frag.appendChild(doc.createTextNode(text.slice(last, at)));
      const span = doc.createElement("span");
      span.dir = "ltr";
      span.style.setProperty("unicode-bidi", "isolate", "important");
      span.textContent = m[0];
      frag.appendChild(span);
      last = at + m[0].length;
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    node.replaceWith(frag);
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

  const width = Math.max(measureContentWidth(source), opts.minWidth ?? 794);
  const clone = source.cloneNode(true) as HTMLElement;
  clone.id = `${opts.elementId}-pdf-clone`;
  clone.classList.add("pdf-export-root");
  clone.style.width = `${width}px`;
  clone.style.maxWidth = "none";
  clone.style.backgroundColor = "#ffffff";
  clone.style.color = "#111827";
  clone.style.borderColor = "#d1d5db";
  for (const hidden of Array.from(clone.querySelectorAll("[data-pdf-hide]"))) hidden.remove();
  replaceFormControls(clone, source);
  forceCanvasSafeColors(clone);
  isolateLatinBrackets(clone);

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
  frameDoc.documentElement.lang = document.documentElement.lang || "ar";
  frameDoc.documentElement.dir =
    source.closest<HTMLElement>("[dir]")?.dir || document.documentElement.dir || "rtl";
  await copyStylesheets(frameDoc);
  // html2canvas paints on a canvas owned by the main document, so the font
  // must be registered there too; otherwise glyph widths differ from layout
  // and Arabic words run into each other.
  if (!document.getElementById("urs-pdf-font")) {
    const mainFont = document.createElement("style");
    mainFont.id = "urs-pdf-font";
    mainFont.textContent = pdfFontFaceCss(window.location.origin);
    document.head.appendChild(mainFont);
  }
  await loadPdfFonts(document);
  const fontStyle = frameDoc.createElement("style");
  fontStyle.textContent = pdfFontFaceCss(window.location.origin);
  frameDoc.head.appendChild(fontStyle);

  const style = frameDoc.createElement("style");
  style.textContent = `
    html, body { margin: 0; padding: 0; background: #ffffff; color: #111827; }
    .pdf-export-root, .pdf-export-root * { font-family: "${PDF_FONT_FAMILY}", Arial, sans-serif !important; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td {
      border-color: #9ca3af !important;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: anywhere;
      padding-top: 8px !important;
      padding-bottom: 10px !important;
    }
    .pdf-export-root, .pdf-export-root * {
      color: #111827 !important;
      background-color: transparent !important;
      border-color: #d1d5db !important;
      box-shadow: none !important;
      text-shadow: none !important;
      caret-color: transparent !important;
      line-height: 1.6 !important;
      letter-spacing: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: normal !important;
      height: auto !important;
      max-height: none !important;
      -webkit-line-clamp: none !important;
      position: static !important;
      transform: none !important;
      float: none !important;
      backdrop-filter: none !important;
      filter: none !important;
    }
    .pdf-export-root [data-pdf-value] { white-space: pre-wrap !important; }
    /* Mixed Arabic/English text: let each paragraph pick its own direction,
       so Arabic values inside an English (LTR) sheet read and align correctly. */
    .pdf-export-root p, .pdf-export-root li, .pdf-export-root td, .pdf-export-root th,
    .pdf-export-root h1, .pdf-export-root h2, .pdf-export-root h3, .pdf-export-root h4,
    .pdf-export-root label, .pdf-export-root span, .pdf-export-root [data-pdf-value] {
      unicode-bidi: plaintext !important;
    }
    .pdf-export-root [data-pdf-value] { text-align: start !important; }
    /* Flex/grid layouts are unreliable in html2canvas and were overlapping.
       Flatten them into predictable block flow so nothing can collide. */
    .pdf-export-root { font-size: 13px !important; background-color: #ffffff !important; }
    .pdf-export-root [class*="flex"], .pdf-export-root [class*="grid"] {
      display: block !important;
      gap: 0 !important;
    }
    .pdf-export-root [class*="flex"] > *, .pdf-export-root [class*="grid"] > * {
      display: block !important;
      max-width: 100% !important;
      margin: 0 0 4px 0 !important;
      float: none !important;
    }
    .pdf-export-root td [class*="flex"] > * { margin-bottom: 2px !important; }
    .pdf-export-root img {
      display: block !important;
      width: auto !important;
      height: auto !important;
      max-width: 120px !important;
      max-height: 52px !important;
      margin: 0 0 4px 0 !important;
    }
    .pdf-export-root .pdf-photo-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 12px !important;
      margin-top: 8px !important;
    }
    .pdf-export-root .pdf-photo-grid > .pdf-photo-item {
      display: block !important;
      margin: 0 !important;
      padding: 8px !important;
      border: 1px solid #9ca3af !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .pdf-export-root .pdf-photo-item img {
      width: 100% !important;
      height: 250px !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 0 6px 0 !important;
      object-fit: contain !important;
    }
    .pdf-export-root h1, .pdf-export-root h2, .pdf-export-root h3 {
      margin: 0 0 6px 0 !important;
      font-size: 15px !important;
      line-height: 1.7 !important;
    }
    .pdf-export-root h1 { font-size: 18px !important; }
    .pdf-export-root .pdf-title-band {
      margin-top: 14px !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
    }
    .pdf-export-root br { display: block !important; }
    .pdf-export-root tr, .pdf-export-root thead, .pdf-export-root td, .pdf-export-root th,
    .pdf-export-root [data-pdf-value] { page-break-inside: avoid; break-inside: avoid; }


    .pdf-export-root thead, .pdf-export-root thead *,
    .pdf-export-root .pdf-title-band, .pdf-export-root .pdf-title-band * {
      background-color: #eaf4fb !important;
      color: #0f4c75 !important;
    }
    .pdf-export-root svg:not(.recharts-surface),
    .pdf-export-root svg:not(.recharts-surface) * {
      stroke: #111827 !important;
      fill: none !important;
    }
    /* Charts keep their own colors: recharts paints lines via stroke and
       axis/legend text via fill attributes. */
    .pdf-export-root .recharts-wrapper,
    .pdf-export-root .recharts-wrapper * {
      stroke: revert !important;
      fill: revert !important;
      color: revert !important;
    }
  `;
  frameDoc.head.appendChild(style);
  frameDoc.body.appendChild(frameDoc.importNode(clone, true));
  const frameClone = frameDoc.getElementById(clone.id) as HTMLElement | null;
  if (!frameClone) throw new Error("PDF clone not available");

  try {
    await loadPdfFonts(frameDoc);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    if (frameDoc.fonts?.ready) {
      try {
        await frameDoc.fonts.ready;
      } catch {
        /* ignore font loading issues */
      }
    }
    const images = Array.from(frameClone.querySelectorAll<HTMLImageElement>("img"));
    await Promise.all(
      images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 80));
    const contentHeight = Math.max(
      frameClone.scrollHeight,
      frameClone.getBoundingClientRect().height,
      200,
    );
    const contentWidth = Math.max(frameClone.scrollWidth, width);
    frame.style.height = `${contentHeight + 40}px`;
    frame.style.width = `${contentWidth}px`;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    // Browsers refuse to paint canvases beyond ~16k px per side / ~2^25 total px.
    // Exceeding that limit is what produced fully blank PDF pages on long sheets.
    const MAX_SIDE = 12000;
    const MAX_AREA = 26_000_000;
    const requested = Math.min(2.5, Math.max(1.6, window.devicePixelRatio || 1));
    const scale = Math.max(
      0.85,
      Math.min(
        requested,
        MAX_SIDE / contentHeight,
        MAX_SIDE / contentWidth,
        Math.sqrt(MAX_AREA / (contentWidth * contentHeight)),
      ),
    );

    const canvas = await html2canvas(frameClone, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: contentWidth,
      height: contentHeight,
      windowWidth: contentWidth,
      windowHeight: contentHeight + 40,
      scrollX: 0,
      scrollY: 0,
    });
    if (!canvas.width || !canvas.height) throw new Error("PDF rendering failed (empty canvas)");

    // Map real DOM block endings to canvas pixels. Page slices should end after
    // a complete table row or text field, never across its final line/border.
    const cloneRect = frameClone.getBoundingClientRect();
    const canvasRatio = canvas.height / contentHeight;
    const safeBreaks = Array.from(
      frameClone.querySelectorAll<HTMLElement>(
        "tr, thead, [data-pdf-value], [data-pdf-block], .pdf-title-band, .pdf-photo-item",
      ),
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return Math.round((rect.bottom - cloneRect.top + 3) * canvasRatio);
      })
      .filter((value) => value > 0 && value < canvas.height)
      .sort((a, b) => a - b);

    const pdf = new jsPDF(opts.orientation ?? "p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const footerH = 8; // reserved strip for the page footer
    const imgW = pageW - margin * 2;
    const usableH = pageH - margin * 2 - footerH;
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

    // Trim trailing blank space so we never emit empty pages at the end.
    let effectiveHeight = canvas.height;
    while (effectiveHeight > 10 && isBlankRow(effectiveHeight - 1)) effectiveHeight -= 8;
    effectiveHeight = Math.min(canvas.height, effectiveHeight + 8);

    const findBreak = (start: number, ideal: number) => {
      const limit = Math.min(effectiveHeight, ideal);
      const minAllowed = start + Math.floor(pxPerPage * 0.45);
      // Prefer a measured element boundary. This is the reliable path for
      // bordered tables where no visually blank scanline exists between rows.
      for (let i = safeBreaks.length - 1; i >= 0; i -= 1) {
        const candidate = safeBreaks[i];
        if (candidate <= limit - 2 && candidate > minAllowed) return candidate;
      }
      for (let y = limit; y > minAllowed; y -= 1) {
        if (isBlankRow(y)) return y;
      }
      return limit;
    };

    let offset = 0;
    let first = true;
    while (offset < effectiveHeight) {
      const remaining = effectiveHeight - offset;
      const sliceH =
        remaining <= pxPerPage ? remaining : findBreak(offset, offset + pxPerPage) - offset;
      const safeSliceH = Math.max(1, Math.min(sliceH, remaining));

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = safeSliceH;
      const pageCtx = pageCanvas.getContext("2d");
      if (pageCtx) {
        pageCtx.fillStyle = "#ffffff";
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(
          canvas,
          0,
          offset,
          canvas.width,
          safeSliceH,
          0,
          0,
          canvas.width,
          safeSliceH,
        );
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

    addPageFooters(pdf, margin);

    return {
      blob: withMimeType(pdf.output("blob"), PDF_MIME),
      filename: ensureFileExtension(opts.filename, ".pdf"),
    };
  } finally {
    frame.remove();
  }
}
