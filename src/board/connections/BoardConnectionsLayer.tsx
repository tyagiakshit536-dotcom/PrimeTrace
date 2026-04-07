import { CSSProperties, useMemo, useRef } from "react";
import { Matrix2D, Point2D } from "../../canvas";
import {
  BoardConnection,
  DraftBoardConnection,
  BoardNodeLayout,
  NodePinAnchor,
  ThreadLineDesign,
  ThreadStyle,
  ThreadVisualSettings,
  getPinPoint,
  useBoardConnections,
} from "./BoardConnectionsContext";
import { buildDynamicBezierPath, portRectToCanvasPoint } from "./connectionMath";

const LAYER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  overflow: "visible",
  pointerEvents: "none",
  zIndex: 0,
};

function buildCurvedPath(
  start: { x: number; y: number },
  end: { x: number; y: number }
): string {
  return buildDynamicBezierPath(start, end);
}

function buildStraightPath(
  start: { x: number; y: number },
  end: { x: number; y: number }
): string {
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function buildArcPath(
  start: { x: number; y: number },
  end: { x: number; y: number }
): string {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const controlX = start.x + deltaX * 0.5;
  const controlY = start.y + deltaY * 0.5 - Math.min(120, Math.hypot(deltaX, deltaY) * 0.28);

  return `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
}

function buildZigZagPath(
  start: { x: number; y: number },
  end: { x: number; y: number }
): string {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const segments = Math.max(4, Math.min(14, Math.round(length / 44)));
  const stepX = deltaX / segments;
  const stepY = deltaY / segments;
  const angle = Math.atan2(deltaY, deltaX);
  const offsetX = Math.sin(angle) * 8;
  const offsetY = -Math.cos(angle) * 8;

  let path = `M ${start.x} ${start.y}`;

  for (let index = 1; index < segments; index += 1) {
    const direction = index % 2 === 0 ? -1 : 1;
    const x = start.x + stepX * index + offsetX * direction;
    const y = start.y + stepY * index + offsetY * direction;
    path += ` L ${x} ${y}`;
  }

  path += ` L ${end.x} ${end.y}`;
  return path;
}

function buildHandmadePath(
  start: { x: number; y: number },
  end: { x: number; y: number }
): string {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const segments = Math.max(5, Math.min(16, Math.round(length / 36)));

  let path = `M ${start.x} ${start.y}`;

  for (let index = 1; index < segments; index += 1) {
    const ratio = index / segments;
    const baseX = start.x + deltaX * ratio;
    const baseY = start.y + deltaY * ratio;
    const sway = Math.sin(ratio * Math.PI * 4) * 7;
    const drift = Math.cos(ratio * Math.PI * 6) * 3;

    path += ` L ${baseX + sway} ${baseY + drift}`;
  }

  path += ` L ${end.x} ${end.y}`;
  return path;
}

function buildPathByStyle(
  start: { x: number; y: number },
  end: { x: number; y: number },
  style: ThreadStyle
): string {
  if (style === "straight") {
    return buildStraightPath(start, end);
  }

  if (style === "zigzag") {
    return buildZigZagPath(start, end);
  }

  if (style === "arc") {
    return buildArcPath(start, end);
  }

  if (style === "handmade") {
    return buildHandmadePath(start, end);
  }

  return buildCurvedPath(start, end);
}

function normalizeHexColor(value: unknown, fallback = "#8f8f8f"): string {
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

function toBrightenedRgba(hexColor: string, brightness: number, opacity: number): string {
  const normalized = normalizeHexColor(hexColor).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  const brightnessFactor = Math.max(0.4, Math.min(2.2, brightness / 100));
  const apply = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel * brightnessFactor)));

  return `rgba(${apply(red)}, ${apply(green)}, ${apply(blue)}, ${Math.max(
    0.05,
    Math.min(1, opacity)
  )})`;
}

function getDashArray(design: ThreadLineDesign, width: number): string | undefined {
  const normalizedWidth = Math.max(1, width);

  if (design === "dashed") {
    return `${Math.max(8, normalizedWidth * 3)} ${Math.max(6, normalizedWidth * 2)}`;
  }

  if (design === "dotted") {
    return `0 ${Math.max(8, normalizedWidth * 2.2)}`;
  }

  if (design === "dash-dot") {
    return `${Math.max(10, normalizedWidth * 3)} ${Math.max(
      6,
      normalizedWidth * 2
    )} ${Math.max(2, normalizedWidth)} ${Math.max(6, normalizedWidth * 2)}`;
  }

  if (design === "double") {
    return `${Math.max(2, normalizedWidth * 1.2)} ${Math.max(2, normalizedWidth * 1.1)}`;
  }

  return undefined;
}

interface ThreadRenderPath {
  id: string;
  path: string;
  style: ThreadStyle;
  colorHex: string;
  opacity: number;
  brightness: number;
  width: number;
  lineDesign: ThreadLineDesign;
  isDraft: boolean;
}

type PathResolver = (
  pathId: string,
  style: ThreadStyle,
  start: Point2D,
  end: Point2D
) => string;

type AnchorPointResolver = (
  nodeId: string,
  pinAnchor: NodePinAnchor,
  fallbackLayout?: BoardNodeLayout
) => Point2D | null;

function formatCoordinate(value: number): string {
  return `${Math.round(value * 100) / 100}`;
}

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function queryNodePortElement(
  nodeId: string,
  pinAnchor: NodePinAnchor
): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const selector =
    `.board-node-port[data-node-pin-role='output']` +
    `[data-node-pin-id="${escapeAttributeValue(nodeId)}"]` +
    `[data-node-pin-anchor='${pinAnchor}']`;

  const element = document.querySelector(selector);
  return element instanceof HTMLElement ? element : null;
}

function resolvePortPointFromDom(
  nodeId: string,
  pinAnchor: NodePinAnchor,
  viewportRect: DOMRect | null,
  matrix: Matrix2D
): Point2D | null {
  if (!viewportRect) {
    return null;
  }

  const portElement = queryNodePortElement(nodeId, pinAnchor);
  if (!portElement) {
    return null;
  }

  return portRectToCanvasPoint(portElement.getBoundingClientRect(), viewportRect, matrix);
}

function mapConnectionToPath(
  connection: BoardConnection,
  nodeLayouts: Readonly<Record<string, BoardNodeLayout>>,
  resolvePath: PathResolver,
  resolveAnchorPoint: AnchorPointResolver
): ThreadRenderPath | null {
  const fromLayout = nodeLayouts[connection.fromNodeId];
  const toLayout = nodeLayouts[connection.toNodeId];

  const fromPoint = resolveAnchorPoint(
    connection.fromNodeId,
    connection.fromPinAnchor,
    fromLayout
  );
  const toPoint = resolveAnchorPoint(
    connection.toNodeId,
    connection.toPinAnchor,
    toLayout
  );

  if (!fromPoint || !toPoint) {
    return null;
  }

  return {
    id: `${connection.fromNodeId}:${connection.fromPinAnchor}::${connection.toNodeId}:${connection.toPinAnchor}`,
    path: resolvePath(
      `${connection.fromNodeId}::${connection.toNodeId}`,
      connection.style,
      fromPoint,
      toPoint
    ),
    style: connection.style,
    colorHex: connection.colorHex,
    opacity: connection.opacity,
    brightness: connection.brightness,
    width: connection.width,
    lineDesign: connection.lineDesign,
    isDraft: false,
  };
}

function mapDraftToPath(
  draft: DraftBoardConnection,
  nodeLayouts: Readonly<Record<string, BoardNodeLayout>>,
  style: ThreadStyle,
  defaults: ThreadVisualSettings,
  resolvePath: PathResolver,
  resolveAnchorPoint: AnchorPointResolver
): ThreadRenderPath | null {
  const sourceLayout = nodeLayouts[draft.sourceNodeId];
  const fromPoint = resolveAnchorPoint(
    draft.sourceNodeId,
    draft.sourcePinAnchor,
    sourceLayout
  );
  if (!fromPoint) {
    return null;
  }

  const toPoint = draft.pointerWorld;

  return {
    id: `draft-${draft.sourceNodeId}-${draft.sourcePinAnchor}`,
    path: resolvePath(
      `draft-${draft.sourceNodeId}-${draft.sourcePinAnchor}`,
      style,
      fromPoint,
      toPoint
    ),
    style,
    colorHex: defaults.colorHex,
    opacity: defaults.opacity,
    brightness: defaults.brightness,
    width: defaults.width,
    lineDesign: defaults.lineDesign,
    isDraft: true,
  };
}

export function BoardConnectionsLayer() {
  const boardConnections = useBoardConnections();
  const pathCacheRef = useRef<Map<string, string>>(new Map());

  const paths = useMemo(() => {
    if (!boardConnections) {
      pathCacheRef.current = new Map();
      return [] as ThreadRenderPath[];
    }

    const viewportRect = boardConnections.getViewportRect();
    const matrix = boardConnections.getCanvasMatrix();
    const previousCache = pathCacheRef.current;
    const nextCache = new Map<string, string>();
    const anchorPointCache = new Map<string, Point2D | null>();

    const resolveAnchorPoint: AnchorPointResolver = (
      nodeId,
      pinAnchor,
      fallbackLayout
    ) => {
      const anchorKey = `${nodeId}:${pinAnchor}`;

      if (anchorPointCache.has(anchorKey)) {
        return anchorPointCache.get(anchorKey) ?? null;
      }

      const fromDom = resolvePortPointFromDom(nodeId, pinAnchor, viewportRect, matrix);
      const resolved = fromDom ?? (fallbackLayout ? getPinPoint(fallbackLayout, pinAnchor) : null);

      anchorPointCache.set(anchorKey, resolved);
      return resolved;
    };

    const resolvePath: PathResolver = (pathId, style, start, end) => {
      const cacheKey =
        `${pathId}|${style}|` +
        `${formatCoordinate(start.x)},${formatCoordinate(start.y)}|` +
        `${formatCoordinate(end.x)},${formatCoordinate(end.y)}`;
      const cached = previousCache.get(cacheKey);
      if (cached) {
        nextCache.set(cacheKey, cached);
        return cached;
      }

      const computed = buildPathByStyle(start, end, style);
      nextCache.set(cacheKey, computed);
      return computed;
    };

    const persistentPaths = boardConnections.connections
      .map((connection) =>
        mapConnectionToPath(
          connection,
          boardConnections.nodeLayouts,
          resolvePath,
          resolveAnchorPoint
        )
      )
      .filter((path): path is ThreadRenderPath => path !== null);

    if (!boardConnections.draftConnection) {
      pathCacheRef.current = nextCache;
      return persistentPaths;
    }

    const draftPath = mapDraftToPath(
      boardConnections.draftConnection,
      boardConnections.nodeLayouts,
      boardConnections.threadStyle,
      boardConnections.threadDefaults,
      resolvePath,
      resolveAnchorPoint
    );

    pathCacheRef.current = nextCache;

    return draftPath ? [...persistentPaths, draftPath] : persistentPaths;
  }, [boardConnections]);

  if (paths.length === 0) {
    return null;
  }

  const isDenseThreadScene = paths.length > 120;

  return (
    <svg
      aria-hidden="true"
      style={LAYER_STYLE}
      data-board-thread-density={isDenseThreadScene ? "high" : "normal"}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {paths.map((entry: ThreadRenderPath) => {
          const dashArray = getDashArray(entry.lineDesign, entry.width);

          return (
            <g key={entry.id}>
              <path
                d={entry.path}
                className={`board-connection-path board-connection-${entry.style} board-connection-design-${
                  entry.lineDesign
                }${
                  entry.isDraft ? " board-connection-draft" : ""
                }`}
                style={{
                  stroke: toBrightenedRgba(
                    entry.colorHex,
                    entry.brightness,
                    entry.opacity
                  ),
                  strokeWidth: entry.width,
                  strokeDasharray: dashArray,
                  vectorEffect: "non-scaling-stroke",
                  shapeRendering: "geometricPrecision",
                  strokeMiterlimit: 1,
                }}
              />

              {isDenseThreadScene ? null : (
                <path
                  d={entry.path}
                  className={`board-connection-sheen board-connection-${entry.style} board-connection-design-${
                    entry.lineDesign
                  }${
                    entry.isDraft ? " board-connection-draft" : ""
                  }`}
                  style={{
                    strokeWidth: Math.max(1, entry.width * 0.34),
                    opacity: Math.max(0.14, Math.min(0.84, entry.opacity * 0.62)),
                    strokeDasharray: getDashArray(
                      entry.lineDesign,
                      Math.max(1, entry.width * 0.8)
                    ),
                    vectorEffect: "non-scaling-stroke",
                    shapeRendering: "geometricPrecision",
                    strokeMiterlimit: 1,
                  }}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
