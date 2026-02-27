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

func TestViewerWriteEndpointsAreForbidden(t *testing.T) {
	server, token := newRBACServerAndToken(t, "viewer")

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "create document", method: http.MethodPost, path: "/api/documents", body: `{"title":"Doc"}`},
		{name: "create space", method: http.MethodPost, path: "/api/spaces", body: `{"name":"Engineering"}`},
		{name: "save workspace", method: http.MethodPost, path: "/api/workspace/doc-1", body: `{"title":"Doc"}`},
		{name: "create proposal", method: http.MethodPost, path: "/api/documents/doc-1/proposals", body: `{"title":"Proposal"}`},
		{name: "submit proposal", method: http.MethodPost, path: "/api/documents/doc-1/proposals/prop-1/submit", body: `{}`},
		{name: "resolve thread", method: http.MethodPost, path: "/api/documents/doc-1/proposals/prop-1/threads/thread-1/resolve", body: `{"outcome":"ACCEPTED"}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, bytes.NewBufferString(tc.body))
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			server.Handler().ServeHTTP(rr, req)

			if rr.Code != http.StatusForbidden {
				t.Fatalf("expected status 403, got %d body=%s", rr.Code, rr.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
				t.Fatalf("parse response: %v", err)
			}
			if payload["code"] != "FORBIDDEN" {
				t.Fatalf("expected code FORBIDDEN, got %v", payload["code"])
			}
		})
	}
}

func TestApproverActionMatrixOnProposalRoutes(t *testing.T) {
	tests := []struct {
		name       string
		role       string
		shouldDeny bool
	}{
		{name: "viewer denied", role: "viewer", shouldDeny: true},
		{name: "commenter denied", role: "commenter", shouldDeny: true},
		{name: "editor allowed", role: "editor", shouldDeny: false},
		{name: "admin allowed", role: "admin", shouldDeny: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			server, token := newRBACServerAndToken(t, tc.role)
			paths := []struct {
				path string
				body string
			}{
				{path: "/api/documents/doc-1/proposals/prop-1/approvals", body: `{"role":"security"}`},
				{path: "/api/documents/doc-1/proposals/prop-1/merge", body: `{}`},
			}

			for _, endpoint := range paths {
				req := httptest.NewRequest(http.MethodPost, endpoint.path, bytes.NewBufferString(endpoint.body))
				req.Header.Set("Authorization", "Bearer "+token)
				req.Header.Set("Content-Type", "application/json")
				rr := httptest.NewRecorder()

				server.Handler().ServeHTTP(rr, req)

				if tc.shouldDeny {
					if rr.Code != http.StatusForbidden {
						t.Fatalf("expected forbidden for role=%s path=%s, got %d body=%s", tc.role, endpoint.path, rr.Code, rr.Body.String())
					}
					continue
				}
				if rr.Code == http.StatusForbidden {
					t.Fatalf("expected role=%s to pass authz for %s, got forbidden", tc.role, endpoint.path)
				}
			}
		})
	}
}

func newRBACServerAndToken(t *testing.T, role string) (*HTTPServer, string) {
	t.Helper()
	userID := "user-" + role
	secret := "test-secret"

	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return store.User{
				ID:          id,
				DisplayName: "Test User",
				Role:        role,
			}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = secret
	server := NewHTTPServer(svc, "*")

	token, err := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  userID,
		Name: "Test User",
		Role: role,
		JTI:  "jti-" + role,
		Exp:  time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return server, token
}
