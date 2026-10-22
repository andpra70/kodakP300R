package model

import "testing"

func TestProfiles(t *testing.T) {
	p, err := Lookup("P210R")
	if err != nil || p.Width != 640 || p.Height != 1024 || p.NativeModelID != 10 {
		t.Fatalf("profilo P210R: %#v, %v", p, err)
	}
	p, err = Detect("Kodak MINI 3 RETRO")
	if err != nil || p.Name != "p300r" {
		t.Fatalf("rilevamento P300R: %#v, %v", p, err)
	}
	if _, err = Detect("Kodak Instant - 0B4B"); err == nil {
		t.Fatal("un alias generico non deve essere rilevato")
	}
}
