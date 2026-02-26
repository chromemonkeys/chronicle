package app

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"chronicle/api/internal/config"
	"chronicle/api/internal/gitrepo"
	"chronicle/api/internal/store"
)

type fakeStore struct {
	getProposalFn       func(context.Context, string) (store.Proposal, error)
	listApprovalsFn     func(context.Context, string) ([]store.Approval, error)
	approveRoleFn       func(context.Context, string, string, string) error
	updateProposalFn    func(context.Context, string, string) error
	resolveThreadFn     func(context.Context, string, string, string, string, string) (bool, error)
	reopenThreadFn      func(context.Context, string, string) (bool, error)
	updateThreadVisibilityFn func(context.Context, string, string, string) (bool, error)
	getThreadFn         func(context.Context, string, string) (store.Thread, error)
	listNamedVersionsFn func(context.Context, string) ([]store.NamedVersion, error)
	listThreadsFn       func(context.Context, string, bool) ([]store.Thread, error)
	listAnnotationsFn   func(context.Context, string, bool) ([]store.Annotation, error)
	listThreadAnnotationsFn func(context.Context, string, string) ([]store.Annotation, error)
	listThreadVoteTotalsFn func(context.Context, string, bool) (map[string]int, error)
	listThreadReactionCountsFn func(context.Context, string, bool) ([]store.ThreadReactionCount, error)
	getDocumentFn       func(context.Context, string) (store.Document, error)
	getActiveProposalFn func(context.Context, string) (*store.Proposal, error)
	listApprovalsAllFn  func(context.Context, string) ([]store.Approval, error)
	summaryCountsFn     func(context.Context) (int, int, int, error)
	listDecisionLogFilteredFn func(context.Context, string, string, string, string, string, int) ([]store.DecisionLogEntry, error)
	insertDocumentFn    func(context.Context, store.Document) error
}

