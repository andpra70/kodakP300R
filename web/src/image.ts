import type { PrinterProfile } from "./models";

export interface CropTransform { zoom: number; offsetX: number; offsetY: number }

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export function renderImage(bitmap: ImageBitmap, profile: PrinterProfile, fit: boolean, canvas: HTMLCanvasElement, transform: CropTransform): CropTransform {
  canvas.width = profile.width;
  canvas.height = profile.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D non disponibile");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const baseScale = fit ? Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height) : Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const zoom = fit ? 1 : Math.max(0.25, transform.zoom);
  const width = bitmap.width * baseScale * zoom;
  const height = bitmap.height * baseScale * zoom;
  // When the image is larger, prevent exposing empty paper on that axis. When
  // it is smaller, allow positioning it anywhere while keeping it on-paper.
  const maxOffsetX = fit ? 0 : Math.abs(width - canvas.width) / 2;
  const maxOffsetY = fit ? 0 : Math.abs(height - canvas.height) / 2;
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, transform.offsetX));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, transform.offsetY));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, (canvas.width - width) / 2 + offsetX, (canvas.height - height) / 2 + offsetY, width, height);
  return { zoom, offsetX, offsetY };
}

export async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("Codifica JPEG fallita")), "image/jpeg", 0.95,
  ));
  return new Uint8Array(await blob.arrayBuffer());
}
