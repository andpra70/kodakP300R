package photo

import (
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"
)

// PrepareSize creates a printer-ready JPEG of the requested raster size.
func PrepareSize(r io.Reader, w io.Writer, quality int, fit bool, width, height int) error {
	if width <= 0 || height <= 0 {
		return fmt.Errorf("dimensioni raster non valide: %dx%d", width, height)
	}
	src, _, err := image.Decode(r)
	if err != nil {
		return err
	}
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	if fit {
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				dst.Set(x, y, color.White)
			}
		}
		scale := float64(width) / float64(b.Dx())
		if sy := float64(height) / float64(b.Dy()); sy < scale {
			scale = sy
		}
		imageWidth := int(float64(b.Dx())*scale + 0.5)
		imageHeight := int(float64(b.Dy())*scale + 0.5)
		x0, y0 := (width-imageWidth)/2, (height-imageHeight)/2
		resample(src, dst, image.Rect(x0, y0, x0+imageWidth, y0+imageHeight), b)
	} else {
		fromWidth, fromHeight := b.Dx(), b.Dy()
		if float64(fromWidth)/float64(fromHeight) > float64(width)/float64(height) {
			fromWidth = fromHeight * width / height
		} else {
			fromHeight = fromWidth * height / width
		}
		x0 := b.Min.X + (b.Dx()-fromWidth)/2
		y0 := b.Min.Y + (b.Dy()-fromHeight)/2
		resample(src, dst, dst.Bounds(), image.Rect(x0, y0, x0+fromWidth, y0+fromHeight))
	}
	return jpeg.Encode(w, dst, &jpeg.Options{Quality: quality})
}

func resample(src image.Image, dst *image.RGBA, to, from image.Rectangle) {
	for y := to.Min.Y; y < to.Max.Y; y++ {
		fy := float64(from.Min.Y)
		if to.Dy() > 1 {
			fy += float64(y-to.Min.Y) * float64(from.Dy()-1) / float64(to.Dy()-1)
		}
		for x := to.Min.X; x < to.Max.X; x++ {
			fx := float64(from.Min.X)
			if to.Dx() > 1 {
				fx += float64(x-to.Min.X) * float64(from.Dx()-1) / float64(to.Dx()-1)
			}
			dst.Set(x, y, bilinear(src, fx, fy))
		}
	}
}

func bilinear(im image.Image, x, y float64) color.RGBA {
	x0, y0 := int(x), int(y)
	x1, y1 := x0+1, y0+1
	b := im.Bounds()
	if x1 >= b.Max.X {
		x1 = x0
	}
	if y1 >= b.Max.Y {
		y1 = y0
	}
	dx, dy := x-float64(x0), y-float64(y0)
	cs := [4]color.RGBA{color.RGBAModel.Convert(im.At(x0, y0)).(color.RGBA), color.RGBAModel.Convert(im.At(x1, y0)).(color.RGBA), color.RGBAModel.Convert(im.At(x0, y1)).(color.RGBA), color.RGBAModel.Convert(im.At(x1, y1)).(color.RGBA)}
	mix := func(a, b, c, d uint8) uint8 {
		v := (1-dx)*(1-dy)*float64(a) + dx*(1-dy)*float64(b) + (1-dx)*dy*float64(c) + dx*dy*float64(d)
		return uint8(v + 0.5)
	}
	return color.RGBA{mix(cs[0].R, cs[1].R, cs[2].R, cs[3].R), mix(cs[0].G, cs[1].G, cs[2].G, cs[3].G), mix(cs[0].B, cs[1].B, cs[2].B, cs[3].B), 255}
}