func (f *fakeStore) ListDocuments(context.Context) ([]store.Document, error) { return nil, nil }
func (f *fakeStore) EnsureUserByName(context.Context, string) (store.User, error) {
	return store.User{}, nil
}
func (f *fakeStore) CreateProposal(context.Context, store.Proposal) error { return nil }
func (f *fakeStore) InsertDocument(ctx context.Context, item store.Document) error {
	if f.insertDocumentFn != nil {
		return f.insertDocumentFn(ctx, item)
	}
	return nil
}
func (f *fakeStore) InsertThread(context.Context, store.Thread) error     { return nil }
func (f *fakeStore) ApproveRole(ctx context.Context, proposalID, role, approvedBy string) error {
	if f.approveRoleFn != nil {
		return f.approveRoleFn(ctx, proposalID, role, approvedBy)
	}
	return nil
}
func (f *fakeStore) InsertDecisionLog(context.Context, store.DecisionLogEntry) error { return nil }
func (f *fakeStore) SaveRefreshSession(context.Context, string, string, time.Time) error {
	return nil
}
func (f *fakeStore) LookupRefreshSession(context.Context, string) (store.User, error) {
	return store.User{}, nil
}
func (f *fakeStore) RevokeRefreshSession(context.Context, string) error { return nil }
func (f *fakeStore) RevokeAccessToken(context.Context, string, time.Time) error {
	return nil
}
func (f *fakeStore) IsAccessTokenRevoked(context.Context, string) (bool, error) { return false, nil }
func (f *fakeStore) GetUserByID(context.Context, string) (store.User, error) {
	return store.User{}, nil
}
func (f *fakeStore) GetActiveProposal(ctx context.Context, documentID string) (*store.Proposal, error) {
	if f.getActiveProposalFn != nil {
		return f.getActiveProposalFn(ctx, documentID)
	}
	return nil, nil
}
func (f *fakeStore) OpenThreadCount(context.Context, string) (int, error) { return 0, nil }
func (f *fakeStore) GetProposal(ctx context.Context, proposalID string) (store.Proposal, error) {
	if f.getProposalFn != nil {
		return f.getProposalFn(ctx, proposalID)
	}
	return store.Proposal{}, sql.ErrNoRows
}
func (f *fakeStore) UpdateDocumentState(context.Context, string, string, string, string, string) error {
	return nil
}
func (f *fakeStore) UpdateProposalStatus(ctx context.Context, proposalID, status string) error {
	if f.updateProposalFn != nil {
		return f.updateProposalFn(ctx, proposalID, status)
	}
	return nil
}
func (f *fakeStore) ResolveThread(ctx context.Context, proposalID, threadID, resolvedBy, resolvedNote, outcome string) (bool, error) {
	if f.resolveThreadFn != nil {
		return f.resolveThreadFn(ctx, proposalID, threadID, resolvedBy, resolvedNote, outcome)
	}
	return false, nil
}
func (f *fakeStore) ReopenThread(ctx context.Context, proposalID, threadID string) (bool, error) {
	if f.reopenThreadFn != nil {
		return f.reopenThreadFn(ctx, proposalID, threadID)
	}
	return false, nil
}
func (f *fakeStore) UpdateThreadVisibility(ctx context.Context, proposalID, threadID, visibility string) (bool, error) {
	if f.updateThreadVisibilityFn != nil {
		return f.updateThreadVisibilityFn(ctx, proposalID, threadID, visibility)
	}
	return false, nil
}
func (f *fakeStore) GetThread(ctx context.Context, proposalID, threadID string) (store.Thread, error) {
	if f.getThreadFn != nil {
		return f.getThreadFn(ctx, proposalID, threadID)
	}
	return store.Thread{}, sql.ErrNoRows
}
func (f *fakeStore) ListNamedVersions(ctx context.Context, proposalID string) ([]store.NamedVersion, error) {
	if f.listNamedVersionsFn != nil {
		return f.listNamedVersionsFn(ctx, proposalID)
	}
	return nil, nil
}
func (f *fakeStore) ListApprovals(ctx context.Context, proposalID string) ([]store.Approval, error) {
	if f.listApprovalsFn != nil {
		return f.listApprovalsFn(ctx, proposalID)
	}
	if f.listApprovalsAllFn != nil {
		return f.listApprovalsAllFn(ctx, proposalID)
	}
	return nil, nil
}
func (f *fakeStore) PendingApprovalCount(context.Context, string) (int, error) { return 0, nil }
func (f *fakeStore) MarkProposalMerged(context.Context, string) error          { return nil }
func (f *fakeStore) GetDocument(ctx context.Context, documentID string) (store.Document, error) {
	if f.getDocumentFn != nil {
		return f.getDocumentFn(ctx, documentID)
	}
	return store.Document{ID: documentID, Title: "Doc", Subtitle: "Sub", Status: "In review"}, nil
}
func (f *fakeStore) ListThreads(ctx context.Context, proposalID string, includeInternal bool) ([]store.Thread, error) {
	if f.listThreadsFn != nil {
		return f.listThreadsFn(ctx, proposalID, includeInternal)
	}
	return nil, nil
}
func (f *fakeStore) InsertAnnotation(context.Context, store.Annotation) error { return nil }
func (f *fakeStore) ListThreadAnnotations(ctx context.Context, proposalID, threadID string) ([]store.Annotation, error) {
	if f.listThreadAnnotationsFn != nil {
		return f.listThreadAnnotationsFn(ctx, proposalID, threadID)
	}
	return nil, nil
}
func (f *fakeStore) ListAnnotations(ctx context.Context, proposalID string, includeInternal bool) ([]store.Annotation, error) {
	if f.listAnnotationsFn != nil {
		return f.listAnnotationsFn(ctx, proposalID, includeInternal)
	}
	return nil, nil
}
func (f *fakeStore) ToggleThreadVote(context.Context, string, string, string, int) error { return nil }
func (f *fakeStore) ToggleThreadReaction(context.Context, string, string, string, string) error {
	return nil
}
func (f *fakeStore) ListThreadVoteTotals(ctx context.Context, proposalID string, includeInternal bool) (map[string]int, error) {
	if f.listThreadVoteTotalsFn != nil {
		return f.listThreadVoteTotalsFn(ctx, proposalID, includeInternal)
	}
	return map[string]int{}, nil
}
func (f *fakeStore) ListThreadReactionCounts(ctx context.Context, proposalID string, includeInternal bool) ([]store.ThreadReactionCount, error) {
	if f.listThreadReactionCountsFn != nil {
		return f.listThreadReactionCountsFn(ctx, proposalID, includeInternal)
	}
	return nil, nil
}
func (f *fakeStore) ListDecisionLog(context.Context, string, string, int) ([]store.DecisionLogEntry, error) {
	return nil, nil
}
func (f *fakeStore) ListDecisionLogFiltered(ctx context.Context, documentID, proposalID, outcome, query, author string, limit int) ([]store.DecisionLogEntry, error) {
	if f.listDecisionLogFilteredFn != nil {
		return f.listDecisionLogFilteredFn(ctx, documentID, proposalID, outcome, query, author, limit)
	}
	return nil, nil
}
func (f *fakeStore) SummaryCounts(ctx context.Context) (int, int, int, error) {
	if f.summaryCountsFn != nil {
		return f.summaryCountsFn(ctx)
	}
	return 0, 0, 0, nil
}
func (f *fakeStore) InsertNamedVersion(context.Context, string, string, string, string) error {
	return nil
}
func (f *fakeStore) ProposalQueue(context.Context) ([]map[string]any, error) { return nil, nil }

