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

// TestExternalUserCannotAccessInternalThread verifies that external users
// cannot reply to, vote on, or react to internal threads
func TestExternalUserCannotAccessInternalThread(t *testing.T) {
	secret := "test-secret"
	// Use editor role so RBAC doesn't block before visibility check
	externalUser := store.User{
		ID:          "user-external",
		DisplayName: "External Guest",
		Role:        "editor",
		IsExternal:  true,
	}
	internalUser := store.User{
		ID:          "user-internal",
		DisplayName: "Internal User",
		Role:        "editor",
		IsExternal:  false,
	}

	// Internal thread that external user should not access
	internalThread := store.Thread{
		ID:         "thread-internal",
		ProposalID: "prop-1",
		Text:       "Internal discussion",
		Visibility: "INTERNAL",
		Status:     "OPEN",
		Author:     "Internal User",
	}

	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			if id == externalUser.ID {
				return externalUser, nil
			}
			return internalUser, nil
		},
		getThreadFn: func(_ context.Context, proposalID, threadID string) (store.Thread, error) {
			if threadID == internalThread.ID {
				return internalThread, nil
			}
			return store.Thread{}, sql.ErrNoRows
		},
		getProposalFn: func(_ context.Context, proposalID string) (store.Proposal, error) {
			return store.Proposal{ID: proposalID, DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		getActiveProposalFn: func(_ context.Context, documentID string) (*store.Proposal, error) {
			return &store.Proposal{ID: "prop-1", DocumentID: documentID, BranchName: "proposal-doc-1"}, nil
		},
		getDocumentFn: func(_ context.Context, documentID string) (store.Document, error) {
			return store.Document{ID: documentID, Title: "Doc", Status: "In review", UpdatedBy: "Avery"}, nil
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

	externalToken, _ := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  externalUser.ID,
		Name: externalUser.DisplayName,
		Role: externalUser.Role,
		JTI:  "jti-external",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})

	tests := []struct {
		name string
		path string
		body string
	}{
		{
			name: "reply to internal thread",
			path: "/api/documents/doc-1/proposals/prop-1/threads/thread-internal/replies",
			body: `{"body":"Test reply"}`,
		},
		{
			name: "vote on internal thread",
			path: "/api/documents/doc-1/proposals/prop-1/threads/thread-internal/vote",
			body: `{"direction":"up"}`,
		},
		{
			name: "react to internal thread",
			path: "/api/documents/doc-1/proposals/prop-1/threads/thread-internal/reactions",
			body: `{"emoji":"👍"}`,
		},
		{
			name: "resolve internal thread",
			path: "/api/documents/doc-1/proposals/prop-1/threads/thread-internal/resolve",
			body: `{"outcome":"ACCEPTED"}`,
		},
		{
			name: "reopen internal thread",
			path: "/api/documents/doc-1/proposals/prop-1/threads/thread-internal/reopen",
			body: `{}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.path, bytes.NewBufferString(tc.body))
			req.Header.Set("Authorization", "Bearer "+externalToken)
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			server.Handler().ServeHTTP(rr, req)

			// External users should get 404 (not found) for internal threads
			// This prevents leaking the existence of internal threads
			if rr.Code != http.StatusNotFound {
				t.Fatalf("expected status 404 for external user accessing internal thread, got %d body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

// TestExternalUserCanAccessExternalThread verifies that external users
// CAN access external threads normally
func TestExternalUserCanAccessExternalThread(t *testing.T) {
	secret := "test-secret"
	// Use editor role so RBAC doesn't block before visibility check
	externalUser := store.User{
		ID:          "user-external",
		DisplayName: "External Guest",
		Role:        "editor",
		IsExternal:  true,
	}

	// External thread that external user CAN access
	externalThread := store.Thread{
		ID:         "thread-external",
		ProposalID: "prop-1",
		Text:       "External discussion",
		Visibility: "EXTERNAL",
		Status:     "OPEN",
		Author:     "External Guest",
	}

	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return externalUser, nil
		},
		getThreadFn: func(_ context.Context, proposalID, threadID string) (store.Thread, error) {
			if threadID == externalThread.ID {
				return externalThread, nil
			}
			return store.Thread{}, sql.ErrNoRows
		},
		getProposalFn: func(_ context.Context, proposalID string) (store.Proposal, error) {
			return store.Proposal{ID: proposalID, DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		getActiveProposalFn: func(_ context.Context, documentID string) (*store.Proposal, error) {
			return &store.Proposal{ID: "prop-1", DocumentID: documentID, BranchName: "proposal-doc-1"}, nil
		},
		getDocumentFn: func(_ context.Context, documentID string) (store.Document, error) {
			return store.Document{ID: documentID, Title: "Doc", Status: "In review", UpdatedBy: "Avery"}, nil
		},
		listApprovalsAllFn: func(context.Context, string) ([]store.Approval, error) {
			return []store.Approval{}, nil
		},
		listThreadsFn: func(context.Context, string, bool) ([]store.Thread, error) {
			return []store.Thread{}, nil
		},
		listAnnotationsFn: func(context.Context, string, bool) ([]store.Annotation, error) {
			return []store.Annotation{}, nil
		},
		summaryCountsFn: func(context.Context) (int, int, int, error) {
			return 1, 1, 0, nil
		},
	}

	svc := newTestService(fs, &fakeGit{})
	svc.cfg.JWTSecret = secret
	server := NewHTTPServer(svc, "*")

	externalToken, _ := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  externalUser.ID,
		Name: externalUser.DisplayName,
		Role: externalUser.Role,
		JTI:  "jti-external",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})

	// External user can vote on external threads
	req := httptest.NewRequest(http.MethodPost, "/api/documents/doc-1/proposals/prop-1/threads/thread-external/vote", bytes.NewBufferString(`{"direction":"up"}`))
	req.Header.Set("Authorization", "Bearer "+externalToken)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	server.Handler().ServeHTTP(rr, req)

	// Should NOT get 404 - external threads are accessible
	if rr.Code == http.StatusNotFound {
		t.Fatalf("external user should be able to access external thread, got 404")
	}
	// We might get other errors (like method not allowed or bad request) but not 404
}

// TestExternalUserCanOnlyCreateExternalThreads verifies that external users
// can only create threads with EXTERNAL visibility
func TestExternalUserCanOnlyCreateExternalThreads(t *testing.T) {
	secret := "test-secret"
	// Use editor role so visibility check is the deciding factor
	externalUser := store.User{
		ID:          "user-external",
		DisplayName: "External Guest",
		Role:        "editor",
		IsExternal:  true,
	}

	fs := &fakeStore{
		getUserByIDFn: func(_ context.Context, id string) (store.User, error) {
			return externalUser, nil
		},
		getProposalFn: func(_ context.Context, proposalID string) (store.Proposal, error) {
			return store.Proposal{ID: proposalID, DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		getActiveProposalFn: func(_ context.Context, documentID string) (*store.Proposal, error) {
			return &store.Proposal{ID: "prop-1", DocumentID: documentID, BranchName: "proposal-doc-1"}, nil
		},
		getDocumentFn: func(_ context.Context, documentID string) (store.Document, error) {
			return store.Document{ID: documentID, Title: "Doc", Status: "In review", UpdatedBy: "Avery"}, nil
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

	externalToken, _ := auth.IssueToken([]byte(secret), auth.Claims{
		Sub:  externalUser.ID,
		Name: externalUser.DisplayName,
		Role: externalUser.Role,
		JTI:  "jti-external",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})

	tests := []struct {
		name         string
		visibility   string
		expectForbidden bool
	}{
		{"create EXTERNAL thread", "EXTERNAL", false},
		{"create INTERNAL thread", "INTERNAL", true},
		{"create empty visibility thread", "", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body := map[string]string{
				"text":       "Test thread",
				"anchorLabel": "Test",
			}
			if tc.visibility != "" {
				body["visibility"] = tc.visibility
			}
			bodyBytes, _ := json.Marshal(body)

			req := httptest.NewRequest(http.MethodPost, "/api/documents/doc-1/proposals/prop-1/threads", bytes.NewBuffer(bodyBytes))
			req.Header.Set("Authorization", "Bearer "+externalToken)
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			server.Handler().ServeHTTP(rr, req)

			if tc.expectForbidden {
				if rr.Code != http.StatusForbidden {
					t.Fatalf("expected status 403 for external user creating %s thread, got %d body=%s", tc.visibility, rr.Code, rr.Body.String())
				}
			} else {
				// Should NOT be forbidden
				if rr.Code == http.StatusForbidden {
					t.Fatalf("external user should be able to create %s thread, got forbidden", tc.visibility)
				}
			}
		})
	}
}

// TestInternalUserRetainsFullThreadVisibility verifies that internal users
// can access both internal and external threads
func TestInternalUserRetainsFullThreadVisibility(t *testing.T) {
	includeInternalValues := make([]bool, 0, 2)
	fs := &fakeStore{
		getDocumentFn: func(_ context.Context, documentID string) (store.Document, error) {
			return store.Document{ID: documentID, Title: "Doc", Subtitle: "Sub", Status: "In review", UpdatedBy: "Avery"}, nil
		},
		getActiveProposalFn: func(_ context.Context, documentID string) (*store.Proposal, error) {
			return &store.Proposal{ID: "prop-1", DocumentID: documentID, BranchName: "proposal-doc-1"}, nil
		},
		listApprovalsAllFn: func(context.Context, string) ([]store.Approval, error) {
			return []store.Approval{
				{Role: "security", Status: "Pending"},
				{Role: "architectureCommittee", Status: "Pending"},
				{Role: "legal", Status: "Pending"},
			}, nil
		},
		listThreadsFn: func(_ context.Context, _ string, includeInternal bool) ([]store.Thread, error) {
			includeInternalValues = append(includeInternalValues, includeInternal)
			return []store.Thread{
				{ID: "thread-internal", Visibility: "INTERNAL", Text: "Internal"},
				{ID: "thread-external", Visibility: "EXTERNAL", Text: "External"},
			}, nil
		},
		summaryCountsFn: func(context.Context) (int, int, int, error) {
			return 1, 1, 0, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	// Internal user should see both threads
	workspace, err := svc.GetWorkspace(context.Background(), "doc-1", "", false)
	if err != nil {
		t.Fatalf("GetWorkspace() internal user error = %v", err)
	}

	threads, ok := workspace["threads"].([]map[string]any)
	if !ok {
		t.Fatalf("expected threads to be []map[string]any, got %T", workspace["threads"])
	}

	if len(threads) != 2 {
		t.Fatalf("expected internal user to see 2 threads, got %d", len(threads))
	}

	if len(includeInternalValues) < 1 {
		t.Fatalf("expected ListThreads to be called")
	}
	if !includeInternalValues[0] {
		t.Fatalf("expected internal viewer to include internal threads")
	}
}
