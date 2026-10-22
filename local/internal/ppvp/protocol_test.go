package ppvp

import (
	"bytes"
	"encoding/binary"
	"io"
	"testing"
	"time"
)

type scripted struct {
	in  *bytes.Reader
	out bytes.Buffer
}

func (s *scripted) Read(p []byte) (int, error)  { return s.in.Read(p) }
func (s *scripted) Write(p []byte) (int, error) { return s.out.Write(p) }

func TestMessageRoundTrip(t *testing.T) {
	want := Message{Command: 9, Param1: 2, Param2: 3, Payload: []byte{4, 5, 6}}
	got, err := ReadMessage(bytes.NewReader(want.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.Bytes(), want.Bytes()) {
		t.Fatalf("got %x want %x", got.Bytes(), want.Bytes())
	}
}

func TestPrintHandshakeAndRequestedChunk(t *testing.T) {
	msg := func(c, p1, p2 byte, p []byte) []byte {
		return Message{Command: c, Param1: p1, Param2: p2, Payload: p}.Bytes()
	}
	req := make([]byte, 8)
	binary.BigEndian.PutUint32(req[0:4], 2)
	binary.BigEndian.PutUint32(req[4:8], 3)
	jobAck := Message{Command: 1, Param1: 5, Param2: 1, Reserved: 4}.Bytes()
	in := bytes.Join([][]byte{msg(2, 1, 0, []byte{1, 2, 3}), msg(4, 1, 0, nil), jobAck, msg(8, 7, 8, req), msg(4, 6, 0, nil)}, nil)
	s := &scripted{in: bytes.NewReader(in)}
	data := []byte{10, 11, 12, 13, 14, 15}
	if err := Print(s, data, 1, time.Second, func(string, ...any) {}); err != nil {
		t.Fatal(err)
	}
	r := bytes.NewReader(s.out.Bytes())
	var got []Message
	for r.Len() > 0 {
		m, e := ReadMessage(r)
		if e != nil && e != io.EOF {
			t.Fatal(e)
		}
		got = append(got, m)
	}
	if len(got) != 6 {
		t.Fatalf("%d messaggi, attesi 6", len(got))
	}
	if got[0].Command != 100 || got[1].Command != 2 || got[2].Command != 5 || got[3].Command != 7 || got[4].Command != 9 || got[5].Command != 1 {
		t.Fatalf("sequenza: %#v", got)
	}
	if got[3].Param1 != 4 {
		t.Fatalf("parametro PPVP_CMD_START: %d, atteso 4", got[3].Param1)
	}
	if !bytes.Equal(got[4].Payload, []byte{12, 13, 14}) {
		t.Fatalf("chunk: %v", got[4].Payload)
	}
}

func TestPrinterStateErrors(t *testing.T) {
	tests := []struct {
		code     byte
		reserved byte
		want     string
	}{
		{4, 0, "errore carta"},
		{20, 0, "cartuccia esaurita"},
		{20, 2, "carta fotografica non riconosciuta"},
		{28, 0, "cartuccia esaurita"},
		{40, 0, "batteria insufficiente"},
		{42, 0, "temperatura"},
		{99, 7, "non classificato"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			err := printerStateError(Message{Command: 4, Param1: 4, Param2: tt.code, Reserved: tt.reserved, Payload: []byte{1, 2}})
			if err == nil || !bytes.Contains([]byte(err.Error()), []byte(tt.want)) {
				t.Fatalf("errore %q, atteso testo %q", err, tt.want)
			}
		})
	}
}

func TestPrintStopsOnCartridgeError(t *testing.T) {
	in := bytes.Join([][]byte{
		Message{Command: 2}.Bytes(),
		Message{Command: 4, Param1: 4, Param2: 28}.Bytes(),
	}, nil)
	s := &scripted{in: bytes.NewReader(in)}
	err := Print(s, []byte{1, 2, 3}, 1, time.Second, func(string, ...any) {})
	if err == nil || !bytes.Contains([]byte(err.Error()), []byte("cartuccia esaurita")) {
		t.Fatalf("errore %q, atteso fine cartuccia", err)
	}
}