type fakeGit struct {
	historyFn        func(string, string, int) ([]store.CommitInfo, error)
	getHeadContentFn func(string, string) (gitrepo.Content, store.CommitInfo, error)
	commitContentFn  func(string, string, gitrepo.Content, string, string) (store.CommitInfo, error)
	ensureDocumentRepoFn func(string, gitrepo.Content, string) error
}

func (f *fakeGit) EnsureDocumentRepo(documentID string, content gitrepo.Content, actor string) error {
	if f.ensureDocumentRepoFn != nil {
		return f.ensureDocumentRepoFn(documentID, content, actor)
	}
	return nil
}
func (f *fakeGit) EnsureBranch(string, string, string) error                { return nil }
func (f *fakeGit) CommitContent(documentID, branchName string, content gitrepo.Content, author, message string) (store.CommitInfo, error) {
	if f.commitContentFn != nil {
		return f.commitContentFn(documentID, branchName, content, author, message)
	}
	return store.CommitInfo{Hash: "abc1234", Author: author, Message: message, CreatedAt: time.Now()}, nil
}
func (f *fakeGit) GetHeadContent(documentID, branchName string) (gitrepo.Content, store.CommitInfo, error) {
	if f.getHeadContentFn != nil {
		return f.getHeadContentFn(documentID, branchName)
	}
	return gitrepo.Content{
		Title:    "Doc",
		Subtitle: "Sub",
		Purpose:  "Purpose",
		Tiers:    "Tiers",
		Enforce:  "Enforce",
	}, store.CommitInfo{Hash: "head123", Author: "Avery", CreatedAt: time.Now(), Message: "head"}, nil
}
func (f *fakeGit) History(documentID, branchName string, limit int) ([]store.CommitInfo, error) {
	if f.historyFn != nil {
		return f.historyFn(documentID, branchName, limit)
	}
	return []store.CommitInfo{{Hash: "abc1234", Message: "Commit", Author: "Avery", CreatedAt: time.Now()}}, nil
}
func (f *fakeGit) GetContentByHash(string, string) (gitrepo.Content, error) {
	return gitrepo.Content{}, nil
}
func (f *fakeGit) CreateTag(string, string, string) error { return nil }
func (f *fakeGit) MergeIntoMain(string, string, string, string) (store.CommitInfo, error) {
	return store.CommitInfo{Hash: "merge123", Author: "Avery", CreatedAt: time.Now(), Message: "Merge"}, nil
}

func newTestService(fs *fakeStore, fg *fakeGit) *Service {
	return &Service{
		cfg:            config.Config{},
		store:          fs,
		git:            fg,
		syncSessionTTL: 15 * time.Minute,
		syncSessions:   make(map[string]syncSessionRecord),
	}
}

