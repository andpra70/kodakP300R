import "./style.css";
import { applyAutoWhiteBalance, applyColorAdjustments, encodeJpeg, loadBitmap, renderImage, type CropTransform } from "./image";
import { profiles, type ModelName } from "./models";
import { print, type PrintPass } from "./ppvp";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header><span class="eyebrow">KODAK · PPVP</span><h1>K Print</h1><p>Stampa diretta Bluetooth dalla tua scrivania.</p></header>
  <section class="workspace">
    <div id="drop-zone" class="preview-wrap">
      <canvas id="preview" aria-label="Anteprima di stampa"></canvas>
      <div id="empty" class="empty"><span>+</span><strong>Scegli o trascina una fotografia</strong><small>JPEG, PNG o WebP</small></div>
    </div>
    <div class="controls">
      <label class="upload">Carica immagine<input id="file" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <label>Modello<select id="model"><option value="p300r">Kodak P300R · 896 × 896</option><option value="p210r">Kodak P210R · 640 × 1024</option></select></label>
      <label class="switch"><input id="fit" type="checkbox" checked /><span></span><div><strong>Foto intera</strong><small>Aggiunge margini bianchi senza tagliare</small></div></label>
      <label class="switch"><input id="awb" type="checkbox" /><span></span><div><strong>Correzione colore AWB</strong><small>Neutralizza automaticamente le dominanti cromatiche</small></div></label>
      <div class="adjust-controls">
        <label>Saturazione <output id="saturation-value">100%</output><input id="saturation" type="range" min="0" max="200" value="100" /></label>
        <label>Luminosità <output id="brightness-value">100%</output><input id="brightness" type="range" min="50" max="150" value="100" /></label>
        <label>Contrasto <output id="contrast-value">100%</output><input id="contrast" type="range" min="50" max="150" value="100" /></label>
        <button id="reset-color" class="compact" type="button">Ripristina colore</button>
      </div>
      <div id="crop-controls" class="crop-controls" hidden>
        <label>Zoom <output id="zoom-value">100%</output><input id="zoom" type="range" min="0.25" max="3" step="0.01" value="1" /></label>
        <button id="reset-crop" class="compact" type="button">Ricentra immagine</button>
        <small>Trascina la foto nell’anteprima per scegliere l’inquadratura.</small>
      </div>
      <div class="connection"><span id="dot"></span><div><strong id="connection-label">Stampante non collegata</strong><small>Chrome desktop 117 o successivo</small></div></div>
      <button id="connect" class="secondary">Collega stampante</button>
      <button id="print" class="primary" disabled>Stampa fotografia</button>
      <div id="print-progress" class="print-progress" hidden>
        <div class="pass pass-yellow"><span></span><strong>Giallo</strong></div>
        <div class="pass pass-magenta"><span></span><strong>Magenta</strong></div>
        <div class="pass pass-cyan"><span></span><strong>Ciano</strong></div>
        <div class="pass pass-protect"><span></span><strong>Protezione</strong></div>
      </div>
      <p id="status" role="status">Associa prima la Kodak nelle impostazioni Bluetooth del computer.</p>
      <details><summary>Log protocollo</summary><pre id="log"></pre></details>
    </div>
  </section>
  <footer>Bluetooth Classic SPP · elaborazione locale · nessun upload</footer>`;

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const modelSelect = document.querySelector<HTMLSelectElement>("#model")!;
const fitInput = document.querySelector<HTMLInputElement>("#fit")!;
const awbInput = document.querySelector<HTMLInputElement>("#awb")!;
const saturationInput = document.querySelector<HTMLInputElement>("#saturation")!;
const brightnessInput = document.querySelector<HTMLInputElement>("#brightness")!;
const contrastInput = document.querySelector<HTMLInputElement>("#contrast")!;
const saturationValue = document.querySelector<HTMLOutputElement>("#saturation-value")!;
const brightnessValue = document.querySelector<HTMLOutputElement>("#brightness-value")!;
const contrastValue = document.querySelector<HTMLOutputElement>("#contrast-value")!;
const resetColorButton = document.querySelector<HTMLButtonElement>("#reset-color")!;
const cropControls = document.querySelector<HTMLDivElement>("#crop-controls")!;
const zoomInput = document.querySelector<HTMLInputElement>("#zoom")!;
const zoomValue = document.querySelector<HTMLOutputElement>("#zoom-value")!;
const resetCropButton = document.querySelector<HTMLButtonElement>("#reset-crop")!;
const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const dropZone = document.querySelector<HTMLDivElement>("#drop-zone")!;
const empty = document.querySelector<HTMLDivElement>("#empty")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const printButton = document.querySelector<HTMLButtonElement>("#print")!;
const printProgress = document.querySelector<HTMLDivElement>("#print-progress")!;
const passElements = [...printProgress.querySelectorAll<HTMLElement>(".pass")];
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection-label")!;
const dot = document.querySelector<HTMLElement>("#dot")!;
const logElement = document.querySelector<HTMLPreElement>("#log")!;

let port: SerialPort | undefined;
let jpeg: Uint8Array | undefined;
let busy = false;
let selectedFile: File | undefined;
let bitmap: ImageBitmap | undefined;
let transform: CropTransform = { zoom: 1, offsetX: 0, offsetY: 0 };
let dragStart: { x: number; y: number; offsetX: number; offsetY: number } | undefined;
let encodeTimer: number | undefined;

const log = (line: string) => {
  logElement.textContent += `${new Date().toLocaleTimeString()} ${line}\n`;
  logElement.scrollTop = logElement.scrollHeight;
};
function setStatus(message: string, error = false) { status.textContent = message; status.classList.toggle("error", error); }
function updatePrintButton() { printButton.disabled = busy || !port || !jpeg; connectButton.disabled = busy; }
function invalidatePreparedImage() { jpeg = undefined; updatePrintButton(); }

const passLabels = ["Giallo", "Magenta", "Ciano", "Protezione"] as const;

function resetPrintProgress() {
  printProgress.hidden = false;
  passElements.forEach((element) => element.classList.remove("active", "complete"));
}

function updatePrintProgress(pass: PrintPass) {
  passElements.forEach((element, index) => {
    element.classList.toggle("complete", index < pass);
    element.classList.toggle("active", index === pass);
  });
  setStatus(`Passata ${pass + 1} di 4 · ${passLabels[pass]}`);
}

function renderPreview(applyCorrection = true) {
  if (!bitmap) return;
  transform = renderImage(bitmap, profiles[modelSelect.value as ModelName], fitInput.checked, canvas, transform);
  if (applyCorrection) {
    if (awbInput.checked) applyAutoWhiteBalance(canvas);
    applyColorAdjustments(canvas, {
      saturation: Number(saturationInput.value) / 100,
      brightness: Number(brightnessInput.value) / 100,
      contrast: Number(contrastInput.value) / 100,
    });
  }
  zoomInput.value = String(transform.zoom);
  zoomValue.value = `${Math.round(transform.zoom * 100)}%`;
  cropControls.hidden = fitInput.checked;
  canvas.classList.toggle("editable", !fitInput.checked);
}
async function encodePreview() {
  if (!bitmap) return;
  renderPreview();
  jpeg = await encodeJpeg(canvas);
  setStatus(`Immagine pronta · ${(jpeg.length / 1024).toFixed(0)} KiB · JPEG sRGB${awbInput.checked ? " · AWB" : ""}`);
  updatePrintButton();
}
function scheduleEncode() {
  if (encodeTimer !== undefined) window.clearTimeout(encodeTimer);
  encodeTimer = window.setTimeout(() => void encodePreview().catch((error) => setStatus(String(error), true)), 120);
}
async function refreshImage(reload = false) {
  const file = selectedFile ?? fileInput.files?.[0];
  if (!file) return;
  const profile = profiles[modelSelect.value as ModelName];
  setStatus(`Preparazione ${profile.width} × ${profile.height}…`);
  if (reload || !bitmap) {
    const nextBitmap = await loadBitmap(file);
    bitmap?.close();
    bitmap = nextBitmap;
    transform = { zoom: 1, offsetX: 0, offsetY: 0 };
  }
  renderPreview();
  jpeg = await encodeJpeg(canvas);
  empty.hidden = true;
  canvas.hidden = false;
  setStatus(`Immagine pronta · ${(jpeg.length / 1024).toFixed(0)} KiB · JPEG sRGB${awbInput.checked ? " · AWB" : ""}`);
  updatePrintButton();
}

fileInput.addEventListener("change", () => { selectedFile = fileInput.files?.[0]; void refreshImage(true).catch((error) => setStatus(String(error), true)); });
modelSelect.addEventListener("change", () => void refreshImage().catch((error) => setStatus(String(error), true)));
fitInput.addEventListener("change", () => { invalidatePreparedImage(); void encodePreview().catch((error) => setStatus(String(error), true)); });
awbInput.addEventListener("change", () => { invalidatePreparedImage(); void encodePreview().catch((error) => setStatus(String(error), true)); });
for (const [input, output] of [
  [saturationInput, saturationValue],
  [brightnessInput, brightnessValue],
  [contrastInput, contrastValue],
] as const) input.addEventListener("input", () => {
  output.value = `${input.value}%`;
  invalidatePreparedImage();
  renderPreview(false);
  scheduleEncode();
});
resetColorButton.addEventListener("click", () => {
  saturationInput.value = brightnessInput.value = contrastInput.value = "100";
  saturationValue.value = brightnessValue.value = contrastValue.value = "100%";
  invalidatePreparedImage();
  void encodePreview().catch((error) => setStatus(String(error), true));
});
zoomInput.addEventListener("input", () => { invalidatePreparedImage(); transform.zoom = Number(zoomInput.value); renderPreview(false); scheduleEncode(); });
resetCropButton.addEventListener("click", () => { transform = { zoom: 1, offsetX: 0, offsetY: 0 }; void encodePreview().catch((error) => setStatus(String(error), true)); });

canvas.addEventListener("wheel", (event) => {
  if (fitInput.checked || busy || !bitmap) return;
  event.preventDefault();
  invalidatePreparedImage();

  const rect = canvas.getBoundingClientRect();
  const pointerX = (event.clientX - rect.left) * canvas.width / rect.width;
  const pointerY = (event.clientY - rect.top) * canvas.height / rect.height;
  const oldZoom = transform.zoom;
  const deltaPixels = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1);
  const newZoom = Math.max(0.25, Math.min(3, oldZoom * Math.exp(-deltaPixels * 0.0015)));
  const ratio = newZoom / oldZoom;
  const centerX = canvas.width / 2 + transform.offsetX;
  const centerY = canvas.height / 2 + transform.offsetY;

  transform.zoom = newZoom;
  transform.offsetX = ratio * centerX + (1 - ratio) * pointerX - canvas.width / 2;
  transform.offsetY = ratio * centerY + (1 - ratio) * pointerY - canvas.height / 2;
  renderPreview(false);
  scheduleEncode();
}, { passive: false });

canvas.addEventListener("pointerdown", (event) => {
  if (fitInput.checked || busy || !bitmap) return;
  invalidatePreparedImage();
  canvas.setPointerCapture(event.pointerId);
  dragStart = { x: event.clientX, y: event.clientY, offsetX: transform.offsetX, offsetY: transform.offsetY };
  canvas.classList.add("moving");
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragStart || fitInput.checked) return;
  const rect = canvas.getBoundingClientRect();
  transform.offsetX = dragStart.offsetX + (event.clientX - dragStart.x) * canvas.width / rect.width;
  transform.offsetY = dragStart.offsetY + (event.clientY - dragStart.y) * canvas.height / rect.height;
  renderPreview(false);
});
const finishDrag = () => {
  if (!dragStart) return;
  dragStart = undefined;
  canvas.classList.remove("moving");
  void encodePreview().catch((error) => setStatus(String(error), true));
};
canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", finishDrag);

for (const eventName of ["dragenter", "dragover"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); if (!busy) dropZone.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove("dragging"); });
dropZone.addEventListener("drop", (event) => {
  if (busy) return;
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { setStatus("Il file trascinato non è un’immagine supportata.", true); return; }
  selectedFile = file;
  void refreshImage(true).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
});

connectButton.addEventListener("click", async () => {
  if (!("serial" in navigator)) { setStatus("Web Serial non disponibile: usa Chrome/Chromium desktop 117 o successivo.", true); return; }
  try {
    if (port) {
      await port.close(); port = undefined; connectionLabel.textContent = "Stampante non collegata"; connectButton.textContent = "Collega stampante"; dot.classList.remove("online"); updatePrintButton(); return;
    }
    setStatus("Seleziona il servizio Serial Port della Kodak…");
    port = await navigator.serial.requestPort({ filters: [{ bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb" }] });
    const info = port.getInfo();
    await port.open({ baudRate: 115200, bufferSize: 1 << 20 });
    log(`Porta aperta · servizio ${info.bluetoothServiceClassId ?? "seriale"}`);
    connectionLabel.textContent = "Kodak collegata"; connectButton.textContent = "Disconnetti"; dot.classList.add("online"); setStatus("Collegamento RFCOMM pronto."); updatePrintButton();
  } catch (error) { port = undefined; setStatus(error instanceof Error ? error.message : String(error), true); updatePrintButton(); }
});

printButton.addEventListener("click", async () => {
  if (!port || !jpeg) return;
  busy = true;
  updatePrintButton();
  logElement.textContent = "";
  resetPrintProgress();
  setStatus("Trasferimento della fotografia alla stampante…");
  try {
    await print(port, jpeg, log, updatePrintProgress);
    passElements.forEach((element) => {
      element.classList.remove("active");
      element.classList.add("complete");
    });
    setStatus("Stampa completata. Attendi l’espulsione definitiva.");
  }
  catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    try { await port.close(); } catch { /* La porta può essere già chiusa. */ }
    port = undefined; connectionLabel.textContent = "Stampante non collegata"; connectButton.textContent = "Collega stampante"; dot.classList.remove("online");
  } finally { busy = false; updatePrintButton(); }
});

canvas.hidden = true;
if (!("serial" in navigator)) setStatus("Serve Chrome/Chromium desktop 117+ con Web Serial.", true);
async function loadDefaultImage() {
  setStatus("Caricamento immagine di test…");
  const response = await fetch(`${import.meta.env.BASE_URL}test.jpg`);
  if (!response.ok) throw new Error(`Impossibile caricare l'immagine predefinita (${response.status}).`);
  selectedFile = new File([await response.blob()], "test.jpg", { type: "image/jpeg" });
  await refreshImage(true);
}
void loadDefaultImage().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
