import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Matrix2D, Point2D } from "../../canvas";
import { BoardStorage } from "../../storage";

const CONNECTIONS_META_KEY = "connections";
const FALLBACK_CONNECTIONS_STORAGE_KEY = "detective-board:connections";

export type ThreadStyle =
  | "curve"
  | "straight"
  | "zigzag"
  | "arc"
  | "handmade";

export type ThreadLineDesign =
  | "solid"
  | "dashed"
  | "dotted"
  | "dash-dot"
  | "double";

export type NodePinAnchor = "top" | "right" | "bottom" | "left";

export interface ThreadVisualSettings {
  colorHex: string;
  opacity: number;
  brightness: number;
  width: number;
  lineDesign: ThreadLineDesign;
}

export interface ThreadCreateOptions extends Partial<ThreadVisualSettings> {
  style?: ThreadStyle;
}

const DEFAULT_THREAD_STYLE: ThreadStyle = "curve";
const DEFAULT_THREAD_COLOR = "#8f8f8f";
const DEFAULT_THREAD_OPACITY = 0.92;
const DEFAULT_THREAD_BRIGHTNESS = 100;
const DEFAULT_THREAD_WIDTH = 3;
const DEFAULT_THREAD_LINE_DESIGN: ThreadLineDesign = "solid";

const DEFAULT_SOURCE_PIN_ANCHOR: NodePinAnchor = "right";
const DEFAULT_TARGET_PIN_ANCHOR: NodePinAnchor = "left";

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

function normalizeRange(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function normalizeThreadSettings(
  source?: Partial<ThreadCreateOptions>
): ThreadVisualSettings {
  return {
    colorHex: normalizeHexColor(source?.colorHex, DEFAULT_THREAD_COLOR),
    opacity: normalizeRange(source?.opacity, 0.2, 1, DEFAULT_THREAD_OPACITY),
    brightness: normalizeRange(
      source?.brightness,
      40,
      180,
      DEFAULT_THREAD_BRIGHTNESS
    ),
    width: normalizeRange(source?.width, 1, 14, DEFAULT_THREAD_WIDTH),
    lineDesign: isThreadLineDesign(source?.lineDesign)
      ? source.lineDesign
      : DEFAULT_THREAD_LINE_DESIGN,
  };
}

export interface BoardConnection {
  fromNodeId: string;
  toNodeId: string;
  fromPinAnchor: NodePinAnchor;
  toPinAnchor: NodePinAnchor;
  style: ThreadStyle;
  colorHex: string;
  opacity: number;
  brightness: number;
  width: number;
  lineDesign: ThreadLineDesign;
}

export interface BoardNodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  scalePercent: number;
}

export interface DraftBoardConnection {
  sourceNodeId: string;
  sourcePinAnchor: NodePinAnchor;
  pointerWorld: Point2D;
}

export interface BoardConnectionRequest {
  sourceNodeId: string;
  targetNodeId: string;
  sourcePinAnchor: NodePinAnchor;
  targetPinAnchor: NodePinAnchor;
  clientX: number;
  clientY: number;
  complete: (options?: ThreadCreateOptions | ThreadStyle) => void;
  cancel: () => void;
}

interface BoardConnectionsProviderProps {
  storage?: BoardStorage;
  clientToWorld: (clientX: number, clientY: number) => Point2D;
  getViewportRect: () => DOMRect | null;
  getCanvasMatrix: () => Matrix2D;
  threadModeEnabled?: boolean;
  previewModeEnabled?: boolean;
  threadStyle?: ThreadStyle;
  threadDefaults?: Partial<ThreadCreateOptions>;
  onConnectionRequested?: (request: BoardConnectionRequest) => void;
  children: ReactNode;
}

interface BoardConnectionsRenderContextValue {
  nodeLayouts: Readonly<Record<string, BoardNodeLayout>>;
  connections: readonly BoardConnection[];
  draftConnection: DraftBoardConnection | null;
  getViewportRect: () => DOMRect | null;
  getCanvasMatrix: () => Matrix2D;
  threadStyle: ThreadStyle;
  threadDefaults: ThreadVisualSettings;
}

