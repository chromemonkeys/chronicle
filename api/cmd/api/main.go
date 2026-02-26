package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chronicle/api/internal/app"
	"chronicle/api/internal/config"
	"chronicle/api/internal/gitrepo"
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
	service := app.New(cfg, dataStore, gitService)
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
