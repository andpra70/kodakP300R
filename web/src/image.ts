import type { PrinterProfile } from "./models";

export interface CropTransform { zoom: number; offsetX: number; offsetY: number }
export interface ColorAdjustments { saturation: number; brightness: number; contrast: number }

const srgbToLinear = Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

function linearToSrgb(channel: number): number {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

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

/** Robust gray-world AWB calculated in linear-light RGB. */
export function applyAutoWhiteBalance(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D non disponibile");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  let red = 0, green = 0, blue = 0, samples = 0;

  // Sample every fourth pixel. Ignore shadows, clipped highlights and strongly
  // saturated colors, which are poor illuminant estimators.
  for (let offset = 0; offset < pixels.length; offset += 16) {
    const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const darkest = Math.min(r, g, b);
    const brightest = Math.max(r, g, b);
    if (darkest < 12 || brightest > 247 || brightest - darkest > 120) continue;
    red += srgbToLinear[r];
    green += srgbToLinear[g];
    blue += srgbToLinear[b];
    samples++;
  }
  if (samples < 64) return;

  red /= samples;
  green /= samples;
  blue /= samples;
  const target = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const clampGain = (gain: number) => Math.max(0.75, Math.min(1.33, gain));
  const gains = [clampGain(target / red), clampGain(target / green), clampGain(target / blue)];
  const luts = gains.map((gain) => srgbToLinear.map((value) => linearToSrgb(value * gain)));

  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = luts[0][pixels[offset]];
    pixels[offset + 1] = luts[1][pixels[offset + 1]];
    pixels[offset + 2] = luts[2][pixels[offset + 2]];
  }
  context.putImageData(image, 0, 0);
}

export function applyColorAdjustments(canvas: HTMLCanvasElement, adjustments: ColorAdjustments): void {
  const { saturation, brightness, contrast } = adjustments;
  if (saturation === 1 && brightness === 1 && contrast === 1) return;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D non disponibile");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

  for (let offset = 0; offset < pixels.length; offset += 4) {
    let r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    // Keep the paper background white when "Foto intera" adds margins.
    if (r === 255 && g === 255 && b === 255) continue;
    r = (r * brightness - 127.5) * contrast + 127.5;
    g = (g * brightness - 127.5) * contrast + 127.5;
    b = (b * brightness - 127.5) * contrast + 127.5;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    pixels[offset] = clamp(luminance + (r - luminance) * saturation);
    pixels[offset + 1] = clamp(luminance + (g - luminance) * saturation);
    pixels[offset + 2] = clamp(luminance + (b - luminance) * saturation);
  }
  context.putImageData(image, 0, 0);
}

export async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("Codifica JPEG fallita")), "image/jpeg", 0.95,
  ));
  return new Uint8Array(await blob.arrayBuffer());
}
