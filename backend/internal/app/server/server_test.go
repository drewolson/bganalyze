package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"bganalyze/backend/internal/app/server"
)

const fixtureDir = "../../../../testdata/heroes-analysis"

var fakeFS = fstest.MapFS{
	"index.html": &fstest.MapFile{
		Data: []byte(`<!doctype html><html><body><div id="root"></div></body></html>`),
	},
}

func noopAnalyze(_ context.Context, _, _ string, _ int) error { return nil }

func newTestStore(t *testing.T) *server.HistoryStore {
	t.Helper()
	s, err := server.OpenHistoryStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(server.New(fakeFS, t.TempDir(), noopAnalyze, newTestStore(t)))
}

func TestServesIndex(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}

	if !strings.Contains(string(body), `<div id="root">`) {
		t.Fatalf("response body missing root div: %s", body)
	}
}

func uploadMAT(t *testing.T, srvURL, filename string) *http.Response {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	part.Write([]byte("; fake mat data\n"))
	w.Close()

	resp, err := http.Post(srvURL+"/api/upload", w.FormDataContentType(), &buf)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestUploadValid(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp := uploadMAT(t, srv.URL, "game.mat")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", resp.StatusCode)
	}

	var m server.Match
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if m.ID == "" {
		t.Fatal("expected non-empty match ID")
	}
	if m.Status != "analyzing" {
		t.Fatalf("expected status 'analyzing', got %q", m.Status)
	}
}

func TestUploadInvalidExtension(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp := uploadMAT(t, srv.URL, "game.pdf")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestUploadNoFile(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/api/upload", "application/octet-stream", strings.NewReader(""))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestMatchStatusNotFound(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/match/nonexistent/status")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestAnalysisReturnsJSON(t *testing.T) {
	baseDir := t.TempDir()

	// Analyze func copies test fixtures into the match directory
	copyFixtures := func(_ context.Context, _, outPath string, _ int) error {
		matchDir := filepath.Dir(outPath)
		entries, err := os.ReadDir(fixtureDir)
		if err != nil {
			return err
		}
		for _, e := range entries {
			data, err := os.ReadFile(filepath.Join(fixtureDir, e.Name()))
			if err != nil {
				return err
			}
			if err := os.WriteFile(filepath.Join(matchDir, e.Name()), data, 0o644); err != nil {
				return err
			}
		}
		return nil
	}

	srv := httptest.NewServer(server.New(fakeFS, baseDir, copyFixtures, newTestStore(t)))
	defer srv.Close()

	// Upload a .mat file
	resp := uploadMAT(t, srv.URL, "test.mat")
	defer resp.Body.Close()

	var m server.Match
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		t.Fatalf("decode upload: %v", err)
	}

	// Poll until complete
	for range 50 {
		time.Sleep(50 * time.Millisecond)
		r, err := http.Get(srv.URL + "/api/match/" + m.ID + "/status")
		if err != nil {
			t.Fatal(err)
		}
		var status server.Match
		json.NewDecoder(r.Body).Decode(&status)
		r.Body.Close()
		if status.Status == "complete" {
			break
		}
		if status.Status == "error" {
			t.Fatalf("analysis error: %s", status.Error)
		}
	}

	// Fetch analysis — should be JSON
	r, err := http.Get(srv.URL + "/api/match/" + m.ID + "/analysis")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()

	if r.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(r.Body)
		t.Fatalf("expected 200, got %d: %s", r.StatusCode, body)
	}
	if ct := r.Header.Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Fatalf("expected JSON content type, got %q", ct)
	}

	var result struct {
		Player1 string `json:"Player1"`
		Player2 string `json:"Player2"`
		Games   []struct {
			GameNumber int `json:"GameNumber"`
		} `json:"Games"`
	}
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		t.Fatalf("decode analysis JSON: %v", err)
	}
	if result.Player1 != "rchoice" {
		t.Errorf("Player1 = %q, want %q", result.Player1, "rchoice")
	}
	if result.Player2 != "A192K" {
		t.Errorf("Player2 = %q, want %q", result.Player2, "A192K")
	}
	if len(result.Games) != 5 {
		t.Errorf("Games count = %d, want 5", len(result.Games))
	}
}

// --- History endpoint tests ---

func TestHistoryListEmpty(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/history")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var entries []server.HistoryEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty list, got %d entries", len(entries))
	}
}

