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

export interface InterrogationLogNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialTitle?: string;
  initialSummary?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 390;
const DEFAULT_MIN_HEIGHT = 280;
const DEFAULT_COLOR = "#5f6d80";

function parseEntries(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return ["[21:40] DETECTIVE: State your location at 20:15."];
}

function currentTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function InterrogationLogNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTitle = "Interrogation Log",
  initialSummary = "",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: InterrogationLogNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [title, setTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialTitle, isString)
  );
  const [summary, setSummary] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialSummary, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [entries, setEntries] = useState<string[]>(() => parseEntries(persistedMeta?.text));
  const [speakerDraft, setSpeakerDraft] = useState("WITNESS");
  const [lineDraft, setLineDraft] = useState("");

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "interrogation-log",
      title,
      body: summary,
      colorHex,
      text: entries,
    });
  }, [colorHex, entries, nodeId, storage, summary, title]);

  const addEntry = () => {
    const normalizedLine = lineDraft.trim();
    const normalizedSpeaker = speakerDraft.trim().toUpperCase();
    if (!normalizedLine) {
      return;
    }

    setEntries((currentEntries) => [
      ...currentEntries,
      `[${currentTimestamp()}] ${normalizedSpeaker || "UNKNOWN"}: ${normalizedLine}`,
    ]);
    setLineDraft("");
  };

  const removeEntry = (index: number) => {
    setEntries((currentEntries) =>
      currentEntries.filter((_, entryIndex) => entryIndex !== index)
    );
  };

  const updateEntry = (index: number, nextValue: string) => {
    setEntries((currentEntries) =>
      currentEntries.map((entry, entryIndex) => (entryIndex === index ? nextValue : entry))
    );
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="interrogation-log"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`interrogation-log-node ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: 14,
        border: `1px solid ${colorHex}`,
        background: "linear-gradient(180deg, rgba(13, 19, 28, 0.98), rgba(7, 10, 16, 0.98))",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 10, color: "rgba(230, 240, 253, 0.92)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={title}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
            placeholder="Interrogation title"
            style={{
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.16)",
              background: "transparent",
              color: "inherit",
              outline: "none",
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: 15,
              paddingBottom: 6,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Interrogation accent color"
            style={{ width: 30, height: 24, border: "none", background: "transparent", padding: 0 }}
          />
        </div>

        <textarea
          data-node-interactive="true"
          value={summary}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSummary(event.target.value)}
          placeholder="Summary"
          style={{
            width: "100%",
            minHeight: 54,
            resize: "vertical",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
            padding: 8,
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "grid", gap: 8, maxHeight: 180, overflow: "auto", paddingRight: 2 }}>
          {entries.map((entry, index) => (
            <div
              key={`${index}-${entry}`}
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: 8,
                background: "rgba(255,255,255,0.03)",
                display: "grid",
                gap: 8,
              }}
            >
              <textarea
                data-node-interactive="true"
                value={entry}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  updateEntry(index, event.target.value)
                }
                style={{
                  width: "100%",
                  minHeight: 42,
                  resize: "vertical",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "inherit",
                  fontFamily: "inherit",
                  lineHeight: 1.36,
                }}
              />
              <button
                data-node-interactive="true"
                type="button"
                onClick={() => removeEntry(index)}
                style={{
                  justifySelf: "end",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.03)",
                  color: "inherit",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 8 }}>
          <input
            data-node-interactive="true"
            value={speakerDraft}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSpeakerDraft(event.target.value)}
            placeholder="Speaker"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              padding: "6px 8px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <input
            data-node-interactive="true"
            value={lineDraft}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setLineDraft(event.target.value)}
            placeholder="Statement"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              padding: "6px 8px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            data-node-interactive="true"
            type="button"
            onClick={addEntry}
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              padding: "6px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Add
          </button>
        </div>
      </div>
    </DraggableNode>
  );
}
