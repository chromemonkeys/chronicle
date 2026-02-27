package app

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"chronicle/api/internal/auth"
	"chronicle/api/internal/config"
	"chronicle/api/internal/gitrepo"
	"chronicle/api/internal/rbac"
	"chronicle/api/internal/store"
	"chronicle/api/internal/util"
)

type Session struct {
	Token        string
	RefreshToken string
	UserID       string
	UserName     string
	Role         string
	IsExternal   bool
	JTI          string
	ExpiresAt    time.Time
}

type WorkspaceContent struct {
	Title    string          `json:"title"`
	Subtitle string          `json:"subtitle"`
	Purpose  string          `json:"purpose"`
	Tiers    string          `json:"tiers"`
	Enforce  string          `json:"enforce"`
	Doc      json.RawMessage `json:"doc,omitempty"`
}

type CreateThreadInput struct {
	Text          string          `json:"text"`
	AnchorLabel   string          `json:"anchorLabel"`
	Anchor        string          `json:"anchor"`
	AnchorNodeID  string          `json:"anchorNodeId"`
	AnchorOffsets json.RawMessage `json:"anchorOffsets"`
	Visibility    string          `json:"visibility"`
	Type          string          `json:"type"`
}

type ThreadReplyInput struct {
	Body string `json:"body"`
	Type string `json:"type"`
}

type ResolveThreadInput struct {
	Outcome   string `json:"outcome"`
	Rationale string `json:"rationale"`
}

type VoteThreadInput struct {
	Direction string `json:"direction"`
}

type ReactThreadInput struct {
	Emoji string `json:"emoji"`
}

type UpdateThreadVisibilityInput struct {
	Visibility string `json:"visibility"`
}

type DecisionLogFilterInput struct {
	ProposalID string
	Outcome    string
	Query      string
	Author     string
	Limit      int
}

var allowedThreadTypes = map[string]struct{}{
	"GENERAL":    {},
	"LEGAL":      {},
	"COMMERCIAL": {},
	"TECHNICAL":  {},
	"SECURITY":   {},
	"QUERY":      {},
	"EDITORIAL":  {},
}

var allowedThreadOutcomes = map[string]struct{}{
	"ACCEPTED": {},
	"REJECTED": {},
	"DEFERRED": {},
}

var allowedThreadVisibility = map[string]struct{}{
	"INTERNAL": {},
	"EXTERNAL": {},
}

type dataStore interface {
	ListDocuments(context.Context) ([]store.Document, error)
	EnsureUserByName(context.Context, string) (store.User, error)
	CreateProposal(context.Context, store.Proposal) error
	InsertDocument(context.Context, store.Document) error
	InsertThread(context.Context, store.Thread) error
	ApproveRole(context.Context, string, string, string) error
	InsertDecisionLog(context.Context, store.DecisionLogEntry) error
	SaveRefreshSession(context.Context, string, string, time.Time) error
	LookupRefreshSession(context.Context, string) (store.User, error)
	RevokeRefreshSession(context.Context, string) error
	RevokeAccessToken(context.Context, string, time.Time) error
	IsAccessTokenRevoked(context.Context, string) (bool, error)
	GetUserByID(context.Context, string) (store.User, error)
	GetActiveProposal(context.Context, string) (*store.Proposal, error)
	OpenThreadCount(context.Context, string) (int, error)
	GetProposal(context.Context, string) (store.Proposal, error)
	UpdateDocumentState(context.Context, string, string, string, string, string) error
	UpdateProposalStatus(context.Context, string, string) error
	ResolveThread(context.Context, string, string, string, string, string) (bool, error)
	ReopenThread(context.Context, string, string) (bool, error)
	UpdateThreadVisibility(context.Context, string, string, string) (bool, error)
	GetThread(context.Context, string, string) (store.Thread, error)
	ListNamedVersions(context.Context, string) ([]store.NamedVersion, error)
	ListApprovals(context.Context, string) ([]store.Approval, error)
	PendingApprovalCount(context.Context, string) (int, error)
	MarkProposalMerged(context.Context, string) error
	GetDocument(context.Context, string) (store.Document, error)
	ListThreads(context.Context, string, bool) ([]store.Thread, error)
	InsertAnnotation(context.Context, store.Annotation) error
	ListThreadAnnotations(context.Context, string, string) ([]store.Annotation, error)
	ListAnnotations(context.Context, string, bool) ([]store.Annotation, error)
	ToggleThreadVote(context.Context, string, string, string, int) error
	ToggleThreadReaction(context.Context, string, string, string, string) error
	ListThreadVoteTotals(context.Context, string, bool) (map[string]int, error)
	ListThreadReactionCounts(context.Context, string, bool) ([]store.ThreadReactionCount, error)
	ListDecisionLog(context.Context, string, string, int) ([]store.DecisionLogEntry, error)
	ListDecisionLogFiltered(context.Context, string, string, string, string, string, int) ([]store.DecisionLogEntry, error)
	SummaryCounts(context.Context) (int, int, int, error)
	InsertNamedVersion(context.Context, string, string, string, string) error
	ProposalQueue(context.Context) ([]map[string]any, error)
	GetDefaultWorkspace(context.Context) (store.Workspace, error)
	ListSpaces(context.Context, string) ([]store.Space, error)
	GetSpace(context.Context, string) (store.Space, error)
	InsertSpace(context.Context, store.Space) error
	UpdateSpace(context.Context, string, string, string) error
	DeleteSpace(context.Context, string) error
	ListDocumentsBySpace(context.Context, string) ([]store.Document, error)
	MoveDocument(context.Context, string, string) error
	SpaceDocumentCount(context.Context, string) (int, error)
	Ping(ctx context.Context) error
}

type gitService interface {
	EnsureDocumentRepo(string, gitrepo.Content, string) error
	EnsureBranch(string, string, string) error
	CommitContent(string, string, gitrepo.Content, string, string) (store.CommitInfo, error)
	GetHeadContent(string, string) (gitrepo.Content, store.CommitInfo, error)
	History(string, string, int) ([]store.CommitInfo, error)
	GetContentByHash(string, string) (gitrepo.Content, error)
	GetCommitByHash(string, string) (store.CommitInfo, error)
	CreateTag(string, string, string) error
	MergeIntoMain(string, string, string, string) (store.CommitInfo, error)
}

type syncSessionRecord struct {
	expiresAt time.Time
	payload   map[string]any
}

type Service struct {
	cfg            config.Config
	store          dataStore
	git            gitService
	syncSessionTTL time.Duration
	syncMu         sync.Mutex
	syncSessions   map[string]syncSessionRecord
}

func New(cfg config.Config, dataStore *store.PostgresStore, gitService *gitrepo.Service) *Service {
	return &Service{
		cfg:            cfg,
		store:          dataStore,
		git:            gitService,
		syncSessionTTL: 15 * time.Minute,
		syncSessions:   make(map[string]syncSessionRecord),
	}
}

