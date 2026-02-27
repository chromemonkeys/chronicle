package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"chronicle/api/internal/auth"
	"chronicle/api/internal/gitrepo"
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

func TestCompareRouteReturnsDeterministicChangeObjects(t *testing.T) {
	const secret = "test-secret"

	fromDoc := json.RawMessage(`{"type":"doc","content":[
		{"type":"paragraph","attrs":{"nodeId":"n-a"},"content":[{"type":"text","text":"Alpha"}]},
		{"type":"paragraph","attrs":{"nodeId":"n-b"},"content":[{"type":"text","text":"Beta"}]}
	]}`)
	toDoc := json.RawMessage(`{"type":"doc","content":[
		{"type":"paragraph","attrs":{"nodeId":"n-b"},"content":[{"type":"text","text":"Beta updated"}]},
		{"type":"paragraph","attrs":{"nodeId":"n-a"},"content":[{"type":"text","text":"Alpha"}]},
		{"type":"paragraph","attrs":{"nodeId":"n-c"},"content":[{"type":"text","text":"Gamma"}]}
	]}`)

	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, userID string) (store.User, error) {
			return store.User{ID: userID, DisplayName: "Avery", Role: "editor"}, nil
		},
	}
	fg := &fakeGit{
		getContentByHashFn: func(_ string, hash string) (gitrepo.Content, error) {
			if hash == "from1234" {
				return gitrepo.Content{Doc: fromDoc}, nil
			}
			return gitrepo.Content{Doc: toDoc}, nil
		},
		getCommitByHashFn: func(_ string, _ string) (store.CommitInfo, error) {
			return store.CommitInfo{
				Hash:      "to5678",
				Author:    "Avery",
				CreatedAt: time.Date(2026, 2, 27, 18, 20, 0, 0, time.UTC),
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
		JTI:  "jti-compare",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	makeRequest := func() map[string]any {
		query := url.Values{}
		query.Set("from", "from1234")
		query.Set("to", "to5678")
		req := httptest.NewRequest(http.MethodGet, "/api/documents/doc-1/compare?"+query.Encode(), nil)
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
		return payload
	}

	first := makeRequest()
	second := makeRequest()

	firstChanges, ok := first["changes"].([]any)
	if !ok {
		t.Fatalf("expected changes array, got %T", first["changes"])
	}
	secondChanges, ok := second["changes"].([]any)
	if !ok {
		t.Fatalf("expected second changes array, got %T", second["changes"])
	}
	if len(firstChanges) != len(secondChanges) {
		t.Fatalf("expected deterministic change count, got %d and %d", len(firstChanges), len(secondChanges))
	}
	if len(firstChanges) == 0 {
		t.Fatalf("expected non-empty changes array")
	}

	firstRow, ok := firstChanges[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first change object, got %T", firstChanges[0])
	}
	if firstRow["id"] == "" || firstRow["type"] == "" || firstRow["snippet"] == "" {
		t.Fatalf("expected id/type/snippet fields, got %v", firstRow)
	}
	if firstRow["reviewState"] != "pending" {
		t.Fatalf("expected reviewState pending, got %v", firstRow["reviewState"])
	}
	anchor, ok := firstRow["anchor"].(map[string]any)
	if !ok || anchor["nodeId"] == "" {
		t.Fatalf("expected anchor.nodeId in first change, got %v", firstRow["anchor"])
	}
	contextPayload, ok := firstRow["context"].(map[string]any)
	if !ok {
		t.Fatalf("expected context object, got %T", firstRow["context"])
	}
	if _, hasBefore := contextPayload["before"]; !hasBefore {
		t.Fatalf("expected context.before")
	}
	if _, hasAfter := contextPayload["after"]; !hasAfter {
		t.Fatalf("expected context.after")
	}

	firstID := firstRow["id"]
	secondRow, _ := secondChanges[0].(map[string]any)
	if secondRow["id"] != firstID {
		t.Fatalf("expected deterministic first change id, got %v and %v", firstID, secondRow["id"])
	}
}
