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

export interface EvidenceDocumentNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialTitle?: string;
  initialBody?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_MIN_HEIGHT = 260;
const DEFAULT_COLOR = "#f0ebe3";

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

export function EvidenceDocumentNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTitle = "Evidence Document",
  initialBody = "",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: EvidenceDocumentNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);

  const [title, setTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialTitle, isString)
  );
  const [body, setBody] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialBody, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const textColor = useMemo(() => getReadableTextColor(colorHex), [colorHex]);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight - 90)}px`;
  }, [body, minHeight]);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "evidence-document",
      title,
      body,
      colorHex,
    });
  }, [body, colorHex, nodeId, storage, title]);

  const onTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
  };

  const onBodyChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setBody(event.target.value);
  };

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="evidence-document"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`evidence-doc ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: "24px 20px 20px 20px",
        borderRadius: "4px",
        borderTop: `6px solid ${textColor === "#1a1a1a" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)"}`,
        boxShadow: "0 12px 32px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.1) inset, 0 1px 2px rgba(255,255,255,0.4) inset",
        background: `linear-gradient(180deg, ${colorHex} 0%, ${getReadableTextColor(textColor) === "#1a1a1a" ? '#ffffff' : '#000000'}15 100%)`,
        backgroundColor: colorHex,
        color: textColor,
        position: "relative",
        backgroundImage: `radial-gradient(${textColor}15 1px, transparent 1px)`,
        backgroundSize: "20px 20px",
        ...style,
      }}
    >
      <div style={{
        position: 'absolute',
        top: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 32,
        height: 12,
        background: 'rgba(255, 255, 255, 0.4)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        borderRadius: 2,
        transformOrigin: "center",
        zIndex: 10,
        backdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.2)"
      }}></div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          borderBottom: `2px double ${textColor}33`,
          paddingBottom: 8,
        }}
      >
        <input
          data-node-interactive="true"
          value={title}
          onChange={onTitleChange}
          placeholder="CONFIDENTIAL DOCUMENT"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 22,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "inherit",
            fontFamily: "'Playfair Display', serif",
            textShadow: `0 1px 0px ${textColor}22`
          }}
        />
        <input
          data-node-interactive="true"
          type="color"
          value={colorHex}
          onChange={(event) => setColorHex(event.target.value)}
          aria-label="Evidence document color"
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            border: `2px solid ${textColor}44`,
            cursor: "pointer",
            background: "transparent",
            padding: 0,
          }}
        />
      </div>
      <textarea
        ref={bodyRef}
        data-node-interactive="true"
        value={body}
        onChange={onBodyChange}
        placeholder="[Redacted] entered the premises at 22:40..."
        style={{
          width: "100%",
          minHeight: minHeight - 90,
          border: "none",
          outline: "none",
          resize: "none",
          overflow: "hidden",
          background: "transparent",
          color: "inherit",
          lineHeight: 1.6,
          fontSize: 15,
          fontFamily: "'Special Elite', monospace",
          cursor: "text",
        }}
      />
    </DraggableNode>
  );
}