func (s *Service) Bootstrap(ctx context.Context) error {
	documents, err := s.store.ListDocuments(ctx)
	if err != nil {
		return err
	}
	if len(documents) > 0 {
		return nil
	}

	owner, err := s.store.EnsureUserByName(ctx, "Avery")
	if err != nil {
		return err
	}

	seeds := []struct {
		ID       string
		Title    string
		Subtitle string
		Status   string
	}{
		{ID: "adr-142", Title: "ADR-142: Event Retention Model", Subtitle: "Governing fair use and abuse prevention across all Acme public and internal APIs.", Status: "In review"},
		{ID: "rfc-auth", Title: "RFC: OAuth and Magic Link Session Flow", Subtitle: "Authentication and session lifecycle proposal.", Status: "Draft"},
		{ID: "policy-sec", Title: "Security Policy Update", Subtitle: "Policy adjustments for connection abuse prevention.", Status: "Ready for approval"},
	}

	for _, seed := range seeds {
		if err := s.store.InsertDocument(ctx, store.Document{
			ID:        seed.ID,
			Title:     seed.Title,
			Subtitle:  seed.Subtitle,
			Status:    seed.Status,
			UpdatedBy: owner.DisplayName,
		}); err != nil {
			return err
		}

		baseContent := gitrepo.Content{
			Title:    seed.Title,
			Subtitle: seed.Subtitle,
			Purpose:  "Rate limiting protects infrastructure from abuse, preserves fairness, and maintains availability.",
			Tiers:    "Standard tier consumers are limited to 2,000 requests per minute.",
			Enforce:  "Exceeded limits return 429 with rate-limit headers and retry guidance.",
		}
		if err := s.git.EnsureDocumentRepo(seed.ID, baseContent, owner.DisplayName); err != nil {
			return err
		}
	}

	activeDoc := seeds[0]
	proposal := store.Proposal{
		ID:           util.NewID("prop"),
		DocumentID:   activeDoc.ID,
		Title:        activeDoc.Title + " review",
		Status:       "UNDER_REVIEW",
		BranchName:   "proposal-" + activeDoc.ID,
		TargetBranch: "main",
		CreatedBy:    owner.DisplayName,
	}
	if err := s.store.CreateProposal(ctx, proposal); err != nil {
		return err
	}

	if err := s.git.EnsureBranch(activeDoc.ID, proposal.BranchName, "main"); err != nil {
		return err
	}

	_, err = s.git.CommitContent(activeDoc.ID, proposal.BranchName, gitrepo.Content{
		Title:    activeDoc.Title,
		Subtitle: activeDoc.Subtitle,
		Purpose:  "Rate limiting protects infrastructure from abuse and maintains fairness for all tenants.",
		Tiers:    "Standard tier consumers are limited to 2,000 requests per minute.",
		Enforce:  "Exceeded limits return 429 with retry guidance and per-key concurrent WebSocket caps.",
	}, owner.DisplayName, "Add WebSocket concurrent connection limit")
	if err != nil {
		return err
	}

	threadSeeds := []store.Thread{
		{
			ID:           "purpose",
			ProposalID:   proposal.ID,
			Anchor:       "Overview > Purpose",
			AnchorNodeID: "n-adr142-purpose",
			Text:         "Should we explicitly call out DDoS mitigation as a goal here?",
			Status:       "OPEN",
			Author:       "Marcus K.",
		},
		{
			ID:           "tiers",
			ProposalID:   proposal.ID,
			Anchor:       "Tier Definitions > Standard Limit",
			AnchorNodeID: "n-adr142-tiers",
			Text:         "The 2x increase needs load-testing evidence before policy merge.",
			Status:       "OPEN",
			Author:       "Jamie L.",
		},
		{
			ID:           "enforce",
			ProposalID:   proposal.ID,
			Anchor:       "Enforcement > Response Codes",
			AnchorNodeID: "n-adr142-enforce",
			Text:         "Should jitter algorithm specifics remain in policy or move to SDK docs?",
			Status:       "RESOLVED",
			ResolvedNote: "Resolved by Marcus K. · moved to SDK docs.",
			Author:       "Sarah R.",
		},
	}
	for _, thread := range threadSeeds {
		if err := s.store.InsertThread(ctx, thread); err != nil {
			return err
		}
	}

	if err := s.store.ApproveRole(ctx, proposal.ID, "security", "Sarah R."); err != nil {
		return err
	}

	if err := s.store.InsertDecisionLog(ctx, store.DecisionLogEntry{
		DocumentID: activeDoc.ID,
		ProposalID: proposal.ID,
		ThreadID:   "enforce",
		Outcome:    "ACCEPTED",
		Rationale:  "Jitter algorithm moved to SDK docs to keep policy concise.",
		DecidedBy:  "Marcus K.",
		CommitHash: "seed",
	}); err != nil {
		return err
	}
	return nil
}

