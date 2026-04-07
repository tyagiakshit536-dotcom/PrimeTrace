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

export interface ChecklistBoardNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialTitle?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

interface ChecklistItem {
  label: string;
  done: boolean;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_MIN_HEIGHT = 250;
const DEFAULT_COLOR = "#7a8a70";

function parseChecklistItems(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) {
    return [
      { label: "Secure witness statement", done: false },
      { label: "Verify camera timestamps", done: false },
    ];
  }

  const items: ChecklistItem[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = entry.trim();
    if (normalized.startsWith("[x] ")) {
      items.push({ label: normalized.slice(4), done: true });
      continue;
    }

    if (normalized.startsWith("[ ] ")) {
      items.push({ label: normalized.slice(4), done: false });
      continue;
    }

    items.push({ label: normalized, done: false });
  }

  return items.length > 0 ? items : [{ label: "Add a new task", done: false }];
}

function serializeChecklistItems(items: ChecklistItem[]): string[] {
  return items.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.label}`);
}

export function ChecklistBoardNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTitle = "Operations Checklist",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: ChecklistBoardNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [title, setTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialTitle, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [items, setItems] = useState<ChecklistItem[]>(() =>
    parseChecklistItems(persistedMeta?.text)
  );

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "checklist-board",
      title,
      colorHex,
      text: serializeChecklistItems(items),
    });
  }, [colorHex, items, nodeId, storage, title]);

  const addItem = () => {
    setItems((currentItems) => [...currentItems, { label: "New task", done: false }]);
  };

  const updateItem = (index: number, patch: Partial<ChecklistItem>) => {
    setItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  };

  const removeItem = (index: number) => {
    setItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const doneCount = items.filter((item) => item.done).length;

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="checklist-board"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`checklist-board-node ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: 14,
        border: `1px solid ${colorHex}`,
        background: "linear-gradient(180deg, rgba(19, 25, 17, 0.97), rgba(10, 14, 9, 0.98))",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 10, color: "rgba(235, 245, 226, 0.92)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={title}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
            placeholder="Checklist title"
            style={{
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.16)",
              background: "transparent",
              color: "inherit",
              outline: "none",
              fontFamily: "inherit",
              fontWeight: 700,
              paddingBottom: 6,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Checklist accent color"
            style={{ width: 30, height: 24, border: "none", background: "transparent", padding: 0 }}
          />
        </div>

        <div style={{ fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.78 }}>
          Completed {doneCount}/{items.length}
        </div>

        <div style={{ display: "grid", gap: 8, maxHeight: 210, overflow: "auto", paddingRight: 2 }}>
          {items.map((item, index) => (
            <div
              key={`${index}-${item.label}`}
              style={{
                display: "grid",
                gridTemplateColumns: "18px 1fr auto",
                gap: 8,
                alignItems: "center",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 7,
                padding: "6px 8px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <input
                data-node-interactive="true"
                type="checkbox"
                checked={item.done}
                onChange={(event) => updateItem(index, { done: event.target.checked })}
              />
              <input
                data-node-interactive="true"
                value={item.label}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateItem(index, { label: event.target.value })
                }
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "inherit",
                  fontFamily: "inherit",
                  textDecoration: item.done ? "line-through" : "none",
                  opacity: item.done ? 0.72 : 1,
                }}
              />
              <button
                data-node-interactive="true"
                type="button"
                onClick={() => removeItem(index)}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.03)",
                  color: "inherit",
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                }}
              >
                Del
              </button>
            </div>
          ))}
        </div>

        <button
          data-node-interactive="true"
          type="button"
          onClick={addItem}
          style={{
            border: "1px dashed rgba(255,255,255,0.24)",
            borderRadius: 7,
            background: "rgba(255,255,255,0.04)",
            color: "inherit",
            padding: "7px 10px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Add task
        </button>
      </div>
    </DraggableNode>
  );
}
