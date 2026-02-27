package store

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// TestDecisionLogImmutabilityBlocksUpdate verifies that UPDATE operations
// on decision_log are blocked by the database trigger with a hard failure.
func TestDecisionLogImmutabilityBlocksUpdate(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	// Get database URL from environment or skip
	databaseURL := getTestDatabaseURL(t)
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	// Ensure migration 0005 is applied
	_, err = db.ExecContext(ctx, `
		SELECT 1 FROM information_schema.triggers 
		WHERE trigger_name = 'trg_decision_log_block_update'
	`)
	if err != nil {
		t.Fatalf("immutability trigger not found; migration 0005 may not be applied: %v", err)
	}

	// Insert a test decision log entry
	_, err = db.ExecContext(ctx, `
		INSERT INTO decision_log (thread_id, document_id, proposal_id, outcome, rationale, decided_by_name, commit_hash, participants)
		VALUES ('thread-test-update', 'doc-test', 'prop-test', 'ACCEPTED', 'Test rationale', 'Test User', 'abc123', '[]'::jsonb)
	`)
	if err != nil {
		t.Fatalf("insert test decision log: %v", err)
	}

	// Attempt to UPDATE the decision log entry - should fail
	_, err = db.ExecContext(ctx, `
		UPDATE decision_log 
		SET rationale = 'Modified rationale' 
		WHERE thread_id = 'thread-test-update'
	`)

	if err == nil {
		t.Fatal("expected UPDATE to be blocked, but it succeeded")
	}

	// Verify it's the expected trigger error
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		t.Fatalf("expected PostgreSQL error, got: %v", err)
	}

	if pgErr.SQLState() != "55000" {
		t.Fatalf("expected SQLSTATE 55000 (object_not_in_prerequisite_state), got: %s", pgErr.SQLState())
	}

	if pgErr.Message != "decision_log is immutable; UPDATE is not allowed" {
		t.Fatalf("unexpected error message: %s", pgErr.Message)
	}

	// Cleanup
	// Note: We can't delete directly due to the trigger, so we use TRUNCATE for test cleanup
	_, _ = db.ExecContext(ctx, `TRUNCATE decision_log`)
}

// TestDecisionLogImmutabilityBlocksDelete verifies that DELETE operations
// on decision_log are blocked by the database trigger with a hard failure.
func TestDecisionLogImmutabilityBlocksDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	databaseURL := getTestDatabaseURL(t)
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	// Insert a test decision log entry
	_, err = db.ExecContext(ctx, `
		INSERT INTO decision_log (thread_id, document_id, proposal_id, outcome, rationale, decided_by_name, commit_hash, participants)
		VALUES ('thread-test-delete', 'doc-test', 'prop-test', 'REJECTED', 'Test rationale', 'Test User', 'def456', '[]'::jsonb)
	`)
	if err != nil {
		t.Fatalf("insert test decision log: %v", err)
	}

	// Attempt to DELETE the decision log entry - should fail
	_, err = db.ExecContext(ctx, `
		DELETE FROM decision_log 
		WHERE thread_id = 'thread-test-delete'
	`)

	if err == nil {
		t.Fatal("expected DELETE to be blocked, but it succeeded")
	}

	// Verify it's the expected trigger error
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		t.Fatalf("expected PostgreSQL error, got: %v", err)
	}

	if pgErr.SQLState() != "55000" {
		t.Fatalf("expected SQLSTATE 55000 (object_not_in_prerequisite_state), got: %s", pgErr.SQLState())
	}

	if pgErr.Message != "decision_log is immutable; DELETE is not allowed" {
		t.Fatalf("unexpected error message: %s", pgErr.Message)
	}

	// Cleanup
	_, _ = db.ExecContext(ctx, `TRUNCATE decision_log`)
}

// TestDecisionLogInsertStillWorks verifies that INSERT operations
// on decision_log continue to work normally.
func TestDecisionLogInsertStillWorks(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	databaseURL := getTestDatabaseURL(t)
	db, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer db.Close()

	// Insert should succeed
	_, err = db.ExecContext(ctx, `
		INSERT INTO decision_log (thread_id, document_id, proposal_id, outcome, rationale, decided_by_name, commit_hash, participants)
		VALUES ('thread-test-insert', 'doc-test', 'prop-test', 'DEFERRED', 'Test rationale', 'Test User', 'ghi789', '["user1", "user2"]'::jsonb)
	`)
	if err != nil {
		t.Fatalf("insert decision log should succeed: %v", err)
	}

	// Verify the entry exists
	var count int
	err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM decision_log WHERE thread_id = 'thread-test-insert'`).Scan(&count)
	if err != nil {
		t.Fatalf("query decision log: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 decision log entry, got %d", count)
	}

	// Cleanup
	_, _ = db.ExecContext(ctx, `TRUNCATE decision_log`)
}

// getTestDatabaseURL returns the database URL for testing.
// It checks the TEST_DATABASE_URL environment variable first,
// then falls back to a default local development URL.
func getTestDatabaseURL(t *testing.T) string {
	t.Helper()

	// Check if we have a test database URL in environment
	if url := getenv("TEST_DATABASE_URL", ""); url != "" {
		return url
	}

	// For CI environments, try the standard Postgres environment variables
	host := getenv("POSTGRES_HOST", "localhost")
	port := getenv("POSTGRES_PORT", "5432")
	user := getenv("POSTGRES_USER", "chronicle")
	pass := getenv("POSTGRES_PASSWORD", "chronicle")
	dbname := getenv("POSTGRES_DB", "chronicle_test")

	return "postgres://" + user + ":" + pass + "@" + host + ":" + port + "/" + dbname + "?sslmode=disable"
}

func getenv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
