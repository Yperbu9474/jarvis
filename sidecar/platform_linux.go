//go:build linux

package main

import (
	"os/exec"
	"strings"
)

func platformClipboardRead() (string, error) {
	return runCmd("xclip", []string{"-selection", "clipboard", "-o"}, "")
}

func platformClipboardWrite(content string) error {
	_, err := runCmd("xclip", []string{"-selection", "clipboard"}, content)
	return err
}

func platformCaptureScreen(outputPath string) error {
	// Try scrot, then import, then gnome-screenshot
	if _, err := runCmd("scrot", []string{outputPath}, ""); err == nil {
		return nil
	}
	if _, err := runCmd("import", []string{"-window", "root", outputPath}, ""); err == nil {
		return nil
	}
	_, err := runCmd("gnome-screenshot", []string{"-f", outputPath}, "")
	return err
}

func platformDefaultShell() string {
	return "sh"
}

func platformGetActiveWindow() (appName string, windowTitle string) {
	titleOut, err := exec.Command("xdotool", "getactivewindow", "getwindowname").Output()
	if err != nil {
		return "", ""
	}
	title := strings.TrimSpace(string(titleOut))

	pidOut, err := exec.Command("xdotool", "getactivewindow", "getwindowpid").Output()
	app := ""
	if err == nil {
		pid := strings.TrimSpace(string(pidOut))
		cmdOut, err := exec.Command("ps", "-p", pid, "-o", "comm=").Output()
		if err == nil {
			app = strings.TrimSpace(string(cmdOut))
		}
	}
	if app == "" {
		app = title
	}
	return app, title
}
