package gnubg_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"bganalyze/gnubg"
)

func TestAnalyze(t *testing.T) {
	if _, err := exec.LookPath("gnubg"); err != nil {
		t.Skip("gnubg not in PATH, skipping integration test")
	}

	matPath := filepath.Join("..", "testdata", "heroes.mat")
	if _, err := os.Stat(matPath); err != nil {
		t.Fatalf("test data missing: %v", err)
	}

	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "output.txt")

	err := gnubg.Analyze(context.Background(), matPath, outPath, 0, "")
	if err != nil {
		t.Fatalf("Analyze failed: %v", err)
	}

	info, err := os.Stat(outPath)
	if err != nil {
		t.Fatalf("text output not found: %v", err)
	}
	if info.Size() == 0 {
		t.Fatal("text output is empty")
	}
}
