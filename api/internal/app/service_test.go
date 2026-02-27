package app

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"chronicle/api/internal/config"
	"chronicle/api/internal/gitrepo"
	"chronicle/api/internal/store"
)

type fakeStore struct {
	ensureUserByNameFn         func(context.Context, string) (store.User, error)
	getUserByIDFn              func(context.Context, string) (store.User, error)
	getProposalFn              func(context.Context, string) (store.Proposal, error)
	createProposalFn           func(context.Context, store.Proposal) error
	listApprovalsFn            func(context.Context, string) ([]store.Approval, error)
	approveRoleFn              func(context.Context, string, string, string) error
	updateProposalFn           func(context.Context, string, string) error
	updateDocumentStateFn      func(context.Context, string, string, string, string, string) error
	resolveThreadFn            func(context.Context, string, string, string, string, string) (bool, error)
	reopenThreadFn             func(context.Context, string, string) (bool, error)
	updateThreadVisibilityFn   func(context.Context, string, string, string) (bool, error)
	getThreadFn                func(context.Context, string, string) (store.Thread, error)
	listNamedVersionsFn        func(context.Context, string) ([]store.NamedVersion, error)
	listThreadsFn              func(context.Context, string, bool) ([]store.Thread, error)
	listAnnotationsFn          func(context.Context, string, bool) ([]store.Annotation, error)
	listThreadAnnotationsFn    func(context.Context, string, string) ([]store.Annotation, error)
	listThreadVoteTotalsFn     func(context.Context, string, bool) (map[string]int, error)
	listThreadReactionCountsFn func(context.Context, string, bool) ([]store.ThreadReactionCount, error)
	getDocumentFn              func(context.Context, string) (store.Document, error)
	getActiveProposalFn        func(context.Context, string) (*store.Proposal, error)
	listApprovalsAllFn         func(context.Context, string) ([]store.Approval, error)
	summaryCountsFn            func(context.Context) (int, int, int, error)
	listDecisionLogFilteredFn  func(context.Context, string, string, string, string, string, int) ([]store.DecisionLogEntry, error)
	insertDocumentFn           func(context.Context, store.Document) error
	insertDecisionLogFn        func(context.Context, store.DecisionLogEntry) error
	insertNamedVersionFn       func(context.Context, string, string, string, string) error
}

