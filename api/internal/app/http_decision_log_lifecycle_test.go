package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"chronicle/api/internal/auth"
	"chronicle/api/internal/store"
)

// TestDecisionLogQueryByOutcome verifies querying decisions by outcome filter
func TestDecisionLogQueryByOutcome(t *testing.T) {
	secret := "test-secret"
	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return store.User{ID: id, DisplayName: "Test User", Role: "editor"}, nil
		},
		listDecisionLogFilteredFn: func(_ context.Context, documentID, proposalID, outcome, query, author string, limit int) ([]store.DecisionLogEntry, error) {
			// Verify outcome filter is passed correctly
			if outcome != "" && outcome != "ACCEPTED" && outcome != "REJECTED" && outcome != "DEFERRED" {
				t.Fatalf("invalid outcome filter: %s", outcome)
			}
			return []store.DecisionLogEntry{
				{ID: 1, DocumentID: "doc-1", ThreadID: "thread-1", Outcome: "ACCEPTED", Rationale: "Good change", DecidedBy: "Alice"},
				{ID: 2, DocumentID: "doc-1", ThreadID: "thread-2", Outcome: "REJECTED", Rationale: "Bad change", DecidedBy: "Bob"},
			}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = secret
	server := NewHTTPServer(svc, "*")

	token, _ := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  "user-1",
		Name: "Test User",
		Role: "editor",
		JTI:  "jti-1",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})

	tests := []struct {
		name          string
		outcome       string
		expectedCount int
	}{
		{"filter by ACCEPTED", "ACCEPTED", 2},
		{"filter by REJECTED", "REJECTED", 2},
		{"no filter", "", 2},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			url := "/api/documents/doc-1/decision-log"
			if tc.outcome != "" {
				url += "?outcome=" + tc.outcome
			}
			req := httptest.NewRequest(http.MethodGet, url, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rr := httptest.NewRecorder()

			server.Handler().ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d body=%s", rr.Code, rr.Body.String())
			}

			var response map[string]any
			if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
				t.Fatalf("parse response: %v", err)
			}

			items, ok := response["items"].([]any)
			if !ok {
				t.Fatalf("expected items array, got %T", response["items"])
			}
			if len(items) != tc.expectedCount {
				t.Fatalf("expected %d items, got %d", tc.expectedCount, len(items))
			}
		})
	}
}

// TestDecisionLogInvalidOutcomeFilter verifies invalid outcome filters are rejected
func TestDecisionLogInvalidOutcomeFilter(t *testing.T) {
	secret := "test-secret"
	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return store.User{ID: id, DisplayName: "Test User", Role: "editor"}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = secret
	server := NewHTTPServer(svc, "*")

	token, _ := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  "user-1",
		Name: "Test User",
		Role: "editor",
		JTI:  "jti-1",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/documents/doc-1/decision-log?outcome=INVALID", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected status 422 for invalid outcome, got %d", rr.Code)
	}
}

// TestThreadLifecycleTransitions verifies thread status transitions
func TestThreadLifecycleTransitions(t *testing.T) {
	secret := "test-secret"
	
	tests := []struct {
		name           string
		initialStatus  string
		action         string // "resolve", "reopen"
		expectedStatus string
		expectError    bool
	}{
		{"OPEN to RESOLVED", "OPEN", "resolve", "RESOLVED", false},
		{"RESOLVED to OPEN", "RESOLVED", "reopen", "OPEN", false},
		{"already RESOLVED resolve", "RESOLVED", "resolve", "RESOLVED", true}, // No change expected
		{"already OPEN reopen", "OPEN", "reopen", "OPEN", true},               // No change expected
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			threadID := "thread-" + tc.initialStatus + "-" + tc.action
			fs := &fakeStore{
				getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
					return store.User{ID: id, DisplayName: "Test User", Role: "editor"}, nil
				},
				getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
					return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
				},
				getThreadFn: func(_ context.Context, _, tid string) (store.Thread, error) {
					if tid == threadID {
						return store.Thread{
							ID:         threadID,
							ProposalID: "prop-1",
							Status:     tc.initialStatus,
							Visibility: "EXTERNAL",
						}, nil
					}
					return store.Thread{}, sql.ErrNoRows
				},
				resolveThreadFn: func(_ context.Context, _, tid, _, _, _ string) (bool, error) {
					if tid == threadID && tc.initialStatus == "OPEN" {
						return true, nil // Changed
					}
					return false, nil // No change
				},
				reopenThreadFn: func(_ context.Context, _, tid string) (bool, error) {
					if tid == threadID && tc.initialStatus == "RESOLVED" {
						return true, nil // Changed
					}
					return false, nil // No change
				},
				getActiveProposalFn: func(_ context.Context, _ string) (*store.Proposal, error) {
					return &store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
				},
				getDocumentFn: func(_ context.Context, _ string) (store.Document, error) {
					return store.Document{ID: "doc-1", Title: "Doc", Status: "In review", UpdatedBy: "Avery"}, nil
				},
				listApprovalsAllFn: func(context.Context, string) ([]store.Approval, error) {
					return []store.Approval{}, nil
				},
				listThreadsFn: func(context.Context, string, bool) ([]store.Thread, error) {
					return []store.Thread{}, nil
				},
				summaryCountsFn: func(context.Context) (int, int, int, error) {
					return 1, 1, 0, nil
				},
			}
			svc := newTestService(fs, &fakeGit{})
			svc.cfg.JWTSecret = secret
			server := NewHTTPServer(svc, "*")

			token, _ := auth.IssueToken([]byte(secret), auth.Claims{
				Sub:  "user-1",
				Name: "Test User",
				Role: "editor",
				JTI:  "jti-1",
				Exp:  time.Now().Add(time.Hour).Unix(),
			})

			var req *http.Request
			if tc.action == "resolve" {
				body := `{"outcome":"ACCEPTED"}`
				req = httptest.NewRequest(http.MethodPost, "/api/documents/doc-1/proposals/prop-1/threads/"+threadID+"/resolve", bytes.NewBufferString(body))
			} else {
				req = httptest.NewRequest(http.MethodPost, "/api/documents/doc-1/proposals/prop-1/threads/"+threadID+"/reopen", nil)
			}
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			server.Handler().ServeHTTP(rr, req)

			if tc.expectError {
				if rr.Code != http.StatusNotFound {
					t.Fatalf("expected 404 when no change, got %d", rr.Code)
				}
			} else {
				if rr.Code != http.StatusOK {
					t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
				}
			}
		})
	}
}

