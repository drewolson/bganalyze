package server

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"

	bolt "go.etcd.io/bbolt"
)

var historyBucket = []byte("history")

// HistoryStore is a bbolt-backed store for match history entries.
type HistoryStore struct {
	db *bolt.DB
}

// compactDB rewrites the bbolt database at path to reclaim free pages.
func compactDB(path string) error {
	src, err := bolt.Open(path, 0o600, nil)
	if err != nil {
		return err
	}
	defer src.Close()

	dstPath := path + ".compact"
	dst, err := bolt.Open(dstPath, 0o600, nil)
	if err != nil {
		return err
	}
	defer dst.Close()

	if err := bolt.Compact(dst, src, 0); err != nil {
		return err
	}

	dst.Close()
	src.Close()

	return os.Rename(dstPath, path)
}

// OpenHistoryStore opens (or creates) a bbolt database at the given path.
func OpenHistoryStore(path string) (*HistoryStore, error) {
	if err := compactDB(path); err != nil {
		log.Printf("compactDB: %v (continuing)", err)
	}
	db, err := bolt.Open(path, 0o600, nil)
	if err != nil {
		return nil, fmt.Errorf("open history db: %w", err)
	}
	err = db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists(historyBucket)
		return err
	})
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("create history bucket: %w", err)
	}
	return &HistoryStore{db: db}, nil
}

// Close closes the underlying database.
func (s *HistoryStore) Close() error {
	return s.db.Close()
}

// List returns all history entries sorted by date descending.
func (s *HistoryStore) List() ([]HistoryEntry, error) {
	var entries []HistoryEntry
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(historyBucket)
		return b.ForEach(func(k, v []byte) error {
			var e HistoryEntry
			if err := json.Unmarshal(v, &e); err != nil {
				return err
			}
			entries = append(entries, e)
			return nil
		})
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Date > entries[j].Date
	})
	return entries, nil
}

// Get retrieves a single history entry by ID.
func (s *HistoryStore) Get(id string) (HistoryEntry, error) {
	var e HistoryEntry
	err := s.db.View(func(tx *bolt.Tx) error {
		v := tx.Bucket(historyBucket).Get([]byte(id))
		if v == nil {
			return fmt.Errorf("entry not found: %s", id)
		}
		return json.Unmarshal(v, &e)
	})
	return e, err
}

// Save upserts a history entry.
func (s *HistoryStore) Save(entry HistoryEntry) error {
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(historyBucket).Put([]byte(entry.ID), data)
	})
}

// Delete removes a single entry by ID.
func (s *HistoryStore) Delete(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(historyBucket).Delete([]byte(id))
	})
}

// Clear removes all entries.
func (s *HistoryStore) Clear() error {
	return s.db.Update(func(tx *bolt.Tx) error {
		if err := tx.DeleteBucket(historyBucket); err != nil {
			return err
		}
		_, err := tx.CreateBucket(historyBucket)
		return err
	})
}

// UpdateFlipped updates only the flipped field of an entry.
func (s *HistoryStore) UpdateFlipped(id string, flipped bool) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(historyBucket)
		v := b.Get([]byte(id))
		if v == nil {
			return fmt.Errorf("entry not found: %s", id)
		}
		var e HistoryEntry
		if err := json.Unmarshal(v, &e); err != nil {
			return err
		}
		e.Flipped = flipped
		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		return b.Put([]byte(id), data)
	})
}
