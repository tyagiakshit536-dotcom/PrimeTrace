const GHOST_SIGNATURE_VERSION = 1 as const;
const GHOST_SIGNATURE_KEY_PREFIX = "ghost-signature:v1";
const FONT_TEST_TEXT = "mmmmmmmmmmlliWW00@@";

const FONT_PROBE_SET = [
  "Arial",
  "Arial Black",
  "Bahnschrift",
  "Calibri",
  "Cambria",
  "Candara",
  "Consolas",
  "Courier New",
  "Franklin Gothic Medium",
  "Garamond",
  "Georgia",
  "Helvetica",
  "Impact",
  "Lucida Console",
  "Palatino Linotype",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "Inter",
  "JetBrains Mono",
] as const;

const BASE_FONT_FAMILIES = ["monospace", "sans-serif", "serif"] as const;

type ExtendedNavigator = Navigator & {
  deviceMemory?: number;
};

export interface GhostFingerprintVector {
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  language: string;
  languages: string[];
  platform: string;
  timezone: string;
  colorDepth: number;
  pixelDepth: number;
  screenWidth: number;
  screenHeight: number;
  availableFonts: string[];
}

export interface GhostSignature {
  version: typeof GHOST_SIGNATURE_VERSION;
  id: string;
  seed: number;
  origin: string;
  createdAt: string;
  fingerprintHash: string;
}

export type GhostCharcoalFlavor = "blue-grey-charcoal" | "warm-black-charcoal";

export interface GhostPersonality {
  parity: "even" | "odd";
  charcoalFlavor: GhostCharcoalFlavor;
  charcoalHex: string;
}

function getCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "unknown-origin";
  }

  return window.location.origin || "unknown-origin";
}

function toScopedStorageKey(origin: string): string {
  return `${GHOST_SIGNATURE_KEY_PREFIX}:${origin.toLowerCase()}`;
}

function parseStoredSignature(rawValue: string | null, origin: string): GhostSignature | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<GhostSignature>;

    if (
      parsed.version !== GHOST_SIGNATURE_VERSION ||
      typeof parsed.id !== "string" ||
      typeof parsed.seed !== "number" ||
      typeof parsed.origin !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.fingerprintHash !== "string"
    ) {
      return null;
    }

    if (parsed.origin.toLowerCase() !== origin.toLowerCase()) {
      return null;
    }

    return {
      version: GHOST_SIGNATURE_VERSION,
      id: parsed.id,
      seed: parsed.seed,
      origin: parsed.origin,
      createdAt: parsed.createdAt,
      fingerprintHash: parsed.fingerprintHash,
    };
  } catch {
    return null;
  }
}