// TestOrphanedThreadPreservation verifies orphaned threads are preserved and queryable
func TestOrphanedThreadPreservation(t *testing.T) {
	secret := "test-secret"
	orphanCalls := make([]struct {
		threadID string
		reason   string
	}, 0)
	
	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return store.User{ID: id, DisplayName: "Test User", Role: "editor"}, nil
		},
		orphanThreadFn: func(_ context.Context, proposalID, threadID, reason string) (bool, error) {
			orphanCalls = append(orphanCalls, struct {
				threadID string
				reason   string
			}{threadID, reason})
			return true, nil
		},
		listThreadsFn: func(_ context.Context, proposalID string, includeInternal bool) ([]store.Thread, error) {
			return []store.Thread{
				{ID: "thread-1", ProposalID: proposalID, AnchorNodeID: "node-deleted", Status: "OPEN", Visibility: "INTERNAL"},
				{ID: "thread-2", ProposalID: proposalID, AnchorNodeID: "node-exists", Status: "OPEN", Visibility: "INTERNAL"},
				{ID: "thread-3", ProposalID: proposalID, AnchorNodeID: "", Status: "OPEN", Visibility: "INTERNAL"}, // No anchor
			}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = secret

	// Test document with only "node-exists" - node-deleted should cause orphaning
	doc := json.RawMessage(`{
		"type": "doc",
		"content": [
			{"type": "paragraph", "attrs": {"nodeId": "node-exists"}, "content": []}
		]
	}`)

	ctx := context.Background()
	err := svc.detectAndOrphanThreads(ctx, "prop-1", doc, "Test User")
	if err != nil {
		t.Fatalf("detectAndOrphanThreads failed: %v", err)
	}

	// Should have orphaned thread-1 (node-deleted not in doc)
	if len(orphanCalls) != 1 {
		t.Fatalf("expected 1 orphan call, got %d", len(orphanCalls))
	}
	if orphanCalls[0].threadID != "thread-1" {
		t.Fatalf("expected thread-1 to be orphaned, got %s", orphanCalls[0].threadID)
	}
	if !bytes.Contains([]byte(orphanCalls[0].reason), []byte("node-deleted")) {
		t.Fatalf("expected reason to mention node-deleted, got %s", orphanCalls[0].reason)
	}
}

// TestResolveThreadRejectsMissingRationale verifies REJECTED requires rationale
func TestResolveThreadRejectsMissingRationale(t *testing.T) {
	secret := "test-secret"
	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return store.User{ID: id, DisplayName: "Test User", Role: "editor"}, nil
		},
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		getThreadFn: func(_ context.Context, _, _ string) (store.Thread, error) {
			return store.Thread{ID: "thread-1", ProposalID: "prop-1", Status: "OPEN", Visibility: "EXTERNAL"}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = secret
	server := NewHTTPServer(svc, "*")

	token, _ := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  "user-1",
		Name: "Test User",
		Role: "editor",
		JTI:  "jti-1",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})

	// Try to reject without rationale
	body := `{"outcome":"REJECTED"}`
	req := httptest.NewRequest(http.MethodPost, "/api/documents/doc-1/proposals/prop-1/threads/thread-1/resolve", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for missing rationale, got %d body=%s", rr.Code, rr.Body.String())
	}

	var response map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if response["code"] != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %v", response["code"])
	}
}
