import "./theme.css";
import {
  ButtonHTMLAttributes,
  CSSProperties,
  ChangeEvent,
  memo,
  ReactNode,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackgroundMode,
  BackgroundOptions,
  Matrix2D,
  getMatrixUniformScale,
} from "../canvas";
import { BoardStorage, BoardStorageSnapshot } from "../storage";
import {
  DetectiveBoardCanvas,
  DetectiveBoardCanvasControls,
} from "./DetectiveBoardCanvas";
import {
  AudioEvidenceNode,
  ChecklistBoardNode,
  EvidenceDocumentNode,
  GifNode,
  InterrogationLogNode,
  MapNode,
  PhotoDropNode,
  PollNode,
  ProfessionTemplateNode,
  ShapeNode,
  StickyNoteNode,
  SuspectProfileNode,
  ThreadHubNode,
  TimelineEventNode,
  VideoEvidenceNode,
  IconZoomIn,
  IconZoomOut,
  IconResetView,
  IconUndo,
  IconRedo,
  IconAddThread,
  IconAddNote,
  IconAddPhoto,
  IconAddDocument,
  IconAddMap,
  IconAddPoll,
  IconAddTimeline,
  IconAddThreadHub,
  IconAddGIF,
  IconAddShape,
  IconAddAudio,
  IconAddVideo,
  IconAddSuspect,
  IconAddInterrogation,
  IconAddChecklist,
  IconRemoveNode,
  IconDuplicate,
  IconAutoArrange,
  IconClearBoard,
  IconExport,
  IconImport,
  IconCollapse,
  IconToggleBackground,
  IconUpload,
  IconClear,
  IconPanelToggle,
  BOARD_NODE_DELETE_EVENT,
  BOARD_NODE_DUPLICATE_EVENT,
  BoardNodeActionEventDetail,
} from "./components";
import {
  BoardConnection,
  BoardConnectionRequest,
  NodePinAnchor,
  ThreadCreateOptions,
  ThreadLineDesign,
  ThreadStyle,
} from "./connections";
import {
  blobToDataUrl,
  compressImageFileToBase64,
  dataUrlToBlob,
} from "./utils/imageCompression";
import { DetectiveNodeType, patchNodeMeta, readNodeMeta } from "./storage/nodeState";
import {
  buildBoardExportFilename,
  downloadBoardPng,
  downloadBoardSvg,
  downloadBoardWebp,
  openBoardPdfPrintWindow,
} from "./utils/boardExport";
import {
  ALL_TOOL_DEFINITIONS,
  BoardToolDefinition,
  BoardToolIconKey,
  DEFAULT_PINNED_TOOL_IDS,
} from "./toolCatalog";
import { deriveGhostPersonality, type GhostSignature } from "../ghost";

export interface DetectiveBoardPresetProps {
  storage?: BoardStorage;
  ghostSignature?: GhostSignature | null;
  className?: string;
  style?: CSSProperties;
}

const defaultStorage = new BoardStorage({ namespace: "detective-board" });

const BOARD_THEME_META_KEY = "theme";
const BOARD_THEME_PRESET_META_KEY = "theme-preset";
const BOARD_TITLE_META_KEY = "title";
const BOARD_BACKGROUND_META_KEY = "background-mode";
const BOARD_BACKGROUND_IMAGE_META_KEY = "background-image";
const BOARD_BACKGROUND_BLOB_KEY = "board-background-image";
const BOARD_THREAD_STYLE_META_KEY = "thread-style";
const BOARD_THREAD_SETTINGS_META_KEY = "thread-settings";
const BOARD_PINNED_TOOLS_META_KEY = "pinned-tools";
const HISTORY_LIMIT = 40;

type BoardThemePresetId =
  | "dark"
  | "light"
  | "nature"
  | "detective"
  | "hacker"
  | "cyberpunk";

interface BoardThemeState {
  planeColor: string;
  gridColor: string;
  majorGridColor: string;
  threadColor: string;
}

interface BoardThemePreset extends BoardThemeState {
  id: BoardThemePresetId;
  name: string;
  uiBg: string;
  uiBorder: string;
  uiText: string;
  uiMuted: string;
  nodeShadow: string;
  nodeShadowHover: string;
}

interface BoardBackgroundImageMeta {
  blobKey: string | null;
  opacity: number;
  brightness: number;
}

interface BoardNodeEntry {
  id: string;
  type: DetectiveNodeType;
}

interface ThreadStudioState {
  style: ThreadStyle;
  colorHex: string;
  opacity: number;
  brightness: number;
  width: number;
  lineDesign: ThreadLineDesign;
}

const TOOL_DEFINITIONS_BY_ID = new Map<string, BoardToolDefinition>(
  ALL_TOOL_DEFINITIONS.map((tool) => [tool.id, tool])
);

const DEFAULT_THEME_PRESET_ID: BoardThemePresetId = "detective";

const THEME_PRESETS: readonly BoardThemePreset[] = [
  {
    id: "dark",
    name: "Dark",
    planeColor: "#121212",
    gridColor: "#8f8f8f",
    majorGridColor: "#d1d1d1",
    threadColor: "#909090",
    uiBg: "rgba(18, 18, 18, 0.82)",
    uiBorder: "rgba(255, 255, 255, 0.14)",
    uiText: "rgba(241, 241, 241, 0.94)",
    uiMuted: "rgba(229, 229, 229, 0.66)",
    nodeShadow: "0 10px 28px rgba(0, 0, 0, 0.44), 0 2px 8px rgba(0, 0, 0, 0.34)",
    nodeShadowHover: "0 16px 36px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.38)",
  },
  {
    id: "light",
    name: "Light",
    planeColor: "#f2f1ec",
    gridColor: "#6d6d6d",
    majorGridColor: "#3f3f3f",
    threadColor: "#4a4a4a",
    uiBg: "rgba(247, 247, 242, 0.86)",
    uiBorder: "rgba(24, 24, 24, 0.18)",
    uiText: "rgba(24, 24, 24, 0.92)",
    uiMuted: "rgba(42, 42, 42, 0.56)",
    nodeShadow: "0 8px 20px rgba(0, 0, 0, 0.14), 0 1px 4px rgba(0, 0, 0, 0.12)",
    nodeShadowHover: "0 12px 30px rgba(0, 0, 0, 0.2), 0 3px 8px rgba(0, 0, 0, 0.16)",
  },
  {
    id: "nature",
    name: "Nature",
    planeColor: "#1f2a22",
    gridColor: "#9ca693",
    majorGridColor: "#d2dbc8",
    threadColor: "#b8c2a9",
    uiBg: "rgba(22, 30, 24, 0.84)",
    uiBorder: "rgba(196, 205, 187, 0.24)",
    uiText: "rgba(229, 236, 221, 0.94)",
    uiMuted: "rgba(212, 220, 204, 0.64)",
    nodeShadow: "0 10px 28px rgba(8, 12, 8, 0.5), 0 2px 8px rgba(7, 10, 7, 0.3)",
    nodeShadowHover: "0 16px 36px rgba(8, 12, 8, 0.58), 0 4px 12px rgba(7, 10, 7, 0.34)",
  },
  {
    id: "detective",
    name: "Detective",
    planeColor: "#151312",
    gridColor: "#9a8f80",
    majorGridColor: "#d3c8b8",
    threadColor: "#afa38f",
    uiBg: "rgba(24, 20, 18, 0.86)",
    uiBorder: "rgba(228, 214, 191, 0.22)",
    uiText: "rgba(240, 231, 215, 0.94)",
    uiMuted: "rgba(224, 212, 194, 0.62)",
    nodeShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.28)",
    nodeShadowHover: "0 16px 40px rgba(0, 0, 0, 0.58), 0 5px 14px rgba(0, 0, 0, 0.32)",
  },
  {
    id: "hacker",
    name: "Hacker",
    planeColor: "#050b05",
    gridColor: "#2e7a2e",
    majorGridColor: "#48b448",
    threadColor: "#59d859",
    uiBg: "rgba(5, 14, 5, 0.84)",
    uiBorder: "rgba(92, 218, 92, 0.28)",
    uiText: "rgba(183, 255, 183, 0.94)",
    uiMuted: "rgba(150, 230, 150, 0.6)",
    nodeShadow: "0 10px 28px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.32)",
    nodeShadowHover: "0 16px 36px rgba(0, 0, 0, 0.58), 0 4px 12px rgba(0, 0, 0, 0.36)",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    planeColor: "#120820",
    gridColor: "#5ec8d4",
    majorGridColor: "#f3ecff",
    threadColor: "#b5f0ff",
    uiBg: "rgba(20, 10, 36, 0.86)",
    uiBorder: "rgba(161, 230, 255, 0.24)",
    uiText: "rgba(233, 245, 255, 0.96)",
    uiMuted: "rgba(196, 225, 245, 0.66)",
    nodeShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 10px rgba(0, 0, 0, 0.3)",
    nodeShadowHover: "0 16px 42px rgba(0, 0, 0, 0.6), 0 4px 14px rgba(0, 0, 0, 0.34)",
  },
];

const DEFAULT_THREAD_STYLE: ThreadStyle = "curve";
const DEFAULT_THREAD_OPACITY = 0.92;
const DEFAULT_THREAD_BRIGHTNESS = 100;
const DEFAULT_THREAD_WIDTH = 3;
const DEFAULT_THREAD_LINE_DESIGN: ThreadLineDesign = "solid";
const DEFAULT_SOURCE_PIN_ANCHOR: NodePinAnchor = "right";
const DEFAULT_TARGET_PIN_ANCHOR: NodePinAnchor = "left";

