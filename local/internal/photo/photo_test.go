package photo

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestPrepareFitPreservesPortraitWithWhiteBars(t *testing.T) {
	const width, height = 896, 896
	src := image.NewRGBA(image.Rect(0, 0, 100, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 100; x++ {
			src.Set(x, y, color.RGBA{R: 220, G: 20, B: 20, A: 255})
		}
	}
	var input, output bytes.Buffer
	if err := jpeg.Encode(&input, src, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	if err := PrepareSize(&input, &output, 100, true, width, height); err != nil {
		t.Fatal(err)
	}
	got, err := jpeg.Decode(&output)
	if err != nil {
		t.Fatal(err)
	}
	if got.Bounds().Dx() != width || got.Bounds().Dy() != height {
		t.Fatalf("dimensioni = %v", got.Bounds())
	}
	left := color.RGBAModel.Convert(got.At(10, height/2)).(color.RGBA)
	center := color.RGBAModel.Convert(got.At(width/2, height/2)).(color.RGBA)
	if left.R < 240 || left.G < 240 || left.B < 240 {
		t.Fatalf("banda non bianca: %#v", left)
	}
	if center.R < 180 || center.G > 60 || center.B > 60 {
		t.Fatalf("centro inatteso: %#v", center)
	}
}

func TestPrepareP210RSize(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 80, 60))
	var input, output bytes.Buffer
	if err := jpeg.Encode(&input, src, nil); err != nil {
		t.Fatal(err)
	}
	if err := PrepareSize(&input, &output, 95, false, 640, 1024); err != nil {
		t.Fatal(err)
	}
	got, err := jpeg.Decode(&output)
	if err != nil {
		t.Fatal(err)
	}
	if got.Bounds().Dx() != 640 || got.Bounds().Dy() != 1024 {
		t.Fatalf("dimensioni P210R = %v", got.Bounds())
	}
}
