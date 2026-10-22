//go:build linux

package transport

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var macRE = regexp.MustCompile(`(?i)^[0-9a-f]{2}(:[0-9a-f]{2}){5}$`)

func openLinux(printer string, channel byte, timeout time.Duration) (*os.File, func(), error) {
	if strings.HasPrefix(printer, "/dev/") {
		f, err := os.OpenFile(printer, os.O_RDWR, 0)
		return f, func() {
			if f != nil {
				_ = f.Close()
			}
		}, err
	}
	mac := printer
	if !macRE.MatchString(mac) {
		out, err := exec.Command("bluetoothctl", "devices").Output()
		if err != nil {
			return nil, func() {}, fmt.Errorf("bluetoothctl: %w", err)
		}
		s := bufio.NewScanner(strings.NewReader(string(out)))
		mac = ""
		for s.Scan() {
			fields := strings.Fields(s.Text())
			if len(fields) >= 3 && strings.Contains(strings.ToLower(strings.Join(fields[2:], " ")), strings.ToLower(printer)) {
				mac = fields[1]
				break
			}
		}
		if mac == "" {
			return nil, func() {}, fmt.Errorf("stampante Bluetooth %q non trovata", printer)
		}
	}
	f, err := dialRFCOMM(mac, channel, timeout)
	if err != nil {
		return nil, func() {}, err
	}
	return f, func() { _ = f.Close() }, nil
}

const (
	afBluetooth   = 31
	btProtoRFCOMM = 3
	solBluetooth  = 274
	btSecurity    = 4
)

type sockaddrRFCOMM struct {
	Family  uint16
	Addr    [6]byte
	Channel uint8
	Pad     uint8
}
type btSecurityValue struct{ Level, KeySize uint8 }

func dialRFCOMM(mac string, channel byte, timeout time.Duration) (*os.File, error) {
	errs := make([]string, 0, 2)
	for attempt := 1; attempt <= 2; attempt++ {
		f, err := dialRFCOMMOnce(mac, channel, timeout)
		if err == nil {
			return f, nil
		}
		errs = append(errs, fmt.Sprintf("tentativo %d: %v", attempt, err))
		if attempt < 2 {
			time.Sleep(500 * time.Millisecond)
		}
	}
	return nil, fmt.Errorf("connessione RFCOMM fallita dopo 2 tentativi (%s)", strings.Join(errs, "; "))
}

func dialRFCOMMOnce(mac string, channel byte, timeout time.Duration) (*os.File, error) {
	raw, err := hex.DecodeString(strings.ReplaceAll(mac, ":", ""))
	if err != nil || len(raw) != 6 {
		return nil, fmt.Errorf("MAC Bluetooth non valido: %s", mac)
	}
	fd, err := syscall.Socket(afBluetooth, syscall.SOCK_STREAM|syscall.SOCK_CLOEXEC, btProtoRFCOMM)
	if err != nil {
		return nil, fmt.Errorf("socket RFCOMM: %w", err)
	}
	owned := true
	defer func() {
		if owned {
			_ = syscall.Close(fd)
		}
	}()
	sec := btSecurityValue{Level: 1}
	_, _, errno := syscall.Syscall6(syscall.SYS_SETSOCKOPT, uintptr(fd), solBluetooth, btSecurity, uintptr(unsafe.Pointer(&sec)), unsafe.Sizeof(sec), 0)
	if errno != 0 {
		return nil, fmt.Errorf("BT_SECURITY_LOW: %w", errno)
	}
	sa := sockaddrRFCOMM{Family: afBluetooth, Channel: channel}
	for i := 0; i < 6; i++ {
		sa.Addr[i] = raw[5-i]
	}
	if err = syscall.SetNonblock(fd, true); err != nil {
		return nil, fmt.Errorf("socket RFCOMM non bloccante: %w", err)
	}
	_, _, errno = syscall.Syscall(syscall.SYS_CONNECT, uintptr(fd), uintptr(unsafe.Pointer(&sa)), unsafe.Sizeof(sa))
	if errno != 0 && errno != syscall.EINPROGRESS && errno != syscall.EALREADY && errno != syscall.EINTR {
		return nil, fmt.Errorf("connessione RFCOMM %s canale %d: %w", mac, channel, errno)
	}
	if errno != 0 {
		if fd/64 >= len(syscall.FdSet{}.Bits) {
			return nil, fmt.Errorf("file descriptor RFCOMM fuori intervallo per select: %d", fd)
		}
		deadline := time.Now().Add(timeout)
		for {
			remaining := time.Until(deadline)
			if remaining <= 0 {
				return nil, fmt.Errorf("timeout connessione RFCOMM %s canale %d", mac, channel)
			}
			var writable syscall.FdSet
			writable.Bits[fd/64] |= 1 << (uint(fd) % 64)
			tv := syscall.NsecToTimeval(remaining.Nanoseconds())
			ready, selectErr := syscall.Select(fd+1, nil, &writable, nil, &tv)
			if selectErr == syscall.EINTR {
				continue
			}
			if selectErr != nil {
				return nil, fmt.Errorf("attesa connessione RFCOMM: %w", selectErr)
			}
			if ready == 0 {
				return nil, fmt.Errorf("timeout connessione RFCOMM %s canale %d", mac, channel)
			}
			soErr, getErr := syscall.GetsockoptInt(fd, syscall.SOL_SOCKET, syscall.SO_ERROR)
			if getErr != nil {
				return nil, fmt.Errorf("stato connessione RFCOMM: %w", getErr)
			}
			if soErr != 0 {
				return nil, fmt.Errorf("connessione RFCOMM %s canale %d: %w", mac, channel, syscall.Errno(soErr))
			}
			break
		}
	}
	if err = syscall.SetNonblock(fd, false); err != nil {
		return nil, fmt.Errorf("ripristino socket RFCOMM bloccante: %w", err)
	}
	owned = false
	return os.NewFile(uintptr(fd), "rfcomm:"+mac), nil
}