func (s *Service) Login(ctx context.Context, name string) (Session, error) {
	userName := strings.TrimSpace(name)
	if userName == "" {
		userName = "User"
	}

	user, err := s.store.EnsureUserByName(ctx, userName)
	if err != nil {
		return Session{}, err
	}

	return s.issueSession(ctx, user)
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (Session, error) {
	tokenHash := auth.HashToken(refreshToken)
	user, err := s.store.LookupRefreshSession(ctx, tokenHash)
	if err != nil {
		return Session{}, err
	}
	if err := s.store.RevokeRefreshSession(ctx, tokenHash); err != nil {
		return Session{}, err
	}
	return s.issueSession(ctx, user)
}

func (s *Service) issueSession(ctx context.Context, user store.User) (Session, error) {
	now := time.Now()
	expiresAt := now.Add(s.cfg.AccessTTL)
	jti := util.NewID("jti")

	token, err := auth.IssueToken([]byte(s.cfg.JWTSecret), auth.Claims{
		Sub:  user.ID,
		Name: user.DisplayName,
		Role: user.Role,
		JTI:  jti,
		Exp:  expiresAt.Unix(),
	})
	if err != nil {
		return Session{}, err
	}

	refresh := util.NewID("rft") + util.NewID("")
	refreshExpires := now.Add(s.cfg.RefreshTTL)
	if err := s.store.SaveRefreshSession(ctx, auth.HashToken(refresh), user.ID, refreshExpires); err != nil {
		return Session{}, err
	}

	return Session{
		Token:        token,
		RefreshToken: refresh,
		UserID:       user.ID,
		UserName:     user.DisplayName,
		Role:         user.Role,
		IsExternal:   user.IsExternal,
		JTI:          jti,
		ExpiresAt:    expiresAt,
	}, nil
}

func (s *Service) SessionFromToken(ctx context.Context, token string) (Session, error) {
	claims, err := auth.ParseToken([]byte(s.cfg.JWTSecret), token)
	if err != nil {
		return Session{}, err
	}
	revoked, err := s.store.IsAccessTokenRevoked(ctx, claims.JTI)
	if err != nil {
		return Session{}, err
	}
	if revoked {
		return Session{}, auth.ErrInvalidToken
	}

	user, err := s.store.GetUserByID(ctx, claims.Sub)
	if err != nil {
		return Session{}, err
	}

	return Session{
		Token:      token,
		UserID:     user.ID,
		UserName:   user.DisplayName,
		Role:       user.Role,
		IsExternal: user.IsExternal,
		JTI:        claims.JTI,
		ExpiresAt:  time.Unix(claims.Exp, 0),
	}, nil
}

func (s *Service) Logout(ctx context.Context, session Session, refreshToken string) error {
	if session.JTI != "" {
		_ = s.store.RevokeAccessToken(ctx, session.JTI, session.ExpiresAt)
	}
	if refreshToken != "" {
		_ = s.store.RevokeRefreshSession(ctx, auth.HashToken(refreshToken))
	}
	return nil
}

func (s *Service) Can(role string, action rbac.Action) bool {
	return rbac.Can(rbac.Normalize(role), action)
}

func (s *Service) ListDocuments(ctx context.Context) ([]map[string]any, error) {
	documents, err := s.store.ListDocuments(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(documents))
	for _, doc := range documents {
		openThreads := 0
		proposal, err := s.store.GetActiveProposal(ctx, doc.ID)
		if err != nil {
			return nil, err
		}
		if proposal != nil {
			openThreads, err = s.store.OpenThreadCount(ctx, proposal.ID)
			if err != nil {
				return nil, err
			}
		}
		items = append(items, map[string]any{
			"id":          doc.ID,
			"title":       doc.Title,
			"status":      doc.Status,
			"updatedBy":   doc.UpdatedBy,
			"openThreads": openThreads,
			"spaceId":     doc.SpaceID,
		})
	}
	return items, nil
}

func (s *Service) GetDocumentSummary(ctx context.Context, documentID string) (map[string]any, error) {
	items, err := s.ListDocuments(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		if item["id"] == documentID {
			return item, nil
		}
	}
	return nil, sql.ErrNoRows
}

func (s *Service) EnsureWorkflowProposal(ctx context.Context, documentID, userName string) (*store.Proposal, error) {
	active, err := s.store.GetActiveProposal(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if active != nil {
		return active, nil
	}

	proposal := store.Proposal{
		ID:           util.NewID("prop"),
		DocumentID:   documentID,
		Title:        "New proposal",
		Status:       "DRAFT",
		BranchName:   "proposal-" + util.NewID(documentID),
		TargetBranch: "main",
		CreatedBy:    userName,
	}
	if err := s.store.CreateProposal(ctx, proposal); err != nil {
		return nil, err
	}
	if err := s.git.EnsureBranch(documentID, proposal.BranchName, "main"); err != nil {
		return nil, err
	}
	return &proposal, nil
}

func (s *Service) CreateProposal(ctx context.Context, documentID, userName, title string, viewerIsExternal bool) (map[string]any, error) {
	proposalTitle := strings.TrimSpace(title)
	if proposalTitle == "" {
		proposalTitle = "New proposal"
	}
	proposal := store.Proposal{
		ID:           util.NewID("prop"),
		DocumentID:   documentID,
		Title:        proposalTitle,
		Status:       "DRAFT",
		BranchName:   "proposal-" + util.NewID(documentID),
		TargetBranch: "main",
		CreatedBy:    userName,
	}
	if err := s.store.CreateProposal(ctx, proposal); err != nil {
		return nil, err
	}
	if err := s.git.EnsureBranch(documentID, proposal.BranchName, "main"); err != nil {
		return nil, err
	}
	doc, err := s.store.GetDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.store.UpdateDocumentState(ctx, documentID, firstNonBlank(proposalTitle, doc.Title), doc.Subtitle, "Draft", userName); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) CreateDocument(ctx context.Context, title, subtitle, spaceID, userName string, viewerIsExternal bool) (map[string]any, error) {
	documentTitle := strings.TrimSpace(title)
	if documentTitle == "" {
		documentTitle = "Untitled Document"
	}
	documentSubtitle := strings.TrimSpace(subtitle)
	if strings.TrimSpace(spaceID) == "" {
		spaceID = "sp_default"
	}
	documentID := "doc-" + util.NewID("")[:10]
	initialContent := gitrepo.Content{
		Title:    documentTitle,
		Subtitle: documentSubtitle,
		Purpose:  "Describe the purpose and decision context for this document.",
		Tiers:    "Document relevant tiers, scope boundaries, or audience segments.",
		Enforce:  "Describe how this policy or decision is enforced and reviewed.",
	}
	if err := s.store.InsertDocument(ctx, store.Document{
		ID:        documentID,
		Title:     documentTitle,
		Subtitle:  documentSubtitle,
		Status:    "Draft",
		SpaceID:   spaceID,
		UpdatedBy: userName,
	}); err != nil {
		return nil, err
	}
	if err := s.git.EnsureDocumentRepo(documentID, initialContent, userName); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) SaveWorkspace(ctx context.Context, documentID string, content WorkspaceContent, userName string, viewerIsExternal bool) (map[string]any, error) {
	proposal, err := s.EnsureWorkflowProposal(ctx, documentID, userName)
	if err != nil {
		return nil, err
	}

	current, _, err := s.git.GetHeadContent(documentID, proposal.BranchName)
	if err != nil {
		return nil, err
	}

	nextDoc := current.Doc
	if normalizedDoc := normalizeDocJSON(content.Doc); len(normalizedDoc) > 0 {
		nextDoc = normalizedDoc
	}
	derived := deriveLegacyFromDoc(nextDoc, current)
	next := gitrepo.Content{
		Title:    firstNonBlank(content.Title, firstNonBlank(derived.Title, current.Title)),
		Subtitle: firstNonBlank(content.Subtitle, firstNonBlank(derived.Subtitle, current.Subtitle)),
		Purpose:  firstNonBlank(content.Purpose, firstNonBlank(derived.Purpose, current.Purpose)),
		Tiers:    firstNonBlank(content.Tiers, firstNonBlank(derived.Tiers, current.Tiers)),
		Enforce:  firstNonBlank(content.Enforce, firstNonBlank(derived.Enforce, current.Enforce)),
		Doc:      nextDoc,
	}

	if gitrepo.HasChanges(current, next) {
		message := "Update proposal content"
		if _, err := s.git.CommitContent(documentID, proposal.BranchName, next, userName, message); err != nil {
			return nil, err
		}
		if proposal.Status == "DRAFT" {
			if err := s.store.UpdateProposalStatus(ctx, proposal.ID, "DRAFT"); err != nil {
				return nil, err
			}
		}
		if err := s.store.UpdateDocumentState(ctx, documentID, next.Title, next.Subtitle, "In review", userName); err != nil {
			return nil, err
		}
	}

	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) SubmitProposal(ctx context.Context, documentID, proposalID string, viewerIsExternal bool) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	if err := s.store.UpdateProposalStatus(ctx, proposalID, "UNDER_REVIEW"); err != nil {
		return nil, err
	}
	doc, err := s.store.GetDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.store.UpdateDocumentState(ctx, documentID, doc.Title, doc.Subtitle, "In review", doc.UpdatedBy); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) ApproveProposalRole(ctx context.Context, documentID, proposalID, role, userName string, viewerIsExternal bool) (map[string]any, error) {
	role = strings.TrimSpace(role)
	if _, ok := approvalDependencies[role]; !ok {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "role must be one of security, architectureCommittee, legal", nil)
	}
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	approvals, err := s.store.ListApprovals(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	statusByRole := make(map[string]string, len(approvals))
	for _, approval := range approvals {
		statusByRole[approval.Role] = approval.Status
	}
	blockers := blockedApprovalRoles(statusByRole, role)
	if len(blockers) > 0 {
		return nil, domainError(http.StatusConflict, "APPROVAL_ORDER_BLOCKED", "Approval order is blocked by unmet prerequisites", map[string]any{
			"role":     role,
			"blockers": blockers,
		})
	}
	if err := s.store.ApproveRole(ctx, proposalID, role, userName); err != nil {
		return nil, err
	}
	if err := s.store.UpdateProposalStatus(ctx, proposalID, "UNDER_REVIEW"); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) CreateThread(ctx context.Context, documentID, proposalID, userName string, viewerIsExternal bool, input CreateThreadInput) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}

	text := strings.TrimSpace(input.Text)
	if text == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "text is required", nil)
	}
	threadType := normalizeThreadType(input.Type)
	if _, ok := allowedThreadTypes[threadType]; !ok {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "invalid thread type", nil)
	}
	visibility := normalizeThreadVisibility(input.Visibility)
	if _, ok := allowedThreadVisibility[visibility]; !ok {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "invalid thread visibility", nil)
	}
	if viewerIsExternal && visibility != "EXTERNAL" {
		return nil, domainError(http.StatusForbidden, "FORBIDDEN", "external users can only create EXTERNAL threads", nil)
	}

	anchorLabel := strings.TrimSpace(firstNonBlank(input.AnchorLabel, input.Anchor))
	if anchorLabel == "" {
		anchorLabel = "¶ Unanchored"
	}
	threadID := util.NewID("thr")
	anchorOffsets := normalizeAnchorOffsetsJSON(input.AnchorOffsets)
	if len(anchorOffsets) == 0 {
		anchorOffsets = json.RawMessage(`{}`)
	}
	if err := s.store.InsertThread(ctx, store.Thread{
		ID:            threadID,
		ProposalID:    proposalID,
		Anchor:        anchorLabel,
		AnchorNodeID:  strings.TrimSpace(input.AnchorNodeID),
		AnchorOffsets: string(anchorOffsets),
		Text:          text,
		Status:        "OPEN",
		Visibility:    visibility,
		Type:          threadType,
		Author:        userName,
	}); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) ReplyThread(ctx context.Context, documentID, proposalID, threadID, userName string, viewerIsExternal bool, input ThreadReplyInput) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	thread, err := s.store.GetThread(ctx, proposalID, threadID)
	if err != nil {
		return nil, err
	}
	if viewerIsExternal && thread.Visibility != "EXTERNAL" {
		return nil, domainError(http.StatusForbidden, "FORBIDDEN", "external users cannot reply to internal threads", nil)
	}
	body := strings.TrimSpace(input.Body)
	if body == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "body is required", nil)
	}
	annotationType := normalizeThreadType(input.Type)
	if _, ok := allowedThreadTypes[annotationType]; !ok {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "invalid annotation type", nil)
	}
	if err := s.store.InsertAnnotation(ctx, store.Annotation{
		ID:         util.NewID("ann"),
		ProposalID: proposalID,
		ThreadID:   threadID,
		Author:     userName,
		Body:       body,
		Type:       annotationType,
	}); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) ResolveThread(ctx context.Context, documentID, proposalID, threadID, userName string, viewerIsExternal bool, input ResolveThreadInput) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}

	outcome := normalizeThreadOutcome(input.Outcome)
	if _, ok := allowedThreadOutcomes[outcome]; !ok {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "invalid resolution outcome", nil)
	}
	rationale := strings.TrimSpace(input.Rationale)
	if outcome == "REJECTED" && rationale == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "rationale is required for REJECTED outcome", nil)
	}
	if rationale == "" {
		rationale = "Thread resolved in proposal flow."
	}

	resolvedNote := fmt.Sprintf("Resolved by %s · %s", userName, time.Now().Format(time.RFC3339))
	changed, err := s.store.ResolveThread(ctx, proposalID, threadID, userName, resolvedNote, outcome)
	if err != nil {
		return nil, err
	}
	if !changed {
		return nil, sql.ErrNoRows
	}
	thread, err := s.store.GetThread(ctx, proposalID, threadID)
	if err != nil {
		return nil, err
	}
	annotations, err := s.store.ListThreadAnnotations(ctx, proposalID, threadID)
	if err != nil {
		return nil, err
	}
	participantsSet := map[string]struct{}{userName: {}}
	if thread.Author != "" {
		participantsSet[thread.Author] = struct{}{}
	}
	for _, annotation := range annotations {
		if annotation.Author == "" {
			continue
		}
		participantsSet[annotation.Author] = struct{}{}
	}
	participants := make([]string, 0, len(participantsSet))
	for name := range participantsSet {
		participants = append(participants, name)
	}
	sort.Strings(participants)

	_, headCommit, err := s.git.GetHeadContent(documentID, proposal.BranchName)
	if err != nil {
		return nil, err
	}
	if err := s.store.InsertDecisionLog(ctx, store.DecisionLogEntry{
		DocumentID: documentID,
		ProposalID: proposalID,
		ThreadID:   threadID,
		Outcome:    outcome,
		Rationale:  rationale,
		DecidedBy:  userName,
		CommitHash: headCommit.Hash,
		Participants: participants,
	}); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) ReopenThread(ctx context.Context, documentID, proposalID, threadID string, viewerIsExternal bool) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	changed, err := s.store.ReopenThread(ctx, proposalID, threadID)
	if err != nil {
		return nil, err
	}
	if !changed {
		return nil, sql.ErrNoRows
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) SetThreadVisibility(ctx context.Context, documentID, proposalID, threadID string, viewerIsExternal bool, input UpdateThreadVisibilityInput) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	visibility := normalizeThreadVisibility(input.Visibility)
	if _, ok := allowedThreadVisibility[visibility]; !ok {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "invalid thread visibility", nil)
	}
	changed, err := s.store.UpdateThreadVisibility(ctx, proposalID, threadID, visibility)
	if err != nil {
		return nil, err
	}
	if !changed {
		return nil, sql.ErrNoRows
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) VoteThread(ctx context.Context, documentID, proposalID, threadID, userName string, viewerIsExternal bool, input VoteThreadInput) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	thread, err := s.store.GetThread(ctx, proposalID, threadID)
	if err != nil {
		return nil, err
	}
	if viewerIsExternal && thread.Visibility != "EXTERNAL" {
		return nil, domainError(http.StatusForbidden, "FORBIDDEN", "external users cannot vote on internal threads", nil)
	}
	direction := strings.ToLower(strings.TrimSpace(input.Direction))
	vote := 0
	if direction == "up" {
		vote = 1
	}
	if direction == "down" {
		vote = -1
	}
	if vote == 0 {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "direction must be 'up' or 'down'", nil)
	}
	if err := s.store.ToggleThreadVote(ctx, proposalID, threadID, userName, vote); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) ReactThread(ctx context.Context, documentID, proposalID, threadID, userName string, viewerIsExternal bool, input ReactThreadInput) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	thread, err := s.store.GetThread(ctx, proposalID, threadID)
	if err != nil {
		return nil, err
	}
	if viewerIsExternal && thread.Visibility != "EXTERNAL" {
		return nil, domainError(http.StatusForbidden, "FORBIDDEN", "external users cannot react to internal threads", nil)
	}
	emoji := strings.TrimSpace(input.Emoji)
	if emoji == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "emoji is required", nil)
	}
	if len([]rune(emoji)) > 8 {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "emoji is too long", nil)
	}
	if err := s.store.ToggleThreadReaction(ctx, proposalID, threadID, userName, emoji); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func (s *Service) DecisionLog(ctx context.Context, documentID string, filters DecisionLogFilterInput) (map[string]any, error) {
	outcome := strings.ToUpper(strings.TrimSpace(filters.Outcome))
	if outcome != "" {
		if _, ok := allowedThreadOutcomes[outcome]; !ok {
			return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "invalid decision outcome filter", nil)
		}
	}
	entries, err := s.store.ListDecisionLogFiltered(
		ctx,
		documentID,
		strings.TrimSpace(filters.ProposalID),
		outcome,
		strings.TrimSpace(filters.Query),
		strings.TrimSpace(filters.Author),
		filters.Limit,
	)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(entries))
	for _, row := range entries {
		items = append(items, map[string]any{
			"id":           row.ID,
			"threadId":     row.ThreadID,
			"proposalId":   nilIfEmpty(row.ProposalID),
			"outcome":      row.Outcome,
			"rationale":    row.Rationale,
			"decidedBy":    row.DecidedBy,
			"decidedAt":    row.DecidedAt.Format(time.RFC3339),
			"commitHash":   row.CommitHash,
			"participants": row.Participants,
		})
	}
	return map[string]any{
		"documentId": documentID,
		"items":      items,
	}, nil
}