const THREAD_STYLE_LABELS: Record<ThreadStyle, string> = {
  curve: "Curve",
  straight: "Straight",
  zigzag: "Zig Zag",
  arc: "Arc",
  handmade: "Handmade",
};

const THREAD_LINE_DESIGN_LABELS: Record<ThreadLineDesign, string> = {
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  "dash-dot": "Dash Dot",
  double: "Double",
};

const DEFAULT_NODES: readonly BoardNodeEntry[] = [
  { id: "thread-hub-1", type: "thread-hub" },
  { id: "note-1", type: "sticky-note" },
  { id: "photo-1", type: "photo-drop" },
  { id: "doc-1", type: "evidence-document" },
  { id: "map-1", type: "map-node" },
  { id: "poll-1", type: "poll-node" },
  { id: "timeline-1", type: "timeline-event" },
  { id: "shape-1", type: "shape-node" },
  { id: "suspect-1", type: "suspect-profile" },
  { id: "audio-1", type: "audio-evidence" },
];

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const expanded = normalized
      .slice(1)
      .split("")
      .map((entry) => `${entry}${entry}`)
      .join("");

    return `#${expanded}`;
  }

  return fallback;
}

function hexToRgba(hexColor: string, alpha: number): string {
  const normalized = normalizeHexColor(hexColor, "#ffffff").slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function getHexLuminance(hexColor: string): number {
  const normalized = normalizeHexColor(hexColor, "#000000").slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return (red * 299 + green * 587 + blue * 114) / 255000;
}

function mixHexColors(baseHexColor: string, tintHexColor: string, ratio: number): string {
  const base = normalizeHexColor(baseHexColor, "#000000").slice(1);
  const tint = normalizeHexColor(tintHexColor, "#000000").slice(1);
  const blendRatio = Math.max(0, Math.min(1, ratio));

  const mixChannel = (baseOffset: number): string => {
    const baseValue = Number.parseInt(base.slice(baseOffset, baseOffset + 2), 16);
    const tintValue = Number.parseInt(tint.slice(baseOffset, baseOffset + 2), 16);

    const mixed = Math.round(baseValue * (1 - blendRatio) + tintValue * blendRatio);
    return mixed.toString(16).padStart(2, "0");
  };

  return `#${mixChannel(0)}${mixChannel(2)}${mixChannel(4)}`;
}

function normalizeRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function isThreadStyle(value: unknown): value is ThreadStyle {
  return (
    value === "curve" ||
    value === "straight" ||
    value === "zigzag" ||
    value === "arc" ||
    value === "handmade"
  );
}

function isThreadLineDesign(value: unknown): value is ThreadLineDesign {
  return (
    value === "solid" ||
    value === "dashed" ||
    value === "dotted" ||
    value === "dash-dot" ||
    value === "double"
  );
}

function isNodePinAnchor(value: unknown): value is NodePinAnchor {
  return (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

function isThemePresetId(value: unknown): value is BoardThemePresetId {
  return (
    value === "dark" ||
    value === "light" ||
    value === "nature" ||
    value === "detective" ||
    value === "hacker" ||
    value === "cyberpunk"
  );
}

function getThemePreset(themeId: BoardThemePresetId): BoardThemePreset {
  return (
    THEME_PRESETS.find((preset) => preset.id === themeId) ??
    THEME_PRESETS.find((preset) => preset.id === DEFAULT_THEME_PRESET_ID) ??
    THEME_PRESETS[0]
  );
}

function readThemePresetId(storage: BoardStorage): BoardThemePresetId {
  const persisted = storage.getBoardMeta<unknown>(BOARD_THEME_PRESET_META_KEY);
  return isThemePresetId(persisted) ? persisted : DEFAULT_THEME_PRESET_ID;
}

function readThemeState(storage: BoardStorage, fallback: BoardThemeState): BoardThemeState {
  const persisted = storage.getBoardMeta<Record<string, unknown>>(BOARD_THEME_META_KEY);

  return {
    planeColor: normalizeHexColor(persisted?.planeColor, fallback.planeColor),
    gridColor: normalizeHexColor(persisted?.gridColor, fallback.gridColor),
    majorGridColor: normalizeHexColor(persisted?.majorGridColor, fallback.majorGridColor),
    threadColor: normalizeHexColor(persisted?.threadColor, fallback.threadColor),
  };
}

function readBackgroundImageMeta(storage: BoardStorage): BoardBackgroundImageMeta {
  const persisted = storage.getBoardMeta<Record<string, unknown>>(BOARD_BACKGROUND_IMAGE_META_KEY);

  return {
    blobKey: typeof persisted?.blobKey === "string" ? persisted.blobKey : null,
    opacity: normalizeRange(persisted?.opacity, 0.08, 0.96, 0.42),
    brightness: normalizeRange(persisted?.brightness, 35, 180, 100),
  };
}

function readThreadStyle(storage: BoardStorage): ThreadStyle {
  const persisted = storage.getBoardMeta<unknown>(BOARD_THREAD_STYLE_META_KEY);
  return isThreadStyle(persisted) ? persisted : DEFAULT_THREAD_STYLE;
}

function readThreadStudioState(
  storage: BoardStorage,
  fallbackColorHex: string
): ThreadStudioState {
  const persisted = storage.getBoardMeta<Record<string, unknown>>(
    BOARD_THREAD_SETTINGS_META_KEY
  );

  return {
    style: isThreadStyle(persisted?.style)
      ? persisted.style
      : readThreadStyle(storage),
    colorHex: normalizeHexColor(persisted?.colorHex, fallbackColorHex),
    opacity: normalizeRange(persisted?.opacity, 0.2, 1, DEFAULT_THREAD_OPACITY),
    brightness: normalizeRange(
      persisted?.brightness,
      40,
      180,
      DEFAULT_THREAD_BRIGHTNESS
    ),
    width: normalizeRange(persisted?.width, 1, 14, DEFAULT_THREAD_WIDTH),
    lineDesign: isThreadLineDesign(persisted?.lineDesign)
      ? persisted.lineDesign
      : DEFAULT_THREAD_LINE_DESIGN,
  };
}

function normalizePinnedToolIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string" || seen.has(entry)) {
      continue;
    }

    if (!TOOL_DEFINITIONS_BY_ID.has(entry)) {
      continue;
    }

    seen.add(entry);
    result.push(entry);
  }

  return result;
}

function readPinnedToolIds(storage: BoardStorage): string[] {
  const persisted = normalizePinnedToolIds(
    storage.getBoardMeta<unknown>(BOARD_PINNED_TOOLS_META_KEY)
  );

  if (persisted.length > 0) {
    return persisted;
  }

  return [...DEFAULT_PINNED_TOOL_IDS];
}

function renderToolIcon(
  iconKey: BoardToolIconKey,
  glyph: string,
  toolId?: string
): ReactNode {
  if (iconKey === "note") return <IconAddNote />;
  if (iconKey === "photo") return <IconAddPhoto />;
  if (iconKey === "document") return <IconAddDocument />;
  if (iconKey === "map") return <IconAddMap />;
  if (iconKey === "poll") return <IconAddPoll />;
  if (iconKey === "timeline") return <IconAddTimeline />;
  if (iconKey === "thread-hub") return <IconAddThreadHub />;
  if (iconKey === "gif") return <IconAddGIF />;
  if (iconKey === "shape") return <IconAddShape />;
  if (iconKey === "audio") return <IconAddAudio />;
  if (iconKey === "video") return <IconAddVideo />;
  if (iconKey === "suspect") return <IconAddSuspect />;
  if (iconKey === "interrogation") return <IconAddInterrogation />;
  if (iconKey === "checklist") return <IconAddChecklist />;

  // Custom tool specific icons (monochromatic grays and opacities)
  const svgProps = {
    width: "1em",
    height: "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { opacity: 0.85 },
  };

  if (toolId === "project-brief-card") {
    // A briefcase
    return (
      <svg {...svgProps}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  }

  if (toolId === "lesson-planner") {
    // Open book
    return (
      <svg {...svgProps}>
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    );
  }

  if (toolId === "assignment-tracker") {
    // Clipboard/Tasks
    return (
      <svg {...svgProps}>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M9 14h6" />
        <path d="M9 18h6" />
        <path d="M9 10h.01" />
      </svg>
    );
  }

  if (toolId === "patient-summary") {
    // Heartbeat / Clipboard
    return (
      <svg {...svgProps}>
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <path d="M8 12h2l1.5-3 2 6 1.5-3h3" />
      </svg>
    );
  }

  if (toolId === "case-brief-card") {
    // Gavel/Legal
    return (
      <svg {...svgProps}>
        <path d="M14 13L21 6l-3-3-7 7" />
        <path d="M14 14l-3-3" />
        <path d="M11 11l-3 3 3 3 5-5z" />
        <path d="M10 21H3v-7" />
        <path d="M3 21l7-7" />
      </svg>
    );
  }

  if (toolId === "crop-cycle-planner") {
    // Leaf
    return (
      <svg {...svgProps}>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M11 20c-.5-5 1.5-8.5 7.5-11.5" />
      </svg>
    );
  }

  if (toolId === "art-concept-moodboard") {
    // Grid/Palette
    return (
      <svg {...svgProps}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
        <path d="M15 21V9" />
      </svg>
    );
  }

  // Generic monochromatic icon using the glyph text inside a document/card shape
  return (
    <svg
      {...svgProps}
    >
      <rect x="4" y="3" width="16" height="18" rx="2" ry="2" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <text 
        x="12" 
        y="17" 
        fontSize="7" 
        fontWeight="bold" 
        textAnchor="middle" 
        fill="currentColor"
        stroke="none"
      >
        {glyph}
      </text>
    </svg>
  );
}

function normalizePersistedConnections(value: unknown): BoardConnection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const dedupedConnections = new Map<string, BoardConnection>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Record<string, unknown>;

    const fromNodeId =
      typeof candidate.fromNodeId === "string" ? candidate.fromNodeId : "";
    const toNodeId = typeof candidate.toNodeId === "string" ? candidate.toNodeId : "";

    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      continue;
    }

    const style = isThreadStyle(candidate.style)
      ? candidate.style
      : DEFAULT_THREAD_STYLE;
    const lineDesign = isThreadLineDesign(candidate.lineDesign)
      ? candidate.lineDesign
      : DEFAULT_THREAD_LINE_DESIGN;
    const fromPinAnchor = isNodePinAnchor(candidate.fromPinAnchor)
      ? candidate.fromPinAnchor
      : DEFAULT_SOURCE_PIN_ANCHOR;
    const toPinAnchor = isNodePinAnchor(candidate.toPinAnchor)
      ? candidate.toPinAnchor
      : DEFAULT_TARGET_PIN_ANCHOR;

    const normalizedConnection: BoardConnection = {
      fromNodeId,
      toNodeId,
      fromPinAnchor,
      toPinAnchor,
      style,
      lineDesign,
      colorHex: normalizeHexColor(candidate.colorHex, "#8f8f8f"),
      opacity: normalizeRange(candidate.opacity, 0.2, 1, DEFAULT_THREAD_OPACITY),
      brightness: normalizeRange(
        candidate.brightness,
        40,
        180,
        DEFAULT_THREAD_BRIGHTNESS
      ),
      width: normalizeRange(candidate.width, 1, 14, DEFAULT_THREAD_WIDTH),
    };

    dedupedConnections.set(
      `${normalizedConnection.fromNodeId}:${normalizedConnection.fromPinAnchor}::${normalizedConnection.toNodeId}:${normalizedConnection.toPinAnchor}`,
      normalizedConnection
    );
  }

  return Array.from(dedupedConnections.values());
}

