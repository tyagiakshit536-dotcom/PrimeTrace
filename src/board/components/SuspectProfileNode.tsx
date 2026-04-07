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

export interface SuspectProfileNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialName?: string;
  initialNotes?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

type SuspectStatus = "at-large" | "surveillance" | "cleared";

interface SuspectSettings {
  alias: string;
  status: SuspectStatus;
  risk: number;
  armed: boolean;
}

const DEFAULT_WIDTH = 340;
const DEFAULT_MIN_HEIGHT = 260;
const DEFAULT_COLOR = "#8b6f5f";

function parseSuspectSettings(value: unknown): SuspectSettings {
  if (typeof value !== "string") {
    return {
      alias: "",
      status: "at-large",
      risk: 40,
      armed: false,
    };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const statusCandidate = parsed.status;

    return {
      alias: typeof parsed.alias === "string" ? parsed.alias : "",
      status:
        statusCandidate === "surveillance" || statusCandidate === "cleared"
          ? statusCandidate
          : "at-large",
      risk:
        typeof parsed.risk === "number" && Number.isFinite(parsed.risk)
          ? Math.max(0, Math.min(100, Math.round(parsed.risk)))
          : 40,
      armed: parsed.armed === true,
    };
  } catch {
    return {
      alias: "",
      status: "at-large",
      risk: 40,
      armed: false,
    };
  }
}

function statusLabel(status: SuspectStatus): string {
  if (status === "surveillance") {
    return "Under Surveillance";
  }

  if (status === "cleared") {
    return "Cleared";
  }

  return "At Large";
}

export function SuspectProfileNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialName = "Unknown Suspect",
  initialNotes = "",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: SuspectProfileNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const initialSettings = useMemo(
    () => parseSuspectSettings(persistedMeta?.text),
    [persistedMeta?.text]
  );

  const [suspectName, setSuspectName] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialName, isString)
  );
  const [notes, setNotes] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialNotes, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [alias, setAlias] = useState(initialSettings.alias);
  const [status, setStatus] = useState<SuspectStatus>(initialSettings.status);
  const [risk, setRisk] = useState(initialSettings.risk);
  const [armed, setArmed] = useState(initialSettings.armed);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "suspect-profile",
      title: suspectName,
      body: notes,
      colorHex,
      text: JSON.stringify({ alias, status, risk, armed }),
    });
  }, [alias, armed, colorHex, nodeId, notes, risk, status, storage, suspectName]);

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="suspect-profile"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`suspect-profile-node ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: 20,
        borderRadius: 16,
        border: `1px solid ${colorHex}99`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), inset 0 0 40px ${colorHex}15`,
        background: "linear-gradient(145deg, rgba(31, 22, 27, 0.95), rgba(15, 10, 15, 0.95))",
        backdropFilter: "blur(24px)",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 14, color: "rgba(247, 233, 221, 0.95)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={suspectName}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSuspectName(event.target.value)}
            placeholder="Suspect Reference"
            style={{
              border: "none",
              borderBottom: `2px solid ${colorHex}`,
              outline: "none",
              background: "transparent",
              color: "inherit",
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 800,
              fontSize: 18,
              paddingBottom: 6,
              textShadow: `0 0 10px ${colorHex}55`,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Profile Accent"
            style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", background: "transparent", padding: 0 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={alias}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setAlias(event.target.value)}
            placeholder="Known Alpha / Alias"
            style={{
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
              color: "#38bdf8",
              fontWeight: 600,
              outline: "none",
              padding: "10px 14px",
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
            }}
          />
          <select
            data-node-interactive="true"
            value={status}
            onChange={(event) => setStatus(event.target.value as SuspectStatus)}
            style={{
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              background: "rgba(0,0,0,0.4)",
              color: "inherit",
              padding: "10px 14px",
              fontFamily: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <option value="at-large">🔴 At Large</option>
            <option value="surveillance">🟡 Surveillance</option>
            <option value="cleared">🟢 Cleared</option>
          </select>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${colorHex}44`,
            background: `linear-gradient(to right, ${colorHex}11, transparent)`,
            padding: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.9 }}>
              {statusLabel(status)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.9, color: risk > 70 ? "#ef4444" : "inherit" }}>
              Risk Level {risk}%
            </span>
          </div>
          <input
            data-node-interactive="true"
            type="range"
            min={0}
            max={100}
            step={1}
            value={risk}
            onChange={(event) => setRisk(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
            style={{ accentColor: risk > 75 ? "#ef4444" : risk > 40 ? "#fbbf24" : "#10b981", cursor: "pointer" }}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
            <input
              data-node-interactive="true"
              type="checkbox"
              checked={armed}
              onChange={(event) => setArmed(event.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#ef4444", cursor: "pointer" }}
            />
            {armed ? <span style={{color: "#ef4444", textShadow: "0 0 8px rgba(239,68,68,0.5)"}}>⚠️ WARNING: POTENTIALLY ARMED</span> : "Potentially Armed"}
          </label>
        </div>

        <textarea
          data-node-interactive="true"
          value={notes}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)}
          placeholder="Intelligence logs, known associates, routine, psych profile..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            minHeight: 120,
            resize: "vertical",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.3)",
            color: "inherit",
            padding: 14,
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.6,
            boxShadow: "inset 0 4px 10px rgba(0,0,0,0.4)",
          }}
        />
      </div>
    </DraggableNode>
  );
}
