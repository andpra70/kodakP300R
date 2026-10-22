import type { PrinterProfile } from "./models";

export async function prepareImage(
  file: File,
  profile: PrinterProfile,
  fit: boolean,
  canvas: HTMLCanvasElement,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    canvas.width = profile.width;
    canvas.height = profile.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D non disponibile");

    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = fit
      ? Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height)
      : Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Codifica JPEG fallita")), "image/jpeg", 0.95);
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
