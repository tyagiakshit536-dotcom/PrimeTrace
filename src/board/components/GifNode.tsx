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
import { blobToDataUrl, dataUrlToBlob } from "../utils/imageCompression";
import {
  isNumber,
  isString,
  patchNodeMeta,
  readNodeMeta,
  resolveInitialValue,
} from "../storage/nodeState";

export interface GifNodeProps {
  nodeId: string;
  storage: BoardStorage;
  initialX?: number;
  initialY?: number;
  initialZIndex?: number;
  initialLabel?: string;
  initialColorHex?: string;
  bounds?: DragBounds;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 220;
const DEFAULT_COLOR = "#8c8c8c";

export function GifNode({
  nodeId,
  storage,
  initialX = 0,
  initialY = 0,
  initialZIndex,
  initialLabel = "GIF",
  initialColorHex = DEFAULT_COLOR,
  bounds,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
  style,
}: GifNodeProps) {
  const persistedMeta = useMemo(() => readNodeMeta(storage, nodeId), [storage, nodeId]);
  const initialBlobKey = useMemo(
    () => persistedMeta?.blobKey ?? `${nodeId}:gif`,
    [nodeId, persistedMeta?.blobKey]
  );

  const [blobKey, setBlobKey] = useState(initialBlobKey);
  const [label, setLabel] = useState(() =>
    resolveInitialValue(persistedMeta?.title, initialLabel, isString)
  );
  const [colorHex, setColorHex] = useState(() =>
    resolveInitialValue(persistedMeta?.colorHex, initialColorHex, isString)
  );
  const [gifDataUrl, setGifDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const hydrateGif = async () => {
      try {
        const blob = await storage.getBlob(blobKey);
        if (!blob || !isMounted) {
          return;
        }

        const dataUrl = await blobToDataUrl(blob);
        if (isMounted) {
          setGifDataUrl(dataUrl);
        }
      } catch {
        if (isMounted) {
          setError("!");
        }
      }
    };

    void hydrateGif();

    return () => {
      isMounted = false;
    };
  }, [blobKey, storage]);

  useEffect(() => {
    patchNodeMeta(storage, nodeId, {
      id: nodeId,
      nodeType: "gif-node",
      title: label,
      colorHex,
      blobKey,
    });
  }, [blobKey, colorHex, label, nodeId, storage]);

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.includes("gif")) {
        setError("GIF");
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

            reject(new Error("GIF decode failed."));
          };
          reader.onerror = () => reject(reader.error ?? new Error("GIF read failed."));
          reader.readAsDataURL(file);
        });

        const nextBlobKey = `${nodeId}:gif`;
        await storage.setBlob(nextBlobKey, dataUrlToBlob(dataUrl));

        patchNodeMeta(storage, nodeId, {
          id: nodeId,
          nodeType: "gif-node",
          blobKey: nextBlobKey,
          imageMimeType: file.type,
        });

        setBlobKey(nextBlobKey);
        setGifDataUrl(dataUrl);
      } catch {
        setError("!");
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
      nodeType="gif-node"
      storage={storage}
      initialX={resolveInitialValue(persistedMeta?.x, initialX, isNumber)}
      initialY={resolveInitialValue(persistedMeta?.y, initialY, isNumber)}
      initialZIndex={resolveInitialValue(persistedMeta?.zIndex, initialZIndex, isNumber)}
      bounds={bounds}
      className={`gif-node ${className || ""}`}
      style={{
        width,
        height,
        padding: 10,
        border: `1px solid ${colorHex}`,
        background: "rgba(16,16,16,0.95)",
        ...style,
      }}
    >
      <div style={{ width: "100%", height: "100%", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            data-node-interactive="true"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="GIF"
            style={{
              flex: 1,
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.16)",
              background: "transparent",
              color: "rgba(240,240,240,0.95)",
              outline: "none",
              paddingBottom: 4,
              fontFamily: "inherit",
              fontSize: 13,
            }}
          />
          <input
            data-node-interactive="true"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
            aria-label="GIF node color"
            style={{ width: 30, height: 22, border: "none", background: "transparent", padding: 0 }}
          />
        </div>

        <label
          data-node-interactive="true"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "calc(100% - 30px)",
            borderRadius: 6,
            overflow: "hidden",
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <input
            data-node-interactive="true"
            type="file"
            accept="image/gif"
            onChange={onFileChange}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
          />

          {gifDataUrl ? (
            <img
              src={gifDataUrl}
              alt={label || "GIF"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ color: "rgba(238,238,238,0.75)", fontSize: 18, letterSpacing: "0.08em" }}>
              {isLoading ? "Loading" : "GIF"}
              {error ? ` ${error}` : ""}
            </div>
          )}
        </label>
      </div>
    </DraggableNode>
  );
}
