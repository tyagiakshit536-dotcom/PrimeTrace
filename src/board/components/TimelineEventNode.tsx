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

export interface TimelineEventNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialDate?: string;
  initialTime?: string;
  initialHeading?: string;
  initialDetails?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_COLOR = "#8a8d92";

function joinTimelineStamp(date: string, time: string): string {
  return [date.trim(), time.trim()].filter(Boolean).join(" | ");
}

function splitTimelineStamp(value: unknown): { date: string; time: string } {
  if (typeof value !== "string") {
    return { date: "", time: "" };
  }

  const [date = "", time = ""] = value.split("|").map((entry) => entry.trim());
  return { date, time };
}

export function TimelineEventNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialDate = "14 Oct",
  initialTime = "21:10",
  initialHeading = "Key event",
  initialDetails = "",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  className,
  style,
}: TimelineEventNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const initialStamp = splitTimelineStamp(persistedMeta?.text);

  const [date, setDate] = useState(() =>
    initialStamp.date || resolveInitialValue(undefined, initialDate, isString)
  );
  const [time, setTime] = useState(() =>
    initialStamp.time || resolveInitialValue(undefined, initialTime, isString)
  );
  const [heading, setHeading] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialHeading, isString)
  );
  const [details, setDetails] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialDetails, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "timeline-event",
      title: heading,
      body: details,
      text: joinTimelineStamp(date, time),
      colorHex,
    });
  }, [colorHex, date, details, heading, nodeId, storage, time]);

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="timeline-event"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`timeline-event-node ${className || ""}`}
      style={{
        width,
        padding: 14,
        borderLeft: `4px solid ${colorHex}`,
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRight: "1px solid rgba(255,255,255,0.1)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(18, 18, 18, 0.97)",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 12, color: "rgba(241, 241, 241, 0.92)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={date}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)}
            placeholder="Date"
            style={{
              width: 92,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 4,
              color: "inherit",
              padding: "6px 8px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <input
            data-node-interactive="true"
            value={time}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value)}
            placeholder="Time"
            style={{
              width: 82,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 4,
              color: "inherit",
              padding: "6px 8px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Timeline accent color"
            style={{
              width: 34,
              height: 28,
              border: "none",
              background: "transparent",
              padding: 0,
              marginLeft: "auto",
            }}
          />
        </div>

        <input
          data-node-interactive="true"
          value={heading}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setHeading(event.target.value)}
          placeholder="Event heading"
          style={{
            width: "100%",
            border: "none",
            borderBottom: "1px solid rgba(255,255,255,0.14)",
            outline: "none",
            background: "transparent",
            color: "inherit",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "inherit",
            paddingBottom: 6,
          }}
        />

        <textarea
          data-node-interactive="true"
          value={details}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDetails(event.target.value)}
          placeholder="Observed actions, witness timing, arrival windows..."
          style={{
            width: "100%",
            minHeight: 120,
            resize: "vertical",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
            padding: 8,
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.45,
          }}
        />
      </div>
    </DraggableNode>
  );
}