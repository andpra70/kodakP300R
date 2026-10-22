//go:build !linux

package transport

import (
	"os"
	"time"
)

func openLinux(printer string, channel byte, timeout time.Duration) (*os.File, func(), error) {
	return unsupported(printer)
}
