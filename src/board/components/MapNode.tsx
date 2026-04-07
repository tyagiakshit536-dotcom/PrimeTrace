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

export interface MapNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialTitle?: string;
  initialNotes?: string;
  initialLocations?: string[];
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 380;
const DEFAULT_MIN_HEIGHT = 320;
const DEFAULT_COLOR = "#9e9687";

function parseLines(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return fallback;
}

function locationsToText(locations: string[]): string {
  return locations.join("\n");
}

export function MapNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTitle = "Field Map",
  initialNotes = "",
  initialLocations = ["Warehouse", "Riverside", "Safe house"],
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: MapNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [title, setTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialTitle, isString)
  );
  const [notes, setNotes] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialNotes, isString)
  );
  const [locationsText, setLocationsText] = useState(() =>
    locationsToText(parseLines(persistedMeta?.text, initialLocations))
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );

  const locations = useMemo(
    () =>
      locationsText
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean),
    [locationsText]
  );

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "map-node",
      title,
      body: notes,
      text: locations,
      colorHex,
    });
  }, [colorHex, locations, nodeId, notes, storage, title]);

  const onTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
  };

  const onNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value);
  };

  const onLocationsChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setLocationsText(event.target.value);
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="map-node"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`map-node ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: 14,
        border: `1px solid ${colorHex}`,
        background: "linear-gradient(180deg, rgba(26, 26, 26, 0.96), rgba(18, 18, 18, 0.98))",
        ...style,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          color: "rgba(240, 240, 240, 0.92)",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={title}
            onChange={onTitleChange}
            placeholder="Map title"
            style={{
              flex: 1,
              border: "none",
              borderBottom: "1px solid rgba(255, 255, 255, 0.16)",
              outline: "none",
              background: "transparent",
              color: "inherit",
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "inherit",
              paddingBottom: 6,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Map accent color"
            style={{
              width: 34,
              height: 28,
              border: "none",
              background: "transparent",
              padding: 0,
            }}
          />
        </div>

        <div
          data-node-interactive="true"
          style={{
            position: "relative",
            height: 170,
            borderRadius: 8,
            overflow: "hidden",
            background:
              "linear-gradient(0deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
            backgroundSize: "22px 22px, 22px 22px, 100% 100%",
            border: "1px solid rgba(255, 255, 255, 0.12)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 25% 32%, rgba(255,255,255,0.06), transparent 24%), radial-gradient(circle at 72% 58%, rgba(255,255,255,0.05), transparent 18%), radial-gradient(circle at 54% 20%, rgba(255,255,255,0.04), transparent 20%)",
            }}
          />
          {locations.slice(0, 6).map((location, index) => {
            const positions = [
              { left: "18%", top: "28%" },
              { left: "64%", top: "22%" },
              { left: "38%", top: "61%" },
              { left: "74%", top: "66%" },
              { left: "22%", top: "76%" },
              { left: "51%", top: "43%" },
            ];
            const position = positions[index % positions.length];

            return (
              <div
                key={`${location}-${index}`}
                style={{
                  position: "absolute",
                  left: position.left,
                  top: position.top,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  color: "rgba(255,255,255,0.88)",
                  textAlign: "center",
                  maxWidth: 88,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50% 50% 50% 0",
                    transform: "rotate(-45deg)",
                    background: colorHex,
                    boxShadow: `0 0 0 2px rgba(0,0,0,0.55), 0 0 0 4px ${colorHex}20`,
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    lineHeight: 1.2,
                    background: "rgba(0, 0, 0, 0.45)",
                    padding: "2px 5px",
                    borderRadius: 4,
                  }}
                >
                  {location}
                </div>
              </div>
            );
          })}
        </div>

        <textarea
          data-node-interactive="true"
          value={locationsText}
          onChange={onLocationsChange}
          placeholder="Locations, one per line"
          style={{
            width: "100%",
            minHeight: 72,
            resize: "vertical",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
            padding: 8,
            outline: "none",
            fontFamily: "inherit",
            fontSize: 13,
          }}
        />

        <textarea
          data-node-interactive="true"
          value={notes}
          onChange={onNotesChange}
          placeholder="Map notes, routes, witness sightings..."
          style={{
            width: "100%",
            minHeight: Math.max(minHeight - 230, 80),
            resize: "vertical",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
            padding: 8,
            outline: "none",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        />
      </div>
    </DraggableNode>
  );
}