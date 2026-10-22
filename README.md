# k-print

Driver CLI sperimentale per Kodak P300/P300R (protocollo Prinics PPVP su Bluetooth SPP).

```sh
go build -o k-print ./cmd/k-print
./k-print -dry-run prepared.jpg foto.jpg
./k-print --fit -dry-run prepared-fit.jpg foto.jpg
./k-print -v -p AA:BB:CC:DD:EE:FF foto.jpg
# è ancora accettato anche un device RFCOMM già collegato:
./k-print -p /dev/rfcomm0 foto.jpg
# Windows: associare prima la stampante a una porta SPP
k-print.exe -p COM5 foto.jpg
```

Su Linux serve BlueZ e la stampante deve essere già associata. Passando il MAC,
`k-print` apre direttamente un socket RFCOMM sul canale SPP 1 con sicurezza LOW,
come la connessione insecure dell'app Android; non crea `/dev/rfcomm0`. Il programma
ritaglia al centro e genera il JPEG 896×896 osservato per P300R; con `--fit`
mantiene invece tutta la foto e aggiunge bande bianche sui lati necessari. La stampante
gestisce internamente le passate Yellow, Magenta, Cyan e overcoat.

## Associazione e stampa guidata su Linux

Lo script controlla l'adattatore, cerca la stampante, esegue pair/trust, verifica
SPP, prova il socket RFCOMM nativo e facoltativamente stampa il file:

```sh
sudo scripts/kodak-p300.sh                         # stampa test.jpg sulla stampante predefinita
sudo scripts/kodak-p300.sh --probe                 # verifica soltanto, senza stampare
sudo scripts/kodak-p300.sh -p 'KODAK Instant' foto.jpg
sudo scripts/kodak-p300.sh -v -p AA:BB:CC:DD:EE:FF foto.jpg
sudo scripts/kodak-p300.sh --fit foto.jpg
# se la link key non è più riconosciuta dalla stampante:
sudo scripts/kodak-p300.sh --repair --pin 0000
```

Lo script usa `0000`, verificato su questa P300, come PIN legacy predefinito.
Su firmware che adottano il codice lungo usare `--repair --pin 12345678`.

Chiudere prima l'app Kodak sul telefono: una connessione Bluetooth già attiva può
impedire l'apertura del canale RFCOMM dal computer.

Se non trova SPP, lo script controlla il servizio BLE Prinics
`9877e0cb-a4d5-4860-a50b-ac10d83b6967` e si ferma con una diagnosi esplicita.
Alcune P300/P300R usano questo percorso GATT, che ha framing diverso dal
protocollo RFCOMM attualmente implementato.

## Stato e cautela

La macchina a stati e il framing derivano staticamente dall'APK `com.prinics.kodak.photoprinter` 5.1.3. Non sono ancora validati su hardware/cattura Bluetooth. Usare inizialmente una sola foto e interrompere in caso di stato inatteso. Una cattura BTSnoop dell'app ufficiale permetterà di verificare eventuali differenze nella correzione colore e nella sequenza firmware.

`k-print` decodifica inoltre gli stati PPVP noti per cartuccia esaurita o non
riconosciuta, carta assente/non riconosciuta, inceppamento, batteria insufficiente,
temperatura e guasto non recuperabile. Gli errori includono sempre anche i codici
grezzi ricevuti dalla stampante; il job termina senza retry automatico.