function createNodeId(nodeType: DetectiveNodeType): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${nodeType}-${Date.now()}-${suffix}`;
}

function resolveSpawnPosition(
  nodeType: DetectiveNodeType,
  existingNodeCount: number
): { x: number; y: number } {
  const presets: Record<DetectiveNodeType, { x: number; y: number }> = {
    "sticky-note": { x: 90, y: 110 },
    "photo-drop": { x: 330, y: 120 },
    "evidence-document": { x: 600, y: 140 },
    "map-node": { x: 880, y: 120 },
    "poll-node": { x: 280, y: 430 },
    "thread-hub": { x: 640, y: 430 },
    "timeline-event": { x: 1020, y: 430 },
    "gif-node": { x: 1320, y: 150 },
    "shape-node": { x: 1320, y: 420 },
    "audio-evidence": { x: 1680, y: 140 },
    "video-evidence": { x: 1680, y: 420 },
    "suspect-profile": { x: 420, y: 760 },
    "interrogation-log": { x: 840, y: 760 },
    "checklist-board": { x: 1260, y: 760 },
    "profession-template": { x: 1620, y: 760 },
  };

  const base = presets[nodeType];
  const offsetIndex = existingNodeCount % 18;

  return {
    x: base.x + (offsetIndex % 3) * 64,
    y: base.y + Math.floor(offsetIndex / 3) * 52,
  };
}

function loadBoardNodes(storage: BoardStorage): BoardNodeEntry[] {
  const nodes = (() => {
    try {
      return storage
        .getAllNodeMeta()
        .map((nodeMeta) => readNodeMeta(storage, nodeMeta.id))
        .filter(
          (meta): meta is NonNullable<ReturnType<typeof readNodeMeta>> =>
            meta !== null
        )
        .map((meta) => ({ id: meta.id, type: meta.nodeType }));
    } catch {
      return [] as BoardNodeEntry[];
    }
  })();

  if (nodes.length > 0) {
    return nodes;
  }

  return [...DEFAULT_NODES];
}

function downloadJsonFile(fileName: string, payload: unknown): void {
  const serialized = JSON.stringify(payload, null, 2);
  const blob = new Blob([serialized], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

function unwrapImportedSnapshot(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const format = record.format;
  const data = record.data;

  if (
    "localStorageEntries" in record &&
    record.localStorageEntries &&
    typeof record.localStorageEntries === "object"
  ) {
    return payload;
  }

  if (
    (format === "detective-board-json" || format === "detective-board-backup") &&
    "data" in record
  ) {
    return record.data;
  }

  if (
    data &&
    typeof data === "object" &&
    "localStorageEntries" in (data as Record<string, unknown>) &&
    (data as Record<string, unknown>).localStorageEntries &&
    typeof (data as Record<string, unknown>).localStorageEntries === "object"
  ) {
    return data;
  }

  if (
    "snapshot" in record &&
    record.snapshot &&
    typeof record.snapshot === "object" &&
    "localStorageEntries" in (record.snapshot as Record<string, unknown>)
  ) {
    return record.snapshot;
  }

  return payload;
}

function createSnapshotFingerprint(snapshot: BoardStorageSnapshot): string {
  return JSON.stringify({
    namespace: snapshot.namespace,
    dbName: snapshot.dbName,
    dbVersion: snapshot.dbVersion,
    blobStoreName: snapshot.blobStoreName,
    localStorageEntries: snapshot.localStorageEntries,
    blobs: snapshot.blobs,
  });
}

function isTextEditingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

interface SymbolButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon?: ReactNode;
  active?: boolean;
}

interface BoardNoticeDialogState {
  title: string;
  message: string;
  acknowledgeLabel?: string;
}

interface BoardConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

const SymbolButton = memo(function SymbolButton({
  label,
  icon,
  active = false,
  className,
  ...buttonProps
}: SymbolButtonProps) {
  const finalClassName = `toolbar-btn symbol-btn ${active ? "is-active" : ""} ${
    className ?? ""
  }`.trim();

  return (
    <button
      type="button"
      {...buttonProps}
      className={finalClassName}
      aria-label={label}
      title={label}
    >
      {icon && <span className="toolbar-btn-icon">{icon}</span>}
      <span className="toolbar-btn-label">{label}</span>
    </button>
  );
});

export function DetectiveBoardPreset({
  storage = defaultStorage,
  ghostSignature = null,
  className,
  style,
}: DetectiveBoardPresetProps) {
  const initialThemePresetId = useMemo(() => readThemePresetId(storage), [storage]);
  const initialThemePreset = useMemo(
    () => getThemePreset(initialThemePresetId),
    [initialThemePresetId]
  );
  const initialTheme = useMemo(
    () => readThemeState(storage, initialThemePreset),
    [initialThemePreset, storage]
  );
  const initialThreadStudio = useMemo(
    () => readThreadStudioState(storage, initialTheme.threadColor),
    [initialTheme.threadColor, storage]
  );
  const initialBackgroundImageMeta = useMemo(
    () => readBackgroundImageMeta(storage),
    [storage]
  );

  const [nodes, setNodes] = useState<BoardNodeEntry[]>(() => loadBoardNodes(storage));
  const [boardTitle, setBoardTitle] = useState(() => {
    const persisted = storage.getBoardMeta<string>(BOARD_TITLE_META_KEY);
    return typeof persisted === "string" && persisted.trim().length > 0
      ? persisted
      : "Case Board";
  });
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
    const persisted = storage.getBoardMeta<unknown>(BOARD_BACKGROUND_META_KEY);
    return persisted === "plane" ? "plane" : "grid";
  });
  const [themePresetId, setThemePresetId] =
    useState<BoardThemePresetId>(initialThemePresetId);
  const [planeColor, setPlaneColor] = useState(initialTheme.planeColor);
  const [gridColor, setGridColor] = useState(initialTheme.gridColor);
  const [majorGridColor, setMajorGridColor] = useState(initialTheme.majorGridColor);
  const [threadColor, setThreadColor] = useState(initialThreadStudio.colorHex);
  const [threadModeEnabled, setThreadModeEnabled] = useState(false);
  const [threadStyle, setThreadStyle] = useState<ThreadStyle>(
    initialThreadStudio.style
  );
  const [threadOpacity, setThreadOpacity] = useState(initialThreadStudio.opacity);
  const [threadBrightness, setThreadBrightness] = useState(
    initialThreadStudio.brightness
  );
  const [threadWidth, setThreadWidth] = useState(initialThreadStudio.width);
  const [threadLineDesign, setThreadLineDesign] = useState<ThreadLineDesign>(
    initialThreadStudio.lineDesign
  );
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [boardVersion, setBoardVersion] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isThreadStudioOpen, setIsThreadStudioOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isToolboxExpanded, setIsToolboxExpanded] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [pinnedToolIds, setPinnedToolIds] = useState<string[]>(() =>
    readPinnedToolIds(storage)
  );
  const [backgroundImageBlobKey, setBackgroundImageBlobKey] = useState<string | null>(
    initialBackgroundImageMeta.blobKey
  );
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(
    initialBackgroundImageMeta.opacity
  );
  const [backgroundImageBrightness, setBackgroundImageBrightness] = useState(
    initialBackgroundImageMeta.brightness
  );
  const [noticeDialog, setNoticeDialog] = useState<BoardNoticeDialogState | null>(
    null
  );
  const [confirmDialog, setConfirmDialog] =
    useState<BoardConfirmDialogState | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundImageInputRef = useRef<HTMLInputElement | null>(null);
  const canvasControlsRef = useRef<DetectiveBoardCanvasControls | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const handledResetRef = useRef(false);

  const historyEntriesRef = useRef<BoardStorageSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const historyFingerprintRef = useRef<string | null>(null);
  const historyFrozenRef = useRef(false);
  const historyCaptureTimerRef = useRef<number | null>(null);

  const deferredToolSearch = useDeferredValue(toolSearch);

  const openNoticeDialog = useCallback(
    (
      title: string,
      message: string,
      acknowledgeLabel = "OK"
    ) => {
      setNoticeDialog({ title, message, acknowledgeLabel });
    },
    []
  );

  const closeDialogs = useCallback(() => {
    setNoticeDialog(null);
    setConfirmDialog(null);
  }, []);

  const handleConfirmDialog = useCallback(async () => {
    if (!confirmDialog) {
      return;
    }

    const callback = confirmDialog.onConfirm;
    setConfirmDialog(null);

    try {
      await callback();
    } catch {
      openNoticeDialog(
        "Action Failed",
        "The requested action could not be completed. Please try again."
      );
    }
  }, [confirmDialog, openNoticeDialog]);

  const activeThemePreset = useMemo(
    () => getThemePreset(themePresetId),
    [themePresetId]
  );
  const ghostPersonality = useMemo(
    () => deriveGhostPersonality(ghostSignature),
    [ghostSignature]
  );
  const personalizedPlaneColor = useMemo(() => {
    const blendRatio = getHexLuminance(planeColor) >= 0.62 ? 0.06 : 0.17;
    return mixHexColors(planeColor, ghostPersonality.charcoalHex, blendRatio);
  }, [ghostPersonality.charcoalHex, planeColor]);
  const personalizedGridColor = useMemo(() => {
    const blendRatio = getHexLuminance(gridColor) >= 0.62 ? 0.04 : 0.13;
    return mixHexColors(gridColor, ghostPersonality.charcoalHex, blendRatio);
  }, [ghostPersonality.charcoalHex, gridColor]);
  const personalizedMajorGridColor = useMemo(() => {
    const blendRatio = getHexLuminance(majorGridColor) >= 0.62 ? 0.03 : 0.1;
    return mixHexColors(majorGridColor, ghostPersonality.charcoalHex, blendRatio);
  }, [ghostPersonality.charcoalHex, majorGridColor]);
  const isLightSurface = useMemo(
    () => getHexLuminance(personalizedPlaneColor) >= 0.62,
    [personalizedPlaneColor]
  );

  const threadCreateOptions = useMemo<ThreadCreateOptions>(
    () => ({
      style: threadStyle,
      colorHex: threadColor,
      opacity: threadOpacity,
      brightness: threadBrightness,
      width: threadWidth,
      lineDesign: threadLineDesign,
    }),
    [
      threadBrightness,
      threadColor,
      threadLineDesign,
      threadOpacity,
      threadStyle,
      threadWidth,
    ]
  );

  const applyThemePreset = useCallback((nextThemePresetId: BoardThemePresetId) => {
    const preset = getThemePreset(nextThemePresetId);
    setThemePresetId(nextThemePresetId);
    setPlaneColor(preset.planeColor);
    setGridColor(preset.gridColor);
    setMajorGridColor(preset.majorGridColor);
    setThreadColor(preset.threadColor);
  }, []);

  const onThemePresetSelect = useCallback(
    (nextThemePresetId: BoardThemePresetId) => {
      applyThemePreset(nextThemePresetId);
      setIsThemeMenuOpen(false);
    },
    [applyThemePreset]
  );

  const onConnectionRequested = useCallback(
    (request: BoardConnectionRequest) => {
      request.complete(threadCreateOptions);
    },
    [threadCreateOptions]
  );

  const onOpenThreadStudio = useCallback(() => {
    setIsThreadStudioOpen(true);
    setThreadModeEnabled(true);
    setIsSidebarCollapsed(true);
  }, []);

  const onCollapseThreadStudio = useCallback(() => {
    setIsThreadStudioOpen(false);
    setThreadModeEnabled(false);
  }, []);

  const onEnterPreview = useCallback(() => {
    setIsPreviewMode(true);
  }, []);

  const onExitPreview = useCallback(() => {
    setIsPreviewMode(false);
  }, []);

  useEffect(() => {
    if (!isPreviewMode) {
      return;
    }

    setIsThemeMenuOpen(false);
    setIsThreadStudioOpen(false);
    setThreadModeEnabled(false);
    setIsToolboxExpanded(false);
  }, [isPreviewMode]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(
      historyIndexRef.current >= 0 &&
        historyIndexRef.current < historyEntriesRef.current.length - 1
    );
  }, []);

  const captureHistorySnapshot = useCallback(
    async (force = false) => {
      if (historyFrozenRef.current && !force) {
        return;
      }

      const snapshot = await storage.exportSnapshot({ includeBlobs: false });
      const fingerprint = createSnapshotFingerprint(snapshot);

      if (!force && historyFingerprintRef.current === fingerprint) {
        return;
      }

      const baseEntries =
        historyIndexRef.current < historyEntriesRef.current.length - 1
          ? historyEntriesRef.current.slice(0, historyIndexRef.current + 1)
          : [...historyEntriesRef.current];

      baseEntries.push(snapshot);

      if (baseEntries.length > HISTORY_LIMIT) {
        baseEntries.splice(0, baseEntries.length - HISTORY_LIMIT);
      }

      historyEntriesRef.current = baseEntries;
      historyIndexRef.current = baseEntries.length - 1;
      historyFingerprintRef.current = fingerprint;
      syncHistoryFlags();
    },
    [storage, syncHistoryFlags]
  );

  const scheduleHistoryCapture = useCallback(() => {
    if (historyFrozenRef.current) {
      return;
    }

    if (historyCaptureTimerRef.current !== null) {
      window.clearTimeout(historyCaptureTimerRef.current);
    }

    historyCaptureTimerRef.current = window.setTimeout(() => {
      historyCaptureTimerRef.current = null;
      void captureHistorySnapshot(false);
    }, 220);
  }, [captureHistorySnapshot]);

  const refreshBoardStateFromStorage = useCallback(() => {
    const persistedPresetId = readThemePresetId(storage);
    const persistedPreset = getThemePreset(persistedPresetId);
    const persistedTheme = readThemeState(storage, persistedPreset);
    const persistedThreadStudio = readThreadStudioState(
      storage,
      persistedTheme.threadColor
    );
    const persistedBackgroundMeta = readBackgroundImageMeta(storage);
    const persistedTitle = storage.getBoardMeta<string>(BOARD_TITLE_META_KEY);
    const persistedMode = storage.getBoardMeta<unknown>(BOARD_BACKGROUND_META_KEY);

    setNodes(loadBoardNodes(storage));
    setThemePresetId(persistedPresetId);
    setPlaneColor(persistedTheme.planeColor);
    setGridColor(persistedTheme.gridColor);
    setMajorGridColor(persistedTheme.majorGridColor);
    setThreadColor(persistedThreadStudio.colorHex);
    setThreadStyle(persistedThreadStudio.style);
    setThreadOpacity(persistedThreadStudio.opacity);
    setThreadBrightness(persistedThreadStudio.brightness);
    setThreadWidth(persistedThreadStudio.width);
    setThreadLineDesign(persistedThreadStudio.lineDesign);
    setBoardTitle(
      typeof persistedTitle === "string" && persistedTitle.trim().length > 0
        ? persistedTitle
        : "Case Board"
    );
    setBackgroundMode(persistedMode === "plane" ? "plane" : "grid");
    setBackgroundImageBlobKey(persistedBackgroundMeta.blobKey);
    setBackgroundImageOpacity(persistedBackgroundMeta.opacity);
    setBackgroundImageBrightness(persistedBackgroundMeta.brightness);
    setPinnedToolIds(readPinnedToolIds(storage));
    setToolSearch("");
    setIsToolboxExpanded(false);
    setIsThreadStudioOpen(false);
    setIsThemeMenuOpen(false);
    setBoardVersion((previous) => previous + 1);
  }, [storage]);

  const applyHistoryIndex = useCallback(
    async (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= historyEntriesRef.current.length) {
        return;
      }

      historyFrozenRef.current = true;

      try {
        const snapshot = historyEntriesRef.current[nextIndex];
        await storage.importSnapshot(snapshot, { applyBlobs: false });
        historyIndexRef.current = nextIndex;
        historyFingerprintRef.current = createSnapshotFingerprint(snapshot);
        refreshBoardStateFromStorage();
      } finally {
        historyFrozenRef.current = false;
        syncHistoryFlags();
      }
    },
    [refreshBoardStateFromStorage, storage, syncHistoryFlags]
  );

  const onUndo = useCallback(() => {
    const nextIndex = historyIndexRef.current - 1;
    if (nextIndex < 0) {
      return;
    }

    void applyHistoryIndex(nextIndex);
  }, [applyHistoryIndex]);

  const onRedo = useCallback(() => {
    const nextIndex = historyIndexRef.current + 1;
    if (nextIndex >= historyEntriesRef.current.length) {
      return;
    }

    void applyHistoryIndex(nextIndex);
  }, [applyHistoryIndex]);

  useEffect(() => {
    if (typeof window === "undefined" || handledResetRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") !== "1") {
      return;
    }

    handledResetRef.current = true;

    void (async () => {
      try {
        storage.clearAllNodeMeta();
        storage.removeBoardMeta("connections");
        await storage.clearBlobs();
      } catch {
        // Continue to hard reload even if storage clear partially fails.
      } finally {
        const cleanUrl = `${window.location.pathname}${window.location.hash}`;
        window.location.replace(cleanUrl);
      }
    })();
  }, [storage]);

  useEffect(() => {
    let isDisposed = false;

    historyFrozenRef.current = true;

    void (async () => {
      try {
        const initialSnapshot = await storage.exportSnapshot({ includeBlobs: false });

        if (isDisposed) {
          return;
        }

        historyEntriesRef.current = [initialSnapshot];
        historyIndexRef.current = 0;
        historyFingerprintRef.current = createSnapshotFingerprint(initialSnapshot);
      } finally {
        if (!isDisposed) {
          historyFrozenRef.current = false;
          syncHistoryFlags();
        }
      }
    })();

    return () => {
      isDisposed = true;

      if (historyCaptureTimerRef.current !== null) {
        window.clearTimeout(historyCaptureTimerRef.current);
      }
    };
  }, [storage, syncHistoryFlags]);

  useEffect(() => {
    return storage.subscribe(() => {
      scheduleHistoryCapture();
    });
  }, [scheduleHistoryCapture, storage]);

  useEffect(() => {
    if (!isThemeMenuOpen) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        themeMenuRef.current &&
        target instanceof Node &&
        themeMenuRef.current.contains(target)
      ) {
        return;
      }

      setIsThemeMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsThemeMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isThemeMenuOpen]);

  useEffect(() => {
    if (!isToolboxExpanded) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolboxExpanded(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isToolboxExpanded]);

  useEffect(() => {
    if (!noticeDialog && !confirmDialog) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialogs();
        return;
      }

      if (event.key !== "Enter") {
        return;
      }

      if (confirmDialog) {
        event.preventDefault();
        void handleConfirmDialog();
        return;
      }

      if (noticeDialog) {
        event.preventDefault();
        setNoticeDialog(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDialogs, confirmDialog, handleConfirmDialog, noticeDialog]);

  useEffect(() => {
    storage.setBoardMeta(BOARD_TITLE_META_KEY, boardTitle);
  }, [boardTitle, storage]);

  useEffect(() => {
    storage.setBoardMeta(BOARD_BACKGROUND_META_KEY, backgroundMode);
  }, [backgroundMode, storage]);

  useEffect(() => {
    storage.setBoardMeta(BOARD_THEME_PRESET_META_KEY, themePresetId);
  }, [storage, themePresetId]);

  useEffect(() => {
    storage.setBoardMeta(BOARD_THEME_META_KEY, {
      planeColor,
      gridColor,
      majorGridColor,
      threadColor,
    });
  }, [gridColor, majorGridColor, planeColor, storage, threadColor]);

  useEffect(() => {
    storage.setBoardMeta(BOARD_THREAD_STYLE_META_KEY, threadStyle);
    storage.setBoardMeta(BOARD_THREAD_SETTINGS_META_KEY, {
      style: threadStyle,
      colorHex: threadColor,
      opacity: threadOpacity,
      brightness: threadBrightness,
      width: threadWidth,
      lineDesign: threadLineDesign,
    });
  }, [
    storage,
    threadBrightness,
    threadColor,
    threadLineDesign,
    threadOpacity,
    threadStyle,
    threadWidth,
  ]);

  useEffect(() => {
    const normalized = normalizePinnedToolIds(pinnedToolIds);
    storage.setBoardMeta(BOARD_PINNED_TOOLS_META_KEY, normalized);
  }, [pinnedToolIds, storage]);

  useEffect(() => {
    if (backgroundImageBlobKey) {
      storage.setBoardMeta(BOARD_BACKGROUND_IMAGE_META_KEY, {
        blobKey: backgroundImageBlobKey,
        opacity: backgroundImageOpacity,
        brightness: backgroundImageBrightness,
      });
      return;
    }

    storage.removeBoardMeta(BOARD_BACKGROUND_IMAGE_META_KEY);
  }, [
    backgroundImageBlobKey,
    backgroundImageBrightness,
    backgroundImageOpacity,
    storage,
  ]);

  useEffect(() => {
    let isMounted = true;

    if (!backgroundImageBlobKey) {
      setBackgroundImageUrl(null);
      return () => {
        isMounted = false;
      };
    }

    void (async () => {
      try {
        const blob = await storage.getBlob(backgroundImageBlobKey);

        if (!isMounted) {
          return;
        }

        if (!blob) {
          setBackgroundImageUrl(null);
          return;
        }

        const dataUrl = await blobToDataUrl(blob);
        if (isMounted) {
          setBackgroundImageUrl(dataUrl);
        }
      } catch {
        if (isMounted) {
          setBackgroundImageUrl(null);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [backgroundImageBlobKey, storage]);

  const backgroundOptions = useMemo<BackgroundOptions>(
    () => ({
      planeColor: personalizedPlaneColor,
      gridLineColor: hexToRgba(personalizedGridColor, 0.16),
      majorGridLineColor: hexToRgba(personalizedMajorGridColor, 0.28),
      worldGridSize: 64,
      minGridPixelStep: 20,
      maxGridPixelStep: 96,
    }),
    [personalizedGridColor, personalizedMajorGridColor, personalizedPlaneColor]
  );

  const boardContainerStyle = useMemo<CSSProperties>(() => {
    const overlayHex = isLightSurface ? "#0f172a" : "#f8fafc";

    return {
      position: "relative",
      width: "100%",
      height: "100%",
      "--board-bg": personalizedPlaneColor,
      "--ghost-charcoal": ghostPersonality.charcoalHex,
      "--thread-color": threadColor,
      "--board-ui-bg": activeThemePreset.uiBg,
      "--board-ui-border": activeThemePreset.uiBorder,
      "--board-ui-text": activeThemePreset.uiText,
      "--board-ui-muted": activeThemePreset.uiMuted,
      "--node-shadow": activeThemePreset.nodeShadow,
      "--node-shadow-hover": activeThemePreset.nodeShadowHover,
      "--board-node-surface": activeThemePreset.uiBg,
      "--board-node-surface-alt": hexToRgba(overlayHex, isLightSurface ? 0.12 : 0.1),
      "--board-control-bg": hexToRgba(overlayHex, isLightSurface ? 0.08 : 0.07),
      "--board-control-bg-hover": hexToRgba(overlayHex, isLightSurface ? 0.14 : 0.16),
      "--board-control-bg-active": hexToRgba(overlayHex, isLightSurface ? 0.18 : 0.22),
      "--board-control-border": hexToRgba(overlayHex, isLightSurface ? 0.22 : 0.28),
      "--board-input-bg": hexToRgba(overlayHex, isLightSurface ? 0.06 : 0.1),
      "--board-input-bg-soft": hexToRgba(overlayHex, isLightSurface ? 0.04 : 0.06),
      "--board-input-border": hexToRgba(overlayHex, isLightSurface ? 0.22 : 0.24),
      "--board-focus-ring": hexToRgba(threadColor, 0.42),
      "--board-panel-shadow": isLightSurface
        ? "0 10px 30px rgba(15, 23, 42, 0.18)"
        : "0 10px 30px rgba(0, 0, 0, 0.35)",
      "--board-soft-shadow": isLightSurface
        ? "0 6px 14px rgba(15, 23, 42, 0.12)"
        : "0 6px 14px rgba(0, 0, 0, 0.24)",
      "--board-danger-bg": isLightSurface
        ? "rgba(220, 38, 38, 0.12)"
        : "rgba(122, 22, 22, 0.3)",
      "--board-danger-border": isLightSurface
        ? "rgba(220, 38, 38, 0.45)"
        : "rgba(248, 120, 120, 0.42)",
      "--board-danger-text": isLightSurface ? "#991b1b" : "#fecaca",
    } as CSSProperties;
  }, [
    activeThemePreset,
    ghostPersonality.charcoalHex,
    isLightSurface,
    personalizedPlaneColor,
    threadColor,
  ]);

  const addNode = useCallback(
    (nodeType: DetectiveNodeType) => {
      const id = createNodeId(nodeType);
      const spawnPosition = resolveSpawnPosition(nodeType, nodes.length);

      patchNodeMeta(storage, id, {
        id,
        nodeType,
        x: spawnPosition.x,
        y: spawnPosition.y,
      });

      setNodes((previous) => [...previous, { id, type: nodeType }]);
    },
    [nodes.length, storage]
  );

  const addProfessionTool = useCallback(
    (tool: BoardToolDefinition) => {
      if (!tool.template) {
        return;
      }

      const id = createNodeId("profession-template");
      const spawnPosition = resolveSpawnPosition("profession-template", nodes.length);

      patchNodeMeta(storage, id, {
        id,
        nodeType: "profession-template",
        x: spawnPosition.x,
        y: spawnPosition.y,
        title: tool.template.title,
        text: tool.template.notes,
        colorHex: tool.template.accentColor,
        body: JSON.stringify({
          toolId: tool.template.toolId,
          profession: tool.template.profession,
          status: tool.template.status,
          summary: tool.template.summary,
          checklistText: tool.template.checklistLines.join("\n"),
          notes: tool.template.notes,
          layout: tool.template.layout,
        }),
      });

      setNodes((previous) => [...previous, { id, type: "profession-template" }]);
    },
    [nodes.length, storage]
  );

  const onAddToolById = useCallback(
    (toolId: string) => {
      const tool = TOOL_DEFINITIONS_BY_ID.get(toolId);
      if (!tool) {
        return;
      }

      if (tool.nodeType === "profession-template") {
        addProfessionTool(tool);
        return;
      }

      addNode(tool.nodeType);
    },
    [addNode, addProfessionTool]
  );

  const quickTools = useMemo(() => {
    const pinnedTools = pinnedToolIds
      .map((toolId) => TOOL_DEFINITIONS_BY_ID.get(toolId))
      .filter((tool): tool is BoardToolDefinition => Boolean(tool));

    const seen = new Set<string>(pinnedTools.map((tool) => tool.id));
    const filled = [...pinnedTools];

    for (const tool of ALL_TOOL_DEFINITIONS) {
      if (filled.length >= 18) {
        break;
      }

      if (seen.has(tool.id)) {
        continue;
      }

      seen.add(tool.id);
      filled.push(tool);
    }

    return filled;
  }, [pinnedToolIds]);

  const filteredTools = useMemo(() => {
    const normalizedQuery = deferredToolSearch.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return ALL_TOOL_DEFINITIONS;
    }

    return ALL_TOOL_DEFINITIONS.filter((tool) => {
      const searchText = [
        tool.label,
        tool.quickLabel,
        tool.profession ?? "",
        ...tool.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }, [deferredToolSearch]);

  const onTogglePinnedTool = useCallback((toolId: string) => {
    setPinnedToolIds((previous) => {
      if (previous.includes(toolId)) {
        return previous.filter((entry) => entry !== toolId);
      }

      const next = [...previous, toolId];
      if (next.length <= 24) {
        return next;
      }

      return next.slice(next.length - 24);
    });
  }, []);

  const onResetPinnedTools = useCallback(() => {
    setPinnedToolIds([...DEFAULT_PINNED_TOOL_IDS]);
  }, []);

  const removeNodeById = useCallback(
    async (nodeId: string) => {
      const nodeEntry = nodes.find((entry) => entry.id === nodeId);
      if (!nodeEntry) {
        return;
      }

      const nodeMeta = readNodeMeta(storage, nodeId);
      storage.removeNodeMeta(nodeId);

      if (nodeMeta?.blobKey && typeof nodeMeta.blobKey === "string") {
        await storage.removeBlob(nodeMeta.blobKey);
      }

      setNodes((previous) => previous.filter((entry) => entry.id !== nodeId));
    },
    [nodes, storage]
  );

  const duplicateNodeById = useCallback(
    (nodeId: string) => {
      const sourceEntry = nodes.find((entry) => entry.id === nodeId);
      if (!sourceEntry) {
        return;
      }

      const sourceMeta = storage.getNodeMeta(sourceEntry.id);
      const duplicateId = createNodeId(sourceEntry.type);

      if (!sourceMeta) {
        const spawn = resolveSpawnPosition(sourceEntry.type, nodes.length + 1);
        patchNodeMeta(storage, duplicateId, {
          id: duplicateId,
          nodeType: sourceEntry.type,
          x: spawn.x,
          y: spawn.y,
        });
        setNodes((previous) => [...previous, { id: duplicateId, type: sourceEntry.type }]);
        return;
      }

      patchNodeMeta(storage, duplicateId, {
        ...(sourceMeta as Record<string, unknown>),
        id: duplicateId,
        nodeType: sourceEntry.type,
        x:
          (typeof sourceMeta.x === "number" && Number.isFinite(sourceMeta.x)
            ? sourceMeta.x
            : 0) + 56,
        y:
          (typeof sourceMeta.y === "number" && Number.isFinite(sourceMeta.y)
            ? sourceMeta.y
            : 0) + 44,
        zIndex: undefined,
      });

      setNodes((previous) => [...previous, { id: duplicateId, type: sourceEntry.type }]);
    },
    [nodes, storage]
  );

  const removeLastNode = useCallback(async () => {
    const lastNode = nodes[nodes.length - 1];
    if (!lastNode) {
      return;
    }

    await removeNodeById(lastNode.id);
  }, [nodes, removeNodeById]);

  const duplicateLastNode = useCallback(() => {
    const lastNode = nodes[nodes.length - 1];
    if (!lastNode) {
      return;
    }

    duplicateNodeById(lastNode.id);
  }, [duplicateNodeById, nodes]);

  useEffect(() => {
    const onDeleteRequested = (event: Event) => {
      const detail = (event as CustomEvent<BoardNodeActionEventDetail>).detail;
      if (!detail || typeof detail.nodeId !== "string") {
        return;
      }

      void removeNodeById(detail.nodeId);
    };

    const onDuplicateRequested = (event: Event) => {
      const detail = (event as CustomEvent<BoardNodeActionEventDetail>).detail;
      if (!detail || typeof detail.nodeId !== "string") {
        return;
      }

      duplicateNodeById(detail.nodeId);
    };

    window.addEventListener(BOARD_NODE_DELETE_EVENT, onDeleteRequested);
    window.addEventListener(BOARD_NODE_DUPLICATE_EVENT, onDuplicateRequested);

    return () => {
      window.removeEventListener(BOARD_NODE_DELETE_EVENT, onDeleteRequested);
      window.removeEventListener(BOARD_NODE_DUPLICATE_EVENT, onDuplicateRequested);
    };
  }, [duplicateNodeById, removeNodeById]);

  const onAutoArrangeNodes = useCallback(() => {
    if (nodes.length === 0) {
      return;
    }

    const columns = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
    const xStep = 360;
    const yStep = 270;
    const startX = 140;
    const startY = 140;

    nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);

      patchNodeMeta(storage, node.id, {
        id: node.id,
        nodeType: node.type,
        x: startX + column * xStep,
        y: startY + row * yStep,
      });
    });

    setBoardVersion((previous) => previous + 1);
  }, [nodes, storage]);

  const clearBoardNow = useCallback(async () => {
    historyFrozenRef.current = true;

    try {
      storage.clearAllNodeMeta();
      storage.removeBoardMeta("connections");
      await storage.clearBlobs();
      setNodes([]);
      setBackgroundImageBlobKey(null);
      setBackgroundImageUrl(null);
      setBoardVersion((previous) => previous + 1);
    } finally {
      historyFrozenRef.current = false;
      await captureHistorySnapshot(true);
    }
  }, [captureHistorySnapshot, storage]);

  const onClearBoard = useCallback(() => {
    setConfirmDialog({
      title: "Clear Board",
      message:
        "This will remove all components, threads, and background media from the board.",
      confirmLabel: "Clear",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: clearBoardNow,
    });
  }, [clearBoardNow]);

  const onClearThreads = useCallback(() => {
    storage.removeBoardMeta("connections");
    setBoardVersion((previous) => previous + 1);
  }, [storage]);

  const onOpenBackgroundImageDialog = useCallback(() => {
    backgroundImageInputRef.current?.click();
  }, []);

  const onBackgroundImageSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const compressed = await compressImageFileToBase64(file, {
          maxWidth: 2400,
          maxHeight: 1600,
          quality: 0.9,
          outputMimeType: "image/webp",
        });

        await storage.setBlob(BOARD_BACKGROUND_BLOB_KEY, dataUrlToBlob(compressed));
        setBackgroundImageBlobKey(BOARD_BACKGROUND_BLOB_KEY);
        setBackgroundImageUrl(compressed);
      } catch {
        openNoticeDialog(
          "Background Upload Failed",
          "The selected image could not be processed. Please try another file."
        );
      } finally {
        event.target.value = "";
      }
    },
    [openNoticeDialog, storage]
  );

  const onClearBackgroundImage = useCallback(async () => {
    if (backgroundImageBlobKey) {
      await storage.removeBlob(backgroundImageBlobKey);
    }

    setBackgroundImageBlobKey(null);
    setBackgroundImageUrl(null);
  }, [backgroundImageBlobKey, storage]);

  const onCameraChange = useCallback((matrix: Matrix2D) => {
    const zoom = getMatrixUniformScale(matrix);
    const nextZoomPercent = Math.max(10, Math.round(zoom * 100));
    setZoomPercent((previousZoomPercent) =>
      previousZoomPercent === nextZoomPercent
        ? previousZoomPercent
        : nextZoomPercent
    );
  }, []);

  const onZoomIn = useCallback(() => {
    canvasControlsRef.current?.zoomIn();
  }, []);

  const onZoomOut = useCallback(() => {
    canvasControlsRef.current?.zoomOut();
  }, []);

  const onResetView = useCallback(() => {
    canvasControlsRef.current?.reset();
  }, []);

  const onToggleBackgroundMode = useCallback(() => {
    setBackgroundMode((previous) => (previous === "grid" ? "plane" : "grid"));
  }, []);

  const buildRenderSnapshot = useCallback(() => {
    const controls = canvasControlsRef.current;
    const viewportElement = controls?.getViewportElement();

    if (!controls || !viewportElement) {
      throw new Error("Board canvas is not ready for export yet.");
    }

    return {
      viewportElement,
      worldElement: viewportElement,
      title: boardTitle,
      backgroundColor: planeColor,
    };
  }, [boardTitle, planeColor]);

  const withExportGuard = useCallback(
    async (task: () => Promise<void>) => {
      setIsExporting(true);

      try {
        await task();
      } catch {
        openNoticeDialog(
          "Export Failed",
          "Unable to complete export. Please try again after a moment."
        );
      } finally {
        setIsExporting(false);
      }
    },
    [openNoticeDialog]
  );

  const onExportPng = useCallback(() => {
    void withExportGuard(async () => {
      await downloadBoardPng(buildRenderSnapshot(), {
        title: boardTitle,
        backgroundColor: planeColor,
      });
    });
  }, [boardTitle, buildRenderSnapshot, planeColor, withExportGuard]);

  const onExportSvg = useCallback(() => {
    void withExportGuard(async () => {
      downloadBoardSvg(buildRenderSnapshot(), {
        title: boardTitle,
        backgroundColor: planeColor,
      });
    });
  }, [boardTitle, buildRenderSnapshot, planeColor, withExportGuard]);

  const onExportWebp = useCallback(() => {
    void withExportGuard(async () => {
      await downloadBoardWebp(buildRenderSnapshot(), {
        title: boardTitle,
        backgroundColor: planeColor,
        quality: 0.93,
      });
    });
  }, [boardTitle, buildRenderSnapshot, planeColor, withExportGuard]);

  const onExportPdf = useCallback(() => {
    void withExportGuard(async () => {
      await openBoardPdfPrintWindow(buildRenderSnapshot(), {
        title: boardTitle,
        backgroundColor: planeColor,
      });
    });
  }, [boardTitle, buildRenderSnapshot, planeColor, withExportGuard]);

  const onExportJson = useCallback(() => {
    void withExportGuard(async () => {
      const snapshot = await storage.exportSnapshot({ includeBlobs: true });
      const filename = buildBoardExportFilename("json", boardTitle);
      const payload = {
        exportedAt: new Date().toISOString(),
        format: "detective-board-backup",
        version: 3,
        title: boardTitle,
        data: snapshot,
      };

      downloadJsonFile(filename, payload);
    });
  }, [boardTitle, storage, withExportGuard]);

  const onOpenImportDialog = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const onImportBoard = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      historyFrozenRef.current = true;

      try {
        const text = await file.text();
        const parsedPayload = JSON.parse(text) as unknown;
        const snapshotPayload = unwrapImportedSnapshot(parsedPayload);

        await storage.importSnapshot(snapshotPayload);
        refreshBoardStateFromStorage();
      } catch (error) {
        const reason =
          error instanceof Error && error.message
            ? `\n${error.message}`
            : "";
        openNoticeDialog(
          "Import Failed",
          `The backup could not be imported.${reason}`
        );
      } finally {
        historyFrozenRef.current = false;
        try {
          await captureHistorySnapshot(true);
        } catch {
          // Keep imported state even if history refresh fails.
        }
        event.target.value = "";
      }
    },
    [
      captureHistorySnapshot,
      openNoticeDialog,
      refreshBoardStateFromStorage,
      storage,
    ]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingElement(event.target)) {
        return;
      }

      const hasModifier = event.ctrlKey || event.metaKey;
      if (!hasModifier || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (isPreviewMode && (key === "z" || key === "y")) {
        event.preventDefault();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }

      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        onRedo();
        return;
      }

      if (key === "=" || key === "+") {
        event.preventDefault();
        onZoomIn();
        return;
      }

      if (key === "-") {
        event.preventDefault();
        onZoomOut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPreviewMode, onRedo, onUndo, onZoomIn, onZoomOut]);

  const renderNode = useCallback(
    (node: BoardNodeEntry, index: number) => {
      const defaultPosition = resolveSpawnPosition(node.type, index);

      if (node.type === "photo-drop") {
        return (
          <PhotoDropNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "evidence-document") {
        return (
          <EvidenceDocumentNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "map-node") {
        return (
          <MapNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "poll-node") {
        return (
          <PollNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "thread-hub") {
        return (
          <ThreadHubNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "timeline-event") {
        return (
          <TimelineEventNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "gif-node") {
        return (
          <GifNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "shape-node") {
        return (
          <ShapeNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "audio-evidence") {
        return (
          <AudioEvidenceNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "video-evidence") {
        return (
          <VideoEvidenceNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "suspect-profile") {
        return (
          <SuspectProfileNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "interrogation-log") {
        return (
          <InterrogationLogNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "checklist-board") {
        return (
          <ChecklistBoardNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      if (node.type === "profession-template") {
        return (
          <ProfessionTemplateNode
            key={node.id}
            nodeId={node.id}
            storage={storage}
            initialX={defaultPosition.x}
            initialY={defaultPosition.y}
          />
        );
      }

      return (
        <StickyNoteNode
          key={node.id}
          nodeId={node.id}
          storage={storage}
          initialX={defaultPosition.x}
          initialY={defaultPosition.y}
        />
      );
    },
    [storage]
  );

  const nodeElements = useMemo(
    () => nodes.map((node, index) => renderNode(node, index)),
    [nodes, renderNode]
  );

  return (
    <div
      style={boardContainerStyle}
      className={`detective-board-container${isPreviewMode ? " is-preview" : ""}`}
    >
      <DetectiveBoardCanvas
        key={`board-${boardVersion}`}
        storage={storage}
        threadModeEnabled={threadModeEnabled && !isPreviewMode}
        previewModeEnabled={isPreviewMode}
        threadStyle={threadStyle}
        threadDefaults={threadCreateOptions}
        onConnectionRequested={onConnectionRequested}
        backgroundImageUrl={backgroundImageUrl}
        backgroundImageOpacity={backgroundImageOpacity}
        backgroundImageBrightness={backgroundImageBrightness}
        backgroundMode={backgroundMode}
        backgroundOptions={backgroundOptions}
        className={className}
        style={style}
        controlsRef={canvasControlsRef}
        onCameraChange={onCameraChange}
      >
        {nodeElements}
      </DetectiveBoardCanvas>

      {!isPreviewMode ? (
        <header className="board-panel board-header-panel" data-board-export-hidden="true">
          <div className="board-header-brand" aria-label="Application identity">
            <div className="board-app-name">PrimeTrace</div>
            <div className="board-app-maker">by Detha</div>
          </div>

          <div className="board-title-shell">
            <input
              className="board-title-input"
              data-node-interactive="true"
              value={boardTitle}
              onChange={(event) => setBoardTitle(event.target.value)}
              placeholder="Board Name"
              aria-label="Board title"
            />
          </div>

          <div className="board-header-actions">
            <SymbolButton label="Zoom Out" icon={<IconZoomOut />} onClick={onZoomOut} />
            <span className="board-zoom-indicator" aria-label="Zoom level">
              {zoomPercent}%
            </span>
            <SymbolButton label="Zoom In" icon={<IconZoomIn />} onClick={onZoomIn} />
            <SymbolButton label="Reset View" icon={<IconResetView />} onClick={onResetView} />
            <SymbolButton label="Undo" icon={<IconUndo />} onClick={onUndo} disabled={!canUndo} />
            <SymbolButton label="Redo" icon={<IconRedo />} onClick={onRedo} disabled={!canRedo} />
            <SymbolButton label="View" onClick={onEnterPreview} />

            <div
              ref={themeMenuRef}
              className={`top-menu-shell ${isThemeMenuOpen ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="top-menu-button"
                onClick={() => setIsThemeMenuOpen((previous) => !previous)}
                aria-label="Select theme"
                aria-expanded={isThemeMenuOpen}
                aria-haspopup="menu"
              >
                Theme
              </button>

              <div className="top-menu-popover" role="menu" aria-label="Theme selection">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="menuitem"
                    className={`theme-menu-item ${
                      themePresetId === preset.id ? "is-active" : ""
                    }`}
                    onClick={() => onThemePresetSelect(preset.id)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>
      ) : null}

      {!isPreviewMode ? (
        <section
          className={`board-panel board-bottom-panel ${
            isToolboxExpanded ? "is-expanded" : ""
          }`}
          data-board-export-hidden="true"
        >
          <div className="bottom-quick-row">
            <div className="bottom-node-actions bottom-node-actions-quick">
              <SymbolButton
                label="Add Thread"
                icon={<IconAddThread />}
                active={isThreadStudioOpen}
                onClick={onOpenThreadStudio}
              />

              {quickTools.map((tool) => (
                <SymbolButton
                  key={tool.id}
                  label={tool.quickLabel}
                  icon={renderToolIcon(tool.iconKey, tool.glyph, tool.id)}
                  onClick={() => onAddToolById(tool.id)}
                />
              ))}
            </div>

            <button
              type="button"
              className={`toolbox-collapser-btn ${isToolboxExpanded ? "is-expanded" : ""}`}
              onClick={() => setIsToolboxExpanded((previous) => !previous)}
              aria-expanded={isToolboxExpanded}
              aria-controls="board-toolbox-drawer"
              aria-label={
                isToolboxExpanded ? "Collapse full tool library" : "Expand full tool library"
              }
              title={
                isToolboxExpanded ? "Collapse full tool library" : "Expand full tool library"
              }
            >
              <IconPanelToggle />
            </button>
          </div>

          {isToolboxExpanded ? (
            <div id="board-toolbox-drawer" className="toolbox-drawer">
              <div className="toolbox-search-row">
                <input
                  type="search"
                  className="toolbox-search-input"
                  value={toolSearch}
                  onChange={(event) => setToolSearch(event.target.value)}
                  placeholder="Search professions, tools, or keywords"
                  aria-label="Search tools"
                />
                <button
                  type="button"
                  className="toolbox-reset-pins-btn"
                  onClick={onResetPinnedTools}
                >
                  Reset Pins
                </button>
              </div>

              <div className="toolbox-search-meta">
                <span>{filteredTools.length} tools</span>
                <span>{quickTools.length} pinned in quick row</span>
              </div>

              <div
                className="toolbox-library-actions"
                role="list"
                aria-label="All board tools"
              >
                {filteredTools.map((tool) => {
                  const isPinned = pinnedToolIds.includes(tool.id);

                  return (
                    <SymbolButton
                      key={tool.id}
                      label={tool.quickLabel}
                      icon={renderToolIcon(tool.iconKey, tool.glyph, tool.id)}
                      active={isPinned}
                      className="toolbox-library-btn"
                      onClick={() => onAddToolById(tool.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onTogglePinnedTool(tool.id);
                      }}
                    />
                  );
                })}

                {filteredTools.length === 0 ? (
                  <div className="toolbox-empty-state">No tools matched your search.</div>
                ) : null}
              </div>

              <div className="toolbox-library-hint">
                Right click a library button to pin or unpin it in the quick row.
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!isPreviewMode && isThreadStudioOpen ? (
        <aside
          className="board-panel thread-studio-drawer"
          data-board-export-hidden="true"
        >
          <div className="thread-studio-head">
            <div className="thread-studio-title">Thread Studio</div>
            <SymbolButton label="Collapse" icon={<IconCollapse />} onClick={onCollapseThreadStudio} />
          </div>

          <div className="thread-studio-status">
            {threadModeEnabled ? "Join mode active" : "Join mode inactive"}
          </div>

          <div className="thread-studio-actions">
            <SymbolButton
              label={threadModeEnabled ? "Thread Mode On" : "Thread Mode Off"}
              icon={<IconAddThread />}
              active={threadModeEnabled}
              onClick={() => setThreadModeEnabled((previous) => !previous)}
            />
            <SymbolButton label="Clear Threads" icon={<IconClear />} onClick={onClearThreads} />
          </div>

          <div className="thread-style-strip" role="group" aria-label="Thread path style">
            {(Object.keys(THREAD_STYLE_LABELS) as ThreadStyle[]).map((styleEntry) => (
              <button
                key={styleEntry}
                type="button"
                className={`theme-menu-item ${
                  threadStyle === styleEntry ? "is-active" : ""
                }`}
                onClick={() => setThreadStyle(styleEntry)}
              >
                {THREAD_STYLE_LABELS[styleEntry]}
              </button>
            ))}
          </div>

          <div className="thread-style-strip" role="group" aria-label="Thread line design">
            {(Object.keys(THREAD_LINE_DESIGN_LABELS) as ThreadLineDesign[]).map(
              (designEntry) => (
                <button
                  key={designEntry}
                  type="button"
                  className={`theme-menu-item ${
                    threadLineDesign === designEntry ? "is-active" : ""
                  }`}
                  onClick={() => setThreadLineDesign(designEntry)}
                >
                  {THREAD_LINE_DESIGN_LABELS[designEntry]}
                </button>
              )
            )}
          </div>

          <div className="thread-studio-controls">
            <div className="icon-control-row">
              <span>Color</span>
              <input
                type="color"
                value={threadColor}
                onChange={(event) => setThreadColor(event.target.value)}
                aria-label="Thread color"
              />
            </div>

            <label className="icon-slider-row" htmlFor="thread-opacity-range">
              <span>Opacity</span>
              <input
                id="thread-opacity-range"
                type="range"
                min={20}
                max={100}
                step={1}
                value={Math.round(threadOpacity * 100)}
                onChange={(event) =>
                  setThreadOpacity(
                    normalizeRange(
                      Number(event.target.value) / 100,
                      0.2,
                      1,
                      DEFAULT_THREAD_OPACITY
                    )
                  )
                }
                aria-label="Thread opacity"
              />
            </label>

            <label className="icon-slider-row" htmlFor="thread-brightness-range">
              <span>Brightness</span>
              <input
                id="thread-brightness-range"
                type="range"
                min={40}
                max={180}
                step={1}
                value={Math.round(threadBrightness)}
                onChange={(event) =>
                  setThreadBrightness(
                    normalizeRange(
                      Number(event.target.value),
                      40,
                      180,
                      DEFAULT_THREAD_BRIGHTNESS
                    )
                  )
                }
                aria-label="Thread brightness"
              />
            </label>

            <label className="icon-slider-row" htmlFor="thread-width-range">
              <span>Thickness</span>
              <input
                id="thread-width-range"
                type="range"
                min={1}
                max={14}
                step={1}
                value={Math.round(threadWidth)}
                onChange={(event) =>
                  setThreadWidth(
                    normalizeRange(
                      Number(event.target.value),
                      1,
                      14,
                      DEFAULT_THREAD_WIDTH
                    )
                  )
                }
                aria-label="Thread width"
              />
            </label>
          </div>
        </aside>
      ) : null}

      {!isPreviewMode ? (
        <div className="board-side-wrapper" data-board-export-hidden="true">
          <button
            type="button"
            className={`board-sidebar-toggle ${isSidebarCollapsed ? "is-collapsed" : ""}`}
            onClick={() => setIsSidebarCollapsed((previous) => !previous)}
            aria-label={isSidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? "Open" : "Collapse"}
          </button>

          <aside className={`board-panel board-side-panel ${isSidebarCollapsed ? "is-collapsed" : ""}`}>
          <div className="board-section" title="Board colors">
            <div className="icon-control-row">
              <span>Plane</span>
              <input
                type="color"
                value={planeColor}
                onChange={(event) => setPlaneColor(event.target.value)}
                aria-label="Plane color"
              />
            </div>
            <div className="icon-control-row">
              <span>Grid</span>
              <input
                type="color"
                value={gridColor}
                onChange={(event) => setGridColor(event.target.value)}
                aria-label="Grid color"
              />
            </div>
            <div className="icon-control-row">
              <span>Major Grid</span>
              <input
                type="color"
                value={majorGridColor}
                onChange={(event) => setMajorGridColor(event.target.value)}
                aria-label="Major grid color"
              />
            </div>
            <div className="symbol-row">
              <SymbolButton
                label={backgroundMode === "grid" ? "Switch To Plane" : "Switch To Grid"}
                icon={<IconToggleBackground />}
                onClick={onToggleBackgroundMode}
              />
            </div>
          </div>

          <div className="board-section" title="Background image">
            <div className="symbol-row">
              <SymbolButton label="Upload Background" icon={<IconUpload />} onClick={onOpenBackgroundImageDialog} />
              <SymbolButton label="Clear Background" icon={<IconClear />} onClick={() => void onClearBackgroundImage()} />
            </div>
          </div>

          <div className="board-section" title="Export and import">
            <div className="symbol-row">
              <SymbolButton label="Export PNG" icon={<IconExport />} onClick={onExportPng} disabled={isExporting} />
              <SymbolButton label="Export PDF" icon={<IconExport />} onClick={onExportPdf} disabled={isExporting} />
              <SymbolButton label="Export SVG" icon={<IconExport />} onClick={onExportSvg} disabled={isExporting} />
            </div>
            <div className="symbol-row">
              <SymbolButton label="Export WEBP" icon={<IconExport />} onClick={onExportWebp} disabled={isExporting} />
              <SymbolButton label="Export Backup" icon={<IconExport />} onClick={onExportJson} disabled={isExporting} />
              <SymbolButton label="Import Backup" icon={<IconImport />} onClick={onOpenImportDialog} />
            </div>
          </div>

          <div className="board-section" title="Board actions">
            <div className="symbol-row">
              <SymbolButton label="Remove Last Node" icon={<IconRemoveNode />} onClick={() => void removeLastNode()} disabled={nodes.length === 0} />
              <SymbolButton label="Duplicate Last" icon={<IconDuplicate />} onClick={duplicateLastNode} disabled={nodes.length === 0} />
              <SymbolButton label="Auto Arrange" icon={<IconAutoArrange />} onClick={onAutoArrangeNodes} disabled={nodes.length === 0} />
              <SymbolButton label="Clear Board" icon={<IconClearBoard />} onClick={onClearBoard} />
            </div>
          </div>
          </aside>
        </div>
      ) : null}

      {confirmDialog || noticeDialog ? (
        <div
          className="board-dialog-overlay"
          data-board-export-hidden="true"
          onClick={closeDialogs}
        >
          <section
            className="board-panel board-choice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-choice-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="board-choice-title" className="board-choice-title">
              {confirmDialog?.title ?? noticeDialog?.title}
            </h2>
            <p className="board-choice-message">
              {confirmDialog?.message ?? noticeDialog?.message}
            </p>

            <div className="board-choice-actions">
              {confirmDialog ? (
                <>
                  <button
                    type="button"
                    className="top-menu-button"
                    onClick={() => setConfirmDialog(null)}
                  >
                    {confirmDialog.cancelLabel ?? "Cancel"}
                  </button>
                  <button
                    type="button"
                    className={`top-menu-button board-choice-confirm ${
                      confirmDialog.destructive ? "is-danger" : ""
                    }`}
                    onClick={() => void handleConfirmDialog()}
                  >
                    {confirmDialog.confirmLabel ?? "Confirm"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="top-menu-button board-choice-confirm"
                  onClick={() => setNoticeDialog(null)}
                >
                  {noticeDialog?.acknowledgeLabel ?? "OK"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isPreviewMode ? (
        <button
          type="button"
          className="board-preview-exit"
          onClick={onExitPreview}
          data-board-export-hidden="true"
        >
          Exit Preview
        </button>
      ) : null}

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json,text/json"
        onChange={onImportBoard}
        className="toolbar-import-input"
        aria-hidden="true"
        tabIndex={-1}
      />

      <input
        ref={backgroundImageInputRef}
        type="file"
        accept="image/*"
        onChange={onBackgroundImageSelected}
        className="toolbar-import-input"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
