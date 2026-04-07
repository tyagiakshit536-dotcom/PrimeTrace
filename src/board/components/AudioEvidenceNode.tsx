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

export interface AudioEvidenceNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialTitle?: string;
  initialTranscript?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_MIN_HEIGHT = 232;
const DEFAULT_COLOR = "#687f95";

interface AudioSettings {
  loop: boolean;
}

function parseAudioSettings(value: unknown): AudioSettings {
  if (typeof value !== "string") {
    return { loop: false };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      loop: parsed.loop === true,
    };
  } catch {
    return { loop: false };
  }
}

export function AudioEvidenceNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialTitle = "Audio Evidence",
  initialTranscript = "",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  className,
  style,
}: AudioEvidenceNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const initialBlobKey = useMemo(
    () => persistedMeta?.blobKey ?? `${nodeId}:audio`,
    [nodeId, persistedMeta?.blobKey]
  );

  const initialSettings = useMemo(
    () => parseAudioSettings(persistedMeta?.text),
    [persistedMeta?.text]
  );

  const [title, setTitle] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialTitle, isString)
  );
  const [transcript, setTranscript] = useState(() =>
    resolveInitialValue(persistedMeta?.body, initialTranscript, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [blobKey, setBlobKey] = useState(initialBlobKey);
  const [loopPlayback, setLoopPlayback] = useState(initialSettings.loop);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "audio-evidence",
      title,
      body: transcript,
      colorHex,
      blobKey,
      text: JSON.stringify({ loop: loopPlayback }),
    });
  }, [blobKey, colorHex, loopPlayback, nodeId, storage, title, transcript]);

  useEffect(() => {
    let isMounted = true;

    const hydrateAudio = async () => {
      try {
        const blob = await storage.getBlob(blobKey);
        if (!blob || !isMounted) {
          if (isMounted) {
            setAudioDataUrl(null);
          }
          return;
        }

        const dataUrl = await blobToDataUrl(blob);
        if (isMounted) {
          setAudioDataUrl(dataUrl);
        }
      } catch {
        if (isMounted) {
          setAudioDataUrl(null);
          setError("Unable to restore saved audio.");
        }
      }
    };

    void hydrateAudio();

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

      if (!file.type.startsWith("audio/")) {
        setError("Select a valid audio file.");
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

            reject(new Error("Audio decode failed."));
          };
          reader.onerror = () => reject(reader.error ?? new Error("Audio read failed."));
          reader.readAsDataURL(file);
        });

        const nextBlobKey = `${nodeId}:audio`;
        await storage.setBlob(nextBlobKey, file);

        patchNodeMeta(storage, nodeId, {
          id: nodeId,
          nodeType: "audio-evidence",
          blobKey: nextBlobKey,
          imageMimeType: file.type,
        });

        setBlobKey(nextBlobKey);
        setAudioDataUrl(dataUrl);
      } catch {
        setError("Audio upload failed.");
      } finally {
        setIsLoading(false);
        event.target.value = "";
      }
    },
    [nodeId, storage]
  );

  const onClearAudio = useCallback(async () => {
    try {
      await storage.removeBlob(blobKey);
      setAudioDataUrl(null);
    } catch {
      setError("Could not clear audio file.");
    }
  }, [blobKey, storage]);

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="audio-evidence"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`audio-evidence-node ${className || ""}`}
      style={{
        width,
        minHeight,
        padding: 14,
        border: `1px solid ${colorHex}`,
        background: "linear-gradient(180deg, rgba(17, 21, 28, 0.97), rgba(10, 12, 17, 0.98))",
        ...style,
      }}
    >
      <div style={{ display: "grid", gap: 10, color: "rgba(238, 244, 252, 0.92)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input
            data-node-interactive="true"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Audio title"
            style={{
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "inherit",
              outline: "none",
              fontFamily: "inherit",
              fontWeight: 600,
              paddingBottom: 6,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="Audio node accent color"
            style={{ width: 30, height: 24, border: "none", background: "transparent", padding: 0 }}
          />
        </div>

        <label
          data-node-interactive="true"
          style={{
            border: "1px dashed rgba(255,255,255,0.24)",
            borderRadius: 8,
            padding: "8px 10px",
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
            accept="audio/*"
            onChange={onFileChange}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
          {isLoading ? "Processing audio..." : "Upload Audio"}
        </label>

        {audioDataUrl ? (
          <audio
            data-node-interactive="true"
            controls
            preload="metadata"
            loop={loopPlayback}
            src={audioDataUrl}
            style={{ width: "100%" }}
          />
        ) : (
          <div
            style={{
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.03)",
              padding: 10,
              fontSize: 12,
              color: "rgba(227, 236, 247, 0.72)",
            }}
          >
            No audio attached yet.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input
              data-node-interactive="true"
              type="checkbox"
              checked={loopPlayback}
              onChange={(event) => setLoopPlayback(event.target.checked)}
            />
            Loop playback
          </label>
          <button
            data-node-interactive="true"
            type="button"
            onClick={() => void onClearAudio()}
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            Clear Audio
          </button>
        </div>

        <textarea
          data-node-interactive="true"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Transcript / analyst notes"
          style={{
            width: "100%",
            minHeight: 82,
            resize: "vertical",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
            padding: 8,
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.42,
          }}
        />

        {error ? (
          <div style={{ fontSize: 12, color: "rgba(255, 180, 180, 0.92)" }}>{error}</div>
        ) : null}
      </div>
    </DraggableNode>
  );
}