func postHistoryEntry(t *testing.T, srvURL string, entry server.HistoryEntry) *http.Response {
	t.Helper()
	body, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.Post(srvURL+"/api/history", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestHistorySaveAndList(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	entry := server.HistoryEntry{
		ID:      "test-1",
		Player1: "Alice",
		Player2: "Bob",
		Date:    "2025-01-01T00:00:00Z",
	}

	resp := postHistoryEntry(t, srv.URL, entry)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("POST expected 204, got %d", resp.StatusCode)
	}

	// List
	r, err := http.Get(srv.URL + "/api/history")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()

	var entries []server.HistoryEntry
	if err := json.NewDecoder(r.Body).Decode(&entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Player1 != "Alice" {
		t.Errorf("expected player1 Alice, got %q", entries[0].Player1)
	}
}

func TestHistoryDeleteOne(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp := postHistoryEntry(t, srv.URL, server.HistoryEntry{ID: "del-1", Player1: "A", Player2: "B"})
	resp.Body.Close()
	resp = postHistoryEntry(t, srv.URL, server.HistoryEntry{ID: "del-2", Player1: "C", Player2: "D"})
	resp.Body.Close()

	req, _ := http.NewRequest("DELETE", srv.URL+"/api/history/del-1", nil)
	delResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE expected 204, got %d", delResp.StatusCode)
	}

	r, err := http.Get(srv.URL + "/api/history")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var entries []server.HistoryEntry
	json.NewDecoder(r.Body).Decode(&entries)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry after delete, got %d", len(entries))
	}
	if entries[0].ID != "del-2" {
		t.Errorf("expected remaining entry 'del-2', got %q", entries[0].ID)
	}
}

func TestHistoryClearAll(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp := postHistoryEntry(t, srv.URL, server.HistoryEntry{ID: "c-1"})
	resp.Body.Close()
	resp = postHistoryEntry(t, srv.URL, server.HistoryEntry{ID: "c-2"})
	resp.Body.Close()

	req, _ := http.NewRequest("DELETE", srv.URL+"/api/history", nil)
	delResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE all expected 204, got %d", delResp.StatusCode)
	}

	r, err := http.Get(srv.URL + "/api/history")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var entries []server.HistoryEntry
	json.NewDecoder(r.Body).Decode(&entries)
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
}

func TestHistorySaveAttachesMatchFile(t *testing.T) {
	baseDir := t.TempDir()
	store := newTestStore(t)
	srv := httptest.NewServer(server.New(fakeFS, baseDir, noopAnalyze, store))
	defer srv.Close()

	// Create a match file in the temp dir as if upload had occurred
	id := "attach-test"
	matchDir := filepath.Join(baseDir, id)
	if err := os.MkdirAll(matchDir, 0o755); err != nil {
		t.Fatal(err)
	}
	matchContent := []byte("; fake mat data\n")
	if err := os.WriteFile(filepath.Join(matchDir, "match.mat"), matchContent, 0o644); err != nil {
		t.Fatal(err)
	}

	// Save a history entry — server should attach the match file
	entry := server.HistoryEntry{
		ID:      id,
		Player1: "Alice",
		Player2: "Bob",
		Date:    "2025-01-01T00:00:00Z",
	}
	resp := postHistoryEntry(t, srv.URL, entry)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("POST expected 204, got %d", resp.StatusCode)
	}

	// Verify the store has the match file by reading directly
	got, err := store.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.MatchFile, matchContent) {
		t.Errorf("MatchFile = %q, want %q", got.MatchFile, matchContent)
	}
	if got.MatchFileExt != ".mat" {
		t.Errorf("MatchFileExt = %q, want %q", got.MatchFileExt, ".mat")
	}
}

func TestHistorySaveNoMatchFile(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	// Save an entry with no match file on disk — should succeed with empty match file
	entry := server.HistoryEntry{
		ID:      "no-file",
		Player1: "Alice",
		Player2: "Bob",
		Date:    "2025-01-01T00:00:00Z",
	}
	resp := postHistoryEntry(t, srv.URL, entry)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("POST expected 204, got %d", resp.StatusCode)
	}
}