func (s *Service) SaveNamedVersion(ctx context.Context, documentID, proposalID, name, userName string, viewerIsExternal bool) (map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, sql.ErrNoRows
	}
	_, commit, err := s.git.GetHeadContent(documentID, proposal.BranchName)
	if err != nil {
		return nil, err
	}
	label := strings.TrimSpace(name)
	if label == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "name is required", nil)
	}
	tagName := buildNamedVersionTagName(label, commit.Hash)
	if err := s.git.CreateTag(documentID, commit.Hash, tagName); err != nil {
		return nil, err
	}
	if err := s.store.InsertNamedVersion(ctx, proposalID, label, commit.Hash, userName); err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, documentID, viewerIsExternal)
}

func buildNamedVersionTagName(label, commitHash string) string {
	const maxLabelLen = 48
	slug := make([]rune, 0, len(label))
	lastDash := false
	for _, raw := range strings.ToLower(strings.TrimSpace(label)) {
		ch := raw
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			slug = append(slug, ch)
			lastDash = false
			continue
		}
		if !lastDash {
			slug = append(slug, '-')
			lastDash = true
		}
	}
	slugText := strings.Trim(string(slug), "-")
	if slugText == "" {
		slugText = "version"
	}
	if len(slugText) > maxLabelLen {
		slugText = strings.TrimRight(slugText[:maxLabelLen], "-")
	}
	if slugText == "" {
		slugText = "version"
	}

	hashPart := make([]rune, 0, len(commitHash))
	for _, ch := range strings.ToLower(commitHash) {
		if (ch >= 'a' && ch <= 'f') || (ch >= '0' && ch <= '9') {
			hashPart = append(hashPart, ch)
		}
	}
	hashText := string(hashPart)
	if hashText == "" {
		hashText = "head"
	}
	if len(hashText) > 12 {
		hashText = hashText[:12]
	}
	return "nv-" + slugText + "-" + hashText
}

type MergeGatePolicy struct {
	AllowMergeWithDeferredChanges bool `json:"allowMergeWithDeferredChanges"`
	IgnoreFormatOnlyChangesForGate bool `json:"ignoreFormatOnlyChangesForGate"`
}

func defaultMergeGatePolicy() MergeGatePolicy {
	return MergeGatePolicy{
		AllowMergeWithDeferredChanges: false,
		IgnoreFormatOnlyChangesForGate: false,
	}
}

func mergeGateDetailsFromPolicy(policy MergeGatePolicy) map[string]any {
	return map[string]any{
		"allowMergeWithDeferredChanges": policy.AllowMergeWithDeferredChanges,
		"ignoreFormatOnlyChangesForGate": policy.IgnoreFormatOnlyChangesForGate,
	}
}

func buildChangeStateBlockers(changeStates []map[string]any, policy MergeGatePolicy) []map[string]any {
	if len(changeStates) == 0 {
		return nil
	}
	blockers := make([]map[string]any, 0)
	for _, row := range changeStates {
		changeID, _ := row["id"].(string)
		if strings.TrimSpace(changeID) == "" {
			continue
		}
		reviewState, _ := row["reviewState"].(string)
		changeType, _ := row["type"].(string)
		anchorNodeID := ""
		if anchor, ok := row["anchor"].(map[string]any); ok {
			anchorNodeID, _ = anchor["nodeId"].(string)
		}
		switch reviewState {
		case "accepted":
			continue
		case "deferred":
			if policy.AllowMergeWithDeferredChanges {
				continue
			}
		}
		if changeType == "format_only" && policy.IgnoreFormatOnlyChangesForGate {
			continue
		}
		blockers = append(blockers, map[string]any{
			"id":      "change:" + changeID,
			"type":    "change",
			"label":   "Change " + changeID + " is " + firstNonBlank(reviewState, "pending"),
			"changeId": changeID,
			"state":   firstNonBlank(reviewState, "pending"),
			"link": map[string]any{
				"tab":    "history",
				"changeId": changeID,
				"nodeId": anchorNodeID,
			},
		})
	}
	return blockers
}

func (s *Service) buildMergeGateDetails(ctx context.Context, proposalID string, policy MergeGatePolicy, changeStates []map[string]any) (map[string]any, error) {
	approvals, err := s.store.ListApprovals(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	threads, err := s.store.ListThreads(ctx, proposalID, true)
	if err != nil {
		return nil, err
	}
	pendingApprovals := 0
	openThreads := 0
	blockers := make([]map[string]any, 0)
	for _, approval := range approvals {
		if strings.EqualFold(strings.TrimSpace(approval.Status), "Approved") {
			continue
		}
		pendingApprovals++
		roleKey := strings.TrimSpace(approval.Role)
		blockers = append(blockers, map[string]any{
			"id":      "approval:" + roleKey,
			"type":    "approval",
			"label":   roleLabel(roleKey) + " approval is pending",
			"role":    roleKey,
			"status":  approval.Status,
			"link": map[string]any{
				"tab":  "approvals",
				"role": roleKey,
			},
		})
	}
	if pendingApprovals == 0 {
		count, err := s.store.PendingApprovalCount(ctx, proposalID)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			pendingApprovals = count
			for i := 0; i < count; i++ {
				blockers = append(blockers, map[string]any{
					"id":    fmt.Sprintf("approval:pending:%d", i+1),
					"type":  "approval",
					"label": "Required approval is pending",
					"link": map[string]any{
						"tab": "approvals",
					},
				})
			}
		}
	}
	for _, thread := range threads {
		if strings.EqualFold(strings.TrimSpace(thread.Status), "RESOLVED") {
			continue
		}
		openThreads++
		blockers = append(blockers, map[string]any{
			"id":       "thread:" + thread.ID,
			"type":     "thread",
			"label":    "Thread " + thread.ID + " is still open",
			"threadId": thread.ID,
			"status":   thread.Status,
			"link": map[string]any{
				"tab":      "discussions",
				"threadId": thread.ID,
				"nodeId":   thread.AnchorNodeID,
			},
		})
	}
	if openThreads == 0 {
		count, err := s.store.OpenThreadCount(ctx, proposalID)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			openThreads = count
			for i := 0; i < count; i++ {
				blockers = append(blockers, map[string]any{
					"id":    fmt.Sprintf("thread:open:%d", i+1),
					"type":  "thread",
					"label": "A required thread is still open",
					"link": map[string]any{
						"tab": "discussions",
					},
				})
			}
		}
	}
	blockers = append(blockers, buildChangeStateBlockers(changeStates, policy)...)
	return map[string]any{
		"pendingApprovals": pendingApprovals,
		"openThreads":      openThreads,
		"changeBlockers":   len(blockers) - pendingApprovals - openThreads,
		"blockers":         blockers,
		"policy":           mergeGateDetailsFromPolicy(policy),
	}, nil
}

