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

export interface ThreadHubNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialCaseTitle?: string;
  initialSummary?: string;
  initialLeads?: string[];
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_COLOR = "#8e8778";

function parseLeadItems(value: unknown, fallback: string[]): string[] {
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

interface LeadItem {
  label: string;
  checked: boolean;
}

function parseChecklist(entries: string[]): LeadItem[] {
  return entries.map((entry) => {
    const normalized = entry.trim();
    if (normalized.startsWith("[x] ")) {
      return { label: normalized.slice(4), checked: true };
    }

    if (normalized.startsWith("[ ] ")) {
      return { label: normalized.slice(4), checked: false };
    }

    return { label: normalized, checked: false };
  });
}

function serializeChecklist(items: LeadItem[]): string[] {
  return items.map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.label}`);
}

export function ThreadHubNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialCaseTitle = "Thread Hub",
  initialSummary = "",
  initialLeads = ["Cross-check call logs", "Revisit station footage", "Verify purchase receipts"],
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  className,
  style,
}: ThreadHubNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [caseTitle, setCaseTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialCaseTitle, isString)
  );
  const [summary, setSummary] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialSummary, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [leads, setLeads] = useState<LeadItem[]>(() =>
    parseChecklist(parseLeadItems(persistedMeta?.text, initialLeads))
  );

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "thread-hub",
      title: caseTitle,
      body: summary,
      text: serializeChecklist(leads),
      colorHex,
    });
  }, [caseTitle, colorHex, leads, nodeId, storage, summary]);

  const updateLead = (index: number, patch: Partial<LeadItem>) => {
    setLeads((currentLeads) =>
      currentLeads.map((lead, leadIndex) =>
        leadIndex === index ? { ...lead, ...patch } : lead
      )
    );
  };

  const addLead = () => {
    setLeads((currentLeads) => [...currentLeads, { label: "New lead", checked: false }]);
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="thread-hub"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`thread-hub-node ${className || ""}`}
      style={{
        width,
        padding: 16,
        border: `1px solid ${colorHex}`,
        background: "rgba(19, 19, 19, 0.97)",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 12, color: "rgba(242, 242, 242, 0.92)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={caseTitle}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setCaseTitle(event.target.value)}
            placeholder="Case title"
            style={{
              flex: 1,
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.14)",
              outline: "none",
              background: "transparent",
              color: "inherit",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "inherit",
              paddingBottom: 6,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Thread hub accent color"
            style={{
              width: 34,
              height: 28,
              border: "none",
              background: "transparent",
              padding: 0,
            }}
          />
        </div>

        <textarea
          data-node-interactive="true"
          value={summary}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSummary(event.target.value)}
          placeholder="Central working theory..."
          style={{
            width: "100%",
            minHeight: 82,
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

        <div
          style={{
            borderRadius: 10,
            border: "1px dashed rgba(255,255,255,0.14)",
            padding: 12,
            background:
              "radial-gradient(circle at center, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.015) 42%, transparent 43%)",
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              margin: "0 auto 10px auto",
              borderRadius: "50%",
              border: `1px solid ${colorHex}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 12,
              fontSize: 12,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Active threads
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {leads.map((lead, index) => (
              <label
                key={`${index}-${lead.label}`}
                data-node-interactive="true"
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  data-node-interactive="true"
                  type="checkbox"
                  checked={lead.checked}
                  onChange={(event) => updateLead(index, { checked: event.target.checked })}
                />
                <input
                  data-node-interactive="true"
                  value={lead.label}
                  onChange={(event) => updateLead(index, { label: event.target.value })}
                  placeholder="Lead item"
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "inherit",
                    fontFamily: "inherit",
                    textDecoration: lead.checked ? "line-through" : "none",
                    opacity: lead.checked ? 0.72 : 1,
                  }}
                />
                <span
                  style={{
                    width: 24,
                    height: 1,
                    background: "rgba(255,255,255,0.18)",
                    display: "block",
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <button
          data-node-interactive="true"
          type="button"
          onClick={addLead}
          style={{
            border: "1px dashed rgba(255,255,255,0.22)",
            background: "transparent",
            color: "inherit",
            borderRadius: 6,
            padding: "8px 10px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Add lead
        </button>
      </div>
    </DraggableNode>
  );
}