import {
  CSSProperties,
  ReactNode,
  Ref,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  BackgroundMode,
  BackgroundOptions,
  CameraSettings,
  getCanvasBackgroundStyle,
  Matrix2D,
  Point2D,
  toCssMatrix,
  useInfiniteCamera,
} from "../canvas";
import { BoardStorage } from "../storage";
import {
  BoardConnectionRequest,
  BoardConnectionsLayer,
  BoardConnectionsProvider,
  ThreadCreateOptions,
  ThreadStyle,
} from "./connections";

export interface DetectiveBoardCanvasControls {
  getViewportElement: () => HTMLElement | null;
  getWorldElement: () => HTMLDivElement | null;
  getViewportRect: () => DOMRect | null;
  getViewportCenter: () => Point2D;
  getMatrix: () => Matrix2D;
  getZoom: () => number;
  setMatrix: (matrix: Matrix2D) => void;
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (nextZoom: number, anchor?: Point2D) => void;
  zoomBy: (zoomDelta: number, anchor?: Point2D) => void;
  screenToWorld: (point: Point2D) => Point2D;
  worldToScreen: (point: Point2D) => Point2D;
}

export interface DetectiveBoardCanvasProps {
  children: ReactNode;
  storage?: BoardStorage;
  threadModeEnabled?: boolean;
  previewModeEnabled?: boolean;
  threadStyle?: ThreadStyle;
  threadDefaults?: Partial<ThreadCreateOptions>;
  onConnectionRequested?: (request: BoardConnectionRequest) => void;
  backgroundImageUrl?: string | null;
  backgroundImageOpacity?: number;
  backgroundImageBrightness?: number;
  backgroundMode?: BackgroundMode;
  backgroundOptions?: BackgroundOptions;
  camera?: CameraSettings;
  className?: string;
  style?: CSSProperties;
  controlsRef?: Ref<DetectiveBoardCanvasControls>;
  onCameraChange?: (matrix: Matrix2D) => void;
}

export function DetectiveBoardCanvas({
  children,
  storage,
  threadModeEnabled = false,
  previewModeEnabled = false,
  threadStyle = "curve",
  threadDefaults,
  onConnectionRequested,
  backgroundImageUrl,
  backgroundImageOpacity = 0.46,
  backgroundImageBrightness = 100,
  backgroundMode = "grid",
  backgroundOptions,
  camera,
  className,
  style,
  controlsRef,
  onCameraChange,
}: DetectiveBoardCanvasProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);

  const cameraController = useInfiniteCamera({
    ...camera,
    onMatrixChange: (matrix) => {
      camera?.onMatrixChange?.(matrix);
      onCameraChange?.(matrix);
    },
  });

  const getViewportCenter = useCallback((): Point2D => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return { x: 0, y: 0 };
    }

    return {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2,
    };
  }, []);

  const zoomInAtCenter = useCallback(() => {
    cameraController.zoomIn(getViewportCenter());
  }, [cameraController, getViewportCenter]);

  const zoomOutAtCenter = useCallback(() => {
    cameraController.zoomOut(getViewportCenter());
  }, [cameraController, getViewportCenter]);

  const zoomTo = useCallback(
    (nextZoom: number, anchor?: Point2D) => {
      cameraController.zoomTo(nextZoom, anchor ?? getViewportCenter());
    },
    [cameraController, getViewportCenter]
  );

  const zoomBy = useCallback(
    (zoomDelta: number, anchor?: Point2D) => {
      cameraController.zoomBy(zoomDelta, anchor ?? getViewportCenter());
    },
    [cameraController, getViewportCenter]
  );

  const getViewportRect = useCallback(
    () => viewportRef.current?.getBoundingClientRect() ?? null,
    []
  );

  const getCanvasMatrix = useCallback(
    () => cameraController.matrixRef.current,
    [cameraController.matrixRef]
  );

  useImperativeHandle(
    controlsRef,
    (): DetectiveBoardCanvasControls => ({
      getViewportElement: () => viewportRef.current,
      getWorldElement: () => worldRef.current,
      getViewportRect,
      getViewportCenter,
      getMatrix: () => cameraController.matrixRef.current,
      getZoom: cameraController.getZoom,
      setMatrix: cameraController.setMatrix,
      reset: cameraController.reset,
      zoomIn: zoomInAtCenter,
      zoomOut: zoomOutAtCenter,
      zoomTo,
      zoomBy,
      screenToWorld: cameraController.screenToWorld,
      worldToScreen: cameraController.worldToScreen,
    }),
    [
      cameraController,
      getViewportRect,
      getViewportCenter,
      zoomBy,
      zoomInAtCenter,
      zoomOutAtCenter,
      zoomTo,
    ]
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const viewportRect = getViewportRect();
      if (!viewportRect) {
        return { x: clientX, y: clientY };
      }

      return cameraController.screenToWorld({
        x: clientX - viewportRect.left,
        y: clientY - viewportRect.top,
      });
    },
    [cameraController, getViewportRect]
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

  const worldStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      zIndex: 1,
      transformOrigin: "0 0",
      transform: `${toCssMatrix(cameraController.matrix)} translateZ(0)`,
      willChange: "transform",
      pointerEvents: "none",
      isolation: "isolate",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
    }),
    [cameraController.matrix]
  );

  const nodesLayerStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      zIndex: 1,
      pointerEvents: "none",
      contain: "layout style",
      overflow: "visible",
    }),
    []
  );

  return (
    <section
      ref={viewportRef}
      data-board-layer="viewport"
      className={className}
      style={viewportStyle}
      {...cameraController.bindings}
    >
      <div ref={worldRef} style={worldStyle} data-board-layer="world">
        <BoardConnectionsProvider
          storage={storage}
          clientToWorld={clientToWorld}
          getViewportRect={getViewportRect}
          getCanvasMatrix={getCanvasMatrix}
          threadModeEnabled={threadModeEnabled}
          previewModeEnabled={previewModeEnabled}
          threadStyle={threadStyle}
          threadDefaults={threadDefaults}
          onConnectionRequested={onConnectionRequested}
        >
          <BoardConnectionsLayer />
          <div style={nodesLayerStyle} data-board-layer="nodes">
            {children}
          </div>
        </BoardConnectionsProvider>
      </div>

      {backgroundImageUrl ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            backgroundImage: `url(${backgroundImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: Math.max(0, Math.min(1, backgroundImageOpacity)),
            filter: `brightness(${Math.max(30, Math.min(180, backgroundImageBrightness))}%) grayscale(22%)`,
          }}
        />
      ) : null}
    </section>
  );
}