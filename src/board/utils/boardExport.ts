import { Matrix2D, toCssMatrix } from "../../canvas/math/matrix2d";

export type BoardExportFormat = "png" | "svg" | "json" | "pdf" | "webp";

export interface BoardRenderSnapshot {
  viewportElement: HTMLElement;
  worldElement?: HTMLElement | null;
  matrix?: Matrix2D;
  backgroundColor?: string;
  title?: string;
}

export interface BoardJsonExportPayload<TData = unknown> {
  exportedAt: string;
  format: "detective-board-json";
  version: 1;
  title: string;
  data: TData;
}

export interface BoardImageExportOptions {
  filename?: string;
  title?: string;
  pixelRatio?: number;
  backgroundColor?: string;
  quality?: number;
}

export interface BoardJsonDownloadOptions<TData = unknown> {
  filename?: string;
  title?: string;
  data: TData;
}

export interface BoardPdfExportOptions extends BoardImageExportOptions {
  printWindowTitle?: string;
}

const DEFAULT_FILENAME_PREFIX = "detective-board";
const DEFAULT_BACKGROUND = "#121212";
const DEFAULT_EXPORT_QUALITY = 0.92;

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getTimestampPart(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function buildBoardExportFilename(
  format: BoardExportFormat,
  title = DEFAULT_FILENAME_PREFIX,
  now = new Date()
): string {
  const safeTitle = sanitizeFilenamePart(title) || DEFAULT_FILENAME_PREFIX;
  return `${safeTitle}-${getTimestampPart(now)}.${format}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function collectViewportStyles(element: HTMLElement): {
  backgroundColor: string;
  color: string;
  fontFamily: string;
} {
  const computed = window.getComputedStyle(element);

  return {
    backgroundColor:
      computed.backgroundColor && computed.backgroundColor !== "rgba(0, 0, 0, 0)"
        ? computed.backgroundColor
        : DEFAULT_BACKGROUND,
    color: computed.color,
    fontFamily: computed.fontFamily,
  };
}

function cloneForExport(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  clone.querySelectorAll("input, textarea, select").forEach((element) => {
    const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    if (field instanceof HTMLTextAreaElement) {
      field.textContent = field.value;
      return;
    }

    if (field instanceof HTMLSelectElement) {
      Array.from(field.options).forEach((option) => {
        option.selected = option.value === field.value;
      });
      return;
    }

    if (field.type === "checkbox" || field.type === "radio") {
      if (field.checked) {
        field.setAttribute("checked", "checked");
      } else {
        field.removeAttribute("checked");
      }
      return;
    }

    field.setAttribute("value", field.value);
  });

  clone.querySelectorAll("[data-board-export-hidden='true']").forEach((element) => {
    element.remove();
  });

  return clone;
}

function buildSvgMarkup(snapshot: BoardRenderSnapshot): string {
  const viewportElement = snapshot.viewportElement;
  const worldElement = snapshot.worldElement ?? snapshot.viewportElement;

  const width = viewportElement.clientWidth;
  const height = viewportElement.clientHeight;

  if (width <= 0 || height <= 0) {
    throw new Error("Cannot export a board with an empty viewport.");
  }

  const styles = collectViewportStyles(viewportElement);
  const clonedWorld = cloneForExport(worldElement);

  if (snapshot.matrix) {
    clonedWorld.style.transform = toCssMatrix(snapshot.matrix);
    clonedWorld.style.transformOrigin = "0 0";
  }

  const serializedWorld = new XMLSerializer().serializeToString(clonedWorld);
  const backgroundColor = snapshot.backgroundColor ?? styles.backgroundColor;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}" />
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;position:relative;overflow:hidden;color:${escapeXml(
      styles.color
    )};font-family:${escapeXml(styles.fontFamily)};">
      ${serializedWorld}
    </div>
  </foreignObject>
</svg>`;
}

export function createBoardSvgBlob(snapshot: BoardRenderSnapshot): Blob {
  return new Blob([buildSvgMarkup(snapshot)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

async function svgMarkupToImage(svgMarkup: string): Promise<HTMLImageElement> {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const image = new Image();
  image.decoding = "sync";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to decode board export image."));
    image.src = dataUrl;
  });

  return image;
}

async function createBoardRasterBlob(
  snapshot: BoardRenderSnapshot,
  mimeType: "image/png" | "image/webp",
  options: BoardImageExportOptions = {}
): Promise<Blob> {
  const width = snapshot.viewportElement.clientWidth;
  const height = snapshot.viewportElement.clientHeight;

  if (width <= 0 || height <= 0) {
    throw new Error("Cannot export a board with an empty viewport.");
  }

  const pixelRatio = Math.max(1, options.pixelRatio ?? window.devicePixelRatio ?? 1);
  const svgMarkup = buildSvgMarkup(snapshot);
  const image = await svgMarkupToImage(svgMarkup);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable for export.");
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = options.backgroundColor ?? snapshot.backgroundColor ?? DEFAULT_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create board export file."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      options.quality ?? DEFAULT_EXPORT_QUALITY
    );
  });
}