func TestHistorySupportsMainProposalID(t *testing.T) {
	fs := &fakeStore{
		listNamedVersionsFn: func(_ context.Context, proposalID string) ([]store.NamedVersion, error) {
			if proposalID != "" {
				t.Fatalf("expected main branch history to request named versions with empty proposal ID, got %q", proposalID)
			}
			return nil, nil
		},
	}
	fg := &fakeGit{
		historyFn: func(_ string, branch string, _ int) ([]store.CommitInfo, error) {
			if branch != "main" {
				t.Fatalf("expected history branch main, got %s", branch)
			}
			return []store.CommitInfo{{Hash: "a1b2c3d", Message: "Main commit", Author: "Avery", CreatedAt: time.Now()}}, nil
		},
	}
	svc := newTestService(fs, fg)

	payload, err := svc.History(context.Background(), "doc-1", "main")
	if err != nil {
		t.Fatalf("History() error = %v", err)
	}
	if payload["branch"] != "main" {
		t.Fatalf("expected branch main, got %v", payload["branch"])
	}
	if payload["proposalId"] != nil {
		t.Fatalf("expected proposalId nil for main branch, got %v", payload["proposalId"])
	}
}

func TestCreateDocumentCreatesRepoAndReturnsWorkspace(t *testing.T) {
	var inserted store.Document
	fs := &fakeStore{
		insertDocumentFn: func(_ context.Context, item store.Document) error {
			inserted = item
			return nil
		},
		getDocumentFn: func(_ context.Context, documentID string) (store.Document, error) {
			return store.Document{
				ID:        documentID,
				Title:     inserted.Title,
				Subtitle:  inserted.Subtitle,
				Status:    "Draft",
				UpdatedBy: "Avery",
			}, nil
		},
		getActiveProposalFn: func(context.Context, string) (*store.Proposal, error) {
			return nil, nil
		},
		summaryCountsFn: func(context.Context) (int, int, int, error) {
			return 1, 0, 0, nil
		},
	}
	ensured := false
	fg := &fakeGit{
		ensureDocumentRepoFn: func(documentID string, content gitrepo.Content, actor string) error {
			ensured = true
			if documentID == "" {
				t.Fatalf("expected non-empty document ID")
			}
			if content.Title != "New RFC" {
				t.Fatalf("expected title New RFC, got %q", content.Title)
			}
			if actor != "Avery" {
				t.Fatalf("expected actor Avery, got %q", actor)
			}
			return nil
		},
		getHeadContentFn: func(documentID, branchName string) (gitrepo.Content, store.CommitInfo, error) {
			if branchName != "main" {
				t.Fatalf("expected main branch, got %s", branchName)
			}
			return gitrepo.Content{
				Title:    inserted.Title,
				Subtitle: inserted.Subtitle,
				Purpose:  "Describe the purpose and decision context for this document.",
				Tiers:    "Document relevant tiers, scope boundaries, or audience segments.",
				Enforce:  "Describe how this policy or decision is enforced and reviewed.",
			}, store.CommitInfo{Hash: "head123", Author: "Avery", CreatedAt: time.Now(), Message: "Create document baseline"}, nil
		},
		historyFn: func(_, branchName string, _ int) ([]store.CommitInfo, error) {
			if branchName != "main" {
				t.Fatalf("expected main branch history, got %s", branchName)
			}
			return []store.CommitInfo{{Hash: "head123", Message: "Create document baseline", Author: "Avery", CreatedAt: time.Now()}}, nil
		},
	}
	svc := newTestService(fs, fg)

	payload, err := svc.CreateDocument(context.Background(), "New RFC", "", "Avery", false)
	if err != nil {
		t.Fatalf("CreateDocument() error = %v", err)
	}
	if !ensured {
		t.Fatalf("expected EnsureDocumentRepo to be called")
	}
	doc, ok := payload["document"].(map[string]any)
	if !ok {
		t.Fatalf("expected document payload")
	}
	if doc["title"] != "New RFC" {
		t.Fatalf("expected title New RFC, got %v", doc["title"])
	}
	if doc["proposalId"] != nil {
		t.Fatalf("expected proposalId nil for new document, got %v", doc["proposalId"])
	}
}

