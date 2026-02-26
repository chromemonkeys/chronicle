package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"chronicle/api/internal/config"
	"chronicle/api/internal/gitrepo"
	"chronicle/api/internal/store"
)

// fakeStoreForHealth extends fakeStore with ping functionality
type fakeStoreForHealth struct {
	fakeStore
	pingFn func(context.Context) error
}

func (f *fakeStoreForHealth) Ping(ctx context.Context) error {
	if f.pingFn != nil {
		return f.pingFn(ctx)
	}
	return nil
}

func newTestServiceWithHealth(fs *fakeStoreForHealth, fg *fakeGit) *Service {
	return &Service{
		cfg:            config.Config{},
		store:          fs,
		git:            fg,
		syncSessionTTL: 15,
		syncSessions:   make(map[string]syncSessionRecord),
	}
}

func TestHealthEndpoint(t *testing.T) {
	fs := &fakeStoreForHealth{}
	fg := &fakeGit{}
	svc := newTestServiceWithHealth(fs, fg)
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}

	var response map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if ok, exists := response["ok"]; !exists || ok != true {
		t.Errorf("expected ok=true, got %v", ok)
	}
}

func TestReadyEndpoint_Success(t *testing.T) {
	fs := &fakeStoreForHealth{
		pingFn: func(context.Context) error {
			return nil // Database is healthy
		},
	}
	fg := &fakeGit{}
	svc := newTestServiceWithHealth(fs, fg)
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}

	var response map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if ok, exists := response["ok"]; !exists || ok != true {
		t.Errorf("expected ok=true, got %v", ok)
	}

	if status, exists := response["status"]; !exists || status != "ready" {
		t.Errorf("expected status=ready, got %v", status)
	}

	checks, exists := response["checks"].(map[string]any)
	if !exists {
		t.Fatalf("expected checks object, got %v", response["checks"])
	}

	dbCheck, exists := checks["database"].(map[string]any)
	if !exists {
		t.Fatalf("expected database check, got %v", checks["database"])
	}

	if dbStatus, exists := dbCheck["status"]; !exists || dbStatus != "ok" {
		t.Errorf("expected database status=ok, got %v", dbStatus)
	}
}

func TestReadyEndpoint_DatabaseFailure(t *testing.T) {
	fs := &fakeStoreForHealth{
		pingFn: func(context.Context) error {
			return errors.New("connection refused")
		},
	}
	fg := &fakeGit{}
	svc := newTestServiceWithHealth(fs, fg)
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503, got %d", rr.Code)
	}

	var response map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if ok, exists := response["ok"]; !exists || ok != false {
		t.Errorf("expected ok=false, got %v", ok)
	}

	if status, exists := response["status"]; !exists || status != "not_ready" {
		t.Errorf("expected status=not_ready, got %v", status)
	}

	checks, exists := response["checks"].(map[string]any)
	if !exists {
		t.Fatalf("expected checks object, got %v", response["checks"])
	}

	dbCheck, exists := checks["database"].(map[string]any)
	if !exists {
		t.Fatalf("expected database check, got %v", checks["database"])
	}

	if dbStatus, exists := dbCheck["status"]; !exists || dbStatus != "error" {
		t.Errorf("expected database status=error, got %v", dbStatus)
	}

	if dbError, exists := dbCheck["error"]; !exists || dbError != "connection refused" {
		t.Errorf("expected database error='connection refused', got %v", dbError)
	}
}

func TestHealthEndpoint_OptionsRequest(t *testing.T) {
	fs := &fakeStoreForHealth{}
	fg := &fakeGit{}
	svc := newTestServiceWithHealth(fs, fg)
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodOptions, "/api/health", nil)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("expected status 204 for OPTIONS, got %d", rr.Code)
	}
}

func TestHealthEndpoint_CORSHeaders(t *testing.T) {
	fs := &fakeStoreForHealth{}
	fg := &fakeGit{}
	svc := newTestServiceWithHealth(fs, fg)
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	// Check CORS headers are present
	if origin := rr.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
		t.Errorf("expected CORS origin=*, got %v", origin)
	}

	if cache := rr.Header().Get("Cache-Control"); cache != "no-store" {
		t.Errorf("expected Cache-Control=no-store, got %v", cache)
	}
}

// TestPingMethod tests the Service.Ping method directly
func TestPingMethod(t *testing.T) {
	tests := []struct {
		name      string
		pingError error
		wantError bool
	}{
		{
			name:      "healthy database",
			pingError: nil,
			wantError: false,
		},
		{
			name:      "unhealthy database",
			pingError: errors.New("connection failed"),
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs := &fakeStoreForHealth{
				pingFn: func(context.Context) error {
					return tt.pingError
				},
			}
			fg := &fakeGit{}
			svc := newTestServiceWithHealth(fs, fg)

			err := svc.Ping(context.Background())
			if (err != nil) != tt.wantError {
				t.Errorf("Ping() error = %v, wantError %v", err, tt.wantError)
			}
		})
	}
}
