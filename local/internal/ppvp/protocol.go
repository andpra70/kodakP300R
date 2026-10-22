package ppvp

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"time"
)

const MaxPayload = 16 << 20

type Message struct {
	Command, Param1, Param2, Reserved byte
	Payload                           []byte
}

func (m Message) Bytes() []byte {
	b := make([]byte, 8+len(m.Payload))
	b[0], b[1], b[2], b[3] = m.Command, m.Param1, m.Param2, m.Reserved
	binary.BigEndian.PutUint32(b[4:8], uint32(len(m.Payload)))
	copy(b[8:], m.Payload)
	return b
}

func ReadMessage(r io.Reader) (Message, error) {
	var h [8]byte
	if _, err := io.ReadFull(r, h[:]); err != nil {
		return Message{}, err
	}
	n := binary.BigEndian.Uint32(h[4:])
	if n > MaxPayload {
		return Message{}, fmt.Errorf("PPVP payload troppo grande: %d", n)
	}
	p := make([]byte, n)
	if _, err := io.ReadFull(r, p); err != nil {
		return Message{}, err
	}
	return Message{h[0], h[1], h[2], h[3], p}, nil
}

func u32(b []byte) uint32 { return binary.BigEndian.Uint32(b) }

type Logger func(string, ...any)

func printerStateError(m Message) error {
	detail := "errore stampante non classificato"
	switch m.Param2 {
	case 1, 3:
		detail = "errore generale della stampante"
	case 4, 27:
		detail = "errore carta o inceppamento; controllare il percorso carta e reinserire la cartuccia"
	case 20:
		if m.Reserved == 2 {
			detail = "carta fotografica non riconosciuta"
		} else {
			detail = "cartuccia esaurita o non riconosciuta; sostituire il kit carta/cartucce"
		}
	case 21:
		detail = "carta fotografica non riconosciuta o caricata male"
	case 22:
		detail = "cartuccia o carta assente/non riconosciuta"
	case 23:
		detail = "cartuccia non riconosciuta; estrarla e reinserirla"
	case 28:
		detail = "cartuccia esaurita; sostituire il kit carta/cartucce"
	case 40:
		detail = "batteria insufficiente per iniziare o continuare la stampa"
	case 41:
		detail = "batteria quasi scarica; collegare l'alimentazione"
	case 42:
		detail = "temperatura della stampante fuori intervallo; attendere che si raffreddi"
	}
	return fmt.Errorf("%s (PPVP cmd=%d stato=%d codice=%d dettaglio=%d payload=%x)", detail, m.Command, m.Param1, m.Param2, m.Reserved, m.Payload)
}

// Print implements the response-driven PPVP path recovered from KODAK Photo
// Printer 5.1.3. The printer itself performs the physical YMCO passes.
func Print(rw io.ReadWriter, jpeg []byte, copies byte, timeout time.Duration, logf Logger) error {
	if len(jpeg) == 0 {
		return errors.New("immagine JPEG vuota")
	}
	if copies == 0 {
		copies = 1
	}
	write := func(m Message) error {
		logf("tx cmd=%d p1=%d p2=%d bytes=%d", m.Command, m.Param1, m.Param2, len(m.Payload))
		_, err := rw.Write(m.Bytes())
		return err
	}
	if err := write(Message{Command: 100, Param1: 1}); err != nil {
		return err
	}

	deadline := time.Now().Add(timeout)
	started, acknowledged := false, false
	for time.Now().Before(deadline) {
		m, err := ReadMessage(rw)
		if err != nil {
			return fmt.Errorf("lettura PPVP: %w", err)
		}
		logf("rx cmd=%d p1=%d p2=%d bytes=%d", m.Command, m.Param1, m.Param2, len(m.Payload))
		switch m.Command {
		case 1: // acknowledgement/error envelope
			// After accepting PPVP_CMD_PRINT (5), the printer expects the
			// PPVP_CMD_START (7) response before it asks for JPEG ranges.
			// The Android client copies byte 3 (Reserved) into parameter 1.
			if m.Param1 == 5 {
				if err := write(Message{Command: 7, Param1: m.Reserved}); err != nil {
					return err
				}
			} else if m.Param2 != 0 {
				return fmt.Errorf("comando PPVP %d rifiutato, codice=%d dettaglio=%d payload=%x", m.Param1, m.Param2, m.Reserved, m.Payload)
			}
		case 2: // firmware/model information
			if !acknowledged {
				if err := write(Message{Command: 2, Param1: 1, Param2: 37}); err != nil {
					return err
				}
				acknowledged = true
			}
		case 4: // printer/job state
			switch m.Param1 {
			case 1:
				if !started {
					p := make([]byte, 12)
					binary.BigEndian.PutUint32(p[:4], uint32(len(jpeg)))
					if err := write(Message{Command: 5, Param1: copies, Payload: p}); err != nil {
						return err
					}
					started = true
				}
			case 6:
				_ = write(Message{Command: 1})
				return nil
			case 4:
				return printerStateError(m)
			case 5:
				return fmt.Errorf("errore stampante non recuperabile (PPVP codice=%d dettaglio=%d payload=%x)", m.Param2, m.Reserved, m.Payload)
			}
		case 8, 17: // printer requests a file range
			if len(m.Payload) < 8 {
				return fmt.Errorf("richiesta dati corta: %d byte", len(m.Payload))
			}
			off, n := u32(m.Payload[:4]), u32(m.Payload[4:8])
			if uint64(off)+uint64(n) > uint64(len(jpeg)) {
				return fmt.Errorf("range richiesto fuori file: offset=%d len=%d file=%d", off, n, len(jpeg))
			}
			chunk := append([]byte(nil), jpeg[off:off+n]...)
			if err := write(Message{Command: 9, Param1: m.Param1, Param2: m.Param2, Payload: chunk}); err != nil {
				return err
			}
		case 10, 50:
			// Progress/temperature notification.
		case 64, 101:
			return fmt.Errorf("stampante ha chiuso la sessione (cmd=%d, stato=%d)", m.Command, m.Param1)
		}
	}
	return errors.New("timeout in attesa del completamento stampa")
}
