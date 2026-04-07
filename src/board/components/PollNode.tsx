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

export interface PollNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialQuestion?: string;
  initialOptions?: string[];
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  className?: string;
  style?: CSSProperties;
}

interface PollOption {
  label: string;
  votes: number;
}

const DEFAULT_WIDTH = 340;
const DEFAULT_COLOR = "#8f938f";

function parsePollOptions(value: unknown, fallback: string[]): PollOption[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          const [labelPart, votePart] = entry.split("|");
          const votes = Number(votePart);
          return {
            label: labelPart?.trim() || "Option",
            votes: Number.isFinite(votes) ? Math.max(0, Math.round(votes)) : 0,
          };
        }

        if (
          entry &&
          typeof entry === "object" &&
          "label" in entry &&
          "votes" in entry &&
          typeof (entry as { label: unknown }).label === "string" &&
          typeof (entry as { votes: unknown }).votes === "number"
        ) {
          return {
            label: (entry as { label: string }).label,
            votes: Math.max(0, Math.round((entry as { votes: number }).votes)),
          };
        }

        return null;
      })
      .filter((entry): entry is PollOption => entry !== null);
  }

  return fallback.map((label) => ({ label, votes: 0 }));
}

function serializePollOptions(options: PollOption[]): string[] {
  return options.map((option) => `${option.label}|${option.votes}`);
}

export function PollNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialQuestion = "Which lead has the strongest motive?",
  initialOptions = ["Insider access", "Financial pressure", "Witness conflict"],
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  className,
  style,
}: PollNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [question, setQuestion] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialQuestion, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [options, setOptions] = useState<PollOption[]>(() =>
    parsePollOptions(persistedMeta?.text, initialOptions)
  );

  const totalVotes = useMemo(
    () => options.reduce((sum, option) => sum + option.votes, 0),
    [options]
  );

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "poll-node",
      title: question,
      text: serializePollOptions(options),
      colorHex,
    });
  }, [colorHex, nodeId, options, question, storage]);

  const updateOption = (index: number, patch: Partial<PollOption>) => {
    setOptions((currentOptions) =>
      currentOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option
      )
    );
  };

  const addOption = () => {
    setOptions((currentOptions) => [...currentOptions, { label: "New lead", votes: 0 }]);
  };

  const removeOption = (index: number) => {
    setOptions((currentOptions) => currentOptions.filter((_, optionIndex) => optionIndex !== index));
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="poll-node"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`poll-node ${className || ""}`}
      style={{
        width,
        padding: 14,
        border: `1px solid ${colorHex}`,
        background: "rgba(20, 20, 20, 0.96)",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 12, color: "rgba(240, 240, 240, 0.92)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={question}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuestion(event.target.value)}
            placeholder="Poll question"
            style={{
              flex: 1,
              border: "none",
              borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
              outline: "none",
              background: "transparent",
              color: "inherit",
              fontSize: 15,
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
            aria-label="Poll accent color"
            style={{
              width: 34,
              height: 28,
              border: "none",
              background: "transparent",
              padding: 0,
            }}
          />
        </div>

        <div style={{ fontSize: 11, opacity: 0.72, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Total assessments: {totalVotes}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {options.map((option, index) => {
            const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;

            return (
              <div
                key={`${index}-${option.label}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: 10,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      data-node-interactive="true"
                      value={option.label}
                      onChange={(event) => updateOption(index, { label: event.target.value })}
                      placeholder="Option label"
                      style={{
                        flex: 1,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "inherit",
                        fontSize: 13,
                        fontFamily: "inherit",
                      }}
                    />
                    <button
                      data-node-interactive="true"
                      type="button"
                      onClick={() => removeOption(index)}
                      style={{
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "transparent",
                        color: "inherit",
                        borderRadius: 4,
                        padding: "2px 8px",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: "100%",
                        background: colorHex,
                        transition: "width 120ms ease-out",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, opacity: 0.76 }}>{percentage}% confidence</span>
                    <input
                      data-node-interactive="true"
                      type="number"
                      min={0}
                      value={option.votes}
                      onChange={(event) =>
                        updateOption(index, {
                          votes: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      style={{
                        width: 72,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.22)",
                        color: "inherit",
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          data-node-interactive="true"
          type="button"
          onClick={addOption}
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
          Add option
        </button>
      </div>
    </DraggableNode>
  );
}