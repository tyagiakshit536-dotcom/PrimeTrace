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
  patchNodeMeta,
  readNodeMeta,
  resolveInitialValue,
} from "../storage/nodeState";

export interface ProfessionTemplateSeed {
  toolId: string;
  title: string;
  profession: string;
  status: string;
  summary: string;
  checklistLines: string[];
  notes: string;
  accentColor: string;
  layout?: ProfessionCardLayout;
}

export interface ProfessionTemplateNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialTemplate?: ProfessionTemplateSeed;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

interface ProfessionTemplatePayload {
  toolId: string;
  profession: string;
  status: string;
  summary: string;
  checklistText: string;
  notes: string;
  layout: ProfessionCardLayout;
}

export type ProfessionCardLayout =
  | "stacked"
  | "split"
  | "timeline"
  | "checklist"
  | "focus";

const DEFAULT_WIDTH = 348;
const DEFAULT_MIN_HEIGHT = 284;

const DEFAULT_TEMPLATE: ProfessionTemplateSeed = {
  toolId: "general-profession-card",
  title: "Work Card",
  profession: "General",
  status: "Planned",
  summary: "Describe the objective and expected outcome.",
  checklistLines: [
    "Define objective",
    "Collect resources",
    "Execute task",
    "Review result",
  ],
  notes: "",
  accentColor: "#4f7d68",
};

const STATUS_OPTIONS = [
  "Planned",
  "In Progress",
  "Blocked",
  "Review",
  "Done",
] as const;

const LAYOUT_CYCLE: readonly ProfessionCardLayout[] = [
  "stacked",
  "split",
  "timeline",
  "checklist",
  "focus",
];

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const expanded = normalized
      .slice(1)
      .split("")
      .map((entry) => `${entry}${entry}`)
      .join("");

    return `#${expanded}`;
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isProfessionCardLayout(value: unknown): value is ProfessionCardLayout {
  return (
    value === "stacked" ||
    value === "split" ||
    value === "timeline" ||
    value === "checklist" ||
    value === "focus"
  );
}

function inferLayoutFromToolId(toolId: string): ProfessionCardLayout {
  if (toolId.length === 0) {
    return "stacked";
  }

  if (
    toolId.includes("timeline") ||
    toolId.includes("timetable") ||
    toolId.includes("planner")
  ) {
    return "timeline";
  }

  if (
    toolId.includes("checklist") ||
    toolId.includes("tracker") ||
    toolId.includes("monitor")
  ) {
    return "checklist";
  }

  if (
    toolId.includes("brief") ||
    toolId.includes("spec") ||
    toolId.includes("contract")
  ) {
    return "focus";
  }

  let hash = 0;
  for (let index = 0; index < toolId.length; index += 1) {
    hash = (hash * 33 + toolId.charCodeAt(index)) >>> 0;
  }

  return LAYOUT_CYCLE[hash % LAYOUT_CYCLE.length];
}

function parsePayload(
  payload: unknown,
  fallback: ProfessionTemplateSeed
): ProfessionTemplatePayload {
  const fallbackLayout = fallback.layout ?? inferLayoutFromToolId(fallback.toolId);

  if (!isRecord(payload)) {
    return {
      toolId: fallback.toolId,
      profession: fallback.profession,
      status: fallback.status,
      summary: fallback.summary,
      checklistText: fallback.checklistLines.join("\n"),
      notes: fallback.notes,
      layout: fallbackLayout,
    };
  }

  const toolId =
    typeof payload.toolId === "string" ? payload.toolId : fallback.toolId;

  return {
    toolId,
    profession:
      typeof payload.profession === "string"
        ? payload.profession
        : fallback.profession,
    status:
      typeof payload.status === "string" ? payload.status : fallback.status,
    summary:
      typeof payload.summary === "string" ? payload.summary : fallback.summary,
    checklistText:
      typeof payload.checklistText === "string"
        ? payload.checklistText
        : isStringArray(payload.checklistLines)
          ? payload.checklistLines.join("\n")
          : fallback.checklistLines.join("\n"),
    notes:
      typeof payload.notes === "string" ? payload.notes : fallback.notes,
    layout: isProfessionCardLayout(payload.layout)
      ? payload.layout
      : inferLayoutFromToolId(toolId),
  };
}

