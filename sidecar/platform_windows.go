//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strings"
)

func platformClipboardRead() (string, error) {
	return runCmd("powershell", []string{"-command", "Get-Clipboard"}, "")
}

func platformClipboardWrite(content string) error {
	escaped := strings.ReplaceAll(content, "'", "''")
	_, err := runCmd("powershell", []string{"-command", fmt.Sprintf("Set-Clipboard -Value '%s'", escaped)}, "")
	return err
}

func platformCaptureScreen(outputPath string) error {
	psScript := fmt.Sprintf(
		`Add-Type -AssemblyName System.Windows.Forms; `+
			`[System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { `+
			`$bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); `+
			`$g = [System.Drawing.Graphics]::FromImage($bmp); `+
			`$g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); `+
			`$bmp.Save('%s') }`, outputPath)
	_, err := runCmd("powershell", []string{"-command", psScript}, "")
	return err
}

func platformDefaultShell() string {
	return "cmd.exe"
}

func platformGetActiveWindow() (appName string, windowTitle string) {
	out, err := exec.Command("powershell.exe", "-command",
		`(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Sort-Object -Property CPU -Descending | Select-Object -First 1).MainWindowTitle`).Output()
	if err != nil {
		return "", ""
	}
	title := strings.TrimSpace(string(out))
	return title, title
}
