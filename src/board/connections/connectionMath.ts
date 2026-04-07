import { Matrix2D, Point2D, invertMatrix2D, transformPoint } from "../../canvas";

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CubicBezierControls {
  control1: Point2D;
  control2: Point2D;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getRectCenterPoint(rect: RectLike): Point2D {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function viewportClientToCanvasPoint(
  clientPoint: Point2D,
  viewportRect: Pick<RectLike, "left" | "top">,
  matrix: Matrix2D
): Point2D {
  const viewportPoint = {
    x: clientPoint.x - viewportRect.left,
    y: clientPoint.y - viewportRect.top,
  };

  const inverse = invertMatrix2D(matrix);
  if (!inverse) {
    return viewportPoint;
  }

  return transformPoint(inverse, viewportPoint);
}

export function portRectToCanvasPoint(
  portRect: RectLike,
  viewportRect: Pick<RectLike, "left" | "top">,
  matrix: Matrix2D
): Point2D {
  return viewportClientToCanvasPoint(
    getRectCenterPoint(portRect),
    viewportRect,
    matrix
  );
}

export function getDynamicBezierControls(
  start: Point2D,
  end: Point2D
): CubicBezierControls {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance < Number.EPSILON) {
    return {
      control1: start,
      control2: end,
    };
  }

  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  const horizontalInfluence =
    Math.abs(deltaX) / (Math.abs(deltaX) + Math.abs(deltaY) + 1);
  const tension = clamp(
    distance * (0.24 + horizontalInfluence * 0.16),
    34,
    240
  );
  const sag = clamp(distance * (0.1 + horizontalInfluence * 0.1), 8, 140);

  return {
    control1: {
      x: start.x + directionX * tension,
      y: start.y + directionY * tension + sag,
    },
    control2: {
      x: end.x - directionX * tension,
      y: end.y - directionY * tension + sag,
    },
  };
}

export function buildDynamicBezierPath(start: Point2D, end: Point2D): string {
  const { control1, control2 } = getDynamicBezierControls(start, end);

  return [
    `M ${start.x} ${start.y}`,
    `C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`,
  ].join(" ");
}