function parsePersistedPayload(
  body: unknown,
  fallback: ProfessionTemplateSeed
): ProfessionTemplatePayload {
  if (typeof body !== "string") {
    return parsePayload(null, fallback);
  }

  try {
    return parsePayload(JSON.parse(body), fallback);
  } catch {
    return parsePayload(null, fallback);
  }
}

function buildChecklistCount(checklistText: string): number {
  return checklistText
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0).length;
}

function textColorForBackground(backgroundHex: string): string {
  const normalized = normalizeHexColor(backgroundHex, "#3a5a4d").slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance >= 145 ? "#172026" : "#f3f7fb";
}

export function ProfessionTemplateNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTemplate = DEFAULT_TEMPLATE,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: ProfessionTemplateNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [nodeId, storage]);
  const persistedPayload = useMemo(
    () => parsePersistedPayload(persistedMeta?.body, initialTemplate),
    [initialTemplate, persistedMeta?.body]
  );

  const [title, setTitle] = useState(() =>
    resolveInitialValue(
      persistedMeta?.title,
      initialTemplate.title,
      (value): value is string => typeof value === "string"
    )
  );
  const [toolId] = useState(persistedPayload.toolId);
  const [layout] = useState<ProfessionCardLayout>(persistedPayload.layout);
  const [profession, setProfession] = useState(persistedPayload.profession);
  const [status, setStatus] = useState(persistedPayload.status);
  const [summary, setSummary] = useState(persistedPayload.summary);
  const [checklistText, setChecklistText] = useState(persistedPayload.checklistText);
  const [notes, setNotes] = useState(() =>
    typeof persistedMeta?.text === "string" ? persistedMeta.text : persistedPayload.notes
  );
  const [accentColor, setAccentColor] = useState(() =>
    normalizeHexColor(
      persistedMeta?.colorHex,
      normalizeHexColor(initialTemplate.accentColor, "#4f7d68")
    )
  );

  const cardTextColor = useMemo(() => textColorForBackground(accentColor), [accentColor]);
  const checklistCount = useMemo(() => buildChecklistCount(checklistText), [checklistText]);

  useEffect(() => {
    const payload: ProfessionTemplatePayload = {
      toolId,
      profession,
      status,
      summary,
      checklistText,
      notes,
      layout,
    };

    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "profession-template",
      title,
      text: notes,
      body: JSON.stringify(payload),
      colorHex: accentColor,
    });
  }, [
    accentColor,
    checklistText,
    nodeId,
    notes,
    layout,
    profession,
    status,
    storage,
    summary,
    title,
    toolId,
  ]);

  const cardVisuals = useMemo(() => {
    if (layout === "split") {
      return {
        background: `linear-gradient(135deg, ${accentColor}26 0%, rgba(255, 255, 255, 0.97) 78%)`,
        borderRadius: 14,
      };
    }

    if (layout === "timeline") {
      return {
        background: `linear-gradient(180deg, ${accentColor}24 0%, rgba(255, 255, 255, 0.98) 70%)`,
        borderRadius: 16,
      };
    }

    if (layout === "checklist") {
      return {
        background: `linear-gradient(160deg, ${accentColor}22 0%, rgba(255, 255, 255, 0.97) 84%)`,
        borderRadius: 10,
      };
    }

    if (layout === "focus") {
      return {
        background: `linear-gradient(200deg, ${accentColor}2b 0%, rgba(255, 255, 255, 0.95) 88%)`,
        borderRadius: 13,
      };
    }

    return {
      background: `linear-gradient(150deg, ${accentColor}1f 0%, rgba(255, 255, 255, 0.96) 88%)`,
      borderRadius: 12,
    };
  }, [accentColor, layout]);

  const labelStyle: CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    opacity: 0.75,
  };

  const baseTextareaStyle: CSSProperties = {
    resize: "vertical",
    borderRadius: 8,
    border: "1px solid rgba(15, 23, 42, 0.18)",
    background: "rgba(255, 255, 255, 0.82)",
    padding: 8,
    fontSize: 12,
    lineHeight: 1.45,
  };

  const summaryField = (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={labelStyle}>Summary</span>
      <textarea
        data-node-interactive="true"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="Objective and important context"
        style={{
          ...baseTextareaStyle,
          minHeight: layout === "focus" ? 80 : 56,
        }}
      />
    </label>
  );

  const checklistField = (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={labelStyle}>Checklist ({checklistCount})</span>
      <textarea
        data-node-interactive="true"
        value={checklistText}
        onChange={(event) => setChecklistText(event.target.value)}
        placeholder="One item per line"
        style={{
          ...baseTextareaStyle,
          minHeight: layout === "checklist" ? 120 : 70,
        }}
      />
    </label>
  );

  const notesField = (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={labelStyle}>Notes</span>
      <textarea
        data-node-interactive="true"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Working notes"
        style={{
          ...baseTextareaStyle,
          minHeight: layout === "timeline" ? 76 : 62,
        }}
      />
    </label>
  );

  const bodyContent = useMemo(() => {
    if (layout === "split") {
      return (
        <section style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 8,
            }}
          >
            {summaryField}
            {notesField}
          </div>
          {checklistField}
        </section>
      );
    }

    if (layout === "timeline") {
      return (
        <section style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              border: "1px dashed rgba(15, 23, 42, 0.26)",
              borderRadius: 8,
              padding: "6px 8px",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              opacity: 0.82,
            }}
          >
            <span>{profession || "Role"}</span>
            <span>{status || "Planned"}</span>
          </div>
          {summaryField}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 8,
            }}
          >
            {checklistField}
            {notesField}
          </div>
        </section>
      );
    }

    if (layout === "checklist") {
      return (
        <section style={{ display: "grid", gap: 8 }}>
          {checklistField}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 8,
            }}
          >
            {summaryField}
            {notesField}
          </div>
        </section>
      );
    }

    if (layout === "focus") {
      return (
        <section style={{ display: "grid", gap: 8 }}>
          {summaryField}
          <div
            style={{
              border: "1px solid rgba(15, 23, 42, 0.16)",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 11,
              opacity: 0.82,
            }}
          >
            Priority Track: {status || "Planned"}
          </div>
          {notesField}
          {checklistField}
        </section>
      );
    }

    return (
      <section style={{ display: "grid", gap: 8 }}>
        {summaryField}
        {checklistField}
        {notesField}
      </section>
    );
  }, [
    checklistCount,
    checklistField,
    layout,
    notesField,
    profession,
    status,
    summaryField,
  ]);

  const onProfessionChange = (event: ChangeEvent<HTMLInputElement>) => {
    setProfession(event.target.value);
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="profession-template"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`profession-template-node ${className ?? ""}`}
      style={{
        width,
        minHeight,
        borderRadius: cardVisuals.borderRadius,
        border: "1px solid rgba(15, 23, 42, 0.2)",
        background: cardVisuals.background,
        boxShadow: "0 14px 26px rgba(15, 23, 42, 0.22)",
        backdropFilter: "blur(2px)",
        padding: 12,
        display: "grid",
        gap: 10,
        color: "#102027",
        ...style,
      }}
    >
      <header
        style={{
          borderRadius: 9,
          border: "1px solid rgba(15, 23, 42, 0.16)",
          padding: "8px 10px",
          background: `${accentColor}dd`,
          color: cardTextColor,
          display: "grid",
          gap: 8,
        }}
      >
        <input
          data-node-interactive="true"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Card title"
          placeholder="Card title"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "inherit",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: "0.01em",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 106px 32px",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            data-node-interactive="true"
            value={profession}
            onChange={onProfessionChange}
            aria-label="Profession"
            placeholder="Profession"
            style={{
              borderRadius: 6,
              border: "1px solid rgba(255, 255, 255, 0.35)",
              background: "rgba(255, 255, 255, 0.16)",
              color: "inherit",
              minHeight: 28,
              padding: "4px 8px",
              fontSize: 12,
            }}
          />

          <select
            data-node-interactive="true"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Status"
            style={{
              borderRadius: 6,
              border: "1px solid rgba(255, 255, 255, 0.35)",
              background: "rgba(255, 255, 255, 0.16)",
              color: "inherit",
              minHeight: 28,
              padding: "4px 8px",
              fontSize: 12,
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <input
            data-node-interactive="true"
            type="color"
            value={accentColor}
            onChange={(event) => setAccentColor(event.target.value)}
            aria-label="Accent color"
            style={{
              width: 30,
              height: 28,
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
            }}
          />
        </div>
      </header>

      {bodyContent}
    </DraggableNode>
  );
}