func roleLabel(role string) string {
	switch strings.TrimSpace(role) {
	case "architectureCommittee":
		return "Architecture Committee"
	case "security":
		return "Security"
	case "legal":
		return "Legal"
	default:
		return strings.TrimSpace(role)
	}
}

func (s *Service) MergeProposal(ctx context.Context, documentID, proposalID, userName string, viewerIsExternal bool, policy MergeGatePolicy, changeStates []map[string]any) (map[string]any, map[string]any, error) {
	proposal, err := s.store.GetProposal(ctx, proposalID)
	if err != nil {
		return nil, nil, err
	}
	if proposal.DocumentID != documentID {
		return nil, nil, sql.ErrNoRows
	}

	details, err := s.buildMergeGateDetails(ctx, proposalID, policy, changeStates)
	if err != nil {
		return nil, nil, err
	}
	pendingApprovals, _ := details["pendingApprovals"].(int)
	openThreads, _ := details["openThreads"].(int)
	changeBlockers, _ := details["changeBlockers"].(int)
	if pendingApprovals > 0 || openThreads > 0 || changeBlockers > 0 {
		return nil, details, nil
	}

	mergeCommit, err := s.git.MergeIntoMain(documentID, proposal.BranchName, userName, "Merge proposal "+proposalID)
	if err != nil {
		return nil, nil, err
	}

	if err := s.store.MarkProposalMerged(ctx, proposalID); err != nil {
		return nil, nil, err
	}

	mainContent, _, err := s.git.GetHeadContent(documentID, "main")
	if err != nil {
		return nil, nil, err
	}
	if err := s.store.UpdateDocumentState(ctx, documentID, mainContent.Title, mainContent.Subtitle, "Approved", userName); err != nil {
		return nil, nil, err
	}

	if err := s.store.InsertDecisionLog(ctx, store.DecisionLogEntry{
		DocumentID: documentID,
		ProposalID: proposalID,
		ThreadID:   "merge",
		Outcome:    "ACCEPTED",
		Rationale:  "Proposal merged after merge gate passed.",
		DecidedBy:  userName,
		CommitHash: mergeCommit.Hash,
	}); err != nil {
		return nil, nil, err
	}

	workspace, err := s.GetWorkspace(ctx, documentID, viewerIsExternal)
	if err != nil {
		return nil, nil, err
	}
	return workspace, details, nil
}

func (s *Service) History(ctx context.Context, documentID, proposalID string) (map[string]any, error) {
	branch := "main"
	actualProposalID := ""
	if proposalID == "main" {
		branch = "main"
		actualProposalID = ""
	} else if proposalID != "" {
		proposal, err := s.store.GetProposal(ctx, proposalID)
		if err != nil {
			return nil, err
		}
		if proposal.DocumentID != documentID {
			return nil, sql.ErrNoRows
		}
		branch = proposal.BranchName
		actualProposalID = proposal.ID
	} else {
		active, err := s.store.GetActiveProposal(ctx, documentID)
		if err != nil {
			return nil, err
		}
		if active != nil {
			branch = active.BranchName
			actualProposalID = active.ID
		}
	}

	commits, err := s.git.History(documentID, branch, 50)
	if err != nil {
		return nil, err
	}
	versions, err := s.store.ListNamedVersions(ctx, actualProposalID)
	if err != nil {
		return nil, err
	}

	commitItems := make([]map[string]any, 0, len(commits))
	for _, item := range commits {
		commitItems = append(commitItems, map[string]any{
			"hash":    item.Hash,
			"message": item.Message,
			"meta":    fmt.Sprintf("%s · %s · +%d -%d lines", item.Author, relative(item.CreatedAt), item.Added, item.Removed),
			"branch":  branch,
		})
	}

	versionItems := make([]map[string]any, 0, len(versions))
	for _, version := range versions {
		versionItems = append(versionItems, map[string]any{
			"name":      version.Name,
			"hash":      version.Hash,
			"createdBy": version.CreatedBy,
			"createdAt": version.CreatedAt.Format(time.RFC3339),
		})
	}

	return map[string]any{
		"documentId":    documentID,
		"proposalId":    nilIfEmpty(actualProposalID),
		"branch":        branch,
		"commits":       commitItems,
		"namedVersions": versionItems,
	}, nil
}

func (s *Service) Compare(ctx context.Context, documentID, fromHash, toHash string) (map[string]any, error) {
	from, err := s.git.GetContentByHash(documentID, fromHash)
	if err != nil {
		return nil, err
	}
	to, err := s.git.GetContentByHash(documentID, toHash)
	if err != nil {
		return nil, err
	}
	fromContent := map[string]any{
		"title":    from.Title,
		"subtitle": from.Subtitle,
		"purpose":  from.Purpose,
		"tiers":    from.Tiers,
		"enforce":  from.Enforce,
	}
	if len(from.Doc) > 0 {
		var parsed any
		if err := json.Unmarshal(from.Doc, &parsed); err == nil {
			fromContent["doc"] = parsed
		}
	}
	toContent := map[string]any{
		"title":    to.Title,
		"subtitle": to.Subtitle,
		"purpose":  to.Purpose,
		"tiers":    to.Tiers,
		"enforce":  to.Enforce,
	}
	if len(to.Doc) > 0 {
		var parsed any
		if err := json.Unmarshal(to.Doc, &parsed); err == nil {
			toContent["doc"] = parsed
		}
	}
	changedFields := gitrepo.DiffFields(from, to)
	commitInfo, err := s.git.GetCommitByHash(documentID, toHash)
	if err != nil {
		return nil, err
	}
	changes := buildDeterministicCompareChanges(fromHash, toHash, from, to, commitInfo)
	return map[string]any{
		"from":          fromHash,
		"to":            toHash,
		"changedFields": changedFields,
		"changes":       changes,
		"fromContent":   fromContent,
		"toContent":     toContent,
	}, nil
}

type compareDocNode struct {
	Key       string
	NodeID    string
	NodeType  string
	Text      string
	Index     int
	BeforeCtx string
	AfterCtx  string
}

func buildDeterministicCompareChanges(fromHash, toHash string, from, to gitrepo.Content, commitInfo store.CommitInfo) []map[string]any {
	fromNodes := parseCompareDocNodes(from.Doc)
	toNodes := parseCompareDocNodes(to.Doc)

	fromByKey := make(map[string]compareDocNode, len(fromNodes))
	for _, node := range fromNodes {
		fromByKey[node.Key] = node
	}
	toByKey := make(map[string]compareDocNode, len(toNodes))
	for _, node := range toNodes {
		toByKey[node.Key] = node
	}

	changeItems := make([]map[string]any, 0, max(len(fromNodes), len(toNodes)))
	authorName := firstNonBlank(commitInfo.Author, "Unknown")
	authorID := "usr_" + shortHash(strings.ToLower(strings.TrimSpace(authorName)))
	editedAt := ""
	if !commitInfo.CreatedAt.IsZero() {
		editedAt = commitInfo.CreatedAt.UTC().Format(time.RFC3339)
	}

	for key, fromNode := range fromByKey {
		toNode, exists := toByKey[key]
		if !exists {
			changeItems = append(changeItems, makeCompareChange(
				fromHash,
				toHash,
				"deleted",
				fromNode,
				compareDocNode{},
				authorID,
				authorName,
				editedAt,
			))
			continue
		}
		if fromNode.Text == toNode.Text && fromNode.NodeType == toNode.NodeType && fromNode.Index != toNode.Index {
			changeItems = append(changeItems, makeCompareChange(
				fromHash,
				toHash,
				"moved",
				fromNode,
				toNode,
				authorID,
				authorName,
				editedAt,
			))
			continue
		}
		if fromNode.Text != toNode.Text || fromNode.NodeType != toNode.NodeType {
			changeItems = append(changeItems, makeCompareChange(
				fromHash,
				toHash,
				"modified",
				fromNode,
				toNode,
				authorID,
				authorName,
				editedAt,
			))
		}
	}

	for key, toNode := range toByKey {
		if _, exists := fromByKey[key]; exists {
			continue
		}
		changeItems = append(changeItems, makeCompareChange(
			fromHash,
			toHash,
			"inserted",
			compareDocNode{},
			toNode,
			authorID,
			authorName,
			editedAt,
		))
	}

	sort.Slice(changeItems, func(i, j int) bool {
		leftAnchor, _ := changeItems[i]["anchor"].(map[string]any)
		rightAnchor, _ := changeItems[j]["anchor"].(map[string]any)
		leftNodeID, _ := leftAnchor["nodeId"].(string)
		rightNodeID, _ := rightAnchor["nodeId"].(string)
		if leftNodeID != rightNodeID {
			return leftNodeID < rightNodeID
		}
		leftType, _ := changeItems[i]["type"].(string)
		rightType, _ := changeItems[j]["type"].(string)
		if leftType != rightType {
			return compareTypeRank(leftType) < compareTypeRank(rightType)
		}
		leftSnippet, _ := changeItems[i]["snippet"].(string)
		rightSnippet, _ := changeItems[j]["snippet"].(string)
		return leftSnippet < rightSnippet
	})

	return changeItems
}

