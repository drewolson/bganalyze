package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"bganalyze"
	"bganalyze/backend/internal/app/server"
	"bganalyze/backend/internal/pkg/gnubg"
)

func main() {
	port := flag.Int("port", 8080, "port to listen on")
	gnubgPath := flag.String("gnubgpath", "", "path to gnubg binary (default find via PATH)")
	dataDir := flag.String("datadir", "", "directory for persistent data (default OS config dir)")
	flag.Parse()

	frontendFS, err := fs.Sub(bganalyze.FrontendFiles, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	baseDir, err := os.MkdirTemp("", "bganalyze-*")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(baseDir)

	if *dataDir == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			log.Fatal(err)
		}
		*dataDir = filepath.Join(configDir, "bganalyze")
	}
	if err := os.MkdirAll(*dataDir, 0o755); err != nil {
		log.Fatal(err)
	}

	store, err := server.OpenHistoryStore(filepath.Join(*dataDir, "history.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()

	analyze := func(ctx context.Context, matPath, outPath string, ply int) error {
		return gnubg.Analyze(ctx, matPath, outPath, ply, *gnubgPath)
	}

	addr := fmt.Sprintf(":%d", *port)
	fmt.Printf("Listening on http://localhost%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, server.New(frontendFS, baseDir, analyze, store)))
}
