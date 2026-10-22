import "./style.css";
import { prepareImage } from "./image";
import { profiles, type ModelName } from "./models";
import { print } from "./ppvp";

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
      <div class="connection"><span id="dot"></span><div><strong id="connection-label">Stampante non collegata</strong><small>Chrome desktop 117 o successivo</small></div></div>
      <button id="connect" class="secondary">Collega stampante</button>
      <button id="print" class="primary" disabled>Stampa fotografia</button>
      <p id="status" role="status">Associa prima la Kodak nelle impostazioni Bluetooth del computer.</p>
      <details><summary>Log protocollo</summary><pre id="log"></pre></details>
    </div>
  </section>
  <footer>Bluetooth Classic SPP · elaborazione locale · nessun upload</footer>`;

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const modelSelect = document.querySelector<HTMLSelectElement>("#model")!;
const fitInput = document.querySelector<HTMLInputElement>("#fit")!;
const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const dropZone = document.querySelector<HTMLDivElement>("#drop-zone")!;
const empty = document.querySelector<HTMLDivElement>("#empty")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
const printButton = document.querySelector<HTMLButtonElement>("#print")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const connectionLabel = document.querySelector<HTMLElement>("#connection-label")!;
const dot = document.querySelector<HTMLElement>("#dot")!;
const logElement = document.querySelector<HTMLPreElement>("#log")!;

let port: SerialPort | undefined;
let jpeg: Uint8Array | undefined;
let busy = false;
let selectedFile: File | undefined;

const log = (line: string) => {
  logElement.textContent += `${new Date().toLocaleTimeString()} ${line}\n`;
  logElement.scrollTop = logElement.scrollHeight;
};

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function updatePrintButton() {
  printButton.disabled = busy || !port || !jpeg;
  connectButton.disabled = busy;
}

async function refreshImage() {
  const file = selectedFile ?? fileInput.files?.[0];
  if (!file) return;
  const profile = profiles[modelSelect.value as ModelName];
  setStatus(`Preparazione ${profile.width} × ${profile.height}…`);
  jpeg = await prepareImage(file, profile, fitInput.checked, canvas);
  empty.hidden = true;
  canvas.hidden = false;
  setStatus(`Immagine pronta · ${(jpeg.length / 1024).toFixed(0)} KiB · JPEG sRGB`);
  updatePrintButton();
}

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files?.[0];
  void refreshImage().catch((error) => setStatus(String(error), true));
});
modelSelect.addEventListener("change", () => refreshImage().catch((error) => setStatus(String(error), true)));
fitInput.addEventListener("change", () => refreshImage().catch((error) => setStatus(String(error), true)));

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!busy) dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => {
  if (busy) return;
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Il file trascinato non è un’immagine supportata.", true);
    return;
  }
  selectedFile = file;
  void refreshImage().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
});

connectButton.addEventListener("click", async () => {
  if (!("serial" in navigator)) {
    setStatus("Web Serial non disponibile: usa Chrome/Chromium desktop 117 o successivo.", true);
    return;
  }
  try {
    if (port) {
      await port.close();
      port = undefined;
      connectionLabel.textContent = "Stampante non collegata";
      connectButton.textContent = "Collega stampante";
      dot.classList.remove("online");
      updatePrintButton();
      return;
    }
    setStatus("Seleziona il servizio Serial Port della Kodak…");
    port = await navigator.serial.requestPort({
      filters: [{ bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb" }],
    });
    const info = port.getInfo();
    await port.open({ baudRate: 115200, bufferSize: 1 << 20 });
    log(`Porta aperta · servizio ${info.bluetoothServiceClassId ?? "seriale"}`);
    connectionLabel.textContent = "Kodak collegata";
    connectButton.textContent = "Disconnetti";
    dot.classList.add("online");
    setStatus("Collegamento RFCOMM pronto.");
    updatePrintButton();
  } catch (error) {
    port = undefined;
    setStatus(error instanceof Error ? error.message : String(error), true);
    updatePrintButton();
  }
});

printButton.addEventListener("click", async () => {
  if (!port || !jpeg) return;
  busy = true;
  updatePrintButton();
  logElement.textContent = "";
  setStatus("Invio alla stampante… non spegnerla durante le quattro passate.");
  try {
    await print(port, jpeg, log);
    setStatus("Stampa completata. Attendi l’espulsione definitiva.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    try { await port.close(); } catch { /* La porta può essere già chiusa. */ }
    port = undefined;
    connectionLabel.textContent = "Stampante non collegata";
    connectButton.textContent = "Collega stampante";
    dot.classList.remove("online");
  } finally {
    busy = false;
    updatePrintButton();
  }
});

canvas.hidden = true;
if (!("serial" in navigator)) setStatus("Serve Chrome/Chromium desktop 117+ con Web Serial.", true);

async function loadDefaultImage() {
  setStatus("Caricamento immagine di test…");
  const response = await fetch(`${import.meta.env.BASE_URL}test.jpg`);
  if (!response.ok) {
    throw new Error(`Impossibile caricare l'immagine predefinita (${response.status}).`);
  }
  selectedFile = new File([await response.blob()], "test.jpg", { type: "image/jpeg" });
  await refreshImage();
}

void loadDefaultImage().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
