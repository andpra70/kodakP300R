package model

import (
	"fmt"
	"strings"
)

type Profile struct {
	Name          string
	Width         int
	Height        int
	NativeModelID int
	ColorProfile  string
}

var profiles = map[string]Profile{
	"p300r": {Name: "p300r", Width: 896, Height: 896, NativeModelID: 9, ColorProfile: "sRGB (LUT proprietaria non applicata)"},
	"p210r": {Name: "p210r", Width: 640, Height: 1024, NativeModelID: 10, ColorProfile: "sRGB (LUT proprietaria non applicata)"},
}

func Lookup(name string) (Profile, error) {
	p, ok := profiles[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return Profile{}, fmt.Errorf("modello %q non supportato (usare p300r o p210r)", name)
	}
	return p, nil
}

// Detect recognizes only explicit model identities. Generic aliases such as
// "Kodak Instant - 0B4B" intentionally remain ambiguous.
func Detect(identity string) (Profile, error) {
	s := strings.ToLower(identity)
	switch {
	case strings.Contains(s, "p210r"), strings.Contains(s, "mini 2 retro"):
		return profiles["p210r"], nil
	case strings.Contains(s, "p300r"), strings.Contains(s, "mini 3 retro"):
		return profiles["p300r"], nil
	default:
		return Profile{}, fmt.Errorf("modello non riconoscibile automaticamente da %q; specificare --model p210r o --model p300r", identity)
	}
}
