#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
KPRINT=${KPRINT:-"$PROJECT_DIR/dist/k-print-linux-amd64"}
PRINTER="60:6E:41:B5:0B:4B"
SCAN_SECONDS=15
IMAGE=""
PROBE_ONLY=0
VERBOSE=1
FIT=1
MODEL="p300r"
SKIP_PAIR=0
REPAIR=0
PAIR_PIN="0000"
TRACE="${XDG_STATE_HOME:-${HOME:-$PROJECT_DIR}/.local/state}/k-print/traces/kodak-$(date +%Y%m%d-%H%M%S)-$$.btsnoop"
BTMON_PID=""

usage() {
  cat <<'EOF'
Uso:
  local/scripts/kodak-p300.sh [opzioni] [immagine.jpg]

Associa, verifica e collega una Kodak P300/P300R o P210R, quindi stampa l'immagine.
Senza un nome file usa data/test.jpg nella directory local.

Opzioni:
  -p, --printer NOME|MAC  Nome (anche parziale) o MAC Bluetooth
                          [60:6E:41:B5:0B:4B]
  -s, --scan SECONDI      Durata scansione [15]
      --skip-pair         Non ripetere pair/trust; verifica soltanto
      --repair            Elimina il vecchio bond locale e associa di nuovo
      --pin CODICE        PIN di pairing [0000]; alternativa nota: 12345678
      --k-print PATH      Percorso dell'eseguibile k-print
      --trace PATH        Percorso cattura HCI btmon
      --no-trace          Disabilita la cattura HCI (attiva per default)
      --probe             Verifica la connessione senza stampare
  -v, --verbose           Abilita log PPVP durante la stampa (attivo per default)
      --quiet             Disabilita il log PPVP
      --fit               Mostra la foto intera, con eventuali bande bianche (default)
      --no-fit            Ritaglia la foto per riempire il foglio
      --model MODELLO     Profilo p300r, p210r oppure auto [p300r]
  -h, --help              Mostra questo aiuto

Esempi:
  local/scripts/kodak-p300.sh
  local/scripts/kodak-p300.sh --probe
  local/scripts/kodak-p300.sh -p 'KODAK Instant' foto.jpg
  local/scripts/kodak-p300.sh -p AA:BB:CC:DD:EE:FF foto.jpg
EOF
}