func TestApproveProposalRoleBlocksLegalUntilDependencies(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1"}, nil
		},
		listApprovalsFn: func(_ context.Context, _ string) ([]store.Approval, error) {
			return []store.Approval{
				{Role: "security", Status: "Pending"},
				{Role: "architectureCommittee", Status: "Approved"},
				{Role: "legal", Status: "Pending"},
			}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	_, err := svc.ApproveProposalRole(context.Background(), "doc-1", "prop-1", "legal", "Avery", false)
	var domainErr *DomainError
	if !errors.As(err, &domainErr) {
		t.Fatalf("expected DomainError, got %v", err)
	}
	if domainErr.Code != "APPROVAL_ORDER_BLOCKED" {
		t.Fatalf("unexpected error code: %s", domainErr.Code)
	}
}

func TestResolveThreadReturnsNotFoundWhenNoRowsChanged(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		resolveThreadFn: func(_ context.Context, _, _, _, _, _ string) (bool, error) {
			return false, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	_, err := svc.ResolveThread(context.Background(), "doc-1", "prop-1", "thread-1", "Avery", false, ResolveThreadInput{
		Outcome: "ACCEPTED",
	})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestResolveThreadRejectsInvalidOutcome(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	_, err := svc.ResolveThread(context.Background(), "doc-1", "prop-1", "thread-1", "Avery", false, ResolveThreadInput{
		Outcome: "NOPE",
	})
	var domainErr *DomainError
	if !errors.As(err, &domainErr) {
		t.Fatalf("expected domain error, got %v", err)
	}
	if domainErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %s", domainErr.Code)
	}
}

func TestResolveThreadRequiresRationaleForRejected(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	_, err := svc.ResolveThread(context.Background(), "doc-1", "prop-1", "thread-1", "Avery", false, ResolveThreadInput{
		Outcome: "REJECTED",
	})
	var domainErr *DomainError
	if !errors.As(err, &domainErr) {
		t.Fatalf("expected domain error, got %v", err)
	}
	if domainErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %s", domainErr.Code)
	}
}

func TestHandleSyncSessionEndedValidatesProposalDocumentMatch(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-other", BranchName: "proposal-doc-other"}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	_, err := svc.HandleSyncSessionEnded(
		context.Background(),
		"session-1",
		"doc-1",
		"prop-1",
		"Avery",
		2,
		&WorkspaceContent{Title: "Doc"},
	)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for mismatched proposal/document, got %v", err)
	}
}

func TestHandleSyncSessionEndedDedupesSessionID(t *testing.T) {
	svc := newTestService(&fakeStore{}, &fakeGit{})

	first, err := svc.HandleSyncSessionEnded(
		context.Background(),
		"session-1",
		"doc-1",
		"",
		"Avery",
		0,
		nil,
	)
	if err != nil {
		t.Fatalf("first HandleSyncSessionEnded() error = %v", err)
	}
	second, err := svc.HandleSyncSessionEnded(
		context.Background(),
		"session-1",
		"doc-1",
		"",
		"Avery",
		3,
		nil,
	)
	if err != nil {
		t.Fatalf("second HandleSyncSessionEnded() error = %v", err)
	}
	if first["sessionId"] != second["sessionId"] || first["flushCommit"] != second["flushCommit"] {
		t.Fatalf("expected duplicate session response to be idempotent: first=%v second=%v", first, second)
	}
}

func TestGetWorkspaceFiltersInternalThreadsForExternalUsers(t *testing.T) {
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
			return []store.Thread{}, nil
		},
		summaryCountsFn: func(context.Context) (int, int, int, error) {
			return 1, 1, 0, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	if _, err := svc.GetWorkspace(context.Background(), "doc-1", false); err != nil {
		t.Fatalf("GetWorkspace() internal user error = %v", err)
	}
	if _, err := svc.GetWorkspace(context.Background(), "doc-1", true); err != nil {
		t.Fatalf("GetWorkspace() external user error = %v", err)
	}

	if len(includeInternalValues) != 2 {
		t.Fatalf("expected two ListThreads calls, got %d", len(includeInternalValues))
	}
	if !includeInternalValues[0] {
		t.Fatalf("expected internal viewer to include internal threads")
	}
	if includeInternalValues[1] {
		t.Fatalf("expected external viewer to exclude internal threads")
	}
}
