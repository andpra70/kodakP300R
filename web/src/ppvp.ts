const MAX_PAYLOAD = 16 << 20;

interface Message {
  command: number;
  param1?: number;
  param2?: number;
  reserved?: number;
  payload?: Uint8Array;
}

export type Log = (line: string) => void;

function encode(message: Message): Uint8Array {
  const payload = message.payload ?? new Uint8Array();
  const bytes = new Uint8Array(8 + payload.length);
  bytes[0] = message.command;
  bytes[1] = message.param1 ?? 0;
  bytes[2] = message.param2 ?? 0;
  bytes[3] = message.reserved ?? 0;
  new DataView(bytes.buffer).setUint32(4, payload.length, false);
  bytes.set(payload, 8);
  return bytes;
}

class ByteReader {
  private chunks: Uint8Array[] = [];
  private available = 0;

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async exact(length: number): Promise<Uint8Array> {
    while (this.available < length) {
      const result = await this.reader.read();
      if (result.done) throw new Error("La stampante ha chiuso il collegamento");
      if (result.value.length) {
        this.chunks.push(result.value);
        this.available += result.value.length;
      }
    }
    const output = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      const chunk = this.chunks[0];
      const count = Math.min(chunk.length, length - offset);
      output.set(chunk.subarray(0, count), offset);
      offset += count;
      this.available -= count;
      if (count === chunk.length) this.chunks.shift();
      else this.chunks[0] = chunk.subarray(count);
    }
    return output;
  }
}

async function readMessage(reader: ByteReader): Promise<Required<Message>> {
  const header = await reader.exact(8);
  const length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(4, false);
  if (length > MAX_PAYLOAD) throw new Error(`Payload PPVP troppo grande: ${length}`);
  return {
    command: header[0], param1: header[1], param2: header[2], reserved: header[3],
    payload: await reader.exact(length),
  };
}

function stateError(message: Required<Message>): Error {
  let detail = "Errore stampante non classificato";
  switch (message.param2) {
    case 1: case 3: detail = "Errore generale della stampante"; break;
    case 4: case 27: detail = "Errore carta o inceppamento"; break;
    case 20: detail = message.reserved === 2 ? "Carta fotografica non riconosciuta" : "Cartuccia esaurita o non riconosciuta"; break;
    case 21: detail = "Carta fotografica non riconosciuta o caricata male"; break;
    case 22: detail = "Cartuccia o carta assente/non riconosciuta"; break;
    case 23: detail = "Cartuccia non riconosciuta"; break;
    case 28: detail = "Cartuccia esaurita"; break;
    case 40: detail = "Batteria insufficiente"; break;
    case 41: detail = "Batteria quasi scarica"; break;
    case 42: detail = "Temperatura fuori intervallo"; break;
  }
  return new Error(`${detail} (PPVP stato=${message.param1}, codice=${message.param2}, dettaglio=${message.reserved})`);
}

export async function print(port: SerialPort, jpeg: Uint8Array, log: Log, timeoutMs = 180_000): Promise<void> {
  if (!port.readable || !port.writable) throw new Error("Porta seriale non aperta");
  const serialReader = port.readable.getReader();
  const serialWriter = port.writable.getWriter();
  const reader = new ByteReader(serialReader);
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    void serialReader.cancel("timeout PPVP");
  }, timeoutMs);
  let started = false;
  let acknowledged = false;

  const write = async (message: Message) => {
    const payloadLength = message.payload?.length ?? 0;
    log(`TX cmd=${message.command} p1=${message.param1 ?? 0} p2=${message.param2 ?? 0} bytes=${payloadLength}`);
    await serialWriter.write(encode(message));
  };

  try {
    await write({ command: 100, param1: 1 });
    while (Date.now() < deadline) {
      const message = await readMessage(reader);
      log(`RX cmd=${message.command} p1=${message.param1} p2=${message.param2} bytes=${message.payload.length}`);
      switch (message.command) {
        case 1:
          if (message.param1 === 5) await write({ command: 7, param1: message.reserved });
          else if (message.param2 !== 0) throw new Error(`Comando PPVP ${message.param1} rifiutato: ${message.param2}/${message.reserved}`);
          break;
        case 2:
          if (!acknowledged) {
            await write({ command: 2, param1: 1, param2: 37 });
            acknowledged = true;
          }
          break;
        case 4:
          if (message.param1 === 1 && !started) {
            const payload = new Uint8Array(12);
            new DataView(payload.buffer).setUint32(0, jpeg.length, false);
            await write({ command: 5, param1: 1, payload });
            started = true;
          } else if (message.param1 === 6) {
            await write({ command: 1 });
            return;
          } else if (message.param1 === 4) throw stateError(message);
          else if (message.param1 === 5) throw new Error(`Errore stampante non recuperabile: ${message.param2}/${message.reserved}`);
          break;
        case 8: case 17: {
          if (message.payload.length < 8) throw new Error("Richiesta dati PPVP incompleta");
          const view = new DataView(message.payload.buffer, message.payload.byteOffset, message.payload.byteLength);
          const offset = view.getUint32(0, false);
          const length = view.getUint32(4, false);
          if (offset + length > jpeg.length) throw new Error(`Range PPVP fuori immagine: ${offset}+${length}/${jpeg.length}`);
          await write({ command: 9, param1: message.param1, param2: message.param2, payload: jpeg.slice(offset, offset + length) });
          break;
        }
        case 10: case 50: break;
        case 64: case 101: throw new Error(`La stampante ha chiuso la sessione (cmd=${message.command}, stato=${message.param1})`);
      }
    }
    throw new Error("Timeout in attesa del completamento stampa");
  } catch (error) {
    if (timedOut) throw new Error("Timeout in attesa del completamento stampa");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    serialWriter.releaseLock();
    serialReader.releaseLock();
  }
}
