package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDecisionLogImmutabilityMigrationUsesBlockingTriggers(t *testing.T) {
	migrationPath := filepath.Join("..", "..", "..", "db", "migrations", "0005_decision_log_immutability_trigger.up.sql")
	sqlBytes, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sqlText := string(sqlBytes)

	expectedSnippets := []string{
		"decision_log_immutable_guard",
		"RAISE EXCEPTION",
		"CREATE TRIGGER trg_decision_log_block_update",
		"CREATE TRIGGER trg_decision_log_block_delete",
	}
	for _, snippet := range expectedSnippets {
		if !strings.Contains(sqlText, snippet) {
			t.Fatalf("expected migration to contain %q", snippet)
		}
	}
	if strings.Contains(sqlText, "DO INSTEAD NOTHING") {
		t.Fatalf("expected hard-fail immutability guard, found silent DO INSTEAD NOTHING rule")
	}
}