function formatGhostId(hashHex: string): string {
  const base = hashHex.slice(0, 7).padEnd(7, "0");
  const tailSource = Number.parseInt(hashHex.slice(7, 9), 16);
  const numericTail = Number.isFinite(tailSource)
    ? String(Math.abs(tailSource) % 10)
    : "0";
  const compact = `${base}${numericTail}`;
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}`;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0").repeat(8);
}

async function hashStringToHex(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const digestBytes = Array.from(new Uint8Array(digest));

    return digestBytes
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  return fnv1aHex(value);
}

function detectAvailableFonts(candidates: readonly string[]): string[] {
  if (typeof document === "undefined") {
    return [];
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return [];
  }

  const baselineWidths = new Map<string, number>();

  for (const baseFamily of BASE_FONT_FAMILIES) {
    context.font = `72px ${baseFamily}`;
    baselineWidths.set(baseFamily, context.measureText(FONT_TEST_TEXT).width);
  }

  const available: string[] = [];

  for (const candidate of candidates) {
    const escapedCandidate = candidate.replace(/'/g, "\\'");
    let isAvailable = false;

    for (const baseFamily of BASE_FONT_FAMILIES) {
      context.font = `72px '${escapedCandidate}', ${baseFamily}`;
      const measuredWidth = context.measureText(FONT_TEST_TEXT).width;
      const baselineWidth = baselineWidths.get(baseFamily);

      if (typeof baselineWidth === "number" && measuredWidth !== baselineWidth) {
        isAvailable = true;
        break;
      }
    }

    if (isAvailable) {
      available.push(candidate);
    }
  }

  return available;
}

function collectFingerprintVector(): GhostFingerprintVector {
  const nav = navigator as ExtendedNavigator;
  const screenInfo = window.screen;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown";
  const language = nav.language ?? "unknown";
  const languages = Array.isArray(nav.languages)
    ? nav.languages.slice(0, 6)
    : [language];
  const dpr = Number.isFinite(window.devicePixelRatio)
    ? Number(window.devicePixelRatio.toFixed(4))
    : 1;

  return {
    devicePixelRatio: dpr,
    hardwareConcurrency: Number.isFinite(nav.hardwareConcurrency)
      ? nav.hardwareConcurrency
      : 0,
    deviceMemory:
      typeof nav.deviceMemory === "number" && Number.isFinite(nav.deviceMemory)
        ? nav.deviceMemory
        : 0,
    maxTouchPoints: Number.isFinite(nav.maxTouchPoints) ? nav.maxTouchPoints : 0,
    language,
    languages,
    platform: nav.platform || "unknown",
    timezone,
    colorDepth: Number.isFinite(screenInfo?.colorDepth) ? screenInfo.colorDepth : 0,
    pixelDepth: Number.isFinite(screenInfo?.pixelDepth) ? screenInfo.pixelDepth : 0,
    screenWidth: Number.isFinite(screenInfo?.width) ? screenInfo.width : 0,
    screenHeight: Number.isFinite(screenInfo?.height) ? screenInfo.height : 0,
    availableFonts: detectAvailableFonts(FONT_PROBE_SET),
  };
}

function getIdParity(id: string): "even" | "odd" {
  const endingValue = Number.parseInt(id.slice(-1), 10);

  if (!Number.isFinite(endingValue)) {
    return "even";
  }

  return endingValue % 2 === 0 ? "even" : "odd";
}

function hexToRgbTriplet(hexColor: string): string {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "56, 64, 74";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `${red}, ${green}, ${blue}`;
}

export function deriveGhostPersonality(
  signature: Pick<GhostSignature, "id"> | null | undefined
): GhostPersonality {
  const parity = signature ? getIdParity(signature.id) : "even";

  if (parity === "even") {
    return {
      parity,
      charcoalFlavor: "blue-grey-charcoal",
      charcoalHex: "#3b4653",
    };
  }

  return {
    parity,
    charcoalFlavor: "warm-black-charcoal",
    charcoalHex: "#3c3028",
  };
}

export function applyGhostSignatureToDocument(signature: GhostSignature | null): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  if (!signature) {
    root.removeAttribute("data-ghost-id");
    root.removeAttribute("data-ghost-parity");
    root.removeAttribute("data-ghost-charcoal");
    root.style.removeProperty("--ghost-charcoal");
    root.style.removeProperty("--ghost-charcoal-rgb");
    return;
  }

  const personality = deriveGhostPersonality(signature);

  root.setAttribute("data-ghost-id", signature.id);
  root.setAttribute("data-ghost-parity", personality.parity);
  root.setAttribute("data-ghost-charcoal", personality.charcoalFlavor);
  root.style.setProperty("--ghost-charcoal", personality.charcoalHex);
  root.style.setProperty("--ghost-charcoal-rgb", hexToRgbTriplet(personality.charcoalHex));
}

export function readGhostSignature(): GhostSignature | null {
  if (typeof window === "undefined") {
    return null;
  }

  const origin = getCurrentOrigin();
  const storageKey = toScopedStorageKey(origin);

  try {
    return parseStoredSignature(window.localStorage.getItem(storageKey), origin);
  } catch {
    return null;
  }
}

export async function ensureGhostSignature(): Promise<GhostSignature> {
  if (typeof window === "undefined") {
    throw new Error("Ghost signature can only be generated in a browser runtime.");
  }

  const origin = getCurrentOrigin();
  const storageKey = toScopedStorageKey(origin);

  const persisted = readGhostSignature();
  if (persisted) {
    applyGhostSignatureToDocument(persisted);
    return persisted;
  }

  const fingerprintVector = collectFingerprintVector();
  const fingerprintSource = JSON.stringify(fingerprintVector);
  const fingerprintHash = await hashStringToHex(fingerprintSource);

  const nextSignature: GhostSignature = {
    version: GHOST_SIGNATURE_VERSION,
    id: formatGhostId(fingerprintHash),
    seed: Number.parseInt(fingerprintHash.slice(8, 16), 16) >>> 0,
    origin,
    createdAt: new Date().toISOString(),
    fingerprintHash,
  };

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(nextSignature));
  } catch {
    // Continue without persistence when local storage is blocked.
  }

  applyGhostSignatureToDocument(nextSignature);
  return nextSignature;
}
