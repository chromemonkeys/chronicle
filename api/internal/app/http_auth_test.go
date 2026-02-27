package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"chronicle/api/internal/auth"
	"chronicle/api/internal/store"
)

func TestSessionLoginReturnsContract(t *testing.T) {
	var ensuredName string
	fs := &fakeStore{
		ensureUserByNameFn: func(_ context.Context, userName string) (store.User, error) {
			ensuredName = userName
			return store.User{
				ID:          "user-1",
				DisplayName: userName,
				Role:        "editor",
			}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = "test-secret"
	svc.cfg.AccessTTL = time.Hour
	svc.cfg.RefreshTTL = 24 * time.Hour
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodPost, "/api/session/login", bytes.NewBufferString(`{"name":"  Avery  "}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("parse response: %v", err)
	}

	token, _ := payload["token"].(string)
	refreshToken, _ := payload["refreshToken"].(string)
	userName, _ := payload["userName"].(string)

	if token == "" {
		t.Fatalf("expected token")
	}
	if refreshToken == "" {
		t.Fatalf("expected refreshToken")
	}
	if userName != "Avery" {
		t.Fatalf("expected userName Avery, got %q", userName)
	}
	if ensuredName != "Avery" {
		t.Fatalf("expected EnsureUserByName to receive trimmed name Avery, got %q", ensuredName)
	}
}

func TestSessionLoginRejectsInvalidBody(t *testing.T) {
	server := NewHTTPServer(newTestService(&fakeStore{}, &fakeGit{}), "*")
	req := httptest.NewRequest(http.MethodPost, "/api/session/login", bytes.NewBufferString(`{"name":`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d body=%s", rr.Code, rr.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if payload["code"] != "INVALID_BODY" {
		t.Fatalf("expected code INVALID_BODY, got %v", payload["code"])
	}
}

func TestProtectedRouteWithoutBearerReturnsUnauthorized(t *testing.T) {
	server := NewHTTPServer(newTestService(&fakeStore{}, &fakeGit{}), "*")
	req := httptest.NewRequest(http.MethodGet, "/api/documents", nil)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	assertUnauthorizedCode(t, rr)
}

func TestProtectedRouteWithInvalidBearerReturnsUnauthorized(t *testing.T) {
	svc := newTestService(&fakeStore{}, &fakeGit{})
	svc.cfg.JWTSecret = "test-secret"
	server := NewHTTPServer(svc, "*")

	req := httptest.NewRequest(http.MethodGet, "/api/documents", nil)
	req.Header.Set("Authorization", "Bearer definitely-not-a-token")
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	assertUnauthorizedCode(t, rr)
}

func TestProtectedRouteWithExpiredBearerReturnsUnauthorized(t *testing.T) {
	svc := newTestService(&fakeStore{}, &fakeGit{})
	svc.cfg.JWTSecret = "test-secret"
	server := NewHTTPServer(svc, "*")

	token, err := auth.IssueToken([]byte("test-secret"), auth.Claims{
		Sub:  "user-1",
		Name: "Avery",
		Role: "editor",
		JTI:  "jti-expired",
		Exp:  time.Now().Add(-1 * time.Minute).Unix(),
	})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/documents", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	assertUnauthorizedCode(t, rr)
}

func assertUnauthorizedCode(t *testing.T, rr *httptest.ResponseRecorder) {
	t.Helper()
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d body=%s", rr.Code, rr.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if payload["code"] != "UNAUTHORIZED" {
		t.Fatalf("expected code UNAUTHORIZED, got %v", payload["code"])
	}
}
