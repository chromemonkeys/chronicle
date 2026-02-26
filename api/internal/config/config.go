package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Addr          string
	DatabaseURL   string
	JWTSecret     string
	SyncToken     string
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
	ReposDir      string
	MigrationsDir string
	CORSOrigin    string
}

func Load() Config {
	return Config{
		Addr:          getenv("API_ADDR", ":8787"),
		DatabaseURL:   getenv("DATABASE_URL", "postgres://chronicle:chronicle@localhost:5432/chronicle?sslmode=disable"),
		JWTSecret:     getenv("CHRONICLE_JWT_SECRET", "chronicle-dev-secret"),
		SyncToken:     getenv("CHRONICLE_SYNC_TOKEN", "chronicle-sync-token"),
		AccessTTL:     time.Duration(getenvInt("CHRONICLE_ACCESS_TTL_SECONDS", 900)) * time.Second,
		RefreshTTL:    time.Duration(getenvInt("CHRONICLE_REFRESH_TTL_SECONDS", 2592000)) * time.Second,
		ReposDir:      getenv("CHRONICLE_REPOS_DIR", "./data/repos"),
		MigrationsDir: getenv("CHRONICLE_MIGRATIONS_DIR", "./db/migrations"),
		CORSOrigin:    getenv("CHRONICLE_CORS_ORIGIN", "*"),
	}
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
