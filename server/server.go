package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"

	"bganalyze/gnubg"
)

// AnalyzeFunc is the signature for a function that analyzes a MAT file
// and writes the result to outPath.
type AnalyzeFunc func(ctx context.Context, matPath, outPath string, ply int) error

// Match tracks the state of an uploaded match being analyzed.
type Match struct {
	ID     string `json:"matchID"`
	Status string `json:"status"` // "analyzing", "complete", "error"
	Error  string `json:"error,omitempty"`
}

// Server holds shared state for the HTTP handlers.
type Server struct {
	mu      sync.Mutex
	matches map[string]*Match
	baseDir string
	analyze AnalyzeFunc
	store   *HistoryStore
	mux     *http.ServeMux
}

// New creates an HTTP handler that serves the embedded frontend and API endpoints.
func New(frontendFS fs.FS, baseDir string, analyze AnalyzeFunc, store *HistoryStore) http.Handler {
	s := &Server{
		matches: make(map[string]*Match),
		baseDir: baseDir,
		analyze: analyze,
		store:   store,
		mux:     http.NewServeMux(),
	}

	s.mux.HandleFunc("POST /api/upload", s.handleUpload)
	s.mux.HandleFunc("GET /api/match/{id}/status", s.handleMatchStatus)
	s.mux.HandleFunc("GET /api/match/{id}/analysis", s.handleMatchAnalysis)
	s.mux.HandleFunc("GET /api/history", s.handleHistoryList)
	s.mux.HandleFunc("POST /api/history", s.handleHistorySave)
	s.mux.HandleFunc("DELETE /api/history/{id}", s.handleHistoryDelete)
	s.mux.HandleFunc("DELETE /api/history", s.handleHistoryClear)
	s.mux.HandleFunc("PATCH /api/history/{id}", s.handleHistoryPatch)
	s.mux.HandleFunc("POST /api/history/{id}/reanalyze", s.handleReanalyze)
	s.mux.Handle("/", http.FileServerFS(frontendFS))

	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	supported := slices.Contains(gnubg.SupportedExtensions, ext)
	if !supported {
		http.Error(w, "unsupported file type", http.StatusBadRequest)
		return
	}

	id, err := generateID()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	matchDir := filepath.Join(s.baseDir, id)
	if err := os.MkdirAll(matchDir, 0o755); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	matPath := filepath.Join(matchDir, "match"+ext)
	dst, err := os.Create(matPath)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if _, err := io.Copy(dst, file); err != nil {
		dst.Close()
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	dst.Close()

	ply := 2
	if v := r.FormValue("ply"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p >= 0 && p <= 4 {
			ply = p
		}
	}

	m := &Match{ID: id, Status: "analyzing"}

	s.mu.Lock()
	s.matches[id] = m
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(m)

	go s.runAnalysis(id, matPath, filepath.Join(matchDir, "analysis.txt"), ply)
}

func (s *Server) runAnalysis(id, matPath, outPath string, ply int) {
	err := s.analyze(context.Background(), matPath, outPath, ply)

	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.matches[id].Status = "error"
		s.matches[id].Error = err.Error()
	} else {
		s.matches[id].Status = "complete"
	}
}

func (s *Server) handleMatchStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	s.mu.Lock()
	m, ok := s.matches[id]
	s.mu.Unlock()

	if !ok {
		http.Error(w, "match not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(m)
}

func (s *Server) handleMatchAnalysis(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	s.mu.Lock()
	m, ok := s.matches[id]
	s.mu.Unlock()

	if !ok {
		http.Error(w, "match not found", http.StatusNotFound)
		return
	}
	if m.Status != "complete" {
		http.Error(w, "analysis not ready", http.StatusNotFound)
		return
	}

	matchDir := filepath.Join(s.baseDir, id)
	md, err := gnubg.ParseMatchFiles(matchDir)
	if err != nil {
		http.Error(w, "failed to parse analysis", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(md)
}

func (s *Server) handleReanalyze(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var body struct {
		Ply int `json:"ply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Ply < 0 || body.Ply > 4 {
		http.Error(w, "ply must be between 0 and 4", http.StatusBadRequest)
		return
	}

	entry, err := s.store.Get(id)
	if err != nil {
		http.Error(w, "history entry not found", http.StatusNotFound)
		return
	}
	if len(entry.MatchFile) == 0 {
		http.Error(w, "no match file stored for this entry", http.StatusBadRequest)
		return
	}

	matchDir := filepath.Join(s.baseDir, id)
	if err := os.MkdirAll(matchDir, 0o755); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	matPath := filepath.Join(matchDir, "match"+entry.MatchFileExt)
	if err := os.WriteFile(matPath, entry.MatchFile, 0o644); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	m := &Match{ID: id, Status: "analyzing"}

	s.mu.Lock()
	s.matches[id] = m
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(m)

	go s.runAnalysis(id, matPath, filepath.Join(matchDir, "analysis.txt"), body.Ply)
}

func generateID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
