import {
  CSSProperties,
  ChangeEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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

export interface StickyNoteNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialText?: string;
  initialColorHex?: string;
  initialZIndex?: number;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 230;
const DEFAULT_MIN_HEIGHT = 170;
const DEFAULT_COLOR = "#d8cfb0";

function getReadableTextColor(backgroundHex: string): string {
  const normalized = backgroundHex.trim().replace("#", "");
  const sixDigitHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(sixDigitHex)) {
    return "#1a1a1a";
  }

  const red = Number.parseInt(sixDigitHex.slice(0, 2), 16);
  const green = Number.parseInt(sixDigitHex.slice(2, 4), 16);
  const blue = Number.parseInt(sixDigitHex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance >= 145 ? "#1a1a1a" : "#f5f5f5";
}

export function StickyNoteNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialText = "",
  initialColorHex = DEFAULT_COLOR,
  initialZIndex,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: StickyNoteNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const [text, setText] = useState(() =>
    resolveInitialValue(persistedMeta?.text, initialText, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const textColor = useMemo(() => getReadableTextColor(colorHex), [colorHex]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "sticky-note",
      text,
      colorHex,
    });
  }, [colorHex, nodeId, storage, text]);

  const onTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="sticky-note"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`sticky-note ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: 20,
        borderRadius: "2px 2px 24px 2px",
        boxShadow: "2px 8px 16px rgba(0,0,0,0.3)",
        border: "1px solid rgba(0,0,0,0.1)",
        background: `linear-gradient(135deg, ${colorHex} 0%, ${getReadableTextColor(textColor) === "#1a1a1a" ? '#ffffff' : '#000000'}15 100%)`,
        backgroundColor: colorHex,
        position: 'relative',
        color: textColor,
        ...style,
      }}
    >
      {/* 📌 Cute pin at the top center! */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, #efefef, #a1a1a1 60%, #1a1a1a 100%)',
        boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
        zIndex: 10
      }}></div>
      <div
        data-board-export-hidden="true"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          marginTop: 4,
          paddingBottom: 8,
          borderBottom: `1px solid ${textColor}22`
        }}
      >
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.72 }}>
          Note
        </span>
        <input
          data-node-interactive="true"
          type="color"
          value={colorHex}
          onChange={(event) => setColorHex(event.target.value)}
          aria-label="Sticky note color"
          style={{
            width: 28,
            height: 22,
            border: "none",
            background: "transparent",
            padding: 0,
          }}
        />
      </div>
      <textarea
        ref={textareaRef}
        data-node-interactive="true"
        value={text}
        onChange={onTextChange}
        placeholder="Write a clue..."
        style={{
          width: "100%",
          minHeight: minHeight - 38,
          border: "none",
          background: "transparent",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
          fontSize: "inherit",
          color: "inherit",
          lineHeight: 1.45,
        }}
      />
    </DraggableNode>
  );
}