func makeCompareChange(
	fromHash string,
	toHash string,
	changeType string,
	fromNode compareDocNode,
	toNode compareDocNode,
	authorID string,
	authorName string,
	editedAt string,
) map[string]any {
	anchorNodeID := firstNonBlank(toNode.NodeID, fromNode.NodeID, toNode.Key, fromNode.Key, "unknown")
	snippet := compareSnippet(changeType, fromNode, toNode)
	fromOffset := 0
	toOffset := len([]rune(snippet))
	idSeed := fmt.Sprintf("%s|%s|%s|%s|%d|%d|%s", fromHash, toHash, changeType, anchorNodeID, fromOffset, toOffset, snippet)
	return map[string]any{
		"id":      "chg_" + shortHash(idSeed),
		"type":    changeType,
		"fromRef": fromHash,
		"toRef":   toHash,
		"anchor": map[string]any{
			"nodeId":     anchorNodeID,
			"fromOffset": fromOffset,
			"toOffset":   toOffset,
		},
		"context": map[string]any{
			"before": compareContextBefore(changeType, fromNode, toNode),
			"after":  compareContextAfter(changeType, fromNode, toNode),
		},
		"snippet": snippet,
		"author": map[string]any{
			"id":   authorID,
			"name": authorName,
		},
		"editedAt":    editedAt,
		"reviewState": "pending",
		"threadIds":   []string{},
		"blockers":    []string{},
	}
}

func compareTypeRank(changeType string) int {
	switch changeType {
	case "moved":
		return 0
	case "modified":
		return 1
	case "inserted":
		return 2
	case "deleted":
		return 3
	case "format_only":
		return 4
	default:
		return 5
	}
}

func compareContextBefore(changeType string, fromNode, toNode compareDocNode) string {
	switch changeType {
	case "inserted":
		return toNode.BeforeCtx
	case "deleted":
		return fromNode.BeforeCtx
	default:
		return firstNonBlank(toNode.BeforeCtx, fromNode.BeforeCtx)
	}
}

func compareContextAfter(changeType string, fromNode, toNode compareDocNode) string {
	switch changeType {
	case "inserted":
		return toNode.AfterCtx
	case "deleted":
		return fromNode.AfterCtx
	default:
		return firstNonBlank(toNode.AfterCtx, fromNode.AfterCtx)
	}
}

func compareSnippet(changeType string, fromNode, toNode compareDocNode) string {
	switch changeType {
	case "deleted":
		return truncateForSnippet(firstNonBlank(fromNode.Text, fromNode.NodeType, fromNode.Key))
	case "inserted", "moved", "modified":
		return truncateForSnippet(firstNonBlank(toNode.Text, fromNode.Text, toNode.NodeType, toNode.Key))
	default:
		return truncateForSnippet(firstNonBlank(toNode.Text, fromNode.Text, toNode.Key, fromNode.Key, "change"))
	}
}

func truncateForSnippet(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) <= 120 {
		return trimmed
	}
	return string(runes[:120]) + "..."
}

func parseCompareDocNodes(raw json.RawMessage) []compareDocNode {
	if len(raw) == 0 {
		return nil
	}

	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	contentRaw, _ := doc["content"].([]any)
	if len(contentRaw) == 0 {
		return nil
	}

	nodes := make([]compareDocNode, 0, len(contentRaw))
	for idx, item := range contentRaw {
		nodeMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		nodeType, _ := nodeMap["type"].(string)
		attrs, _ := nodeMap["attrs"].(map[string]any)
		nodeID, _ := attrs["nodeId"].(string)
		text := extractCompareNodeText(nodeMap)
		key := nodeID
		if key == "" {
			key = fmt.Sprintf("%s@%d", firstNonBlank(nodeType, "node"), idx)
		}
		nodes = append(nodes, compareDocNode{
			Key:      key,
			NodeID:   nodeID,
			NodeType: nodeType,
			Text:     text,
			Index:    idx,
		})
	}

	for idx := range nodes {
		if idx > 0 {
			nodes[idx].BeforeCtx = nodes[idx-1].Text
		}
		if idx+1 < len(nodes) {
			nodes[idx].AfterCtx = nodes[idx+1].Text
		}
	}

	return nodes
}

func extractCompareNodeText(node map[string]any) string {
	text, _ := node["text"].(string)
	parts := make([]string, 0, 4)
	if strings.TrimSpace(text) != "" {
		parts = append(parts, strings.TrimSpace(text))
	}
	content, _ := node["content"].([]any)
	for _, item := range content {
		child, ok := item.(map[string]any)
		if !ok {
			continue
		}
		childText := strings.TrimSpace(extractCompareNodeText(child))
		if childText != "" {
			parts = append(parts, childText)
		}
	}
	return strings.TrimSpace(strings.Join(parts, " "))
}

func shortHash(input string) string {
	sum := sha1.Sum([]byte(input))
	return hex.EncodeToString(sum[:])[:12]
}

func (s *Service) Approvals(ctx context.Context) (map[string]any, error) {
	primaryDocID := "adr-142"
	proposal, err := s.store.GetActiveProposal(ctx, primaryDocID)
	if err != nil {
		return nil, err
	}

	mergeGate := map[string]string{
		"security":              "Approved",
		"architectureCommittee": "Approved",
		"legal":                 "Approved",
	}
	if proposal != nil {
		approvals, err := s.store.ListApprovals(ctx, proposal.ID)
		if err != nil {
			return nil, err
		}
		for _, approval := range approvals {
			mergeGate[approval.Role] = approval.Status
		}
	}

	queue, err := s.store.ProposalQueue(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"mergeGate": mergeGate,
		"queue":     queue,
	}, nil
}

