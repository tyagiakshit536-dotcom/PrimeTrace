import {
  CSSProperties,
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BoardStorage } from "../../storage";
import { DraggableNode, DragBounds } from "./DraggableNode";
import { blobToDataUrl } from "../utils/imageCompression";
import {
  isNumber,
  isString,
  patchNodeMeta,
  readNodeMeta,
  resolveInitialValue,
} from "../storage/nodeState";

export interface VideoEvidenceNodeProps {
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
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 290;
const DEFAULT_COLOR = "#7b7568";

interface VideoSettings {
  muted: boolean;
}

function parseVideoSettings(value: unknown): VideoSettings {
  if (typeof value !== "string") {
    return { muted: false };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      muted: parsed.muted === true,
    };
  } catch {
    return { muted: false };
  }
}

export function VideoEvidenceNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTitle = "Video Evidence",
  initialSummary = "",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
}: VideoEvidenceNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const initialBlobKey = useMemo(
    () => persistedMeta?.blobKey ?? `${nodeId}:video`,
    [nodeId, persistedMeta?.blobKey]
  );
  const initialSettings = useMemo(
    () => parseVideoSettings(persistedMeta?.text),
    [persistedMeta?.text]
  );

  const [title, setTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialTitle, isString)
  );
  const [summary, setSummary] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialSummary, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [blobKey, setBlobKey] = useState(initialBlobKey);
  const [muted, setMuted] = useState(initialSettings.muted);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "video-evidence",
      title,
      body: summary,
      colorHex,
      blobKey,
      text: JSON.stringify({ muted }),
    });
  }, [blobKey, colorHex, muted, nodeId, storage, summary, title]);

  useEffect(() => {
    let isMounted = true;

    const hydrateVideo = async () => {
      try {
        const blob = await storage.getBlob(blobKey);
        if (!blob || !isMounted) {
          if (isMounted) {
            setVideoDataUrl(null);
          }
          return;
        }

        const dataUrl = await blobToDataUrl(blob);
        if (isMounted) {
          setVideoDataUrl(dataUrl);
        }
      } catch {
        if (isMounted) {
          setVideoDataUrl(null);
          setError("Unable to restore saved video.");
        }
      }
    };

    void hydrateVideo();

    return () => {
      isMounted = false;
    };
  }, [blobKey, storage]);

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.startsWith("video/")) {
        setError("Select a valid video file.");
        event.target.value = "";
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }

            reject(new Error("Video decode failed."));
          };
          reader.onerror = () => reject(reader.error ?? new Error("Video read failed."));
          reader.readAsDataURL(file);
        });

        const nextBlobKey = `${nodeId}:video`;
        await storage.setBlob(nextBlobKey, file);

        patchNodeMeta(storage, nodeId, {
          id: nodeId,
          nodeType: "video-evidence",
          blobKey: nextBlobKey,
          imageMimeType: file.type,
        });

        setBlobKey(nextBlobKey);
        setVideoDataUrl(dataUrl);
      } catch {
        setError("Video upload failed.");
      } finally {
        setIsLoading(false);
        event.target.value = "";
      }
    },
    [nodeId, storage]
  );

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="video-evidence"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`video-evidence-node ${className || ""}`}
      style={{
        width,
        height,
        padding: 10,
        border: `1px solid ${colorHex}`,
        background: "linear-gradient(180deg, rgba(22, 20, 18, 0.97), rgba(12, 10, 8, 0.98))",
        ...style,
      }}
    >
      <div style={{ width: "100%", height: "100%", display: "grid", gap: 8, color: "rgba(245, 239, 230, 0.92)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Video title"
            style={{
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "inherit",
              outline: "none",
              fontFamily: "inherit",
              fontWeight: 600,
              paddingBottom: 5,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Video node accent color"
            style={{ width: 30, height: 24, border: "none", background: "transparent", padding: 0 }}
          />
        </div>

        <label
          data-node-interactive="true"
          style={{
            border: "1px dashed rgba(255,255,255,0.24)",
            borderRadius: 8,
            padding: "6px 10px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: "0.03em",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <input
            data-node-interactive="true"
            type="file"
            accept="video/*"
            onChange={onFileChange}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
          {isLoading ? "Processing video..." : "Upload Video"}
        </label>

        <div
          style={{
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.14)",
            overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
            flex: 1,
            minHeight: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {videoDataUrl ? (
            <video
              data-node-interactive="true"
              controls
              playsInline
              muted={muted}
              src={videoDataUrl}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
            />
          ) : (
            <div style={{ fontSize: 12, color: "rgba(246, 236, 222, 0.7)" }}>
              No video attached yet.
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input
              data-node-interactive="true"
              type="checkbox"
              checked={muted}
              onChange={(event) => setMuted(event.target.checked)}
            />
            Start muted
          </label>
          <textarea
            data-node-interactive="true"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Scene notes"
            style={{
              flex: 1,
              minHeight: 52,
              resize: "vertical",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              padding: 6,
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.38,
            }}
          />
        </div>

        {error ? <div style={{ fontSize: 12, color: "rgba(255, 180, 180, 0.92)" }}>{error}</div> : null}
      </div>
    </DraggableNode>
  );
}
