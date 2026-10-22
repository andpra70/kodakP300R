package transport

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"
)

func Open(printer string, channel byte, timeout time.Duration) (*os.File, func(), error) {
	if runtime.GOOS == "windows" {
		p := printer
		if strings.HasPrefix(strings.ToUpper(p), "COM") {
			p = `\\.\` + p
		}
		f, err := os.OpenFile(p, os.O_RDWR, 0)
		return f, func() {
			if f != nil {
				_ = f.Close()
			}
		}, err
	}
	return openLinux(printer, channel, timeout)
}

func unsupported(printer string) (*os.File, func(), error) {
	return nil, func() {}, fmt.Errorf("trasporto %q non supportato su %s", printer, runtime.GOOS)
}