func (s *Service) GetWorkspace(ctx context.Context, documentID string, viewerIsExternal bool) (map[string]any, error) {
	document, err := s.store.GetDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	proposal, err := s.store.GetActiveProposal(ctx, documentID)
	if err != nil {
		return nil, err
	}

	branch := "main"
	proposalID := ""
	approvalsMap := map[string]string{
		"security":              "Approved",
		"architectureCommittee": "Approved",
		"legal":                 "Approved",
	}
	threads := make([]map[string]any, 0)
	decisions := make([]map[string]any, 0)
	pendingApprovals := 0
	openThreads := 0

	if proposal != nil {
		branch = proposal.BranchName
		proposalID = proposal.ID

		approvals, err := s.store.ListApprovals(ctx, proposal.ID)
		if err != nil {
			return nil, err
		}
		for _, approval := range approvals {
			approvalsMap[approval.Role] = approval.Status
		}

		threadRows, err := s.store.ListThreads(ctx, proposal.ID, !viewerIsExternal)
		if err != nil {
			return nil, err
		}
		voteTotals, err := s.store.ListThreadVoteTotals(ctx, proposal.ID, !viewerIsExternal)
		if err != nil {
			return nil, err
		}
		reactionCounts, err := s.store.ListThreadReactionCounts(ctx, proposal.ID, !viewerIsExternal)
		if err != nil {
			return nil, err
		}
		reactionsByThread := make(map[string][]map[string]any)
		for _, rc := range reactionCounts {
			reactionsByThread[rc.ThreadID] = append(reactionsByThread[rc.ThreadID], map[string]any{
				"emoji": rc.Emoji,
				"count": rc.Count,
			})
		}
		annotationRows, err := s.store.ListAnnotations(ctx, proposal.ID, !viewerIsExternal)
		if err != nil {
			return nil, err
		}
		repliesByThread := make(map[string][]map[string]any)
		for _, annotation := range annotationRows {
			repliesByThread[annotation.ThreadID] = append(repliesByThread[annotation.ThreadID], map[string]any{
				"initials": initials(annotation.Author),
				"author":   annotation.Author,
				"time":     relative(annotation.CreatedAt),
				"text":     annotation.Body,
				"tone":     toneFromName(annotation.Author),
			})
		}
		for _, thread := range threadRows {
			if thread.Status != "RESOLVED" {
				openThreads++
			}
			anchorOffsets := map[string]any{}
			if err := json.Unmarshal([]byte(thread.AnchorOffsets), &anchorOffsets); err != nil {
				anchorOffsets = map[string]any{}
			}
			quote, _ := anchorOffsets["quote"].(string)
			replies := repliesByThread[thread.ID]
			if replies == nil {
				replies = []map[string]any{}
			}
			reactions := reactionsByThread[thread.ID]
			if reactions == nil {
				reactions = []map[string]any{}
			}
			threads = append(threads, map[string]any{
				"id":            thread.ID,
				"initials":      initials(thread.Author),
				"author":        thread.Author,
				"time":          relative(thread.CreatedAt),
				"anchor":        thread.Anchor,
				"anchorNodeId":  thread.AnchorNodeID,
				"anchorOffsets": anchorOffsets,
				"text":          thread.Text,
				"quote":         nilIfEmpty(strings.TrimSpace(quote)),
				"votes":         voteTotals[thread.ID],
				"voted":         false,
				"reactions":     reactions,
				"tone":          toneFromName(thread.Author),
				"status":        thread.Status,
				"type":          thread.Type,
				"visibility":    thread.Visibility,
				"resolvedOutcome": nilIfEmpty(thread.ResolvedOutcome),
				"resolvedNote":  nilIfEmpty(thread.ResolvedNote),
				"replies":       replies,
			})
		}

		decisionRows, err := s.store.ListDecisionLog(ctx, documentID, proposal.ID, 50)
		if err != nil {
			return nil, err
		}
		for _, row := range decisionRows {
			outcomeLabel := strings.Title(strings.ToLower(row.Outcome))
			outcomeTone := "approved"
			switch row.Outcome {
			case "REJECTED":
				outcomeTone = "rejected"
			case "DEFERRED":
				outcomeTone = "deferred"
			}
			tags := []map[string]string{{"label": outcomeLabel, "tone": outcomeTone}}
			if strings.Contains(strings.ToLower(row.Rationale), "security") {
				tags = append(tags, map[string]string{"label": "Security", "tone": "blue"})
			}
			decisions = append(decisions, map[string]any{
				"date": row.DecidedAt.Format("2006-01-02") + " · " + row.CommitHash,
				"tags": tags,
				"text": row.Rationale,
				"by":   row.DecidedBy,
			})
		}

		pendingApprovals, err = s.store.PendingApprovalCount(ctx, proposal.ID)
		if err != nil {
			return nil, err
		}
	}

	content, headCommit, err := s.git.GetHeadContent(documentID, branch)
	if err != nil {
		return nil, err
	}
	commits, err := s.git.History(documentID, branch, 25)
	if err != nil {
		return nil, err
	}

	history := make([]map[string]string, 0, len(commits))
	for _, commit := range commits {
		history = append(history, map[string]string{
			"hash":    commit.Hash,
			"message": commit.Message,
			"meta":    fmt.Sprintf("%s · %s · +%d -%d lines", commit.Author, relative(commit.CreatedAt), commit.Added, commit.Removed),
		})
	}

	allDocuments, openReviews, merged, err := s.store.SummaryCounts(ctx)
	if err != nil {
		return nil, err
	}

	// Resolve space and workspace names for breadcrumb
	var spaceName, workspaceName string
	if document.SpaceID != "" {
		space, err := s.store.GetSpace(ctx, document.SpaceID)
		if err == nil {
			spaceName = space.Name
		}
	}
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err == nil {
		workspaceName = ws.Name
	}

	result := map[string]any{
		"document": map[string]any{
			"id":         document.ID,
			"title":      content.Title,
			"subtitle":   content.Subtitle,
			"status":     document.Status,
			"version":    fmt.Sprintf("v%d.0.%d-%s", len(commits), max(0, len(commits)-1), branch),
			"editedBy":   headCommit.Author,
			"editedAt":   relative(headCommit.CreatedAt),
			"branch":     branch + " -> main",
			"proposalId": nilIfEmpty(proposalID),
		},
		"content": map[string]string{
			"title":    content.Title,
			"subtitle": content.Subtitle,
			"purpose":  content.Purpose,
			"tiers":    content.Tiers,
			"enforce":  content.Enforce,
		},
		"doc": content.Doc,
		"nodeIds": map[string]string{
			"title":    "n-" + document.ID + "-title",
			"subtitle": "n-" + document.ID + "-subtitle",
			"purpose":  "n-" + document.ID + "-purpose",
			"tiers":    "n-" + document.ID + "-tiers",
			"enforce":  "n-" + document.ID + "-enforce",
		},
		"counts": map[string]int{
			"allDocuments": allDocuments,
			"openReviews":  openReviews,
			"merged":       merged,
		},
		"approvals": approvalsMap,
		"threads":   threads,
		"history":   history,
		"decisions": decisions,
		"mergeGate": map[string]any{
			"pendingApprovals": pendingApprovals,
			"openThreads":      openThreads,
			"mergeReady":       pendingApprovals == 0 && openThreads == 0,
		},
		"workspaceName": workspaceName,
	}
	if spaceName != "" {
		result["space"] = map[string]any{
			"id":   document.SpaceID,
			"name": spaceName,
		}
	}
	return result, nil
}

func (s *Service) GetOrgWorkspace(ctx context.Context) (map[string]any, error) {
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, err
	}
	spaces, err := s.store.ListSpaces(ctx, ws.ID)
	if err != nil {
		return nil, err
	}
	spaceList := make([]map[string]any, 0, len(spaces))
	for _, sp := range spaces {
		docCount, err := s.store.SpaceDocumentCount(ctx, sp.ID)
		if err != nil {
			return nil, err
		}
		spaceList = append(spaceList, map[string]any{
			"id":            sp.ID,
			"workspaceId":   sp.WorkspaceID,
			"name":          sp.Name,
			"slug":          sp.Slug,
			"description":   sp.Description,
			"documentCount": docCount,
		})
	}
	return map[string]any{
		"workspace": map[string]any{
			"id":   ws.ID,
			"name": ws.Name,
			"slug": ws.Slug,
		},
		"spaces": spaceList,
	}, nil
}

func (s *Service) GetSpace(ctx context.Context, spaceID string) (map[string]any, error) {
	space, err := s.store.GetSpace(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	docCount, err := s.store.SpaceDocumentCount(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":            space.ID,
		"workspaceId":   space.WorkspaceID,
		"name":          space.Name,
		"slug":          space.Slug,
		"description":   space.Description,
		"documentCount": docCount,
	}, nil
}

func (s *Service) CreateSpace(ctx context.Context, name, description string) (map[string]any, error) {
	spaceName := strings.TrimSpace(name)
	if spaceName == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "name is required", nil)
	}
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, err
	}
	slug := strings.ToLower(strings.ReplaceAll(spaceName, " ", "-"))
	space := store.Space{
		ID:          util.NewID("sp"),
		WorkspaceID: ws.ID,
		Name:        spaceName,
		Slug:        slug,
		Description: strings.TrimSpace(description),
	}
	if err := s.store.InsertSpace(ctx, space); err != nil {
		return nil, err
	}
	return s.GetOrgWorkspace(ctx)
}

func (s *Service) UpdateSpace(ctx context.Context, spaceID, name, description string) (map[string]any, error) {
	spaceName := strings.TrimSpace(name)
	if spaceName == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "name is required", nil)
	}
	if err := s.store.UpdateSpace(ctx, spaceID, spaceName, strings.TrimSpace(description)); err != nil {
		return nil, err
	}
	space, err := s.store.GetSpace(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	docCount, err := s.store.SpaceDocumentCount(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":            space.ID,
		"workspaceId":   space.WorkspaceID,
		"name":          space.Name,
		"slug":          space.Slug,
		"description":   space.Description,
		"documentCount": docCount,
	}, nil
}

func (s *Service) DeleteSpace(ctx context.Context, spaceID string) error {
	return s.store.DeleteSpace(ctx, spaceID)
}

func (s *Service) ListDocumentsBySpace(ctx context.Context, spaceID string) ([]map[string]any, error) {
	documents, err := s.store.ListDocumentsBySpace(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(documents))
	for _, doc := range documents {
		openThreads := 0
		proposal, err := s.store.GetActiveProposal(ctx, doc.ID)
		if err != nil {
			return nil, err
		}
		if proposal != nil {
			openThreads, err = s.store.OpenThreadCount(ctx, proposal.ID)
			if err != nil {
				return nil, err
			}
		}
		items = append(items, map[string]any{
			"id":          doc.ID,
			"title":       doc.Title,
			"status":      doc.Status,
			"updatedBy":   doc.UpdatedBy,
			"openThreads": openThreads,
			"spaceId":     doc.SpaceID,
		})
	}
	return items, nil
}

func (s *Service) MoveDocument(ctx context.Context, documentID, newSpaceID string) (map[string]any, error) {
	if strings.TrimSpace(newSpaceID) == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "spaceId is required", nil)
	}
	// Verify space exists
	if _, err := s.store.GetSpace(ctx, newSpaceID); err != nil {
		return nil, domainError(http.StatusNotFound, "NOT_FOUND", "space not found", nil)
	}
	if err := s.store.MoveDocument(ctx, documentID, newSpaceID); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "documentId": documentID, "spaceId": newSpaceID}, nil
}

func (s *Service) SyncToken() string {
	return s.cfg.SyncToken
}

// Ping checks the health of service dependencies (database, etc.)
func (s *Service) Ping(ctx context.Context) error {
	return s.store.Ping(ctx)
}

