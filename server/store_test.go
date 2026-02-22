package server

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func openTestStore(t *testing.T) *HistoryStore {
	t.Helper()
	s, err := OpenHistoryStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestStoreListEmpty(t *testing.T) {
	s := openTestStore(t)
	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty list, got %d entries", len(entries))
	}
}

func TestStoreSaveAndList(t *testing.T) {
	s := openTestStore(t)

	e1 := HistoryEntry{ID: "a", Player1: "Alice", Player2: "Bob", Date: "2025-01-02T00:00:00Z", Data: json.RawMessage(`{}`)}
	e2 := HistoryEntry{ID: "b", Player1: "Carol", Player2: "Dave", Date: "2025-01-03T00:00:00Z", Data: json.RawMessage(`{}`)}

	if err := s.Save(e1); err != nil {
		t.Fatal(err)
	}
	if err := s.Save(e2); err != nil {
		t.Fatal(err)
	}

	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	// Should be sorted by date desc
	if entries[0].ID != "b" {
		t.Errorf("expected first entry ID 'b', got %q", entries[0].ID)
	}
	if entries[1].ID != "a" {
		t.Errorf("expected second entry ID 'a', got %q", entries[1].ID)
	}
}

func TestStoreSaveUpsert(t *testing.T) {
	s := openTestStore(t)

	e := HistoryEntry{ID: "a", Player1: "Alice", Player2: "Bob", Date: "2025-01-01T00:00:00Z", Data: json.RawMessage(`{}`)}
	if err := s.Save(e); err != nil {
		t.Fatal(err)
	}

	e.Player1 = "Updated"
	if err := s.Save(e); err != nil {
		t.Fatal(err)
	}

	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry after upsert, got %d", len(entries))
	}
	if entries[0].Player1 != "Updated" {
		t.Errorf("expected player1 'Updated', got %q", entries[0].Player1)
	}
}

func TestStoreDelete(t *testing.T) {
	s := openTestStore(t)

	if err := s.Save(HistoryEntry{ID: "a", Data: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
	if err := s.Save(HistoryEntry{ID: "b", Data: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}

	if err := s.Delete("a"); err != nil {
		t.Fatal(err)
	}

	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].ID != "b" {
		t.Errorf("expected remaining entry ID 'b', got %q", entries[0].ID)
	}
}

func TestStoreClear(t *testing.T) {
	s := openTestStore(t)

	if err := s.Save(HistoryEntry{ID: "a", Data: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
	if err := s.Save(HistoryEntry{ID: "b", Data: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}

	if err := s.Clear(); err != nil {
		t.Fatal(err)
	}

	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
}

func TestStoreUpdateFlipped(t *testing.T) {
	s := openTestStore(t)

	if err := s.Save(HistoryEntry{ID: "a", Flipped: false, Data: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}

	if err := s.UpdateFlipped("a", true); err != nil {
		t.Fatal(err)
	}

	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if !entries[0].Flipped {
		t.Error("expected flipped to be true")
	}
}

func TestStoreUpdateFlippedNotFound(t *testing.T) {
	s := openTestStore(t)

	err := s.UpdateFlipped("nonexistent", true)
	if err == nil {
		t.Error("expected error for nonexistent entry")
	}
}

func TestStoreCompaction(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "compact.db")

	// Write many entries then close.
	s, err := OpenHistoryStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	bigData := json.RawMessage(`{"payload":"` + strings.Repeat("x", 4096) + `"}`)
	for i := range 100 {
		id := fmt.Sprintf("entry-%03d", i)
		if err := s.Save(HistoryEntry{ID: id, Data: bigData}); err != nil {
			t.Fatal(err)
		}
	}
	s.Close()

	// Record peak file size.
	peakInfo, err := os.Stat(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	peakSize := peakInfo.Size()

	// Reopen, clear, write one small entry, then close.
	s, err = OpenHistoryStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Clear(); err != nil {
		t.Fatal(err)
	}
	if err := s.Save(HistoryEntry{ID: "survivor", Player1: "Alice", Data: json.RawMessage(`{}`)}); err != nil {
		t.Fatal(err)
	}
	s.Close()

	// Reopen — triggers compaction.
	s, err = OpenHistoryStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	compactInfo, err := os.Stat(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if compactInfo.Size() >= peakSize {
		t.Errorf("expected compacted size (%d) < peak size (%d)", compactInfo.Size(), peakSize)
	}

	// Verify surviving entry is intact.
	entries, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].ID != "survivor" || entries[0].Player1 != "Alice" {
		t.Errorf("unexpected entry: %+v", entries[0])
	}
}
