import { CSSProperties } from "react";
import { getMatrixUniformScale, Matrix2D } from "../math/matrix2d";

export type BackgroundMode = "grid" | "plane";

export interface BackgroundOptions {
  planeColor?: string;
  gridLineColor?: string;
  majorGridLineColor?: string;
  worldGridSize?: number;
  minGridPixelStep?: number;
  maxGridPixelStep?: number;
}

const DEFAULT_BACKGROUND_OPTIONS: Required<BackgroundOptions> = {
  planeColor: "#f7f9fc",
  gridLineColor: "rgba(25, 35, 52, 0.08)",
  majorGridLineColor: "rgba(25, 35, 52, 0.12)",
  worldGridSize: 64,
  minGridPixelStep: 20,
  maxGridPixelStep: 96,
};

function positiveModulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function normalizeGridStep(
  stepPx: number,
  minStepPx: number,
  maxStepPx: number
): number {
  let normalizedStep = stepPx;

  while (normalizedStep < minStepPx) {
    normalizedStep *= 2;
  }

  while (normalizedStep > maxStepPx) {
    normalizedStep /= 2;
  }

  return normalizedStep;
}

export function getCanvasBackgroundStyle(
  mode: BackgroundMode,
  matrix: Matrix2D,
  options: BackgroundOptions = {}
): CSSProperties {
  const {
    planeColor,
    gridLineColor,
    majorGridLineColor,
    worldGridSize,
    minGridPixelStep,
    maxGridPixelStep,
  } = { ...DEFAULT_BACKGROUND_OPTIONS, ...options };

  if (mode === "plane") {
    return {
      backgroundColor: planeColor,
    };
  }

  const zoom = Math.max(getMatrixUniformScale(matrix), Number.EPSILON);
  const minorStepPx = normalizeGridStep(
    worldGridSize * zoom,
    minGridPixelStep,
    maxGridPixelStep
  );
  const majorStepPx = minorStepPx * 5;

  const offsetXMinor = positiveModulo(matrix[4], minorStepPx);
  const offsetYMinor = positiveModulo(matrix[5], minorStepPx);
  const offsetXMajor = positiveModulo(matrix[4], majorStepPx);
  const offsetYMajor = positiveModulo(matrix[5], majorStepPx);

  return {
    backgroundColor: planeColor,
    backgroundImage: [
      `linear-gradient(to right, ${gridLineColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${gridLineColor} 1px, transparent 1px)`,
      `linear-gradient(to right, ${majorGridLineColor} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${majorGridLineColor} 1px, transparent 1px)`,
    ].join(", "),
    backgroundSize: [
      `${minorStepPx}px ${minorStepPx}px`,
      `${minorStepPx}px ${minorStepPx}px`,
      `${majorStepPx}px ${majorStepPx}px`,
      `${majorStepPx}px ${majorStepPx}px`,
    ].join(", "),
    backgroundPosition: [
      `${offsetXMinor}px ${offsetYMinor}px`,
      `${offsetXMinor}px ${offsetYMinor}px`,
      `${offsetXMajor}px ${offsetYMajor}px`,
      `${offsetXMajor}px ${offsetYMajor}px`,
    ].join(", "),
  };
}
