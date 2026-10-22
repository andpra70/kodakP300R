# Kodak P300/P300R/P210R

Progetto composto da due parti indipendenti:

- [CLI Go per Linux e stampa Bluetooth SPP/RFCOMM](local/README.md);
- [web app Vite/TypeScript e deploy Docker](web/README.md).

Il CLI gestisce pairing e stampa nativa su Linux; la web app usa Web Serial da
Chrome/Chromium desktop e richiede HTTPS o localhost.

Per informazioni sull'analisi del protocollo e sull'app Android consultare
[analysis/REPORT.md](analysis/REPORT.md).
