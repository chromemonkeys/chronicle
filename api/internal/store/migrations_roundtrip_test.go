package store

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestMigrationsRoundTripPostgres(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("CHRONICLE_TEST_DATABASE_URL"))
	if dsn == "" {
		t.Skip("CHRONICLE_TEST_DATABASE_URL is not set")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("ping postgres: %v", err)
	}

	if err := resetPublicSchema(ctx, db); err != nil {
		t.Fatalf("reset schema: %v", err)
	}

	migrationsDir := filepath.Join("..", "..", "..", "db", "migrations")

	if err := ApplyMigrations(ctx, db, migrationsDir); err != nil {
		t.Fatalf("apply up migrations (pass 1): %v", err)
	}

	if err := applyDownMigrations(ctx, db, migrationsDir); err != nil {
		t.Fatalf("apply down migrations: %v", err)
	}

	if _, err := db.ExecContext(ctx, `DELETE FROM schema_migrations`); err != nil {
		t.Fatalf("clear schema_migrations: %v", err)
	}

	if err := ApplyMigrations(ctx, db, migrationsDir); err != nil {
		t.Fatalf("apply up migrations (pass 2): %v", err)
	}
}

func resetPublicSchema(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`)
	return err
}

func applyDownMigrations(ctx context.Context, db *sql.DB, migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return err
	}

	pattern := regexp.MustCompile(`^(\d+)_.*\.down\.sql$`)
	type migration struct {
		version string
		path    string
	}
	downs := make([]migration, 0)

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		match := pattern.FindStringSubmatch(name)
		if match == nil {
			continue
		}
		downs = append(downs, migration{
			version: match[1],
			path:    filepath.Join(migrationsDir, name),
		})
	}

	sort.Slice(downs, func(i, j int) bool {
		return downs[i].version > downs[j].version
	})

	for _, down := range downs {
		sqlBytes, err := os.ReadFile(down.path)
		if err != nil {
			return err
		}
		sqlText := strings.TrimSpace(string(sqlBytes))
		if sqlText == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, sqlText); err != nil {
			return err
		}
	}

	return nil
}
