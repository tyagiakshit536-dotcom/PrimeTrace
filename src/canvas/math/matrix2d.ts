export type Matrix2D = readonly [
  number,
  number,
  number,
  number,
  number,
  number
];

export interface Point2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

export function multiplyMatrix2D(left: Matrix2D, right: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function prependMatrix2D(matrix: Matrix2D, transform: Matrix2D): Matrix2D {
  return multiplyMatrix2D(transform, matrix);
}

export function panByScreenDelta(
  matrix: Matrix2D,
  deltaX: number,
  deltaY: number
): Matrix2D {
  if (deltaX === 0 && deltaY === 0) {
    return matrix;
  }

  return prependMatrix2D(matrix, [1, 0, 0, 1, deltaX, deltaY]);
}

export function scaleMatrixAroundScreenPoint(
  matrix: Matrix2D,
  scale: number,
  anchor: Point2D
): Matrix2D {
  if (scale === 1) {
    return matrix;
  }

  const { x, y } = anchor;

  return prependMatrix2D(matrix, [
    scale,
    0,
    0,
    scale,
    (1 - scale) * x,
    (1 - scale) * y,
  ]);
}

export function zoomMatrixAtScreenPoint(
  matrix: Matrix2D,
  nextZoom: number,
  anchor: Point2D,
  minZoom = Number.NEGATIVE_INFINITY,
  maxZoom = Number.POSITIVE_INFINITY
): Matrix2D {
  const currentZoom = getMatrixUniformScale(matrix);

  if (currentZoom <= 0) {
    return matrix;
  }

  const clampedZoom = clamp(nextZoom, minZoom, maxZoom);
  const zoomFactor = clampedZoom / currentZoom;

  if (!Number.isFinite(zoomFactor) || zoomFactor === 1) {
    return matrix;
  }

  return scaleMatrixAroundScreenPoint(matrix, zoomFactor, anchor);
}

export function zoomMatrixByStep(
  matrix: Matrix2D,
  zoomDelta: number,
  anchor: Point2D,
  minZoom = Number.NEGATIVE_INFINITY,
  maxZoom = Number.POSITIVE_INFINITY
): Matrix2D {
  const currentZoom = getMatrixUniformScale(matrix);

  if (currentZoom <= 0) {
    return matrix;
  }

  return zoomMatrixAtScreenPoint(
    matrix,
    currentZoom + zoomDelta,
    anchor,
    minZoom,
    maxZoom
  );
}

export function invertMatrix2D(matrix: Matrix2D): Matrix2D | null {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;

  if (Math.abs(determinant) < Number.EPSILON) {
    return null;
  }

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}

export function transformPoint(matrix: Matrix2D, point: Point2D): Point2D {
  const [a, b, c, d, e, f] = matrix;

  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

export function worldToScreen(matrix: Matrix2D, point: Point2D): Point2D {
  return transformPoint(matrix, point);
}

export function screenToWorld(matrix: Matrix2D, point: Point2D): Point2D {
  const inverse = invertMatrix2D(matrix);
  if (!inverse) {
    return point;
  }

  return transformPoint(inverse, point);
}

export function getMatrixUniformScale(matrix: Matrix2D): number {
  const [a, b] = matrix;
  return Math.hypot(a, b);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function toCssMatrix(matrix: Matrix2D): string {
  const [a, b, c, d, e, f] = matrix;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

export function getViewportWorldBounds(
  matrix: Matrix2D,
  viewport: Size2D,
  overscanPx = 0
): WorldRect {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return {
      left: Number.NEGATIVE_INFINITY,
      top: Number.NEGATIVE_INFINITY,
      right: Number.POSITIVE_INFINITY,
      bottom: Number.POSITIVE_INFINITY,
    };
  }

  const inverse = invertMatrix2D(matrix);
  if (!inverse) {
    return {
      left: Number.NEGATIVE_INFINITY,
      top: Number.NEGATIVE_INFINITY,
      right: Number.POSITIVE_INFINITY,
      bottom: Number.POSITIVE_INFINITY,
    };
  }

  const corners = [
    transformPoint(inverse, { x: -overscanPx, y: -overscanPx }),
    transformPoint(inverse, { x: viewport.width + overscanPx, y: -overscanPx }),
    transformPoint(inverse, { x: -overscanPx, y: viewport.height + overscanPx }),
    transformPoint(inverse, {
      x: viewport.width + overscanPx,
      y: viewport.height + overscanPx,
    }),
  ];

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}