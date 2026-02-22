package gnubg

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// SupportedExtensions lists file extensions that can be analyzed.
var SupportedExtensions = []string{".mat", ".sgf", ".gam", ".sgg", ".tmg", ".txt"}

// loadCommand returns the gnubg command to load a match file.
// SGF files use "load match"; all others use "import auto".
func loadCommand(filePath string) string {
	if strings.ToLower(filepath.Ext(filePath)) == ".sgf" {
		return fmt.Sprintf("load match \"%s\"", filePath)
	}
	return fmt.Sprintf("import auto \"%s\"", filePath)
}

// Analyze invokes gnubg to analyze the match file at matPath and writes
// the resulting text export to outPath. It creates a temporary command file
// that instructs gnubg to import, analyze, and export the match.
func Analyze(ctx context.Context, matPath, outPath string, ply int, gnubgPath string) error {
	absMAT, err := filepath.Abs(matPath)
	if err != nil {
		return fmt.Errorf("resolving mat path: %w", err)
	}
	absOut, err := filepath.Abs(outPath)
	if err != nil {
		return fmt.Errorf("resolving output path: %w", err)
	}

	cmdFile, err := os.CreateTemp("", "gnubg-cmd-*.txt")
	if err != nil {
		return fmt.Errorf("creating command file: %w", err)
	}
	defer os.Remove(cmdFile.Name())

	commands := fmt.Sprintf("%s\nset output matchpc off\nset analysis chequerplay evaluation plies %d\nset analysis cubedecision evaluation plies %d\nanalyse match\nexport match text \"%s\"\nquit\n", loadCommand(absMAT), ply, ply, absOut)
	if _, err := cmdFile.WriteString(commands); err != nil {
		cmdFile.Close()
		return fmt.Errorf("writing command file: %w", err)
	}
	cmdFile.Close()

	bin := "gnubg"
	if gnubgPath != "" {
		bin = gnubgPath
	}
	cmd := exec.CommandContext(ctx, bin, "-t", "-q", "-r", "-c", cmdFile.Name())
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("gnubg failed: %w\noutput: %s", err, output)
	}

	info, err := os.Stat(absOut)
	if err != nil {
		return fmt.Errorf("text output not produced: %w", err)
	}
	if info.Size() == 0 {
		return fmt.Errorf("text output is empty")
	}

	return nil
}
