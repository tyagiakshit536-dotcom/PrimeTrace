import {
  CSSProperties,
  ChangeEvent,
  PointerEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BoardStorage } from "../../storage";
import { patchNodeMeta, DetectiveNodeType } from "../storage/nodeState";
import { NodePinAnchor, useBoardConnectionControls } from "../connections";
import { nextBoardZIndex, primeBoardZIndex } from "../utils/zIndex";

export interface DragBounds {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

export const BOARD_NODE_DELETE_EVENT = "detective-board:node-delete";
export const BOARD_NODE_DUPLICATE_EVENT = "detective-board:node-duplicate";

export interface BoardNodeActionEventDetail {
  nodeId: string;
}

export interface DraggableNodeProps {
  nodeId: string;
  nodeType: DetectiveNodeType;
  storage: BoardStorage;
  initialX: number;
  initialY: number;
  initialZIndex?: number;
  bounds?: DragBounds;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onPositionChange?: (x: number, y: number) => void;
}

interface DragState {
  pointerId: number;
  lastX: number;
  lastY: number;
}

interface NodeTransformState {
  mode: "resize" | "rotate";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  startRotationDeg: number;
  centerClientX: number;
  centerClientY: number;
  startPointerAngleDeg: number;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function extractDimension(style: CSSProperties | undefined, key: "width" | "height"): number | undefined {
  const value = style?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function clamp(value: number, min?: number, max?: number): number {
  const lower = typeof min === "number" ? min : Number.NEGATIVE_INFINITY;
  const upper = typeof max === "number" ? max : Number.POSITIVE_INFINITY;
  return Math.max(lower, Math.min(upper, value));
}

function applyBounds(x: number, y: number, bounds?: DragBounds): { x: number; y: number } {
  if (!bounds) {
    return { x, y };
  }

  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
}

function isNodePinAnchor(value: unknown): value is NodePinAnchor {
  return (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

function resolveNodeCategory(nodeType: DetectiveNodeType): string {
  if (
    nodeType === "sticky-note" ||
    nodeType === "evidence-document" ||
    nodeType === "interrogation-log"
  ) {
    return "notes";
  }

  if (
    nodeType === "photo-drop" ||
    nodeType === "gif-node" ||
    nodeType === "audio-evidence" ||
    nodeType === "video-evidence"
  ) {
    return "media";
  }

  if (
    nodeType === "map-node" ||
    nodeType === "poll-node" ||
    nodeType === "thread-hub" ||
    nodeType === "timeline-event" ||
    nodeType === "checklist-board"
  ) {
    return "analysis";
  }

  if (nodeType === "suspect-profile" || nodeType === "profession-template") {
    return "people";
  }

  if (nodeType === "shape-node") {
    return "diagram";
  }

  return "general";
}

function normalizeAngleDegrees(value: number): number {
  let next = value % 360;

  if (next > 180) {
    next -= 360;
  }

  if (next < -180) {
    next += 360;
  }

  return next;
}

function getAngleDegrees(centerX: number, centerY: number, x: number, y: number): number {
  return (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "[data-node-interactive='true'], textarea, input, button, select, option, label, a"
    )
  );
}

function dispatchBoardNodeAction(
  eventName: string,
  detail: BoardNodeActionEventDetail
): void {
  window.dispatchEvent(new CustomEvent<BoardNodeActionEventDetail>(eventName, { detail }));
}

export function DraggableNode({
  nodeId,
  nodeType,
  storage,
  initialX,
  initialY,
  initialZIndex,
  bounds,
  className,
  style,
  children,
  onPositionChange,
}: DraggableNodeProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const lastPublishedLayoutRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDeg: number;
    scalePercent: number;
  } | null>(null);
  const boardConnections = useBoardConnectionControls();
  const beginConnectionDrag = boardConnections?.beginConnectionDrag;
  const threadModeEnabled = boardConnections?.threadModeEnabled ?? false;
  const previewModeEnabled = boardConnections?.previewModeEnabled ?? false;
  const upsertNodeLayout = boardConnections?.upsertNodeLayout;
  const removeNodeLayout = boardConnections?.removeNodeLayout;
  const persistedMeta = useMemo(() => storage.getNodeMeta(nodeId), [nodeId, storage]);

  const [position, setPosition] = useState(() =>
    applyBounds(initialX, initialY, bounds)
  );
  const [zIndex, setZIndex] = useState(() => {
    const z =
      typeof initialZIndex === "number" && Number.isFinite(initialZIndex)
        ? initialZIndex
        : nextBoardZIndex();

    primeBoardZIndex(z);
    return z;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [showVisualControls, setShowVisualControls] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(() =>
    toFiniteNumber(persistedMeta?.rotationDeg, 0)
  );
  const [scalePercent, setScalePercent] = useState(() =>
    clampPercent(toFiniteNumber(persistedMeta?.scalePercent, 100), 40, 220)
  );
  const [opacityPercent, setOpacityPercent] = useState(() =>
    clampPercent(toFiniteNumber(persistedMeta?.opacityPercent, 100), 20, 100)
  );
  const [brightnessPercent, setBrightnessPercent] = useState(() =>
    clampPercent(toFiniteNumber(persistedMeta?.brightnessPercent, 100), 40, 180)
  );
  const [widthPx, setWidthPx] = useState<number | undefined>(() =>
    toOptionalFiniteNumber(persistedMeta?.widthPx) ?? extractDimension(style, "width")
  );
  const [heightPx, setHeightPx] = useState<number | undefined>(() =>
    toOptionalFiniteNumber(persistedMeta?.heightPx) ?? extractDimension(style, "height")
  );
  const dragStateRef = useRef<DragState | null>(null);
  const positionRef = useRef(position);
  const queuedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const transformStateRef = useRef<NodeTransformState | null>(null);
  const measuredSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const commitQueuedPosition = useCallback(() => {
    dragFrameRef.current = null;

    const queuedPosition = queuedPositionRef.current;
    if (!queuedPosition) {
      return;
    }

    queuedPositionRef.current = null;
    if (
      queuedPosition.x === positionRef.current.x &&
      queuedPosition.y === positionRef.current.y
    ) {
      return;
    }

    positionRef.current = queuedPosition;
    setPosition(queuedPosition);
  }, []);

  const measureNodeSize = useCallback(() => {
    const element = rootRef.current;
    if (!element) {
      return measuredSizeRef.current;
    }

    const measuredWidth = element.offsetWidth;
    const measuredHeight = element.offsetHeight;

    if (measuredWidth > 0 && measuredHeight > 0) {
      measuredSizeRef.current = {
        width: measuredWidth,
        height: measuredHeight,
      };
    }

    return measuredSizeRef.current;
  }, []);

  useEffect(() => {
    positionRef.current = position;
  }, [position.x, position.y]);

  const bringToFront = useCallback(() => {
    setZIndex((currentZIndex: number) => {
      const next = nextBoardZIndex();
      return next > currentZIndex ? next : currentZIndex;
    });
  }, []);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event: any) => {
      if (event.button !== 0) {
        return;
      }

      if (previewModeEnabled) {
        return;
      }

      bringToFront();

      if (isInteractiveTarget(event.target)) {
        return;
      }

      if (threadModeEnabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [
      beginConnectionDrag,
      bringToFront,
      nodeId,
      previewModeEnabled,
      threadModeEnabled,
    ]
  );

  const onPinPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event: any) => {
      if (previewModeEnabled) {
        return;
      }

      if (event.currentTarget.dataset.nodePinRole !== "output") {
        return;
      }

      const pinAnchor = event.currentTarget.dataset.nodePinAnchor;
      if (!isNodePinAnchor(pinAnchor)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      bringToFront();
      beginConnectionDrag?.(nodeId, pinAnchor, event.clientX, event.clientY);
    },
    [beginConnectionDrag, bringToFront, nodeId, previewModeEnabled]
  );


  const onPinContextMenu = useCallback((event: any) => {
    event.preventDefault();
  }, []);

  const beginResizeTransform = useCallback<PointerEventHandler<HTMLButtonElement>>(
    (event: any) => {
      if (previewModeEnabled) {
        return;
      }

      const element = rootRef.current;
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();

      transformStateRef.current = {
        mode: "resize",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: widthPx ?? rect.width,
        startHeight: heightPx ?? rect.height,
        startRotationDeg: rotationDeg,
        centerClientX: rect.left + rect.width / 2,
        centerClientY: rect.top + rect.height / 2,
        startPointerAngleDeg: getAngleDegrees(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          event.clientX,
          event.clientY
        ),
      };

      setIsTransforming(true);

      event.preventDefault();
      event.stopPropagation();
      bringToFront();
    },
    [bringToFront, heightPx, previewModeEnabled, rotationDeg, widthPx]
  );

  const beginRotateTransform = useCallback<PointerEventHandler<HTMLButtonElement>>(
    (event: any) => {
      if (previewModeEnabled) {
        return;
      }

      const element = rootRef.current;
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const centerClientX = rect.left + rect.width / 2;
      const centerClientY = rect.top + rect.height / 2;

      transformStateRef.current = {
        mode: "rotate",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: widthPx ?? rect.width,
        startHeight: heightPx ?? rect.height,
        startRotationDeg: rotationDeg,
        centerClientX,
        centerClientY,
        startPointerAngleDeg: getAngleDegrees(
          centerClientX,
          centerClientY,
          event.clientX,
          event.clientY
        ),
      };

      setIsTransforming(true);

      event.preventDefault();
      event.stopPropagation();
      bringToFront();
    },
    [bringToFront, heightPx, previewModeEnabled, rotationDeg, widthPx]
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const activeTransform = transformStateRef.current;
      if (!activeTransform || activeTransform.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();

      if (activeTransform.mode === "resize") {
        const deltaX = event.clientX - activeTransform.startClientX;
        const deltaY = event.clientY - activeTransform.startClientY;

        setWidthPx(clamp(activeTransform.startWidth + deltaX, 120, 980));
        setHeightPx(clamp(activeTransform.startHeight + deltaY, 90, 780));
        return;
      }

      const currentAngle = getAngleDegrees(
        activeTransform.centerClientX,
        activeTransform.centerClientY,
        event.clientX,
        event.clientY
      );
      const deltaAngle = currentAngle - activeTransform.startPointerAngleDeg;
      setRotationDeg(
        normalizeAngleDegrees(activeTransform.startRotationDeg + deltaAngle)
      );
    };

    const finishTransform = (event: PointerEvent) => {
      const activeTransform = transformStateRef.current;
      if (!activeTransform || activeTransform.pointerId !== event.pointerId) {
        return;
      }

      transformStateRef.current = null;
      setIsTransforming(false);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finishTransform);
    window.addEventListener("pointercancel", finishTransform);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishTransform);
      window.removeEventListener("pointercancel", finishTransform);
    };
  }, []);