func TestReanalyze(t *testing.T) {
	baseDir := t.TempDir()
	store := newTestStore(t)

	copyFixtures := func(_ context.Context, _, outPath string, _ int) error {
		matchDir := filepath.Dir(outPath)
		entries, err := os.ReadDir(fixtureDir)
		if err != nil {
			return err
		}
		for _, e := range entries {
			data, err := os.ReadFile(filepath.Join(fixtureDir, e.Name()))
			if err != nil {
				return err
			}
			if err := os.WriteFile(filepath.Join(matchDir, e.Name()), data, 0o644); err != nil {
				return err
			}
		}
		return nil
	}

	srv := httptest.NewServer(server.New(fakeFS, baseDir, copyFixtures, store))
	defer srv.Close()

	// Upload a match file first
	resp := uploadMAT(t, srv.URL, "test.mat")
	defer resp.Body.Close()
	var m server.Match
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		t.Fatal(err)
	}

	// Wait for initial analysis to complete
	for range 50 {
		time.Sleep(50 * time.Millisecond)
		r, err := http.Get(srv.URL + "/api/match/" + m.ID + "/status")
		if err != nil {
			t.Fatal(err)
		}
		var status server.Match
		json.NewDecoder(r.Body).Decode(&status)
		r.Body.Close()
		if status.Status == "complete" {
			break
		}
	}

	// Save history entry (this attaches match file from temp dir)
	entry := server.HistoryEntry{
		ID:      m.ID,
		Player1: "rchoice",
		Player2: "A192K",
		Date:    "2025-01-01T00:00:00Z",
		Ply:     2,
	}
	saveResp := postHistoryEntry(t, srv.URL, entry)
	saveResp.Body.Close()

	// Now reanalyze at a different ply
	reanalyzeBody := strings.NewReader(`{"ply": 3}`)
	req, _ := http.NewRequest("POST", srv.URL+"/api/history/"+m.ID+"/reanalyze", reanalyzeBody)
	req.Header.Set("Content-Type", "application/json")
	reResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer reResp.Body.Close()
	if reResp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(reResp.Body)
		t.Fatalf("reanalyze expected 202, got %d: %s", reResp.StatusCode, body)
	}

	var reMatch server.Match
	json.NewDecoder(reResp.Body).Decode(&reMatch)
	if reMatch.ID != m.ID {
		t.Errorf("reanalyze matchID = %q, want %q", reMatch.ID, m.ID)
	}
	if reMatch.Status != "analyzing" {
		t.Errorf("reanalyze status = %q, want 'analyzing'", reMatch.Status)
	}

	// Poll until reanalysis completes
	for range 50 {
		time.Sleep(50 * time.Millisecond)
		r, err := http.Get(srv.URL + "/api/match/" + m.ID + "/status")
		if err != nil {
			t.Fatal(err)
		}
		var status server.Match
		json.NewDecoder(r.Body).Decode(&status)
		r.Body.Close()
		if status.Status == "complete" {
			break
		}
		if status.Status == "error" {
			t.Fatalf("reanalysis error: %s", status.Error)
		}
	}
}

func TestReanalyzeInvalidPly(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	body := strings.NewReader(`{"ply": 5}`)
	req, _ := http.NewRequest("POST", srv.URL+"/api/history/any-id/reanalyze", body)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestReanalyzeNoMatchFile(t *testing.T) {
	store := newTestStore(t)
	srv := httptest.NewServer(server.New(fakeFS, t.TempDir(), noopAnalyze, store))
	defer srv.Close()

	// Save an entry without a match file (no temp dir file exists)
	entry := server.HistoryEntry{
		ID:      "no-file",
		Player1: "Alice",
		Player2: "Bob",
		Date:    "2025-01-01T00:00:00Z",
	}
	resp := postHistoryEntry(t, srv.URL, entry)
	resp.Body.Close()

	// Try to reanalyze — should fail because no match file stored
	body := strings.NewReader(`{"ply": 2}`)
	req, _ := http.NewRequest("POST", srv.URL+"/api/history/no-file/reanalyze", body)
	req.Header.Set("Content-Type", "application/json")
	reResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer reResp.Body.Close()
	if reResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", reResp.StatusCode)
	}
}

func TestReanalyzeEntryNotFound(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	body := strings.NewReader(`{"ply": 2}`)
	req, _ := http.NewRequest("POST", srv.URL+"/api/history/nonexistent/reanalyze", body)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestHistoryPatchFlipped(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	resp := postHistoryEntry(t, srv.URL, server.HistoryEntry{ID: "p-1", Flipped: false})
	resp.Body.Close()

	body := strings.NewReader(`{"flipped": true}`)
	req, _ := http.NewRequest("PATCH", srv.URL+"/api/history/p-1", body)
	req.Header.Set("Content-Type", "application/json")
	patchResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	patchResp.Body.Close()
	if patchResp.StatusCode != http.StatusNoContent {
		t.Fatalf("PATCH expected 204, got %d", patchResp.StatusCode)
	}

	r, err := http.Get(srv.URL + "/api/history")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	var entries []server.HistoryEntry
	json.NewDecoder(r.Body).Decode(&entries)
	if len(entries) != 1 || !entries[0].Flipped {
		t.Fatalf("expected flipped=true, got %v", entries)
	}
}
