package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"k-print/internal/model"
	"k-print/internal/photo"
	"k-print/internal/ppvp"
	"k-print/internal/transport"
)

func main() {
	printer := flag.String("p", "", "stampante: /dev/rfcommN, MAC/nome Bluetooth (Linux), oppure COMn (Windows)")
	probe := flag.Bool("probe", false, "verifica soltanto la connessione alla stampante")
	dry := flag.String("dry-run", "", "prepara il JPEG e salvalo qui, senza collegarsi")
	verbose := flag.Bool("v", true, "mostra i pacchetti PPVP")
	fit := flag.Bool("fit", true, "adatta l'immagine intera al foglio, aggiungendo bande bianche")
	modelName := flag.String("model", "p300r", "modello: p300r, p210r oppure auto")
	channel := flag.Int("channel", 1, "canale RFCOMM/SPP 1..30 (ignorato per COM/device)")
	quality := flag.Int("quality", 95, "qualità JPEG 1..100")
	timeout := flag.Duration("timeout", 3*time.Minute, "timeout complessivo")
	flag.Parse()
	if (*probe && (flag.NArg() != 0 || *printer == "")) || (!*probe && (flag.NArg() != 1 || (*printer == "" && *dry == ""))) {
		fmt.Fprintf(os.Stderr, "uso: k-print -p printer nomefile.jpg\n")
		flag.PrintDefaults()
		os.Exit(2)
	}
	if *quality < 1 || *quality > 100 {
		log.Fatal("quality deve essere 1..100")
	}
	if *channel < 1 || *channel > 30 {
		log.Fatal("channel deve essere 1..30")
	}
	var profile model.Profile
	var err error
	if *modelName == "auto" {
		profile, err = model.Detect(*printer)
	} else {
		profile, err = model.Lookup(*modelName)
	}
	if err != nil {
		log.Fatal(err)
	}
	if *probe {
		rw, cleanup, err := transport.Open(*printer, byte(*channel), 15*time.Second)
		if err != nil {
			log.Fatal(err)
		}
		cleanup()
		_ = rw
		fmt.Println("connessione RFCOMM riuscita")
		return
	}
	f, err := os.Open(flag.Arg(0))
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	var image bytes.Buffer
	if err = photo.PrepareSize(f, &image, *quality, *fit, profile.Width, profile.Height); err != nil {
		log.Fatalf("preparazione immagine: %v", err)
	}
	if *dry != "" {
		if err = os.WriteFile(*dry, image.Bytes(), 0644); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("creato %s (%d byte, %dx%d, modello %s, colore %s)\n", *dry, image.Len(), profile.Width, profile.Height, profile.Name, profile.ColorProfile)
		return
	}
	rw, cleanup, err := transport.Open(*printer, byte(*channel), 15*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	defer cleanup()
	logger := func(string, ...any) {}
	if *verbose {
		logger = log.Printf
	}
	if err = ppvp.Print(struct {
		io.Reader
		io.Writer
	}{rw, rw}, image.Bytes(), 1, *timeout, logger); err != nil {
		log.Fatal(err)
	}
	fmt.Println("stampa completata")
}