interface BoardConnectionsControlsContextValue {
  threadModeEnabled: boolean;
  previewModeEnabled: boolean;
  upsertNodeLayout: (nodeId: string, layout: BoardNodeLayout) => void;
  removeNodeLayout: (nodeId: string) => void;
  beginConnectionDrag: (
    nodeId: string,
    pinAnchor: NodePinAnchor,
    clientX: number,
    clientY: number
  ) => void;
  cancelConnectionDrag: () => void;
}

const BoardConnectionsRenderContext =
  createContext<BoardConnectionsRenderContextValue | null>(null);
const BoardConnectionsControlsContext =
  createContext<BoardConnectionsControlsContextValue | null>(null);

function isBoardConnection(value: unknown): value is BoardConnection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const connection = value as Record<string, unknown>;

  return (
    typeof connection.fromNodeId === "string" &&
    typeof connection.toNodeId === "string" &&
    connection.fromNodeId.length > 0 &&
    connection.toNodeId.length > 0 &&
    isNodePinAnchor(connection.fromPinAnchor ?? DEFAULT_SOURCE_PIN_ANCHOR) &&
    isNodePinAnchor(connection.toPinAnchor ?? DEFAULT_TARGET_PIN_ANCHOR) &&
    isThreadStyle(connection.style ?? DEFAULT_THREAD_STYLE)
  );
}

function normalizeConnection(
  sourceNodeId: string,
  targetNodeId: string,
  sourcePinAnchor: NodePinAnchor,
  targetPinAnchor: NodePinAnchor,
  style: ThreadStyle,
  visual?: Partial<ThreadCreateOptions>
): BoardConnection {
  const normalizedVisual = normalizeThreadSettings(visual);

  return {
    fromNodeId: sourceNodeId,
    toNodeId: targetNodeId,
    fromPinAnchor: sourcePinAnchor,
    toPinAnchor: targetPinAnchor,
    style,
    colorHex: normalizedVisual.colorHex,
    opacity: normalizedVisual.opacity,
    brightness: normalizedVisual.brightness,
    width: normalizedVisual.width,
    lineDesign: normalizedVisual.lineDesign,
  };
}

function connectionKey(connection: BoardConnection): string {
  return `${connection.fromNodeId}:${connection.fromPinAnchor}::${connection.toNodeId}:${connection.toPinAnchor}`;
}

function sanitizeConnectionList(value: unknown): BoardConnection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, BoardConnection>();

  for (const item of value) {
    if (!isBoardConnection(item) || item.fromNodeId === item.toNodeId) {
      continue;
    }

    const normalized = normalizeConnection(
      item.fromNodeId,
      item.toNodeId,
      isNodePinAnchor(item.fromPinAnchor)
        ? item.fromPinAnchor
        : DEFAULT_SOURCE_PIN_ANCHOR,
      isNodePinAnchor(item.toPinAnchor)
        ? item.toPinAnchor
        : DEFAULT_TARGET_PIN_ANCHOR,
      isThreadStyle(item.style) ? item.style : DEFAULT_THREAD_STYLE,
      {
        colorHex: item.colorHex,
        opacity: item.opacity,
        brightness: item.brightness,
        width: item.width,
        lineDesign: item.lineDesign,
      }
    );
    deduped.set(connectionKey(normalized), normalized);
  }

  return Array.from(deduped.values());
}

