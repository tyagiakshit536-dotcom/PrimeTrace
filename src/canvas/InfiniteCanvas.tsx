import {
  CSSProperties,
  ReactNode,
  memo,
  useDeferredValue,
  useMemo,
  useRef,
} from "react";
import {
  BackgroundMode,
  BackgroundOptions,
  getCanvasBackgroundStyle,
} from "./background/backgroundStyles";
import { CameraSettings, useInfiniteCamera } from "./hooks/useInfiniteCamera";
import { useElementSize } from "./hooks/useElementSize";
import { getViewportWorldBounds, Matrix2D, WorldRect, toCssMatrix } from "./math/matrix2d";

const DEFAULT_OVERSCAN_PX = 240;

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InfiniteCanvasProps<T extends CanvasNode> {
  nodes: readonly T[];
  renderNode: (node: T) => ReactNode;
  backgroundMode: BackgroundMode;
  backgroundOptions?: BackgroundOptions;
  camera?: CameraSettings;
  overscanPx?: number;
  disableCulling?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface NodeShellProps {
  x: number;
  y: number;
  width: number;
  height: number;
  children: ReactNode;
}

const NodeShell = memo(function NodeShell({
  x,
  y,
  width,
  height,
  children,
}: NodeShellProps) {
  return (
    <div
      data-canvas-node="true"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        contain: "layout paint style",
        pointerEvents: "auto",
      }}
    >
      {children}
    </div>
  );
});

function intersectsBounds(node: CanvasNode, bounds: WorldRect): boolean {
  const right = node.x + node.width;
  const bottom = node.y + node.height;

  return (
    right >= bounds.left &&
    node.x <= bounds.right &&
    bottom >= bounds.top &&
    node.y <= bounds.bottom
  );
}

export interface InfiniteCanvasController {
  matrix: Matrix2D;
  setMatrix: (matrix: Matrix2D) => void;
  reset: () => void;
  screenToWorld: ReturnType<typeof useInfiniteCamera>["screenToWorld"];
  worldToScreen: ReturnType<typeof useInfiniteCamera>["worldToScreen"];
}

export interface InfiniteCanvasRenderResult {
  controller: InfiniteCanvasController;
  visibleNodeCount: number;
}

export function useInfiniteCanvasController(
  camera?: CameraSettings
): InfiniteCanvasController {
  const cameraController = useInfiniteCamera(camera);

  return {
    matrix: cameraController.matrix,
    setMatrix: cameraController.setMatrix,
    reset: cameraController.reset,
    screenToWorld: cameraController.screenToWorld,
    worldToScreen: cameraController.worldToScreen,
  };
}

export function InfiniteCanvas<T extends CanvasNode>({
  nodes,
  renderNode,
  backgroundMode,
  backgroundOptions,
  camera,
  overscanPx = DEFAULT_OVERSCAN_PX,
  disableCulling = false,
  className,
  style,
}: InfiniteCanvasProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportSize = useElementSize(viewportRef);
  const cameraController = useInfiniteCamera(camera);
  const deferredMatrix = useDeferredValue(cameraController.matrix);

  const worldBounds = useMemo(() => {
    if (disableCulling) {
      return null;
    }

    return getViewportWorldBounds(deferredMatrix, viewportSize, overscanPx);
  }, [
    deferredMatrix,
    disableCulling,
    overscanPx,
    viewportSize.height,
    viewportSize.width,
  ]);

  const visibleNodes = useMemo(() => {
    if (disableCulling || !worldBounds || !Number.isFinite(worldBounds.left)) {
      return nodes;
    }

    return nodes.filter((node) => intersectsBounds(node, worldBounds));
  }, [disableCulling, nodes, worldBounds]);

  const nodeElements = useMemo(
    () =>
      visibleNodes.map((node) => (
        <NodeShell
          key={node.id}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
        >
          {renderNode(node)}
        </NodeShell>
      )),
    [renderNode, visibleNodes]
  );

  const viewportStyle = useMemo<CSSProperties>(
    () => ({
      position: "relative",
      overflow: "hidden",
      width: "100%",
      height: "100%",
      touchAction: "none",
      userSelect: "none",
      cursor: cameraController.isDragging ? "grabbing" : "grab",
      ...getCanvasBackgroundStyle(
        backgroundMode,
        cameraController.matrix,
        backgroundOptions
      ),
      ...style,
    }),
    [
      backgroundMode,
      backgroundOptions,
      cameraController.isDragging,
      cameraController.matrix,
      style,
    ]
  );

  const worldLayerStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      transformOrigin: "0 0",
      transform: toCssMatrix(cameraController.matrix),
      willChange: "transform",
      pointerEvents: "none",
    }),
    [cameraController.matrix]
  );

  return (
    <div
      ref={viewportRef}
      className={className}
      style={viewportStyle}
      {...cameraController.bindings}
    >
      <div style={worldLayerStyle}>{nodeElements}</div>
    </div>
  );
}
