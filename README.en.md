# Kodak P300/P300R/P210R

This repository contains two independent applications:

- [Go CLI for Linux and Bluetooth SPP/RFCOMM printing](local/README.md);
- [Vite/TypeScript web app and Docker deployment](web/README.md).

The CLI handles native Linux pairing and printing. The web app uses Web Serial
in desktop Chrome/Chromium and requires HTTPS or localhost.

For protocol and Android application analysis, see
[analysis/REPORT.md](analysis/REPORT.md).

The web app supports drag-and-drop, full-image mode, and interactive cropping:
disable **Foto intera** to pan the photograph and adjust its zoom. Mouse-wheel
zoom keeps the image point under the pointer stationary.
The available scale ranges from 25% to 300%; uncovered paper remains white.

```sh
# Local Docker server: http://localhost:6066/kodak2/
docker compose up --build -d

# Build linux/amd64 and push the front-controller image
./deploy.sh

# Commit and push; also called by ../../publish.sh
./publish.sh
```

The front controller uses `docker.io/andpra70/kodak-k-print-web:latest` at the
HTTPS `/kodak2/` route.
