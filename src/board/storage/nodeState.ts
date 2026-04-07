import { BoardStorage, BoardNodeMeta } from "../../storage";

export type DetectiveNodeType =
  | "sticky-note"
  | "photo-drop"
  | "evidence-document"
  | "map-node"
  | "poll-node"
  | "thread-hub"
  | "timeline-event"
  | "gif-node"
  | "shape-node"
  | "audio-evidence"
  | "video-evidence"
  | "suspect-profile"
  | "interrogation-log"
  | "checklist-board"
  | "profession-template";

export type DetectiveNodeTextValue = string | string[];

export interface DetectiveNodeMeta extends BoardNodeMeta {
  nodeType: DetectiveNodeType;
  zIndex?: number;
  rotationDeg?: number;
  scalePercent?: number;
  opacityPercent?: number;
  brightnessPercent?: number;
  widthPx?: number;
  heightPx?: number;
  title?: string;
  body?: string;
  text?: DetectiveNodeTextValue;
  colorHex?: string;
  imageMimeType?: string;
}

const DETECTIVE_NODE_TYPES: readonly DetectiveNodeType[] = [
  "sticky-note",
  "photo-drop",
  "evidence-document",
  "map-node",
  "poll-node",
  "thread-hub",
  "timeline-event",
  "gif-node",
  "shape-node",
  "audio-evidence",
  "video-evidence",
  "suspect-profile",
  "interrogation-log",
  "checklist-board",
  "profession-template",
];

function isDetectiveNodeType(value: unknown): value is DetectiveNodeType {
  return (
    typeof value === "string" &&
    (DETECTIVE_NODE_TYPES as readonly string[]).includes(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asTextValueOrUndefined(value: unknown): DetectiveNodeTextValue | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const nextValue = value.filter((entry): entry is string => typeof entry === "string");
    return nextValue.length > 0 ? nextValue : undefined;
  }

  return undefined;
}

export function readNodeMeta(
  storage: BoardStorage,
  nodeId: string
): DetectiveNodeMeta | null {
  const meta = storage.getNodeMeta(nodeId);
  if (!meta) {
    return null;
  }

  const nodeType = meta.nodeType;
  if (!isDetectiveNodeType(nodeType)) {
    return null;
  }

  return {
    ...meta,
    id: nodeId,
    nodeType,
    x: isFiniteNumber(meta.x) ? meta.x : 0,
    y: isFiniteNumber(meta.y) ? meta.y : 0,
    zIndex: isFiniteNumber(meta.zIndex) ? meta.zIndex : undefined,
    rotationDeg: isFiniteNumber(meta.rotationDeg) ? meta.rotationDeg : 0,
    scalePercent: isFiniteNumber(meta.scalePercent)
      ? meta.scalePercent
      : undefined,
    opacityPercent: isFiniteNumber(meta.opacityPercent)
      ? meta.opacityPercent
      : undefined,
    brightnessPercent: isFiniteNumber(meta.brightnessPercent)
      ? meta.brightnessPercent
      : undefined,
    widthPx: isFiniteNumber(meta.widthPx) ? meta.widthPx : undefined,
    heightPx: isFiniteNumber(meta.heightPx) ? meta.heightPx : undefined,
    text: asTextValueOrUndefined(meta.text),
    title: asStringOrUndefined(meta.title),
    body: asStringOrUndefined(meta.body),
    blobKey: asStringOrUndefined(meta.blobKey),
    colorHex: asStringOrUndefined(meta.colorHex),
    imageMimeType: asStringOrUndefined(meta.imageMimeType),
  };
}

export function patchNodeMeta(
  storage: BoardStorage,
  nodeId: string,
  patch: Partial<DetectiveNodeMeta>
): DetectiveNodeMeta {
  const existing = storage.getNodeMeta(nodeId);
  const resolvedNodeType =
    patch.nodeType ??
    (isDetectiveNodeType(existing?.nodeType) ? existing.nodeType : undefined) ??
    "sticky-note";

  const merged: DetectiveNodeMeta = {
    id: nodeId,
    nodeType: resolvedNodeType,
    x: typeof patch.x === "number" ? patch.x : existing?.x ?? 0,
    y: typeof patch.y === "number" ? patch.y : existing?.y ?? 0,
    ...existing,
    ...patch,
    text: asTextValueOrUndefined(patch.text ?? existing?.text),
    title: asStringOrUndefined(patch.title ?? existing?.title),
    body: asStringOrUndefined(patch.body ?? existing?.body),
    blobKey: asStringOrUndefined(patch.blobKey ?? existing?.blobKey),
    colorHex: asStringOrUndefined(patch.colorHex ?? existing?.colorHex),
    imageMimeType: asStringOrUndefined(
      patch.imageMimeType ?? existing?.imageMimeType
    ),
  };

  storage.setNodeMeta(merged);
  return merged;
}

export function resolveInitialValue<T>(
  persistedValue: unknown,
  fallbackValue: T,
  guard: (value: unknown) => value is T
): T {
  if (guard(persistedValue)) {
    return persistedValue;
  }

  return fallbackValue;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