  const onPointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event: any) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.lastX;
      const deltaY = event.clientY - dragState.lastY;

      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      const basePosition = queuedPositionRef.current ?? positionRef.current;
      const nextPosition = applyBounds(
        basePosition.x + deltaX,
        basePosition.y + deltaY,
        bounds
      );

      if (
        nextPosition.x === basePosition.x &&
        nextPosition.y === basePosition.y
      ) {
        return;
      }

      queuedPositionRef.current = nextPosition;

      if (dragFrameRef.current !== null) {
        return;
      }

      dragFrameRef.current = window.requestAnimationFrame(commitQueuedPosition);
    },
    [bounds, commitQueuedPosition]
  );

  const stopDragging = useCallback<PointerEventHandler<HTMLElement>>((event: any) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    const queuedPosition = queuedPositionRef.current;
    queuedPositionRef.current = null;

    if (
      queuedPosition &&
      (queuedPosition.x !== positionRef.current.x ||
        queuedPosition.y !== positionRef.current.y)
    ) {
      positionRef.current = queuedPosition;
      setPosition(queuedPosition);
    }

    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!previewModeEnabled) {
      return;
    }

    setShowVisualControls(false);

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    queuedPositionRef.current = null;
    dragStateRef.current = null;
    transformStateRef.current = null;
    setIsDragging(false);
    setIsTransforming(false);
  }, [previewModeEnabled]);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    if (widthPx === undefined) {
      const measuredWidth = rootRef.current.offsetWidth;
      if (measuredWidth > 0) {
        measuredSizeRef.current.width = measuredWidth;
        setWidthPx(measuredWidth);
      }
    }

    const measuredHeight = rootRef.current.offsetHeight;
    if (heightPx === undefined && measuredHeight > 0) {
      measuredSizeRef.current.height = measuredHeight;
      setHeightPx(measuredHeight);
    }
  }, [heightPx, widthPx]);

  useEffect(() => {
    onPositionChange?.(position.x, position.y);
  }, [onPositionChange, position.x, position.y]);

  useEffect(() => {
    if (isDragging || isTransforming) {
      return;
    }

    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType,
      x: position.x,
      y: position.y,
      zIndex,
      rotationDeg,
      scalePercent,
      opacityPercent,
      brightnessPercent,
      widthPx,
      heightPx,
    });
  }, [
    brightnessPercent,
    heightPx,
    isDragging,
    isTransforming,
    nodeId,
    nodeType,
    opacityPercent,
    position.x,
    position.y,
    rotationDeg,
    scalePercent,
    storage,
    widthPx,
    zIndex,
  ]);

  const publishNodeLayout = useCallback(() => {
    if (!upsertNodeLayout) {
      return;
    }

    const measuredSize = measureNodeSize();
    if (measuredSize.width <= 0 || measuredSize.height <= 0) {
      return;
    }

    const nextLayout = {
      x: position.x,
      y: position.y,
      width: measuredSize.width,
      height: measuredSize.height,
      rotationDeg,
      scalePercent,
    };

    const previousLayout = lastPublishedLayoutRef.current;
    if (
      previousLayout &&
      previousLayout.x === nextLayout.x &&
      previousLayout.y === nextLayout.y &&
      previousLayout.width === nextLayout.width &&
      previousLayout.height === nextLayout.height &&
      previousLayout.rotationDeg === nextLayout.rotationDeg &&
      previousLayout.scalePercent === nextLayout.scalePercent
    ) {
      return;
    }

    lastPublishedLayoutRef.current = nextLayout;

    upsertNodeLayout(nodeId, nextLayout);
  }, [
    measureNodeSize,
    nodeId,
    position.x,
    position.y,
    rotationDeg,
    scalePercent,
    upsertNodeLayout,
  ]);

  useEffect(() => {
    publishNodeLayout();
  }, [publishNodeLayout]);

  useEffect(() => {
    if (!upsertNodeLayout || !rootRef.current) {
      return undefined;
    }

    const element = rootRef.current;
    const observer = new ResizeObserver(() => {
      measureNodeSize();
      publishNodeLayout();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [measureNodeSize, publishNodeLayout, upsertNodeLayout]);

  useEffect(
    () => () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }

      queuedPositionRef.current = null;
      lastPublishedLayoutRef.current = null;
      removeNodeLayout?.(nodeId);
    },
    [nodeId, removeNodeLayout]
  );

  const rootStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      left: position.x,
      top: position.y,
      zIndex,
      touchAction: "none",
      userSelect: "none",
      pointerEvents: previewModeEnabled ? "none" : "auto",
      cursor: previewModeEnabled ? "default" : isDragging ? "grabbing" : "grab",
      ...style,
      width: widthPx ?? style?.width,
      height: heightPx ?? style?.height,
      transform: `rotate(${rotationDeg}deg) scale(${scalePercent / 100})`,
      transformOrigin: "center center",
      opacity: opacityPercent / 100,
      filter: `brightness(${brightnessPercent}%)`,
    }),
    [
      brightnessPercent,
      heightPx,
      isDragging,
      opacityPercent,
      position.x,
      position.y,
      previewModeEnabled,
      rotationDeg,
      scalePercent,
      style,
      widthPx,
      zIndex,
    ]
  );

  const onRangeInput = useCallback(
    (
      event: ChangeEvent<HTMLInputElement>,
      setter: (value: number) => void,
      min: number,
      max: number
    ) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) {
        return;
      }

      setter(clampPercent(next, min, max));
    },
    []
  );

  const resetVisualControls = useCallback(() => {
    setRotationDeg(0);
    setScalePercent(100);
    setOpacityPercent(100);
    setBrightnessPercent(100);
    setWidthPx(extractDimension(style, "width") ?? widthPx);
    setHeightPx(extractDimension(style, "height") ?? heightPx);
  }, [heightPx, style, widthPx]);

  const onRequestDuplicate = useCallback(() => {
    dispatchBoardNodeAction(BOARD_NODE_DUPLICATE_EVENT, { nodeId });
    setShowVisualControls(false);
  }, [nodeId]);

  const onRequestDelete = useCallback(() => {
    dispatchBoardNodeAction(BOARD_NODE_DELETE_EVENT, { nodeId });
    setShowVisualControls(false);
  }, [nodeId]);

  return (
    <article
      ref={rootRef}
      className={`board-node ${className || ""} ${isDragging ? "is-dragging" : ""} ${
        isTransforming ? "is-transforming" : ""
      }`}
      data-node-pin-id={nodeId}
      data-node-topic={nodeType}
      data-node-category={resolveNodeCategory(nodeType)}
      style={rootStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      {!previewModeEnabled ? (
        <>
          <div
            data-node-pin-id={nodeId}
            data-node-pin-role="output"
            data-node-pin-anchor="top"
            className="board-node-port is-top"
            onPointerDown={onPinPointerDown}
            onContextMenu={onPinContextMenu}
            title="Connect"
            aria-label="Connect"
          >
            <div className="board-pin" />
          </div>

          <div
            data-node-pin-id={nodeId}
            data-node-pin-role="output"
            data-node-pin-anchor="right"
            className="board-node-port is-right"
            onPointerDown={onPinPointerDown}
            onContextMenu={onPinContextMenu}
            title="Connect"
            aria-label="Connect"
          >
            <div className="board-pin" />
          </div>

          <div
            data-node-pin-id={nodeId}
            data-node-pin-role="output"
            data-node-pin-anchor="bottom"
            className="board-node-port is-bottom"
            onPointerDown={onPinPointerDown}
            onContextMenu={onPinContextMenu}
            title="Connect"
            aria-label="Connect"
          >
            <div className="board-pin" />
          </div>

          <div
            data-node-pin-id={nodeId}
            data-node-pin-role="output"
            data-node-pin-anchor="left"
            className="board-node-port is-left"
            onPointerDown={onPinPointerDown}
            onContextMenu={onPinContextMenu}
            title="Connect"
            aria-label="Connect"
          >
            <div className="board-pin" />
          </div>

          <button
            type="button"
            data-node-interactive="true"
            onClick={() => setShowVisualControls((previous) => !previous)}
            title="Node adjustments"
            aria-label="Node adjustments"
            className="node-visual-toggle"
          >
            Adjust
          </button>

          <span
            aria-hidden="true"
            data-node-interactive="true"
            className="node-transform-connector"
          />
          <button
            type="button"
            data-node-interactive="true"
            className="node-transform-handle node-transform-rotate"
            onPointerDown={beginRotateTransform}
            title="Rotate"
            aria-label="Rotate"
          />
          <button
            type="button"
            data-node-interactive="true"
            className="node-transform-handle node-transform-resize"
            onPointerDown={beginResizeTransform}
            title="Resize"
            aria-label="Resize"
          />

          {showVisualControls ? (
            <div className="node-visual-panel" data-node-interactive="true" data-board-export-hidden="true">
              <div className="node-visual-row" title="Opacity">
                <span>Opacity</span>
                <input
                  data-node-interactive="true"
                  type="range"
                  min={20}
                  max={100}
                  step={1}
                  value={opacityPercent}
                  onChange={(event) => onRangeInput(event, setOpacityPercent, 20, 100)}
                />
              </div>
              <div className="node-visual-row" title="Brightness">
                <span>Brightness</span>
                <input
                  data-node-interactive="true"
                  type="range"
                  min={40}
                  max={180}
                  step={1}
                  value={brightnessPercent}
                  onChange={(event) => onRangeInput(event, setBrightnessPercent, 40, 180)}
                />
              </div>
              <div className="node-visual-hint">
                Drag top handle to rotate and bottom-right handle to resize.
              </div>
              <button
                type="button"
                data-node-interactive="true"
                className="node-visual-reset"
                onClick={resetVisualControls}
                title="Reset adjustments"
                aria-label="Reset adjustments"
              >
                Reset
              </button>

              <div className="node-visual-actions">
                <button
                  type="button"
                  data-node-interactive="true"
                  className="node-visual-action is-duplicate"
                  onClick={onRequestDuplicate}
                  title="Duplicate component"
                  aria-label="Duplicate component"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  data-node-interactive="true"
                  className="node-visual-action is-delete"
                  onClick={onRequestDelete}
                  title="Delete component"
                  aria-label="Delete component"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="board-node-content">{children}</div>
    </article>
  );
}
