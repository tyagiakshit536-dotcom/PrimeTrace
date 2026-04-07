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
import {
  compressImageFileToBase64,
  dataUrlToBlob,
  blobToDataUrl,
} from "../utils/imageCompression";
import {
  isNumber,
  patchNodeMeta,
  readNodeMeta,
  resolveInitialValue,
} from "../storage/nodeState";

export interface PhotoDropNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 230;
const DEFAULT_FRAME_COLOR = "#f0ece4";

export function PhotoDropNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialColorHex = DEFAULT_FRAME_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
}: PhotoDropNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const initialBlobKey = useMemo(
    () => persistedMeta?.blobKey ?? `${nodeId}:image`,
    [nodeId, persistedMeta?.blobKey]
  );

  const [blobKey, setBlobKey] = useState(initialBlobKey);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [frameColorHex, setFrameColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, (value): value is string =>
      typeof value === "string"
    )
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "photo-drop",
      blobKey,
      colorHex: frameColorHex,
    });
  }, [blobKey, frameColorHex, nodeId, storage]);

  useEffect(() => {
    let isMounted = true;

    const hydrateImage = async () => {
      try {
        const blob = await storage.getBlob(blobKey);
        if (!blob || !isMounted) {
          return;
        }

        const dataUrl = await blobToDataUrl(blob);
        if (isMounted) {
          setImageBase64(dataUrl);
        }
      } catch {
        if (isMounted) {
          setError("Unable to restore saved image.");
        }
      }
    };

    hydrateImage();

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

      setError(null);
      setIsProcessing(true);

      try {
        const compressedBase64 = await compressImageFileToBase64(file, {
          maxWidth: 1600,
          maxHeight: 1200,
          quality: 0.78,
          outputMimeType: "image/jpeg",
        });

        const compressedBlob = dataUrlToBlob(compressedBase64);
        const nextBlobKey = `${nodeId}:image`;

        await storage.setBlob(nextBlobKey, compressedBlob);
        patchNodeMeta(storage, nodeId, {
          id: nodeId,
          nodeType: "photo-drop",
          blobKey: nextBlobKey,
          imageMimeType: compressedBlob.type,
          colorHex: frameColorHex,
        });

        setBlobKey(nextBlobKey);
        setImageBase64(compressedBase64);
      } catch {
        setError("Image compression failed.");
      } finally {
        setIsProcessing(false);
      }
    },
    [frameColorHex, nodeId, storage]
  );

  return (
    <DraggableNode
      nodeId={nodeId}
      nodeType="photo-drop"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`photo-drop ${className || ""}`}
      style={{
        width,
        height,
        padding: "16px 16px 40px 16px",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        background: `linear-gradient(160deg, ${frameColorHex} 0%, rgba(255,255,255,0.8) 100%)`,
        backgroundColor: frameColorHex,
        boxShadow: "0 10px 24px rgba(0,0,0,0.6), inset 0 0 10px rgba(0,0,0,0.05)",
        display: "flex",
        alignItems: "stretch",
        position: "relative",
        borderRadius: 4,
        ...style,
      }}
    >
      {/* Glossy photo effect overlay */}
      <div style={{
        position: 'absolute',
        top: 16, right: 16, bottom: 40, left: 16,
        background: 'linear-gradient(105deg, rgba(255,255,255,0.2) 0%, transparent 40%)',
        pointerEvents: 'none',
        zIndex: 5,
        borderRadius: 2
      }}></div>
      
      {/* Tape on top */}
      <div style={{
        position: 'absolute',
        top: -10,
        left: '50%',
        transform: 'translateX(-50%) rotate(-2deg)',
        width: 80,
        height: 24,
        background: 'rgba(255, 255, 255, 0.4)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        zIndex: 10,
        backdropFilter: "blur(2px)",
        border: "1px solid rgba(255, 255, 255, 0.3)"
      }}></div>

      <label
        data-node-interactive="true"
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 2,
          backgroundColor: "#1f1f1f",
          boxShadow: "inset 0 0 12px rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <input
          data-node-interactive="true"
          type="file"
          accept="image/*"
          onChange={onFileChange}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
        {imageBase64 ? (
          <img
            src={imageBase64}
            alt="Evidence"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              filter: "contrast(1.05) saturate(1.1) sepia(0.8)", // Slight cinematic look
            }}
          />
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "rgba(255, 255, 255, 0.72)",
              fontFamily: "'Inter', sans-serif",
              padding: "0 14px",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, letterSpacing: -0.5 }}>
              Insert Photograph
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, fontWeight: 500 }}>
              AUTO-PROCESSING ACTIVE
            </div>
            {isProcessing ? <div style={{ marginTop: 12, fontSize: 13, color: "#38bdf8", fontWeight: 600, animation: "neonPulse 1s infinite" }}>Processing Base64...</div> : null}
            {error ? <div style={{ marginTop: 12, fontSize: 13, color: "#ef4444", fontWeight: 600 }}>{error}</div> : null}
          </div>
        )}

        <div
          data-board-export-hidden="true"
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 8px",
            borderRadius: 8,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255, 255, 255, 0.9)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            zIndex: 20
          }}
        >
          Border
          <input
            data-node-interactive="true"
            type="color"
            value={frameColorHex}
            onChange={(event) => setFrameColorHex(event.target.value)}
            aria-label="Photo frame color"
            style={{
              width: 24,
              height: 24,
              border: "none",
              borderRadius: "50%",
              background: "transparent",
              padding: 0,
              cursor: "pointer"
            }}
          />
        </div>
      </label>
    </DraggableNode>
  );
}
