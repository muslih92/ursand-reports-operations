export interface ExportFile {
  blob: Blob;
  filename: string;
}

export interface DownloadLink {
  url: string;
  filename: string;
}

export function safeFilePart(value: string | null | undefined, fallback = "Report") {
  const cleaned = (value || fallback).replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

export function triggerBlobDownload(blob: Blob, filename: string): DownloadLink {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { url, filename };
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
    element.style.removeProperty("background-image");
    element.style.removeProperty("background");
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
    table { border-collapse: collapse; }
    th, td { border-color: #9ca3af !important; }
    .pdf-export-root, .pdf-export-root * {
      color: #111827 !important;
      background-color: #ffffff !important;
      border-color: #d1d5db !important;
      box-shadow: none !important;
      text-shadow: none !important;
      caret-color: transparent !important;
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
  `;
  frameDoc.head.appendChild(style);
  frameDoc.body.appendChild(frameDoc.importNode(clone, true));
  const frameClone = frameDoc.getElementById(clone.id) as HTMLElement | null;
  if (!frameClone) throw new Error("PDF clone not available");

  try {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    frame.style.height = `${Math.max(frameClone.scrollHeight + 40, 1400)}px`;
    const canvas = await html2canvas(frameClone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: width,
      scrollX: 0,
      scrollY: 0,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF(opts.orientation ?? "p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const imgW = pageW - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    let heightLeft = imgH;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, imgW, imgH);
    heightLeft -= pageH - margin * 2;
    while (heightLeft > 0) {
      position = margin - (imgH - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
    }

    return { blob: pdf.output("blob"), filename: opts.filename };
  } finally {
    frame.remove();
  }
}