import {
  CSSProperties,
  ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BoardStorage } from "../../storage";
import { DraggableNode, DragBounds } from "./DraggableNode";
import {
  isNumber,
  isString,
  patchNodeMeta,
  readNodeMeta,
  resolveInitialValue,
} from "../storage/nodeState";

export interface ShapeNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialLabel?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

type ShapeType = "rect" | "circle" | "triangle" | "diamond" | "line";

const DEFAULT_WIDTH = 260;
const DEFAULT_HEIGHT = 220;
const DEFAULT_COLOR = "#9a9a9a";
const DEFAULT_STROKE = "#f1f1f1";

function parseShapeType(value: unknown): ShapeType {
  if (
    value === "rect" ||
    value === "circle" ||
    value === "triangle" ||
    value === "diamond" ||
    value === "line"
  ) {
    return value;
  }

  return "rect";
}

function renderShape(
  shapeType: ShapeType,
  fillColor: string,
  strokeColor: string
): CSSProperties {
  if (shapeType === "circle") {
    return {
      width: 120,
      height: 120,
      borderRadius: "50%",
      background: fillColor,
      border: `2px solid ${strokeColor}`,
    };
  }

  if (shapeType === "triangle") {
    return {
      width: 0,
      height: 0,
      borderLeft: "64px solid transparent",
      borderRight: "64px solid transparent",
      borderBottom: `110px solid ${fillColor}`,
      filter: `drop-shadow(0 0 0 ${strokeColor})`,
    };
  }

  if (shapeType === "diamond") {
    return {
      width: 104,
      height: 104,
      background: fillColor,
      border: `2px solid ${strokeColor}`,
      transform: "rotate(45deg)",
    };
  }

  if (shapeType === "line") {
    return {
      width: 150,
      height: 4,
      background: fillColor,
      borderRadius: 99,
      boxShadow: `0 0 0 1px ${strokeColor}`,
    };
  }

  return {
    width: 128,
    height: 96,
    borderRadius: 8,
    background: fillColor,
    border: `2px solid ${strokeColor}`,
  };
}

export function ShapeNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialLabel = "Shape",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
}: ShapeNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [shapeType, setShapeType] = useState<ShapeType>(() =>
    parseShapeType(persistedMeta?.shapeType)
  );
  const [label, setLabel] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialLabel, isString)
  );
  const [fillColor, setFillColor] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [strokeColor, setStrokeColor] = useState(() =>
    resolveInitialValue(persistedMeta?.strokeColor, DEFAULT_STROKE, isString)
  );

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "shape-node",
      title: label,
      colorHex: fillColor,
      shapeType,
      strokeColor,
    });
  }, [fillColor, label, nodeId, shapeType, storage, strokeColor]);

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="shape-node"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`shape-node ${className || ""}`}
      style={{
        width,
        height,
        padding: 10,
        background: "rgba(19,19,19,0.95)",
        border: "1px solid rgba(255,255,255,0.14)",
        ...style,
      }}
    >
      <div style={{ width: "100%", height: "100%", display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={label}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)}
            placeholder="Shape"
            style={{
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "rgba(240,240,240,0.92)",
              outline: "none",
              paddingBottom: 4,
              fontFamily: "inherit",
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={fillColor}
            onChange={(event) => setFillColor(event.target.value)}
            aria-label="Shape fill"
            style={{ width: 28, height: 22, border: "none", background: "transparent", padding: 0 }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={strokeColor}
            onChange={(event) => setStrokeColor(event.target.value)}
            aria-label="Shape stroke"
            style={{ width: 28, height: 22, border: "none", background: "transparent", padding: 0 }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
          <div style={renderShape(shapeType, fillColor, strokeColor)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
          <button data-node-interactive="true" type="button" onClick={() => setShapeType("rect")} title="Rectangle" style={shapePickerButtonStyle(shapeType === "rect")}>Rect</button>
          <button data-node-interactive="true" type="button" onClick={() => setShapeType("circle")} title="Circle" style={shapePickerButtonStyle(shapeType === "circle")}>Circle</button>
          <button data-node-interactive="true" type="button" onClick={() => setShapeType("triangle")} title="Triangle" style={shapePickerButtonStyle(shapeType === "triangle")}>Triangle</button>
          <button data-node-interactive="true" type="button" onClick={() => setShapeType("diamond")} title="Diamond" style={shapePickerButtonStyle(shapeType === "diamond")}>Diamond</button>
          <button data-node-interactive="true" type="button" onClick={() => setShapeType("line")} title="Line" style={shapePickerButtonStyle(shapeType === "line")}>Line</button>
        </div>
      </div>
    </DraggableNode>
  );
}

function shapePickerButtonStyle(isActive: boolean): CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.16)",
    background: isActive ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.04)",
    color: "rgba(240,240,240,0.95)",
    borderRadius: 6,
    padding: "6px 6px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    lineHeight: 1,
  };
}