die() { printf 'ERRORE: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }
ok() { printf 'OK: %s\n' "$*"; }

cleanup() {
  if [[ -n "$BTMON_PID" ]]; then
    kill -INT "$BTMON_PID" 2>/dev/null || true
    wait "$BTMON_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

while (($#)); do
  case "$1" in
    -p|--printer) (($# >= 2)) || die "$1 richiede un valore"; PRINTER=$2; shift 2 ;;
    -s|--scan) (($# >= 2)) || die "$1 richiede un valore"; SCAN_SECONDS=$2; shift 2 ;;
    --skip-pair) SKIP_PAIR=1; shift ;;
    --repair) REPAIR=1; shift ;;
    --pin) (($# >= 2)) || die "$1 richiede un valore"; PAIR_PIN=$2; shift 2 ;;
    --k-print) (($# >= 2)) || die "$1 richiede un valore"; KPRINT=$2; shift 2 ;;
    --trace) (($# >= 2)) || die "$1 richiede un valore"; TRACE=$2; shift 2 ;;
    --no-trace) TRACE=""; shift ;;
    --probe) PROBE_ONLY=1; shift ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --quiet) VERBOSE=0; shift ;;
    --fit) FIT=1; shift ;;
    --no-fit) FIT=0; shift ;;
    --model) (($# >= 2)) || die "$1 richiede un valore"; MODEL=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; (($# <= 1)) || die "specificare una sola immagine"; IMAGE=${1:-}; break ;;
    -*) die "opzione sconosciuta: $1" ;;
    *) [[ -z "$IMAGE" ]] || die "specificare una sola immagine"; IMAGE=$1; shift ;;
  esac
done

if ((PROBE_ONLY)); then
  [[ -z "$IMAGE" ]] || die "--probe non accetta un'immagine"
else
  IMAGE=${IMAGE:-"$PROJECT_DIR/data/test.jpg"}
fi

[[ "$SCAN_SECONDS" =~ ^[0-9]+$ ]] && ((SCAN_SECONDS > 0)) || die "durata scansione non valida: $SCAN_SECONDS"
[[ "$PAIR_PIN" =~ ^[0-9]{4,16}$ ]] || die "PIN non valido: usare da 4 a 16 cifre"
for cmd in bluetoothctl sdptool timeout awk; do
  command -v "$cmd" >/dev/null 2>&1 || die "comando mancante: $cmd (installare BlueZ/bluez-tools)"
done
[[ -z "$IMAGE" || (-f "$IMAGE" && -r "$IMAGE") ]] || die "immagine non leggibile: $IMAGE"
[[ -x "$KPRINT" ]] || die "k-print non eseguibile: $KPRINT"
if [[ -n "$TRACE" ]]; then
  command -v btmon >/dev/null 2>&1 || die "comando mancante: btmon (oppure usare --no-trace)"
  [[ ! -e "$TRACE" ]] || die "il file di traccia esiste già: $TRACE"
  trace_dir=$(dirname -- "$TRACE")
  mkdir -p "$trace_dir" || die "impossibile creare la directory della traccia: $trace_dir"
  btmon -w "$TRACE" >/dev/null 2>&1 &
  BTMON_PID=$!
  sleep 1
  kill -0 "$BTMON_PID" 2>/dev/null || die "avvio btmon fallito; verificare i permessi Bluetooth o usare --no-trace"
  printf 'Cattura HCI attiva: %s\n' "$TRACE"
fi
if ((EUID != 0)); then
  printf 'NOTA: pairing e socket RFCOMM richiedono che la sessione utente abbia i permessi BlueZ necessari.\n'
fi

step "Accensione e controllo adattatore Bluetooth"
bluetoothctl power on >/dev/null
controller=$(bluetoothctl show)
grep -q 'Powered: yes' <<<"$controller" || die "adattatore Bluetooth non acceso"
ok "adattatore acceso"

step "Scansione Bluetooth per ${SCAN_SECONDS}s"
bluetoothctl scan on >/dev/null 2>&1 || true
sleep "$SCAN_SECONDS"
bluetoothctl scan off >/dev/null 2>&1 || true
# L'app Android annulla la discovery prima di aprire RFCOMM. Lasciamo a BlueZ
# il tempo di completare la transizione prima delle richieste SDP/socket.
sleep 1
devices=$(bluetoothctl devices)

if [[ "$PRINTER" =~ ^([[:xdigit:]]{2}:){5}[[:xdigit:]]{2}$ ]]; then
  MAC=${PRINTER^^}
else
  MAC=$(awk -v needle="$PRINTER" '
    BEGIN { IGNORECASE=1 }
    $1 == "Device" {
      name=$0; sub(/^Device [^ ]+ /, "", name)
      if (index(tolower(name), tolower(needle))) { print $2; exit }
    }' <<<"$devices")
  [[ -n "$MAC" ]] || {
    printf '%s\n' "$devices" >&2
    die "nessun dispositivo corrisponde a '$PRINTER'; usare -p MAC o un nome più preciso"
  }
fi

info=$(bluetoothctl info "$MAC" 2>/dev/null || true)
name=$(awk -F': ' '/^[[:space:]]*Name:/{print $2; exit}' <<<"$info")
printf 'Trovata: %s (%s)\n' "${name:-nome sconosciuto}" "$MAC"

EFFECTIVE_MODEL=$MODEL
if [[ "${MODEL,,}" == auto ]]; then
  model_identity="${name,,} ${PRINTER,,}"
  if [[ "$model_identity" == *p210r* || "$model_identity" == *"mini 2 retro"* ]]; then
    EFFECTIVE_MODEL=p210r
  elif [[ "$model_identity" == *p300r* || "$model_identity" == *"mini 3 retro"* ]]; then
    EFFECTIVE_MODEL=p300r
  else
    die "il nome Bluetooth '${name:-sconosciuto}' non identifica il formato; usare --model p210r o --model p300r"
  fi
  ok "modello rilevato: $EFFECTIVE_MODEL"
fi

if ((REPAIR)); then
  ((SKIP_PAIR == 0)) || die "--repair e --skip-pair non possono essere usati insieme"
  step "Rimozione del bond locale obsoleto"
  remove_output=$(bluetoothctl remove "$MAC" 2>&1 || true)
  if ! grep -qi 'successful\|not available' <<<"$remove_output"; then
    printf '%s\n' "$remove_output" >&2
  fi
  sleep 1
  # Dopo remove BlueZ dimentica anche l'oggetto Device; una breve discovery lo ricrea.
  bluetoothctl scan on >/dev/null 2>&1 || true
  sleep 5
  bluetoothctl scan off >/dev/null 2>&1 || true
  sleep 1
  info=$(bluetoothctl info "$MAC" 2>/dev/null || true)
  ok "vecchia link key eliminata; avvio nuovo pairing"
fi

if ((SKIP_PAIR == 0)); then
  step "Associazione e autorizzazione"
  if grep -q 'Paired: yes' <<<"$info"; then
    pair_output=$(bluetoothctl trust "$MAC" 2>&1 || true)
  else
    # Un solo processo mantiene attivo l'agent. Le piccole attese impediscono
    # che il PIN venga interpretato come comando prima della richiesta legacy.
    pair_output=$({
      printf 'agent KeyboardOnly\n'
      printf 'default-agent\n'
      printf 'pair %s\n' "$MAC"
      sleep 2
      printf '%s\n' "$PAIR_PIN"
      sleep 2
      printf 'trust %s\n' "$MAC"
      printf 'info %s\n' "$MAC"
      printf 'quit\n'
    } | timeout 45 bluetoothctl 2>&1) || true
  fi
  info=$(bluetoothctl info "$MAC" 2>/dev/null || true)
  if ! grep -q 'Paired: yes' <<<"$info"; then
    printf '%s\n' "$pair_output" >&2
    die "associazione fallita; verificare che la stampante sia accesa e in modalità pairing"
  fi
  grep -q 'Trusted: yes' <<<"$info" || die "dispositivo associato ma non trusted"
fi
grep -q 'Paired: yes' <<<"$info" || die "stampante non associata (rimuovere --skip-pair)"
grep -q 'Trusted: yes' <<<"$info" || die "stampante non trusted (rimuovere --skip-pair)"
ok "Paired=yes, Trusted=yes"

step "Verifica servizio Serial Port Profile"
sdp_browse=$(timeout 15 sdptool browse "$MAC" 2>&1 || true)
sdp_search=$(timeout 15 sdptool search --bdaddr "$MAC" SP 2>&1 || true)
sdp_records=$(timeout 15 sdptool records "$MAC" 2>&1 || true)
sdp="$sdp_browse"$'\n'"$sdp_search"$'\n'"$sdp_records"
channel=$(awk '
  /Service Name: Serial ?Port/ { spp=1; next }
  spp && /Channel:/ { print $2; exit }
' <<<"$sdp")
if [[ -z "$channel" ]] && grep -qi '00001101-0000-1000-8000-00805f9b34fb\|UUID: Serial Port' <<<"$info"; then
  printf 'AVVISO: UUID SPP dichiarato da BlueZ ma SDP non rivela il canale; provo il canale standard 1.\n'
  channel=1
elif [[ -z "$channel" ]]; then
  printf 'SPP/RFCOMM non pubblicato; controllo il servizio BLE della P300R.\n'
  printf 'Connessione BLE tramite bluetoothd e discovery degli attributi...\n'
  ble_connect=$(timeout 25 bluetoothctl --timeout 20 connect "$MAC" 2>&1 || true)
  sleep 2
  ble_info=$(bluetoothctl info "$MAC" 2>&1 || true)
  gatt_attributes=$(timeout 15 bluetoothctl --timeout 10 list-attributes "$MAC" 2>&1 || true)
  if grep -qi '9877e0cb-a4d5-4860-a50b-ac10d83b6967' <<<"$ble_info"$'\n'"$gatt_attributes"; then
    printf '%s\n%s\n' "$ble_info" "$gatt_attributes"
    die "stampante BLE/GATT rilevata tramite BlueZ (servizio Prinics 9877e0cb-...); questa unità non accetta RFCOMM. Il trasporto BLE di k-print deve essere usato"
  fi

  command -v gatttool >/dev/null 2>&1 || {
    printf '%s\n%s\n' "$ble_connect" "$gatt_attributes" >&2
    die "servizio Prinics non trovato nell'inventario GATT di BlueZ e gatttool non disponibile"
  }
  printf 'BlueZ non ha mostrato il servizio; provo il vecchio client GATT come fallback.\n'
  address_type=$(awk -F': ' '/^[[:space:]]*AddressType:/{print tolower($2); exit}' <<<"$info")
  if [[ "$address_type" == random ]]; then
    address_types=(random public)
  else
    address_types=(public random)
  fi
  gatt_services=""
  selected_address_type=""
  for candidate_type in "${address_types[@]}"; do
    printf 'Tentativo GATT con address type %s...\n' "$candidate_type"
    candidate_services=$(timeout 20 gatttool -b "$MAC" -t "$candidate_type" -m 512 --primary 2>&1 || true)
    gatt_services+=$'\n'"[$candidate_type]"$'\n'"$candidate_services"
    if grep -qi '9877e0cb-a4d5-4860-a50b-ac10d83b6967' <<<"$candidate_services"; then
      selected_address_type=$candidate_type
      break
    fi
  done
  if grep -qi '9877e0cb-a4d5-4860-a50b-ac10d83b6967' <<<"$gatt_services"; then
    printf '%s\n' "$gatt_services"
    die "stampante BLE/GATT rilevata (address type $selected_address_type, servizio Prinics 9877e0cb-...); questa unità non accetta RFCOMM. Il trasporto BLE di k-print deve essere usato, non il canale SPP 1"
  fi
  printf '\n[bluetoothctl connect]\n%s\n[bluetoothctl info]\n%s\n[bluetoothctl list-attributes]\n%s\n%s\n' "$ble_connect" "$ble_info" "$gatt_attributes" "$gatt_services" >&2
  die "la stampante non pubblica né Serial Port Profile né il servizio BLE Prinics; verificare l'output BlueZ/GATT sopra"
else
  ok "servizio SPP presente sul canale $channel"
fi

step "Test socket RFCOMM nativo, sicurezza LOW, canale $channel"
if ! "$KPRINT" -probe --channel "$channel" -p "$MAC"; then
  die "connessione RFCOMM nativa rifiutata dalla stampante; verificare che nessun telefono sia collegato e riaccenderla"
fi
ok "socket RFCOMM nativo accettato"

if [[ -z "$IMAGE" ]]; then
  printf '\nStampante pronta. Per stampare:\n  %q --skip-pair %q\n' "$0" "foto.jpg"
  exit 0
fi

step "Stampa di $IMAGE"
args=(--channel "$channel" -p "$MAC")
args=(--model "$EFFECTIVE_MODEL" "${args[@]}")
((VERBOSE == 0)) || args=(-v "${args[@]}")
((FIT == 0)) || args=(--fit "${args[@]}")
"$KPRINT" "${args[@]}" "$IMAGE"
ok "job completato; attendere l’espulsione definitiva dopo le quattro passate YMCO"
