# Kodak P300/P300R/P210R

Progetto composto da due parti indipendenti:

- [CLI Go per Linux e stampa Bluetooth SPP/RFCOMM](local/README.md);
- [web app Vite/TypeScript e deploy Docker](web/README.md).

Il CLI gestisce pairing e stampa nativa su Linux; la web app usa Web Serial da
Chrome/Chromium desktop e richiede HTTPS o localhost.

Per informazioni sull'analisi del protocollo e sull'app Android consultare
[analysis/REPORT.md](analysis/REPORT.md).

La web app supporta drag-and-drop, foto intera e ritaglio interattivo:
disattivando **Foto intera** si può spostare la fotografia e regolare lo zoom.
La rotella mantiene come centro di scala il punto indicato dal mouse.
La scala disponibile va dal 25% al 300%; lo spazio non coperto resta bianco.

```sh
# Avvio Docker locale: http://localhost:6066/kodak2/
docker compose up --build -d

# Build linux/amd64 e push dell'immagine per il front controller
./deploy.sh

# Commit e push; usato anche dal flusso ../../publish.sh
./publish.sh
```

Il front controller usa `docker.io/andpra70/kodak-k-print-web:latest` sulla
route HTTPS `/kodak2/`.
