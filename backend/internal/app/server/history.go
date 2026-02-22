package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// HistoryEntry represents a single analyzed match stored in history.
type HistoryEntry struct {
	ID           string          `json:"id"`
	Player1      string          `json:"player1"`
	Player2      string          `json:"player2"`
	MatchLength  int             `json:"matchLength"`
	FinalScore   [2]int          `json:"finalScore"`
	Date         string          `json:"date"`
	Ply          int             `json:"ply"`
	Data         json.RawMessage `json:"data"`
	Flipped      bool            `json:"flipped"`
	MatchFile    []byte          `json:"matchFile,omitempty"`
	MatchFileExt string          `json:"matchFileExt,omitempty"`
}

func (s *Server) handleHistoryList(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.List()
	if err != nil {
		http.Error(w, "failed to list history", http.StatusInternalServerError)
		return
	}
	if entries == nil {
		entries = []HistoryEntry{}
	}
	// Strip match file bytes from list response — they're only needed for reanalysis.
	for i := range entries {
		entries[i].MatchFile = nil
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func (s *Server) handleHistorySave(w http.ResponseWriter, r *http.Request) {
	var entry HistoryEntry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if entry.ID == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	// Attach the original match file from the temp directory if available.
	if entry.MatchFile == nil {
		s.attachMatchFile(&entry)
	}

	if err := s.store.Save(entry); err != nil {
		http.Error(w, "failed to save", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// attachMatchFile looks for a match file in the temp directory for the given
// entry and populates MatchFile and MatchFileExt if found.
func (s *Server) attachMatchFile(entry *HistoryEntry) {
	matchDir := filepath.Join(s.baseDir, entry.ID)
	entries, err := os.ReadDir(matchDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "match.") {
			ext := filepath.Ext(e.Name())
			data, err := os.ReadFile(filepath.Join(matchDir, e.Name()))
			if err != nil {
				return
			}
			entry.MatchFile = data
			entry.MatchFileExt = ext
			return
		}
	}
}

func (s *Server) handleHistoryDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.store.Delete(id); err != nil {
		http.Error(w, "failed to delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleHistoryClear(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Clear(); err != nil {
		http.Error(w, "failed to clear", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleHistoryPatch(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Flipped *bool `json:"flipped"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Flipped != nil {
		if err := s.store.UpdateFlipped(id, *body.Flipped); err != nil {
			http.Error(w, "failed to update", http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