func (f *fakeStore) ListDocuments(context.Context) ([]store.Document, error) { return nil, nil }
func (f *fakeStore) EnsureUserByName(ctx context.Context, userName string) (store.User, error) {
	if f.ensureUserByNameFn != nil {
		return f.ensureUserByNameFn(ctx, userName)
	}
	return store.User{}, nil
}
func (f *fakeStore) CreateProposal(ctx context.Context, proposal store.Proposal) error {
	if f.createProposalFn != nil {
		return f.createProposalFn(ctx, proposal)
	}
	return nil
}
func (f *fakeStore) InsertDocument(ctx context.Context, item store.Document) error {
	if f.insertDocumentFn != nil {
		return f.insertDocumentFn(ctx, item)
	}
	return nil
}
func (f *fakeStore) InsertThread(context.Context, store.Thread) error { return nil }
func (f *fakeStore) ApproveRole(ctx context.Context, proposalID, role, approvedBy string) error {
	if f.approveRoleFn != nil {
		return f.approveRoleFn(ctx, proposalID, role, approvedBy)
	}
	return nil
}
func (f *fakeStore) InsertDecisionLog(ctx context.Context, entry store.DecisionLogEntry) error {
	if f.insertDecisionLogFn != nil {
		return f.insertDecisionLogFn(ctx, entry)
	}
	return nil
}
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
func (f *fakeStore) GetUserByID(ctx context.Context, userID string) (store.User, error) {
	if f.getUserByIDFn != nil {
		return f.getUserByIDFn(ctx, userID)
	}
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
func (f *fakeStore) UpdateDocumentState(ctx context.Context, documentID, title, subtitle, status, updatedBy string) error {
	if f.updateDocumentStateFn != nil {
		return f.updateDocumentStateFn(ctx, documentID, title, subtitle, status, updatedBy)
	}
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
func (f *fakeStore) InsertNamedVersion(ctx context.Context, proposalID, name, hash, createdBy string) error {
	if f.insertNamedVersionFn != nil {
		return f.insertNamedVersionFn(ctx, proposalID, name, hash, createdBy)
	}
	return nil
}
func (f *fakeStore) ProposalQueue(context.Context) ([]map[string]any, error) { return nil, nil }
func (f *fakeStore) ListSpaces(context.Context, string) ([]store.Space, error) {
	return nil, nil
}
func (f *fakeStore) GetDefaultWorkspace(context.Context) (store.Workspace, error) {
	return store.Workspace{ID: "ws_default", Name: "Acme Corp", Slug: "acme-corp"}, nil
}
func (f *fakeStore) GetSpace(_ context.Context, spaceID string) (store.Space, error) {
	return store.Space{ID: spaceID, WorkspaceID: "ws_default", Name: "General", Slug: "general", Description: ""}, nil
}
func (f *fakeStore) CreateSpace(context.Context, store.Space) error            { return nil }
func (f *fakeStore) InsertSpace(context.Context, store.Space) error            { return nil }
func (f *fakeStore) UpdateSpace(context.Context, string, string, string) error { return nil }
func (f *fakeStore) DeleteSpace(context.Context, string) error                 { return nil }
func (f *fakeStore) ListDocumentsBySpace(context.Context, string) ([]store.Document, error) {
	return nil, nil
}
func (f *fakeStore) MoveDocument(context.Context, string, string) error      { return nil }
func (f *fakeStore) SpaceDocumentCount(context.Context, string) (int, error) { return 0, nil }
func (f *fakeStore) Ping(context.Context) error                              { return nil }

type fakeGit struct {
	historyFn            func(string, string, int) ([]store.CommitInfo, error)
	getHeadContentFn     func(string, string) (gitrepo.Content, store.CommitInfo, error)
	commitContentFn      func(string, string, gitrepo.Content, string, string) (store.CommitInfo, error)
	ensureDocumentRepoFn func(string, gitrepo.Content, string) error
	ensureBranchFn       func(string, string, string) error
	createTagFn          func(string, string, string) error
}

func (f *fakeGit) EnsureDocumentRepo(documentID string, content gitrepo.Content, actor string) error {
	if f.ensureDocumentRepoFn != nil {
		return f.ensureDocumentRepoFn(documentID, content, actor)
	}
	return nil
}
func (f *fakeGit) EnsureBranch(documentID, branchName, fromBranch string) error {
	if f.ensureBranchFn != nil {
		return f.ensureBranchFn(documentID, branchName, fromBranch)
	}
	return nil
}
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
func (f *fakeGit) CreateTag(documentID, hash, name string) error {
	if f.createTagFn != nil {
		return f.createTagFn(documentID, hash, name)
	}
	return nil
}
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

func TestSaveNamedVersionCreatesTagAndRecord(t *testing.T) {
	insertCalls := 0
	createTagCalls := 0
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, proposalID string) (store.Proposal, error) {
			return store.Proposal{
				ID:         proposalID,
				DocumentID: "doc-1",
				BranchName: "proposal-doc-1",
			}, nil
		},
		getActiveProposalFn: func(_ context.Context, documentID string) (*store.Proposal, error) {
			return &store.Proposal{
				ID:         "prop-1",
				DocumentID: documentID,
				BranchName: "proposal-doc-1",
			}, nil
		},
		insertNamedVersionFn: func(_ context.Context, proposalID, name, hash, createdBy string) error {
			insertCalls++
			if proposalID != "prop-1" {
				t.Fatalf("expected proposalID prop-1, got %q", proposalID)
			}
			if name != "Partner Review Draft" {
				t.Fatalf("expected label to be preserved, got %q", name)
			}
			if hash != "abcDEF1234567890" {
				t.Fatalf("expected hash abcDEF1234567890, got %q", hash)
			}
			if createdBy != "Avery" {
				t.Fatalf("expected createdBy Avery, got %q", createdBy)
			}
			return nil
		},
	}
	fg := &fakeGit{
		getHeadContentFn: func(_ string, branch string) (gitrepo.Content, store.CommitInfo, error) {
			if branch != "proposal-doc-1" {
				t.Fatalf("expected named version source branch proposal-doc-1, got %q", branch)
			}
			return gitrepo.Content{}, store.CommitInfo{Hash: "abcDEF1234567890"}, nil
		},
		createTagFn: func(documentID, hash, name string) error {
			createTagCalls++
			if documentID != "doc-1" {
				t.Fatalf("expected document doc-1, got %q", documentID)
			}
			if hash != "abcDEF1234567890" {
				t.Fatalf("expected hash abcDEF1234567890, got %q", hash)
			}
			expected := "nv-partner-review-draft-abcdef123456"
			if name != expected {
				t.Fatalf("expected tag %q, got %q", expected, name)
			}
			return nil
		},
	}
	svc := newTestService(fs, fg)

	_, err := svc.SaveNamedVersion(context.Background(), "doc-1", "prop-1", "Partner Review Draft", "Avery", false)
	if err != nil {
		t.Fatalf("SaveNamedVersion() error = %v", err)
	}
	if createTagCalls != 1 {
		t.Fatalf("expected one CreateTag call, got %d", createTagCalls)
	}
	if insertCalls != 1 {
		t.Fatalf("expected one InsertNamedVersion call, got %d", insertCalls)
	}
}

