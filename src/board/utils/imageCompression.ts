export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputMimeType?: "image/jpeg" | "image/webp" | "image/png";
}

const DEFAULT_IMAGE_OPTIONS: Required<ImageCompressionOptions> = {
  maxWidth: 1600,
  maxHeight: 1200,
  quality: 0.78,
  outputMimeType: "image/jpeg",
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to decode selected image."));
    };

    image.src = objectUrl;
  });
}

function getTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);

  return {
    width: Math.max(1, Math.round(sourceWidth * ratio)),
    height: Math.max(1, Math.round(sourceHeight * ratio)),
  };
}

export async function compressImageFileToBase64(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<string> {
  const { maxWidth, maxHeight, quality, outputMimeType } = {
    ...DEFAULT_IMAGE_OPTIONS,
    ...options,
  };

  const image = await loadImage(file);
  const { width, height } = getTargetDimensions(
    image.naturalWidth,
    image.naturalHeight,
    maxWidth,
    maxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable.");
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(outputMimeType, quality);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",");
  const mimeMatch = /data:(.*?);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to create data URL from blob."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read blob."));
    };

    reader.readAsDataURL(blob);
  });
}
