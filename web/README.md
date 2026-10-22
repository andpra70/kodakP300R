# K Print Web

La guida al CLI Linux e al pairing Bluetooth nativo è in
[local/README.md](../local/README.md).

Interfaccia Vite/TypeScript che usa Web Serial per collegarsi direttamente al
servizio Bluetooth Classic SPP/RFCOMM della Kodak e inviare il protocollo PPVP.
All'avvio carica come anteprima l'immagine `public/test.jpg`, copiata da
[`local/data/test.jpg`](../local/data/test.jpg); è possibile sostituirla
caricando o trascinando una propria foto.

Requisiti:

- Chrome o Chromium desktop 117+;
- pagina servita da `localhost` oppure HTTPS;
- Kodak già associata nelle impostazioni Bluetooth del sistema;
- nessun telefono collegato contemporaneamente alla stampante.

```sh
npm install
npm run dev
```

Aprire l'indirizzo mostrato da Vite, caricare o trascinare la foto nell'anteprima,
scegliere P300R o P210R,
premere **Collega stampante** e selezionare la porta Serial Port della Kodak.
Con **Foto intera** disattivato è possibile trascinare la foto per modificare
l'inquadratura e usare il controllo Zoom per ridimensionarla. La rotella del
mouse effettua lo zoom mantenendo fermo il punto della foto sotto il cursore.
La scala va dal 25% al 300%; sotto il 100% le parti del foglio non coperte
dall'immagine restano bianche.

La Web Bluetooth API non viene usata perché supporta BLE/GATT. Chrome espone
invece SPP/RFCOMM tramite Web Serial. Il browser richiede sempre un gesto e una
scelta esplicita dell'utente; il sito non può effettuare pairing silenzioso.

## Docker e pubblicazione

L'immagine serve la build Vite con Nginx non privilegiato sulla porta `8080`.
Il percorso Vite predefinito è `/kodak2/`, pronto per il reverse proxy del
front-controller.

```sh
# Costruisci per il server linux/amd64
cd web
./build.sh

# Costruisci e pubblica l'immagine su Docker Hub
./deploy.sh

# Avvia localmente l'immagine già costruita su http://localhost:6066
./run.sh
```

Dalla radice del progetto sono inoltre disponibili `docker-compose.yml`,
`deploy.sh` e `publish.sh`, compatibili con gli script globali in `../../`:

```sh
docker compose up --build -d
./deploy.sh
./publish.sh
```

`deploy.sh` costruisce l'immagine per `linux/amd64` e la invia al registry
Docker configurato in `IMAGE_REF` (o nei valori predefiniti dello script); è
necessario aver eseguito il login Docker.

`docker-compose.kodak.yml` è un overlay Compose di deploy e non contiene una
sezione `build`. Dalla root del repository, copialo nel progetto
front-controller e avvia il servizio insieme al Compose principale:

```sh
cp web/docker-compose.kodak.yml ../../front-controller/
cd ../../front-controller
docker compose -f docker-compose.yml -f docker-compose.kodak.yml up -d kodak2-web
```

L'overlay si collega alla rete Docker `front-controller_internal-services`
(personalizzabile con `FRONT_CONTROLLER_INTERNAL_NETWORK`). Per renderlo
raggiungibile dal browser, aggiungere al server Nginx del front-controller:

```nginx
location = /kodak2 {
    return 301 /kodak2/;
}

location /kodak2/ {
    proxy_pass http://kodak2-web:8080/;
}
```

Il front-controller deve terminare HTTPS, necessario per Web Serial.