export async function createBoardPngBlob(
  snapshot: BoardRenderSnapshot,
  options: BoardImageExportOptions = {}
): Promise<Blob> {
  return await createBoardRasterBlob(snapshot, "image/png", options);
}

export async function createBoardWebpBlob(
  snapshot: BoardRenderSnapshot,
  options: BoardImageExportOptions = {}
): Promise<Blob> {
  return await createBoardRasterBlob(snapshot, "image/webp", options);
}

export function downloadBoardSvg(
  snapshot: BoardRenderSnapshot,
  options: BoardImageExportOptions = {}
): void {
  const filename =
    options.filename ?? buildBoardExportFilename("svg", options.title ?? snapshot.title);

  triggerDownload(createBoardSvgBlob(snapshot), filename);
}

export async function downloadBoardPng(
  snapshot: BoardRenderSnapshot,
  options: BoardImageExportOptions = {}
): Promise<void> {
  const filename =
    options.filename ?? buildBoardExportFilename("png", options.title ?? snapshot.title);

  const blob = await createBoardPngBlob(snapshot, options);
  triggerDownload(blob, filename);
}

export async function downloadBoardWebp(
  snapshot: BoardRenderSnapshot,
  options: BoardImageExportOptions = {}
): Promise<void> {
  const filename =
    options.filename ?? buildBoardExportFilename("webp", options.title ?? snapshot.title);

  const blob = await createBoardWebpBlob(snapshot, options);
  triggerDownload(blob, filename);
}

export function downloadBoardJson<TData>(
  options: BoardJsonDownloadOptions<TData>
): BoardJsonExportPayload<TData> {
  const payload: BoardJsonExportPayload<TData> = {
    exportedAt: new Date().toISOString(),
    format: "detective-board-json",
    version: 1,
    title: options.title ?? DEFAULT_FILENAME_PREFIX,
    data: options.data,
  };

  const filename =
    options.filename ??
    buildBoardExportFilename("json", options.title ?? DEFAULT_FILENAME_PREFIX);

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  triggerDownload(blob, filename);
  return payload;
}

export async function openBoardPdfPrintWindow(
  snapshot: BoardRenderSnapshot,
  options: BoardPdfExportOptions = {}
): Promise<Window> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Popup was blocked while preparing the PDF export.");
  }

  const title =
    options.printWindowTitle ?? options.title ?? snapshot.title ?? "Detective Board";
  const safeTitle = escapeXml(title);

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0f0f0f;
        color: #f0f0f0;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
    </style>
  </head>
  <body>
    <main>Preparing PDF preview...</main>
  </body>
</html>`);
  printWindow.document.close();

  let pngUrl: string | null = null;

  try {
    const pngBlob = await createBoardPngBlob(snapshot, options);
    pngUrl = URL.createObjectURL(pngBlob);

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #0f0f0f;
        color: #f0f0f0;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      main {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 20px;
      }
      img {
        display: block;
        max-width: 100%;
        max-height: calc(100vh - 40px);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
        background: #121212;
      }
      @media print {
        html, body {
          background: #ffffff;
        }
        main {
          padding: 0;
        }
        img {
          max-width: 100vw;
          max-height: 100vh;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <img src="${pngUrl}" alt="${safeTitle}" />
    </main>
    <script>
      window.addEventListener("load", function () {
        var image = document.querySelector("img");

        function triggerPrint() {
          setTimeout(function () {
            window.focus();
            window.print();
          }, 120);
        }

        if (!image) {
          triggerPrint();
          return;
        }

        if (image.complete) {
          triggerPrint();
          return;
        }

        image.addEventListener("load", triggerPrint, { once: true });
        image.addEventListener("error", triggerPrint, { once: true });
      });
      window.addEventListener("afterprint", function () {
        window.close();
      });
    </script>
  </body>
</html>`);
    printWindow.document.close();

    printWindow.addEventListener(
      "beforeunload",
      () => {
        if (pngUrl) {
          URL.revokeObjectURL(pngUrl);
        }
      },
      { once: true }
    );

    return printWindow;
  } catch (error) {
    if (pngUrl) {
      URL.revokeObjectURL(pngUrl);
    }

    try {
      printWindow.close();
    } catch {
      // Ignore close failures.
    }

    throw error;
  }
}
