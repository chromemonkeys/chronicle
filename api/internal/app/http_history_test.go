package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"chronicle/api/internal/auth"
	"chronicle/api/internal/store"
)

func TestHistoryRouteSupportsMainProposalID(t *testing.T) {
	const secret = "test-secret"

	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, userID string) (store.User, error) {
			return store.User{
				ID:          userID,
				DisplayName: "Avery",
				Role:        "editor",
			}, nil
		},
		listNamedVersionsFn: func(_ context.Context, proposalID string) ([]store.NamedVersion, error) {
			if proposalID != "" {
				t.Fatalf("expected named versions lookup with empty proposal ID for main branch, got %q", proposalID)
			}
			return nil, nil
		},
	}
	fg := &fakeGit{
		historyFn: func(_ string, branchName string, _ int) ([]store.CommitInfo, error) {
			if branchName != "main" {
				t.Fatalf("expected history branch main, got %q", branchName)
			}
			return []store.CommitInfo{
				{Hash: "abc1234", Message: "Main baseline", Author: "Avery", CreatedAt: time.Now()},
			}, nil
		},
	}

	svc := newTestService(fs, fg)
	svc.cfg.JWTSecret = secret
	server := NewHTTPServer(svc, "*")

	token, err := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  "user-1",
		Name: "Avery",
		Role: "editor",
		JTI:  "jti-main-history",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/documents/doc-1/history?proposalId=main", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if payload["branch"] != "main" {
		t.Fatalf("expected branch main, got %v", payload["branch"])
	}
	if payload["proposalId"] != nil {
		t.Fatalf("expected proposalId null for main history, got %v", payload["proposalId"])
	}
}
