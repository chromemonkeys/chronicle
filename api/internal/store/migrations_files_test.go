package store

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestMigrationsHaveMatchingUpAndDownFiles(t *testing.T) {
	migrationsDir := filepath.Join("..", "..", "..", "db", "migrations")
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		t.Fatalf("read migrations dir: %v", err)
	}

	pattern := regexp.MustCompile(`^(\d+)_.*\.(up|down)\.sql$`)
	byVersion := map[string]map[string]bool{}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		match := pattern.FindStringSubmatch(name)
		if match == nil {
			continue
		}
		version := match[1]
		direction := match[2]
		if byVersion[version] == nil {
			byVersion[version] = map[string]bool{}
		}
		if byVersion[version][direction] {
			t.Fatalf("duplicate %s migration file for version %s", direction, version)
		}
		byVersion[version][direction] = true
	}

	if len(byVersion) == 0 {
		t.Fatal("no migrations discovered")
	}

	for version, dirs := range byVersion {
		if !dirs["up"] || !dirs["down"] {
			t.Fatalf("version %s must include both up and down files", version)
		}
	}
}