function readPersistedConnections(storage?: BoardStorage): BoardConnection[] {
  if (storage) {
    return sanitizeConnectionList(
      storage.getBoardMeta<BoardConnection[]>(CONNECTIONS_META_KEY)
    );
  }

  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(FALLBACK_CONNECTIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return sanitizeConnectionList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistConnections(
  connections: readonly BoardConnection[],
  storage?: BoardStorage
): void {
  if (storage) {
    storage.setBoardMeta(CONNECTIONS_META_KEY, connections);
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    FALLBACK_CONNECTIONS_STORAGE_KEY,
    JSON.stringify(connections)
  );
}

function getPinTargetFromClientCoordinates(
  clientX: number,
  clientY: number
): { nodeId: string; pinAnchor: NodePinAnchor } | null {
  if (typeof document === "undefined") {
    return null;
  }

  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const pinElement = target.closest(
    ".board-node-port[data-node-pin-role='output'][data-node-pin-id][data-node-pin-anchor]"
  );
  if (!(pinElement instanceof HTMLElement)) {
    return null;
  }

  const nodeId = pinElement.dataset.nodePinId;
  const pinAnchor = pinElement.dataset.nodePinAnchor;

  if (
    typeof nodeId !== "string" ||
    nodeId.length === 0 ||
    !isNodePinAnchor(pinAnchor)
  ) {
    return null;
  }

  return { nodeId, pinAnchor };
}

export function getPinPoint(layout: BoardNodeLayout, anchor: NodePinAnchor): Point2D {
  const cx = layout.x + layout.width / 2;
  const cy = layout.y + layout.height / 2;
  
  const scale = (layout.scalePercent || 100) / 100;
  
  // Base offset from center, scaled
  let dx = 0;
  let dy = 0;
  
  if (anchor === "top") {
    dy = -((layout.height / 2) + 8) * scale;
  } else if (anchor === "bottom") {
    dy = ((layout.height / 2) + 8) * scale;
  } else if (anchor === "right") {
    dx = ((layout.width / 2) + 8) * scale;
  } else if (anchor === "left") {
    dx = -((layout.width / 2) + 8) * scale;
  }
  
  const angleRad = ((layout.rotationDeg || 0) * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  
  return {
    x: cx + (dx * cosA - dy * sinA),
    y: cy + (dx * sinA + dy * cosA),
  };
}

export function BoardConnectionsProvider({
  storage,
  clientToWorld,
  getViewportRect,
  getCanvasMatrix,
  threadModeEnabled = false,
  previewModeEnabled = false,
  threadStyle = DEFAULT_THREAD_STYLE,
  threadDefaults,
  onConnectionRequested,
  children,
}: BoardConnectionsProviderProps) {
  const [nodeLayouts, setNodeLayouts] = useState<Record<string, BoardNodeLayout>>(
    {}
  );
  const [connections, setConnections] = useState<BoardConnection[]>(() =>
    readPersistedConnections(storage)
  );
  const [draftSource, setDraftSource] = useState<{
    nodeId: string;
    pinAnchor: NodePinAnchor;
  } | null>(null);
  const [draftPointerWorld, setDraftPointerWorld] = useState<Point2D | null>(null);

  const sourceRef = useRef<{ nodeId: string; pinAnchor: NodePinAnchor } | null>(
    null
  );
  const resolvedThreadDefaults = useMemo(
    () => normalizeThreadSettings(threadDefaults),
    [threadDefaults]
  );

  useEffect(() => {
    sourceRef.current = draftSource;
  }, [draftSource]);

  useEffect(() => {
    persistConnections(connections, storage);
  }, [connections, storage]);

  const upsertNodeLayout = useCallback(
    (nodeId: string, layout: BoardNodeLayout) => {
      setNodeLayouts((previousLayouts: Record<string, BoardNodeLayout>) => {
        const previousLayout = previousLayouts[nodeId];

        if (
          previousLayout &&
          previousLayout.x === layout.x &&
          previousLayout.y === layout.y &&
          previousLayout.width === layout.width &&
          previousLayout.height === layout.height &&
          previousLayout.rotationDeg === layout.rotationDeg &&
          previousLayout.scalePercent === layout.scalePercent
        ) {
          return previousLayouts;
        }

        return {
          ...previousLayouts,
          [nodeId]: layout,
        };
      });
    },
    []
  );

  const removeNodeLayout = useCallback((nodeId: string) => {
    setNodeLayouts((previousLayouts: Record<string, BoardNodeLayout>) => {
      if (!(nodeId in previousLayouts)) {
        return previousLayouts;
      }

      const nextLayouts = { ...previousLayouts };
      delete nextLayouts[nodeId];
      return nextLayouts;
    });
  }, []);

  const beginConnectionDrag = useCallback(
    (
      nodeId: string,
      pinAnchor: NodePinAnchor,
      clientX: number,
      clientY: number
    ) => {
      if (previewModeEnabled) {
        return;
      }

      setDraftSource({ nodeId, pinAnchor });
      setDraftPointerWorld(clientToWorld(clientX, clientY));
    },
    [clientToWorld, previewModeEnabled]
  );

  const cancelConnectionDrag = useCallback(() => {
    setDraftSource(null);
    setDraftPointerWorld(null);
  }, []);

  const upsertConnection = useCallback(
    (
      sourceNodeId: string,
      targetNodeId: string,
      sourcePinAnchor: NodePinAnchor,
      targetPinAnchor: NodePinAnchor,
      style: ThreadStyle,
      visualOverrides?: Partial<ThreadCreateOptions>
    ) => {
      if (sourceNodeId === targetNodeId) {
        return;
      }

      const normalized = normalizeConnection(
        sourceNodeId,
        targetNodeId,
        sourcePinAnchor,
        targetPinAnchor,
        style,
        {
          ...resolvedThreadDefaults,
          ...visualOverrides,
        }
      );

      setConnections((previousConnections: BoardConnection[]) => {
        const existingIndex = previousConnections.findIndex(
          (connection: BoardConnection) =>
            connectionKey(connection) === connectionKey(normalized)
        );

        if (existingIndex >= 0) {
          const existing = previousConnections[existingIndex];
          if (
            existing.style === normalized.style &&
            existing.colorHex === normalized.colorHex &&
            existing.opacity === normalized.opacity &&
            existing.brightness === normalized.brightness &&
            existing.width === normalized.width &&
            existing.lineDesign === normalized.lineDesign
          ) {
            return previousConnections;
          }

          const nextConnections = [...previousConnections];
          nextConnections[existingIndex] = normalized;
          return nextConnections;
        }

        return [...previousConnections, normalized];
      });
    },
    [resolvedThreadDefaults]
  );

  const connectNodes = useCallback(
    (
      sourceNodeId: string,
      targetNodeId: string,
      sourcePinAnchor: NodePinAnchor,
      targetPinAnchor: NodePinAnchor
    ) => {
      upsertConnection(
        sourceNodeId,
        targetNodeId,
        sourcePinAnchor,
        targetPinAnchor,
        threadStyle,
        resolvedThreadDefaults
      );
    },
    [resolvedThreadDefaults, threadStyle, upsertConnection]
  );

  const updateDraftPointerFromClient = useCallback(
    (clientX: number, clientY: number) => {
      setDraftPointerWorld((previousPointer: Point2D | null) => {
        if (!sourceRef.current) {
          return previousPointer;
        }

        const nextPointer = clientToWorld(clientX, clientY);

        if (
          previousPointer &&
          previousPointer.x === nextPointer.x &&
          previousPointer.y === nextPointer.y
        ) {
          return previousPointer;
        }

        return nextPointer;
      });
    },
    [clientToWorld]
  );

  const completeDraftFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const source = sourceRef.current;
      if (!source) {
        cancelConnectionDrag();
        return;
      }

      const target = getPinTargetFromClientCoordinates(clientX, clientY);
      if (target) {
        const sourceNodeId = source.nodeId;
        const sourcePinAnchor = source.pinAnchor;
        const targetNodeId = target.nodeId;
        const targetPinAnchor = target.pinAnchor;

        if (onConnectionRequested) {
          try {
            onConnectionRequested({
              sourceNodeId,
              targetNodeId,
              sourcePinAnchor,
              targetPinAnchor,
              clientX,
              clientY,
              complete: (options?: ThreadCreateOptions | ThreadStyle) => {
                try {
                  const styleFromOptions =
                    typeof options === "string"
                      ? options
                      : options?.style;

                  const resolvedStyle = isThreadStyle(styleFromOptions)
                    ? styleFromOptions
                    : threadStyle;

                  const visualOverrides =
                    options && typeof options === "object"
                      ? {
                          colorHex: options.colorHex,
                          opacity: options.opacity,
                          brightness: options.brightness,
                          width: options.width,
                          lineDesign: options.lineDesign,
                        }
                      : undefined;

                  upsertConnection(
                    sourceNodeId,
                    targetNodeId,
                    sourcePinAnchor,
                    targetPinAnchor,
                    resolvedStyle,
                    visualOverrides
                  );
                } catch {
                  connectNodes(
                    sourceNodeId,
                    targetNodeId,
                    sourcePinAnchor,
                    targetPinAnchor
                  );
                }
              },
              cancel: () => {
                // Intentionally no-op: no connection is created when request is canceled.
              },
            });
          } catch {
            connectNodes(
              sourceNodeId,
              targetNodeId,
              sourcePinAnchor,
              targetPinAnchor
            );
          }
        } else {
          connectNodes(
            sourceNodeId,
            targetNodeId,
            sourcePinAnchor,
            targetPinAnchor
          );
        }
      }

      cancelConnectionDrag();
    },
    [
      cancelConnectionDrag,
      connectNodes,
      onConnectionRequested,
      resolvedThreadDefaults,
      threadStyle,
      upsertConnection,
    ]
  );

  useEffect(() => {
    if (previewModeEnabled) {
      cancelConnectionDrag();
    }
  }, [cancelConnectionDrag, previewModeEnabled]);

  useEffect(() => {
    if (!draftSource) {
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      updateDraftPointerFromClient(event.clientX, event.clientY);
    };

    const onPointerUp = (event: PointerEvent) => {
      completeDraftFromClient(event.clientX, event.clientY);
    };

    const onPointerCancel = () => {
      cancelConnectionDrag();
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [
    cancelConnectionDrag,
    completeDraftFromClient,
    draftSource,
    updateDraftPointerFromClient,
  ]);

  const draftConnection = useMemo<DraftBoardConnection | null>(() => {
    if (!draftSource || !draftPointerWorld) {
      return null;
    }

    return {
      sourceNodeId: draftSource.nodeId,
      sourcePinAnchor: draftSource.pinAnchor,
      pointerWorld: draftPointerWorld,
    };
  }, [draftPointerWorld, draftSource]);

  const renderValue = useMemo<BoardConnectionsRenderContextValue>(
    () => ({
      nodeLayouts,
      connections,
      draftConnection,
      getViewportRect,
      getCanvasMatrix,
      threadStyle,
      threadDefaults: resolvedThreadDefaults,
    }),
    [
      connections,
      draftConnection,
      getCanvasMatrix,
      getViewportRect,
      nodeLayouts,
      threadStyle,
      resolvedThreadDefaults,
    ]
  );

  const controlsValue = useMemo<BoardConnectionsControlsContextValue>(
    () => ({
      threadModeEnabled,
      previewModeEnabled,
      upsertNodeLayout,
      removeNodeLayout,
      beginConnectionDrag,
      cancelConnectionDrag,
    }),
    [
      beginConnectionDrag,
      cancelConnectionDrag,
      previewModeEnabled,
      threadModeEnabled,
      removeNodeLayout,
      upsertNodeLayout,
    ]
  );

  return (
    <BoardConnectionsControlsContext.Provider value={controlsValue}>
      <BoardConnectionsRenderContext.Provider value={renderValue}>
        {children}
      </BoardConnectionsRenderContext.Provider>
    </BoardConnectionsControlsContext.Provider>
  );
}

export function useBoardConnections(): BoardConnectionsRenderContextValue | null {
  return useContext(BoardConnectionsRenderContext);
}

export function useBoardConnectionControls(): BoardConnectionsControlsContextValue | null {
  return useContext(BoardConnectionsControlsContext);
}