func (s *Service) HandleSyncSessionEnded(
	ctx context.Context,
	sessionID string,
	documentID string,
	proposalID string,
	actor string,
	updateCount int,
	snapshot *WorkspaceContent,
) (map[string]any, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, domainError(http.StatusUnprocessableEntity, "VALIDATION_ERROR", "sessionId is required", nil)
	}
	if cached, ok := s.lookupSyncSession(sessionID); ok {
		return clonePayload(cached), nil
	}

	userName := firstNonBlank(actor, "Sync Gateway")
	if snapshot == nil {
		payload := map[string]any{
			"ok":          true,
			"sessionId":   sessionID,
			"documentId":  documentID,
			"proposalId":  nilIfEmpty(proposalID),
			"flushCommit": nil,
			"updateCount": updateCount,
		}
		s.storeSyncSession(sessionID, payload)
		return clonePayload(payload), nil
	}

	var proposal *store.Proposal
	if proposalID != "" {
		item, err := s.store.GetProposal(ctx, proposalID)
		if err != nil {
			return nil, err
		}
		if item.DocumentID != documentID {
			return nil, sql.ErrNoRows
		}
		proposal = &item
	} else {
		var err error
		proposal, err = s.EnsureWorkflowProposal(ctx, documentID, userName)
		if err != nil {
			return nil, err
		}
	}

	current, _, err := s.git.GetHeadContent(documentID, proposal.BranchName)
	if err != nil {
		return nil, err
	}
	next := gitrepo.Content{
		Title:    firstNonBlank(snapshot.Title, current.Title),
		Subtitle: firstNonBlank(snapshot.Subtitle, current.Subtitle),
		Purpose:  firstNonBlank(snapshot.Purpose, current.Purpose),
		Tiers:    firstNonBlank(snapshot.Tiers, current.Tiers),
		Enforce:  firstNonBlank(snapshot.Enforce, current.Enforce),
		Doc:      current.Doc,
	}
	if normalizedDoc := normalizeDocJSON(snapshot.Doc); len(normalizedDoc) > 0 {
		next.Doc = normalizedDoc
		derived := deriveLegacyFromDoc(next.Doc, next)
		next.Title = firstNonBlank(derived.Title, next.Title)
		next.Subtitle = firstNonBlank(derived.Subtitle, next.Subtitle)
		next.Purpose = firstNonBlank(derived.Purpose, next.Purpose)
		next.Tiers = firstNonBlank(derived.Tiers, next.Tiers)
		next.Enforce = firstNonBlank(derived.Enforce, next.Enforce)
	}
	diff := gitrepo.DiffFields(current, next)
	if len(diff) == 0 {
		payload := map[string]any{
			"ok":          true,
			"sessionId":   sessionID,
			"documentId":  documentID,
			"proposalId":  proposal.ID,
			"flushCommit": nil,
			"updateCount": updateCount,
		}
		s.storeSyncSession(sessionID, payload)
		return clonePayload(payload), nil
	}

	commit, err := s.git.CommitContent(documentID, proposal.BranchName, next, userName, fmt.Sprintf("Sync session flush (%d updates)", max(updateCount, 1)))
	if err != nil {
		return nil, err
	}
	if err := s.store.UpdateDocumentState(ctx, documentID, next.Title, next.Subtitle, "In review", userName); err != nil {
		return nil, err
	}
	payload := map[string]any{
		"ok":          true,
		"sessionId":   sessionID,
		"documentId":  documentID,
		"proposalId":  proposal.ID,
		"flushCommit": commit.Hash,
		"updateCount": updateCount,
	}
	s.storeSyncSession(sessionID, payload)
	return clonePayload(payload), nil
}

var approvalDependencies = map[string][]string{
	"security":              []string{},
	"architectureCommittee": []string{},
	"legal":                 []string{"security", "architectureCommittee"},
}

func blockedApprovalRoles(statusByRole map[string]string, role string) []string {
	deps := approvalDependencies[role]
	blockers := make([]string, 0, len(deps))
	for _, dep := range deps {
		if statusByRole[dep] != "Approved" {
			blockers = append(blockers, dep)
		}
	}
	return blockers
}

func clonePayload(input map[string]any) map[string]any {
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func (s *Service) lookupSyncSession(sessionID string) (map[string]any, bool) {
	now := time.Now()
	s.syncMu.Lock()
	defer s.syncMu.Unlock()
	for key, record := range s.syncSessions {
		if now.After(record.expiresAt) {
			delete(s.syncSessions, key)
		}
	}
	record, ok := s.syncSessions[sessionID]
	if !ok {
		return nil, false
	}
	return record.payload, true
}

func (s *Service) storeSyncSession(sessionID string, payload map[string]any) {
	s.syncMu.Lock()
	defer s.syncMu.Unlock()
	s.syncSessions[sessionID] = syncSessionRecord{
		expiresAt: time.Now().Add(s.syncSessionTTL),
		payload:   clonePayload(payload),
	}
}

func normalizeThreadType(value string) string {
	normalized := strings.ToUpper(strings.TrimSpace(value))
	if normalized == "" {
		return "GENERAL"
	}
	return normalized
}

func normalizeThreadOutcome(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func normalizeThreadVisibility(value string) string {
	normalized := strings.ToUpper(strings.TrimSpace(value))
	if normalized == "" {
		return "INTERNAL"
	}
	return normalized
}

func normalizeDocJSON(doc json.RawMessage) json.RawMessage {
	if len(doc) == 0 {
		return nil
	}
	var decoded any
	if err := json.Unmarshal(doc, &decoded); err != nil {
		return nil
	}
	normalized, err := json.Marshal(decoded)
	if err != nil {
		return nil
	}
	return json.RawMessage(normalized)
}

func normalizeAnchorOffsetsJSON(offsets json.RawMessage) json.RawMessage {
	if len(offsets) == 0 {
		return nil
	}
	var decoded map[string]any
	if err := json.Unmarshal(offsets, &decoded); err != nil {
		return nil
	}
	normalized, err := json.Marshal(decoded)
	if err != nil {
		return nil
	}
	return json.RawMessage(normalized)
}

func deriveLegacyFromDoc(doc json.RawMessage, fallback gitrepo.Content) gitrepo.Content {
	if len(doc) == 0 {
		return fallback
	}
	var parsed struct {
		Type    string `json:"type"`
		Content []struct {
			Type    string          `json:"type"`
			Content json.RawMessage `json:"content"`
			Attrs   struct {
				Level int `json:"level"`
			} `json:"attrs"`
		} `json:"content"`
	}
	if err := json.Unmarshal(doc, &parsed); err != nil || parsed.Type != "doc" {
		return fallback
	}
	result := fallback
	seenTitle := false
	for i := 0; i < len(parsed.Content); i++ {
		node := parsed.Content[i]
		text := extractNodeText(node.Content)
		if node.Type == "heading" && node.Attrs.Level == 1 && strings.TrimSpace(text) != "" {
			result.Title = strings.TrimSpace(text)
			seenTitle = true
			continue
		}
		if node.Type == "paragraph" && seenTitle && strings.TrimSpace(text) != "" && result.Subtitle == fallback.Subtitle {
			result.Subtitle = strings.TrimSpace(text)
			continue
		}
		if node.Type != "heading" || i+1 >= len(parsed.Content) {
			continue
		}
		next := parsed.Content[i+1]
		if next.Type != "paragraph" {
			continue
		}
		nextText := strings.TrimSpace(extractNodeText(next.Content))
		if nextText == "" {
			continue
		}
		heading := strings.ToLower(strings.TrimSpace(text))
		switch {
		case strings.Contains(heading, "purpose"):
			result.Purpose = nextText
			i++
		case strings.Contains(heading, "tier"):
			result.Tiers = nextText
			i++
		case strings.Contains(heading, "enforce"):
			result.Enforce = nextText
			i++
		}
	}
	return result
}

func extractNodeText(content json.RawMessage) string {
	var nodes []map[string]any
	if err := json.Unmarshal(content, &nodes); err != nil {
		return ""
	}
	var walk func(map[string]any) string
	walk = func(node map[string]any) string {
		textValue, _ := node["text"].(string)
		rawChildren, hasChildren := node["content"]
		if !hasChildren {
			return textValue
		}
		children, ok := rawChildren.([]any)
		if !ok {
			return textValue
		}
		var builder strings.Builder
		if textValue != "" {
			builder.WriteString(textValue)
		}
		for _, child := range children {
			childMap, ok := child.(map[string]any)
			if !ok {
				continue
			}
			builder.WriteString(walk(childMap))
		}
		return builder.String()
	}

	var builder strings.Builder
	for _, node := range nodes {
		builder.WriteString(walk(node))
	}
	return builder.String()
}

func nilIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func relative(value time.Time) string {
	minutes := int(time.Since(value).Minutes())
	if minutes < 1 {
		minutes = 1
	}
	if minutes < 60 {
		return fmt.Sprintf("%dm ago", minutes)
	}
	hours := minutes / 60
	if hours < 24 {
		return fmt.Sprintf("%dh ago", hours)
	}
	days := hours / 24
	return fmt.Sprintf("%dd ago", days)
}

func initials(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "NA"
	}
	if len(parts) == 1 {
		r := []rune(parts[0])
		if len(r) == 1 {
			return strings.ToUpper(string(r[0]))
		}
		return strings.ToUpper(string(r[0]) + string(r[1]))
	}
	return strings.ToUpper(string([]rune(parts[0])[0]) + string([]rune(parts[len(parts)-1])[0]))
}

func toneFromName(name string) string {
	switch {
	case strings.Contains(name, "Sarah"):
		return "green"
	case strings.Contains(name, "Marcus"):
		return "red"
	case strings.Contains(name, "Jamie"):
		return "blue"
	case strings.Contains(name, "Priya"):
		return "purple"
	default:
		return "amber"
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func SortedKeys(input map[string]string) []string {
	keys := make([]string, 0, len(input))
	for key := range input {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