func TestSaveNamedVersionRejectsBlankName(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, proposalID string) (store.Proposal, error) {
			return store.Proposal{
				ID:         proposalID,
				DocumentID: "doc-1",
				BranchName: "proposal-doc-1",
			}, nil
		},
	}
	svc := newTestService(fs, &fakeGit{})

	_, err := svc.SaveNamedVersion(context.Background(), "doc-1", "prop-1", "   ", "Avery", false)
	var domainErr *DomainError
	if !errors.As(err, &domainErr) {
		t.Fatalf("expected DomainError, got %v", err)
	}
	if domainErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR, got %s", domainErr.Code)
	}
}

func TestBuildNamedVersionTagNameSanitizesUnsafeCharacters(t *testing.T) {
	got := buildNamedVersionTagName(" Final / Client: Executed!  ", "A1B2C3D4E5F6G7")
	if got != "nv-final-client-executed-a1b2c3d4e5f6" {
		t.Fatalf("unexpected tag: %q", got)
	}
	if strings.Contains(got, " ") || strings.Contains(got, "/") || strings.Contains(got, ":") {
		t.Fatalf("tag must not contain unsafe separators: %q", got)
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

	payload, err := svc.CreateDocument(context.Background(), "New RFC", "", "sp_default", "Avery", false)
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

func TestSaveWorkspaceCreatesProposalBranchAndCommits(t *testing.T) {
	var createdProposal store.Proposal
	createProposalCalls := 0
	updateDocumentStateCalls := 0
	commitCalls := 0
	ensureBranchCalls := 0

	fs := &fakeStore{
		getActiveProposalFn: func(_ context.Context, documentID string) (*store.Proposal, error) {
			if createdProposal.ID == "" {
				return nil, nil
			}
			return &createdProposal, nil
		},
		createProposalFn: func(_ context.Context, proposal store.Proposal) error {
			createProposalCalls += 1
			createdProposal = proposal
			return nil
		},
		getDocumentFn: func(_ context.Context, documentID string) (store.Document, error) {
			return store.Document{
				ID:        documentID,
				Title:     "Doc",
				Subtitle:  "Sub",
				Status:    "Draft",
				UpdatedBy: "Avery",
			}, nil
		},
		updateProposalFn: func(_ context.Context, proposalID, status string) error {
			if proposalID != createdProposal.ID {
				t.Fatalf("expected proposal status update for %q, got %q", createdProposal.ID, proposalID)
			}
			if status != "DRAFT" {
				t.Fatalf("expected DRAFT status, got %q", status)
			}
			return nil
		},
		listApprovalsAllFn: func(context.Context, string) ([]store.Approval, error) {
			return nil, nil
		},
		updateDocumentStateFn: func(_ context.Context, documentID, title, subtitle, status, updatedBy string) error {
			updateDocumentStateCalls += 1
			if documentID != "doc-1" {
				t.Fatalf("expected document doc-1, got %q", documentID)
			}
			if title != "Updated title" {
				t.Fatalf("expected updated title, got %q", title)
			}
			if status != "In review" {
				t.Fatalf("expected status In review, got %q", status)
			}
			if updatedBy != "Avery" {
				t.Fatalf("expected updatedBy Avery, got %q", updatedBy)
			}
			return nil
		},
		summaryCountsFn: func(context.Context) (int, int, int, error) {
			return 1, 1, 0, nil
		},
	}

	fg := &fakeGit{
		ensureBranchFn: func(documentID, branchName, fromBranch string) error {
			ensureBranchCalls += 1
			if documentID != "doc-1" {
				t.Fatalf("expected doc-1 branch creation, got %q", documentID)
			}
			if branchName == "" {
				t.Fatalf("expected non-empty proposal branch name")
			}
			if fromBranch != "main" {
				t.Fatalf("expected branch source main, got %q", fromBranch)
			}
			return nil
		},
		getHeadContentFn: func(documentID, branchName string) (gitrepo.Content, store.CommitInfo, error) {
			if branchName != createdProposal.BranchName {
				t.Fatalf("expected head lookup on %q, got %q", createdProposal.BranchName, branchName)
			}
			return gitrepo.Content{
					Title:    "Doc",
					Subtitle: "Sub",
					Purpose:  "Purpose",
					Tiers:    "Tier baseline",
					Enforce:  "Enforce baseline",
				}, store.CommitInfo{
					Hash:      "head123",
					Author:    "Avery",
					Message:   "head",
					CreatedAt: time.Now(),
				}, nil
		},
		commitContentFn: func(documentID, branchName string, content gitrepo.Content, author, message string) (store.CommitInfo, error) {
			commitCalls += 1
			if documentID != "doc-1" {
				t.Fatalf("expected commit for doc-1, got %q", documentID)
			}
			if branchName != createdProposal.BranchName {
				t.Fatalf("expected commit on %q, got %q", createdProposal.BranchName, branchName)
			}
			if content.Title != "Updated title" {
				t.Fatalf("expected committed title Updated title, got %q", content.Title)
			}
			if author != "Avery" {
				t.Fatalf("expected commit author Avery, got %q", author)
			}
			if message != "Update proposal content" {
				t.Fatalf("expected commit message Update proposal content, got %q", message)
			}
			return store.CommitInfo{Hash: "new1234", Author: author, Message: message, CreatedAt: time.Now()}, nil
		},
		historyFn: func(_ string, branchName string, _ int) ([]store.CommitInfo, error) {
			if branchName != createdProposal.BranchName {
				t.Fatalf("expected workspace history on proposal branch %q, got %q", createdProposal.BranchName, branchName)
			}
			return []store.CommitInfo{
				{Hash: "new1234", Message: "Update proposal content", Author: "Avery", CreatedAt: time.Now()},
				{Hash: "head123", Message: "head", Author: "Avery", CreatedAt: time.Now().Add(-time.Minute)},
			}, nil
		},
	}

	svc := newTestService(fs, fg)
	payload, err := svc.SaveWorkspace(context.Background(), "doc-1", WorkspaceContent{
		Title: "Updated title",
		Doc:   `{"type":"doc","content":[{"type":"paragraph","attrs":{"nodeId":"p1"},"content":[{"type":"text","text":"Updated title"}]}]}`,
	}, "Avery", false)
	if err != nil {
		t.Fatalf("SaveWorkspace() error = %v", err)
	}

	if createProposalCalls != 1 {
		t.Fatalf("expected one proposal creation, got %d", createProposalCalls)
	}
	if ensureBranchCalls != 1 {
		t.Fatalf("expected one EnsureBranch call, got %d", ensureBranchCalls)
	}
	if commitCalls != 1 {
		t.Fatalf("expected one commit call, got %d", commitCalls)
	}
	if updateDocumentStateCalls == 0 {
		t.Fatalf("expected document state update after save")
	}

	doc, ok := payload["document"].(map[string]any)
	if !ok {
		t.Fatalf("expected document payload map")
	}
	if doc["proposalId"] == nil || doc["proposalId"] == "" {
		t.Fatalf("expected workspace payload to include active proposalId")
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

func TestResolveThreadFailsWhenDecisionLogInsertFails(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		resolveThreadFn: func(_ context.Context, _, _, _, _, _ string) (bool, error) {
			return true, nil
		},
		getThreadFn: func(_ context.Context, _, _ string) (store.Thread, error) {
			return store.Thread{ID: "thr-1", ProposalID: "prop-1", Author: "Sam", Visibility: "INTERNAL"}, nil
		},
		listThreadAnnotationsFn: func(_ context.Context, _, _ string) ([]store.Annotation, error) {
			return []store.Annotation{{Author: "Alex"}}, nil
		},
		insertDecisionLogFn: func(context.Context, store.DecisionLogEntry) error {
			return errors.New("immutable violation")
		},
	}
	fg := &fakeGit{
		getHeadContentFn: func(_, _ string) (gitrepo.Content, store.CommitInfo, error) {
			return gitrepo.Content{}, store.CommitInfo{Hash: "head123"}, nil
		},
	}
	svc := newTestService(fs, fg)

	_, err := svc.ResolveThread(context.Background(), "doc-1", "prop-1", "thread-1", "Avery", false, ResolveThreadInput{
		Outcome: "ACCEPTED",
	})
	if err == nil || err.Error() != "immutable violation" {
		t.Fatalf("expected decision-log error, got %v", err)
	}
}

func TestMergeProposalFailsWhenDecisionLogInsertFails(t *testing.T) {
	fs := &fakeStore{
		getProposalFn: func(_ context.Context, _ string) (store.Proposal, error) {
			return store.Proposal{ID: "prop-1", DocumentID: "doc-1", BranchName: "proposal-doc-1"}, nil
		},
		insertDecisionLogFn: func(context.Context, store.DecisionLogEntry) error {
			return errors.New("immutable violation")
		},
	}
	fg := &fakeGit{
		getHeadContentFn: func(_, branch string) (gitrepo.Content, store.CommitInfo, error) {
			return gitrepo.Content{Title: "Doc", Subtitle: "Sub"}, store.CommitInfo{Hash: "main123"}, nil
		},
	}
	svc := newTestService(fs, fg)

	_, _, _, err := svc.MergeProposal(context.Background(), "doc-1", "prop-1", "Avery", false)
	if err == nil || err.Error() != "immutable violation" {
		t.Fatalf("expected decision-log error, got %v", err)
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
