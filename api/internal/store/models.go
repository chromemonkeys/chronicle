package store

import "time"

type User struct {
	ID          string
	DisplayName string
	Role        string
	IsExternal  bool
}

type Workspace struct {
	ID        string
	Name      string
	Slug      string
	Settings  string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Space struct {
	ID          string
	WorkspaceID string
	Name        string
	Slug        string
	Description string
	SortOrder   int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Document struct {
	ID        string
	Title     string
	Subtitle  string
	Status    string
	SpaceID   string
	UpdatedBy string
	UpdatedAt time.Time
}

type Proposal struct {
	ID           string
	DocumentID   string
	Title        string
	Status       string
	BranchName   string
	TargetBranch string
	CreatedBy    string
	CreatedAt    time.Time
}

type Thread struct {
	ID              string
	ProposalID      string
	Anchor          string
	AnchorNodeID    string
	AnchorOffsets   string
	Text            string
	Status          string
	Visibility      string
	Type            string
	ResolvedOutcome string
	ResolvedNote    string
	OrphanedReason  string
	Author          string
	CreatedAt       time.Time
}

type Annotation struct {
	ID         string
	ProposalID string
	ThreadID   string
	Author     string
	Body       string
	Type       string
	CreatedAt  time.Time
}

type ThreadReactionCount struct {
	ThreadID string
	Emoji    string
	Count    int
}

type Approval struct {
	Role       string
	Status     string
	ApprovedBy string
	ApprovedAt *time.Time
}

type DecisionLogEntry struct {
	ID           int64
	DocumentID   string
	ProposalID   string
	ThreadID     string
	Outcome      string
	Rationale    string
	DecidedBy    string
	DecidedAt    time.Time
	CommitHash   string
	Participants []string
}

type NamedVersion struct {
	Name      string
	Hash      string
	CreatedBy string
	CreatedAt time.Time
}

type CommitInfo struct {
	Hash      string
	Message   string
	Author    string
	CreatedAt time.Time
	Added     int
	Removed   int
}

type ChangeReviewState struct {
	ID               int64
	ChangeID         string
	ProposalID       string
	DocumentID       string
	FromRef          string
	ToRef            string
	ReviewState      string
	RejectedRationale string
	ReviewedBy       string
	ReviewedAt       *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type AuditEvent struct {
	ID         int64
	EventType  string
	ActorName  string
	DocumentID string
	ProposalID string
	ChangeID   *string
	ThreadID   *string
	Payload    map[string]any
	CreatedAt  time.Time
}
