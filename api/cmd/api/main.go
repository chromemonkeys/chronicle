package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"chronicle/api/internal/app"
	"chronicle/api/internal/config"
	"chronicle/api/internal/gitrepo"
	"chronicle/api/internal/search"
	"chronicle/api/internal/session"
	"chronicle/api/internal/store"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	if err := store.ApplyMigrations(ctx, db, cfg.MigrationsDir); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	if err := os.MkdirAll(cfg.ReposDir, 0o755); err != nil {
		log.Fatalf("failed to create repos dir: %v", err)
	}

	dataStore := store.NewPostgresStore(db)
	gitService := gitrepo.New(cfg.ReposDir)
	pgfts := search.NewPgFTS(db)
	var meiliClient *search.Meili
	if strings.TrimSpace(cfg.MeiliURL) != "" {
		meiliClient = search.NewMeili(cfg.MeiliURL, cfg.MeiliMasterKey)
	}
	searchService := search.NewService(meiliClient, pgfts)
	if meiliClient != nil {
		defer meiliClient.Close()
	}

	// Initialize Redis session store for refresh tokens (AUTH-102)
	var service *app.Service
	if strings.TrimSpace(cfg.RedisURL) != "" {
		log.Printf("Using Redis for refresh token storage")
		redisStore, err := session.NewRedisStore(cfg.RedisURL)
		if err != nil {
			log.Fatalf("redis connection failed: %v", err)
		}
		defer redisStore.Close()
		service = app.NewWithSessionStore(cfg, dataStore, redisStore, gitService, searchService)
	} else {
		log.Printf("Using PostgreSQL for refresh token storage")
		service = app.New(cfg, dataStore, gitService, searchService)
	}
	if err := service.Bootstrap(ctx); err != nil {
		log.Printf("WARNING: bootstrap error (will retry on next restart): %v", err)
	}

	httpServer := app.NewHTTPServer(service, cfg.CORSOrigin)
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           httpServer.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("Chronicle API listening on %s", cfg.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
