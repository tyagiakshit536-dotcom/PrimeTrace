import {
  MutableRefObject,
  PointerEventHandler,
  WheelEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clamp,
  getMatrixUniformScale,
  IDENTITY_MATRIX,
  Matrix2D,
  panByScreenDelta,
  Point2D,
  scaleMatrixAroundScreenPoint,
  screenToWorld,
  worldToScreen,
  zoomMatrixAtScreenPoint,
} from "../math/matrix2d";

const DEFAULT_MIN_ZOOM = 0.1;
const DEFAULT_MAX_ZOOM = 5;
const DEFAULT_WHEEL_ZOOM_INTENSITY = 0.0015;
const DEFAULT_ZOOM_STEP = 0.15;

interface DragState {
  pointerId: number;
  lastX: number;
  lastY: number;
}

export interface CameraSettings {
  initialMatrix?: Matrix2D;
  minZoom?: number;
  maxZoom?: number;
  wheelZoomIntensity?: number;
  zoomStep?: number;
  onMatrixChange?: (matrix: Matrix2D) => void;
}

export interface CameraBindings {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onWheel: WheelEventHandler<HTMLDivElement>;
}

export interface InfiniteCameraController {
  matrix: Matrix2D;
  matrixRef: MutableRefObject<Matrix2D>;
  isDragging: boolean;
  bindings: CameraBindings;
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  setMatrix: (matrix: Matrix2D) => void;
  reset: () => void;
  getZoom: () => number;
  zoomTo: (nextZoom: number, anchor?: Point2D) => void;
  zoomBy: (zoomDelta: number, anchor?: Point2D) => void;
  zoomIn: (anchor?: Point2D) => void;
  zoomOut: (anchor?: Point2D) => void;
  screenToWorld: (point: Point2D) => Point2D;
  worldToScreen: (point: Point2D) => Point2D;
}

export function useInfiniteCamera(
  settings: CameraSettings = {}
): InfiniteCameraController {
  const {
    initialMatrix = IDENTITY_MATRIX,
    minZoom = DEFAULT_MIN_ZOOM,
    maxZoom = DEFAULT_MAX_ZOOM,
    wheelZoomIntensity = DEFAULT_WHEEL_ZOOM_INTENSITY,
    zoomStep = DEFAULT_ZOOM_STEP,
    onMatrixChange,
  } = settings;

  const [matrix, setMatrixState] = useState<Matrix2D>(initialMatrix);
  const [isDragging, setIsDragging] = useState(false);

  const matrixRef = useRef<Matrix2D>(initialMatrix);
  const dragStateRef = useRef<DragState | null>(null);
  const queuedMatrixRef = useRef<Matrix2D | null>(null);
  const frameRef = useRef<number | null>(null);
  const initialMatrixRef = useRef<Matrix2D>(initialMatrix);

  const flushQueuedMatrix = useCallback(() => {
    frameRef.current = null;
    const queuedMatrix = queuedMatrixRef.current;

    if (!queuedMatrix) {
      return;
    }

    queuedMatrixRef.current = null;
    setMatrixState(queuedMatrix);
  }, []);

  const scheduleMatrixUpdate = useCallback(
    (nextMatrix: Matrix2D) => {
      matrixRef.current = nextMatrix;
      queuedMatrixRef.current = nextMatrix;

      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(flushQueuedMatrix);
    },
    [flushQueuedMatrix]
  );

  const setMatrix = useCallback((nextMatrix: Matrix2D) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    queuedMatrixRef.current = null;
    matrixRef.current = nextMatrix;
    setMatrixState(nextMatrix);
  }, []);

  const applyZoom = useCallback(
    (nextZoom: number, anchor: Point2D = { x: 0, y: 0 }) => {
      const nextMatrix = zoomMatrixAtScreenPoint(
        matrixRef.current,
        nextZoom,
        anchor,
        minZoom,
        maxZoom
      );
      setMatrix(nextMatrix);
    },
    [maxZoom, minZoom, setMatrix]
  );

  const zoomBy = useCallback(
    (zoomDelta: number, anchor: Point2D = { x: 0, y: 0 }) => {
      const currentZoom = getMatrixUniformScale(matrixRef.current);

      if (currentZoom <= 0) {
        return;
      }

      applyZoom(currentZoom + zoomDelta, anchor);
    },
    [applyZoom]
  );

  const endDrag = useCallback<PointerEventHandler<HTMLDivElement>>((event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.button !== 0) {
        return;
      }

      if (event.currentTarget !== event.target) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      setIsDragging(true);
    },
    []
  );

  const onPointerMove = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
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

      const nextMatrix = panByScreenDelta(matrixRef.current, deltaX, deltaY);
      scheduleMatrixUpdate(nextMatrix);
    },
    [scheduleMatrixUpdate]
  );

  const onWheel = useCallback<WheelEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();

      const currentZoom = getMatrixUniformScale(matrixRef.current);
      if (currentZoom <= 0) {
        return;
      }

      const unclampedZoom =
        currentZoom * Math.exp(-event.deltaY * wheelZoomIntensity);
      const clampedZoom = clamp(unclampedZoom, minZoom, maxZoom);
      const zoomFactor = clampedZoom / currentZoom;

      if (zoomFactor === 1) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const nextMatrix = scaleMatrixAroundScreenPoint(
        matrixRef.current,
        zoomFactor,
        anchor
      );
      scheduleMatrixUpdate(nextMatrix);
    },
    [maxZoom, minZoom, scheduleMatrixUpdate, wheelZoomIntensity]
  );

  useEffect(() => {
    matrixRef.current = matrix;
    onMatrixChange?.(matrix);
  }, [matrix, onMatrixChange]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  const bindings = useMemo<CameraBindings>(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onWheel,
    }),
    [endDrag, onPointerDown, onPointerMove, onWheel]
  );

  return {
    matrix,
    matrixRef,
    isDragging,
    bindings,
    minZoom,
    maxZoom,
    zoomStep,
    setMatrix,
    reset: () => setMatrix(initialMatrixRef.current),
    getZoom: () => getMatrixUniformScale(matrixRef.current),
    zoomTo: applyZoom,
    zoomBy,
    zoomIn: (anchor) => zoomBy(zoomStep, anchor),
    zoomOut: (anchor) => zoomBy(-zoomStep, anchor),
    screenToWorld: (point) => screenToWorld(matrixRef.current, point),
    worldToScreen: (point) => worldToScreen(matrixRef.current, point),
  };
}