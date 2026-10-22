# Kodak CLI (Go)

Questa cartella contiene il modulo Go, il client CLI, il trasporto Bluetooth
Classic SPP/RFCOMM per Linux, lo script di pairing e l'immagine di test. La
web app indipendente è in [`../web`](../web).

## Requisiti Linux

- Go 1.22 o successivo;
- BlueZ e i comandi `bluetoothctl`, `sdptool`;
- `timeout`, `awk`, `grep`;
- una sessione utente Linux autorizzata da BlueZ/Polkit a usare l'adattatore
  Bluetooth e permesso di aprire socket RFCOMM.

La stampante deve essere accesa e non collegata contemporaneamente all'app
mobile Kodak. Il trasporto richiede Bluetooth Classic SPP/RFCOMM; BLE/GATT non
è supportato dal CLI.

## Compilazione e test

Dalla root del repository:

```sh
cd local
go test ./...
./build.sh
```

Il binario Linux amd64 viene creato in `dist/k-print-linux-amd64`.
In alternativa, per compilare direttamente sull'architettura corrente:

```sh
cd local
go build -o dist/k-print ./cmd/k-print
```

## Permessi ed esecuzione come utente normale

Esegui pairing e stampa dall'account della sessione desktop, senza `sudo`.
Sulle distribuzioni desktop comuni, BlueZ e Polkit autorizzano l'utente
attualmente connesso a usare il Bluetooth. Le regole variano in base alla
distribuzione e alla configurazione locale: non aggiungere automaticamente
l'utente al gruppo `bluetooth` e non assegnare capability al binario; spesso
quel gruppo non controlla né le operazioni BlueZ via D-Bus né i socket RFCOMM.

Se il pairing automatico non è autorizzato, associa e contrassegna la Kodak
come attendibile dall'applicazione Bluetooth del desktop, poi usa
`--skip-pair`. L'adattatore deve essere acceso e la stampante già associata e
trusted:

```sh
local/scripts/kodak-p300.sh --skip-pair --probe
local/scripts/kodak-p300.sh --skip-pair foto.jpg
```

Se `bluetoothctl power on` o il pairing restituiscono `NotAuthorized` o
`NotPermitted`, è Polkit/BlueZ a negare l'operazione: chiedere
all'amministratore di configurare la policy prevista dalla distribuzione per
l'utente o il gruppo appropriato. Se invece il probe fallisce sul socket
RFCOMM, verificare che nessun altro client (in particolare l'app Kodak sul
telefono) sia collegato e che il sistema consenta all'utente di usare RFCOMM.
Le regole per quest'ultimo accesso dipendono dal sistema; non rendere il binario
setuid e non applicare `chmod` indiscriminati ai device.

La cattura HCI usa `btmon`, che può richiedere privilegi aggiuntivi a seconda
del sistema. Per default lo script salva una cattura con nome univoco sotto
`${XDG_STATE_HOME:-~/.local/state}/k-print/traces/`; il file contiene il
traffico Bluetooth osservato durante l'esecuzione.
Se `btmon` non è installato o l'utente non è autorizzato a catturare il
traffico, disabilitare la cattura con `--no-trace`; non è necessario eseguire
tutto il programma con `sudo`.

## Pairing e stampa guidati

Lo script predefinito associa e autorizza la Kodak, verifica SPP, rileva il
canale RFCOMM e avvia la stampa. Senza un'immagine specificata usa
[`data/test.jpg`](data/test.jpg).

```sh
# Pairing e verifica senza stampare
local/scripts/kodak-p300.sh --probe

# Stampa l'immagine di test sulla P300R predefinita
local/scripts/kodak-p300.sh

# Specifica stampante e immagine
local/scripts/kodak-p300.sh -p AA:BB:CC:DD:EE:FF foto.jpg

# P210R, mantenendo l'intera foto
local/scripts/kodak-p300.sh --model p210r --fit \
  -p AA:BB:CC:DD:EE:FF foto.jpg

# Disabilita la cattura HCI predefinita
local/scripts/kodak-p300.sh --no-trace foto.jpg

# Stampa senza log verbose e ritagliando per riempire il foglio
local/scripts/kodak-p300.sh --no-trace --quiet --no-fit foto.jpg

# Ricrea un pairing obsoleto
local/scripts/kodak-p300.sh --repair --pin 0000 --probe
```

Per default lo script stampa la foto intera (`fit`), mostra i pacchetti PPVP
(`verbose`) e registra il traffico Bluetooth HCI (`trace`). Usare `--no-fit`,
`--quiet` e `--no-trace` per disattivare le rispettive opzioni; `--trace PATH`
sceglie un percorso specifico.

Per il pairing sono noti i PIN `0000` e `12345678`. Dopo `--probe` la
stampante resta associata. Non tenere aperta la connessione CLI mentre il
browser tenta di collegarsi.

## Comandi CLI

```sh
cd local

# Prepara un JPEG P300R senza collegarsi
./dist/k-print-linux-amd64 --dry-run prepared.jpg foto.jpg

# Foto completa P210R (640×1024), senza ritaglio
./dist/k-print-linux-amd64 --model p210r --fit \
  --dry-run prepared-p210r.jpg foto.jpg

# Linux: connessione diretta tramite MAC Bluetooth (sessione utente autorizzata)
./dist/k-print-linux-amd64 -v --model p300r \
  -p AA:BB:CC:DD:EE:FF foto.jpg

# Canale SPP esplicito oppure device RFCOMM già collegato
./dist/k-print-linux-amd64 --channel 2 \
  -p AA:BB:CC:DD:EE:FF foto.jpg
./dist/k-print-linux-amd64 -p /dev/rfcomm0 foto.jpg
```

Il CLI Go abilita per default `-fit` e `-v`; disabilitarli con `-fit=false` o
`-v=false`.

`--model` accetta `p300r`, `p210r` o `auto` quando il nome identifica
chiaramente il modello. Kodak P300R usa un raster 896×896; P210R usa
640×1024. Gli alias generici come `Kodak Instant - 0B4B` non identificano il
modello in modo affidabile.

Consulta [la guida web](../web/README.md) per l'interfaccia browser, Docker e
pubblicazione sul front-controller.
