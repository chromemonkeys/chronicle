package store

import "time"

type User struct {
	ID                    string
	DisplayName           string
	Email                 string
	PasswordHash          string
	Role                  string
	IsExternal            bool
	IsEmailVerified       bool
	VerificationToken     string
	VerificationExpiresAt *time.Time
	DeactivatedAt         *time.Time
	CreatedAt             time.Time
	UpdatedAt             time.Time
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
	Visibility  string
	SortOrder   int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Document struct {
	ID         string
	Title      string
	Subtitle   string
	Status     string
	SpaceID    string
	ShareMode  string
	ParentID   *string
	SortOrder  int
	Path       string
	UpdatedBy  string
	UpdatedAt  time.Time
}

// DocumentTreeNode represents a document in the tree hierarchy
type DocumentTreeNode struct {
	Document
	Children []DocumentTreeNode
	Depth    int
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

type PermissionDenial struct {
	ID           int64
	ActorID      string
	ActorName    string
	Action       string
	ResourceType string
	ResourceID   string
	Role         string
	Path         string
	Method       string
	CreatedAt    time.Time
}

type DocumentPermission struct {
	ID         string
	DocumentID string
	UserID     string
	Role       string
	GrantedBy  string
	GrantedAt  time.Time
	ExpiresAt  *time.Time
	// Joined fields for API responses
	UserEmail  string
	UserName   string
}

// =============================================================================
// NEW: Sprint 3 RBAC Models
// =============================================================================

// Group represents a user group for permission management
type Group struct {
	ID             string
	WorkspaceID    string
	Name           string
	Description    string
	SCIMExternalID *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// GroupMembership links users to groups
type GroupMembership struct {
	ID        string
	GroupID   string
	UserID    string
	CreatedAt time.Time
}

// Permission is a unified permission grant (replaces DocumentPermission)
// Supports both user and group subjects, and both space and document resources
type Permission struct {
	ID           string
	WorkspaceID  string
	SubjectType  string // 'user' or 'group'
	SubjectID    string
	ResourceType string // 'space' or 'document'
	ResourceID   string
	Role         string // 'viewer', 'commenter', 'suggester', 'editor', 'admin'
	GrantedBy    *string
	GrantedAt    time.Time
	ExpiresAt    *time.Time
	DeletedAt    *time.Time
}

// PermissionWithDetails includes joined user/group info for API responses
type PermissionWithDetails struct {
	Permission
	// For user subjects
	UserEmail  *string
	UserName   *string
	// For group subjects
	GroupName  *string
	MemberCount *int
}

// PublicLink represents a shareable link for anonymous document access
type PublicLink struct {
	ID             string
	Token          string
	DocumentID     string
	CreatedBy      string
	Role           string // 'viewer' or 'commenter'
	PasswordHash   *string
	ExpiresAt      *time.Time
	AccessCount    int
	LastAccessedAt *time.Time
	CreatedAt      time.Time
	RevokedAt      *time.Time
}

// EffectivePermission represents a row from the materialized view
type EffectivePermission struct {
	UserID       string
	ResourceType string
	ResourceID   string
	WorkspaceID  string
	Role         string
	ComputedAt   time.Time
}

// =============================================================================
// Approval Workflow V2 Models
// =============================================================================

// ApprovalGroup represents a custom approval group defined per document
type ApprovalGroup struct {
	ID           string
	DocumentID   string
	Name         string
	Description  string
	MinApprovals int
	SortOrder    int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// ApprovalGroupMember represents a user assigned to an approval group
type ApprovalGroupMember struct {
	ID          string
	GroupID     string
	UserID      string
	DisplayName string
	Email       string
	CreatedAt   time.Time
}

// ProposalApproval represents an individual approval/rejection action
type ProposalApproval struct {
	ID             string
	ProposalID     string
	GroupID        string
	ApprovedBy     string
	ApprovedByName string
	CommitHash     string
	Status         string // approved, rejected, dismissed
	Comment        string
	CreatedAt      time.Time
}
