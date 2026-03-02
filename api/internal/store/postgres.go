package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) DB() *sql.DB {
	return s.db
}

func (s *PostgresStore) EnsureUserByName(ctx context.Context, name string) (User, error) {
	const findUser = `SELECT id, display_name, is_external FROM users WHERE display_name = $1`
	var user User
	err := s.db.QueryRowContext(ctx, findUser, name).Scan(&user.ID, &user.DisplayName, &user.IsExternal)
	if err == nil {
		role, roleErr := s.getRole(ctx, user.ID)
		if roleErr != nil {
			return User{}, roleErr
		}
		user.Role = role
		return user, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return User{}, fmt.Errorf("lookup user: %w", err)
	}

	insertUser := `
		INSERT INTO users (display_name, email)
		VALUES ($1, CONCAT(LOWER(REPLACE($1, ' ', '.')), '@local.chronicle.dev'))
		RETURNING id, display_name, is_external
	`
	if err := s.db.QueryRowContext(ctx, insertUser, name).Scan(&user.ID, &user.DisplayName, &user.IsExternal); err != nil {
		return User{}, fmt.Errorf("insert user: %w", err)
	}

	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO workspace_memberships (user_id, role)
		VALUES ($1, 'editor')
		ON CONFLICT (user_id) DO NOTHING
	`, user.ID); err != nil {
		return User{}, fmt.Errorf("upsert membership: %w", err)
	}

	user.Role = "editor"
	return user, nil
}

func (s *PostgresStore) GetUserByID(ctx context.Context, userID string) (User, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `SELECT id, display_name, is_external FROM users WHERE id=$1`, userID).Scan(&user.ID, &user.DisplayName, &user.IsExternal)
	if err != nil {
		return User{}, err
	}
	role, err := s.getRole(ctx, user.ID)
	if err != nil {
		return User{}, err
	}
	user.Role = role
	return user, nil
}

func (s *PostgresStore) getRole(ctx context.Context, userID string) (string, error) {
	var role string
	err := s.db.QueryRowContext(ctx, `SELECT role FROM workspace_memberships WHERE user_id=$1`, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "viewer", nil
	}
	if err != nil {
		return "", fmt.Errorf("read role: %w", err)
	}
	return role, nil
}

func (s *PostgresStore) SaveRefreshSession(ctx context.Context, tokenHash, userID string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO refresh_sessions (token_hash, user_id, expires_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (token_hash) DO UPDATE SET user_id=EXCLUDED.user_id, expires_at=EXCLUDED.expires_at, revoked_at=NULL
	`, tokenHash, userID, expiresAt)
	if err != nil {
		return fmt.Errorf("save refresh session: %w", err)
	}
	return nil
}

func (s *PostgresStore) RevokeRefreshSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE refresh_sessions SET revoked_at=NOW() WHERE token_hash=$1`, tokenHash)
	if err != nil {
		return fmt.Errorf("revoke refresh session: %w", err)
	}
	return nil
}

func (s *PostgresStore) LookupRefreshSession(ctx context.Context, tokenHash string) (User, error) {
	const query = `
		SELECT u.id, u.display_name, wm.role, u.is_external
		FROM refresh_sessions rs
		JOIN users u ON u.id = rs.user_id
		LEFT JOIN workspace_memberships wm ON wm.user_id = u.id
		WHERE rs.token_hash = $1
			AND rs.revoked_at IS NULL
			AND rs.expires_at > NOW()
	`
	var user User
	err := s.db.QueryRowContext(ctx, query, tokenHash).Scan(&user.ID, &user.DisplayName, &user.Role, &user.IsExternal)
	if err != nil {
		return User{}, err
	}
	if user.Role == "" {
		user.Role = "viewer"
	}
	return user, nil
}

func (s *PostgresStore) RevokeAccessToken(ctx context.Context, jti string, exp time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO revoked_access_tokens (jti, expires_at)
		VALUES ($1, $2)
		ON CONFLICT (jti) DO NOTHING
	`, jti, exp)
	if err != nil {
		return fmt.Errorf("revoke access token: %w", err)
	}
	return nil
}

func (s *PostgresStore) IsAccessTokenRevoked(ctx context.Context, jti string) (bool, error) {
	var revoked bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM revoked_access_tokens WHERE jti=$1)`, jti).Scan(&revoked)
	if err != nil {
		return false, fmt.Errorf("check revoked token: %w", err)
	}
	return revoked, nil
}

func (s *PostgresStore) ListDocuments(ctx context.Context) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, subtitle, status, space_id, updated_by_name, updated_at
		FROM documents
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	defer rows.Close()

	items := make([]Document, 0)
	for rows.Next() {
		var item Document
		if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID, &item.UpdatedBy, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate documents: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) GetDocument(ctx context.Context, documentID string) (Document, error) {
	var item Document
	err := s.db.QueryRowContext(ctx, `
		SELECT id, title, subtitle, status, space_id, COALESCE(share_mode, 'space'), updated_by_name, updated_at
		FROM documents
		WHERE id=$1
	`, documentID).Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID, &item.ShareMode, &item.UpdatedBy, &item.UpdatedAt)
	if err != nil {
		return Document{}, err
	}
	return item, nil
}

func (s *PostgresStore) InsertDocument(ctx context.Context, item Document) error {
	spaceID := item.SpaceID
	if spaceID == "" {
		spaceID = "sp_default"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO documents (id, title, subtitle, status, space_id, updated_by_name)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO NOTHING
	`, item.ID, item.Title, item.Subtitle, item.Status, spaceID, item.UpdatedBy)
	if err != nil {
		return fmt.Errorf("insert document: %w", err)
	}
	return nil
}

func (s *PostgresStore) UpdateDocumentState(ctx context.Context, documentID, title, subtitle, status, updatedBy string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE documents
		SET title=$2, subtitle=$3, status=$4, updated_by_name=$5, updated_at=NOW()
		WHERE id=$1
	`, documentID, title, subtitle, status, updatedBy)
	if err != nil {
		return fmt.Errorf("update document state: %w", err)
	}
	return nil
}

func (s *PostgresStore) GetActiveProposal(ctx context.Context, documentID string) (*Proposal, error) {
	const query = `
		SELECT id, document_id, title, status, branch_name, target_branch, created_by_name, created_at
		FROM proposals
		WHERE document_id=$1 AND status IN ('DRAFT', 'UNDER_REVIEW')
		ORDER BY created_at DESC
		LIMIT 1
	`
	var item Proposal
	err := s.db.QueryRowContext(ctx, query, documentID).Scan(
		&item.ID,
		&item.DocumentID,
		&item.Title,
		&item.Status,
		&item.BranchName,
		&item.TargetBranch,
		&item.CreatedBy,
		&item.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get active proposal: %w", err)
	}
	return &item, nil
}

func (s *PostgresStore) GetProposal(ctx context.Context, proposalID string) (Proposal, error) {
	var item Proposal
	err := s.db.QueryRowContext(ctx, `
		SELECT id, document_id, title, status, branch_name, target_branch, created_by_name, created_at
		FROM proposals
		WHERE id=$1
	`, proposalID).Scan(
		&item.ID,
		&item.DocumentID,
		&item.Title,
		&item.Status,
		&item.BranchName,
		&item.TargetBranch,
		&item.CreatedBy,
		&item.CreatedAt,
	)
	if err != nil {
		return Proposal{}, err
	}
	return item, nil
}

func (s *PostgresStore) CreateProposal(ctx context.Context, proposal Proposal) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO proposals (id, document_id, title, status, branch_name, target_branch, created_by_name)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, proposal.ID, proposal.DocumentID, proposal.Title, proposal.Status, proposal.BranchName, proposal.TargetBranch, proposal.CreatedBy)
	if err != nil {
		return fmt.Errorf("create proposal: %w", err)
	}

	for _, role := range []string{"security", "architectureCommittee", "legal"} {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO approvals (proposal_id, role, status)
			VALUES ($1, $2, 'Pending')
			ON CONFLICT (proposal_id, role) DO NOTHING
		`, proposal.ID, role); err != nil {
			return fmt.Errorf("seed approvals: %w", err)
		}
	}

	return nil
}

func (s *PostgresStore) UpdateProposalStatus(ctx context.Context, proposalID, status string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE proposals SET status=$2 WHERE id=$1`, proposalID, status)
	if err != nil {
		return fmt.Errorf("update proposal status: %w", err)
	}
	return nil
}

func (s *PostgresStore) MarkProposalMerged(ctx context.Context, proposalID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE proposals
		SET status='MERGED', merged_at=NOW()
		WHERE id=$1
	`, proposalID)
	if err != nil {
		return fmt.Errorf("mark proposal merged: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListThreads(ctx context.Context, proposalID string, includeInternal bool) ([]Thread, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, proposal_id, anchor_label, COALESCE(anchor_node_id, ''), COALESCE(anchor_offsets_json::text, '{}'), body, status, visibility, type, COALESCE(resolved_outcome, ''), COALESCE(resolved_note, ''), created_by_name, created_at
		FROM threads
		WHERE proposal_id=$1
		  AND ($2::boolean OR visibility='EXTERNAL')
		ORDER BY created_at ASC
	`, proposalID, includeInternal)
	if err != nil {
		return nil, fmt.Errorf("list threads: %w", err)
	}
	defer rows.Close()

	items := make([]Thread, 0)
	for rows.Next() {
		var item Thread
		if err := rows.Scan(
			&item.ID,
			&item.ProposalID,
			&item.Anchor,
			&item.AnchorNodeID,
			&item.AnchorOffsets,
			&item.Text,
			&item.Status,
			&item.Visibility,
			&item.Type,
			&item.ResolvedOutcome,
			&item.ResolvedNote,
			&item.Author,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan thread: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate threads: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) InsertThread(ctx context.Context, thread Thread) error {
	visibility := thread.Visibility
	if visibility == "" {
		visibility = "INTERNAL"
	}
	threadType := thread.Type
	if threadType == "" {
		threadType = "GENERAL"
	}
	status := thread.Status
	if status == "" {
		status = "OPEN"
	}
	anchorOffsets := thread.AnchorOffsets
	if anchorOffsets == "" {
		anchorOffsets = "{}"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO threads (id, proposal_id, anchor_label, anchor_node_id, anchor_offsets_json, body, status, visibility, type, created_by_name)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5::jsonb, $6, $7, $8, $9, $10)
	`, thread.ID, thread.ProposalID, thread.Anchor, thread.AnchorNodeID, anchorOffsets, thread.Text, status, visibility, threadType, thread.Author)
	if err != nil {
		return fmt.Errorf("insert thread: %w", err)
	}
	return nil
}

func (s *PostgresStore) ResolveThread(ctx context.Context, proposalID, threadID, resolvedBy, resolvedNote, outcome string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET status='RESOLVED', resolved_by_name=$3, resolved_at=NOW(), resolved_note=$4, resolved_outcome=$5, updated_at=NOW()
		WHERE proposal_id=$1 AND id=$2 AND status <> 'RESOLVED'
	`, proposalID, threadID, resolvedBy, resolvedNote, outcome)
	if err != nil {
		return false, fmt.Errorf("resolve thread: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("resolve thread rows: %w", err)
	}
	return affected > 0, nil
}

func (s *PostgresStore) ReopenThread(ctx context.Context, proposalID, threadID string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET status='OPEN', resolved_by_name=NULL, resolved_at=NULL, resolved_note=NULL, resolved_outcome=NULL, updated_at=NOW()
		WHERE proposal_id=$1 AND id=$2 AND status='RESOLVED'
	`, proposalID, threadID)
	if err != nil {
		return false, fmt.Errorf("reopen thread: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("reopen thread rows: %w", err)
	}
	return affected > 0, nil
}

func (s *PostgresStore) UpdateThreadVisibility(ctx context.Context, proposalID, threadID, visibility string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET visibility=$3, updated_at=NOW()
		WHERE proposal_id=$1 AND id=$2
	`, proposalID, threadID, visibility)
	if err != nil {
		return false, fmt.Errorf("update thread visibility: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("update thread visibility rows: %w", err)
	}
	return affected > 0, nil
}

func (s *PostgresStore) GetThread(ctx context.Context, proposalID, threadID string) (Thread, error) {
	var item Thread
	err := s.db.QueryRowContext(ctx, `
		SELECT id, proposal_id, anchor_label, COALESCE(anchor_node_id, ''), COALESCE(anchor_offsets_json::text, '{}'), body, status, visibility, type, COALESCE(resolved_outcome, ''), COALESCE(resolved_note, ''), created_by_name, created_at
		FROM threads
		WHERE proposal_id=$1 AND id=$2
	`, proposalID, threadID).Scan(
		&item.ID,
		&item.ProposalID,
		&item.Anchor,
		&item.AnchorNodeID,
		&item.AnchorOffsets,
		&item.Text,
		&item.Status,
		&item.Visibility,
		&item.Type,
		&item.ResolvedOutcome,
		&item.ResolvedNote,
		&item.Author,
		&item.CreatedAt,
	)
	if err != nil {
		return Thread{}, err
	}
	return item, nil
}

func (s *PostgresStore) InsertAnnotation(ctx context.Context, annotation Annotation) error {
	annotationType := annotation.Type
	if annotationType == "" {
		annotationType = "GENERAL"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO annotations (id, proposal_id, thread_id, author_name, body, type)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, annotation.ID, annotation.ProposalID, annotation.ThreadID, annotation.Author, annotation.Body, annotationType)
	if err != nil {
		return fmt.Errorf("insert annotation: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListThreadAnnotations(ctx context.Context, proposalID, threadID string) ([]Annotation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, proposal_id, thread_id, author_name, body, type, created_at
		FROM annotations
		WHERE proposal_id=$1 AND thread_id=$2
		ORDER BY created_at ASC
	`, proposalID, threadID)
	if err != nil {
		return nil, fmt.Errorf("list thread annotations: %w", err)
	}
	defer rows.Close()

	items := make([]Annotation, 0)
	for rows.Next() {
		var item Annotation
		if err := rows.Scan(
			&item.ID,
			&item.ProposalID,
			&item.ThreadID,
			&item.Author,
			&item.Body,
			&item.Type,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan annotation: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate annotations: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) ListAnnotations(ctx context.Context, proposalID string, includeInternal bool) ([]Annotation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.proposal_id, a.thread_id, a.author_name, a.body, a.type, a.created_at
		FROM annotations a
		JOIN threads t ON t.proposal_id = a.proposal_id AND t.id = a.thread_id
		WHERE a.proposal_id=$1
		  AND ($2::boolean OR t.visibility='EXTERNAL')
		ORDER BY a.created_at ASC
	`, proposalID, includeInternal)
	if err != nil {
		return nil, fmt.Errorf("list annotations: %w", err)
	}
	defer rows.Close()

	items := make([]Annotation, 0)
	for rows.Next() {
		var item Annotation
		if err := rows.Scan(
			&item.ID,
			&item.ProposalID,
			&item.ThreadID,
			&item.Author,
			&item.Body,
			&item.Type,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan annotation: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate annotations: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) ToggleThreadVote(ctx context.Context, proposalID, threadID, userName string, vote int) error {
	var existing int
	err := s.db.QueryRowContext(ctx, `
		SELECT vote
		FROM thread_votes
		WHERE proposal_id=$1 AND thread_id=$2 AND user_name=$3
	`, proposalID, threadID, userName).Scan(&existing)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("lookup thread vote: %w", err)
	}
	if err == nil && existing == vote {
		if _, delErr := s.db.ExecContext(ctx, `
			DELETE FROM thread_votes
			WHERE proposal_id=$1 AND thread_id=$2 AND user_name=$3
		`, proposalID, threadID, userName); delErr != nil {
			return fmt.Errorf("delete thread vote: %w", delErr)
		}
		return nil
	}
	if _, upsertErr := s.db.ExecContext(ctx, `
		INSERT INTO thread_votes (proposal_id, thread_id, user_name, vote)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (proposal_id, thread_id, user_name)
		DO UPDATE SET vote=EXCLUDED.vote, updated_at=NOW()
	`, proposalID, threadID, userName, vote); upsertErr != nil {
		return fmt.Errorf("upsert thread vote: %w", upsertErr)
	}
	return nil
}

func (s *PostgresStore) ToggleThreadReaction(ctx context.Context, proposalID, threadID, userName, emoji string) error {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM thread_reactions
		WHERE proposal_id=$1 AND thread_id=$2 AND user_name=$3 AND emoji=$4
	`, proposalID, threadID, userName, emoji)
	if err != nil {
		return fmt.Errorf("delete thread reaction: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete thread reaction rows: %w", err)
	}
	if affected > 0 {
		return nil
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO thread_reactions (proposal_id, thread_id, user_name, emoji)
		VALUES ($1, $2, $3, $4)
	`, proposalID, threadID, userName, emoji); err != nil {
		return fmt.Errorf("insert thread reaction: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListThreadVoteTotals(ctx context.Context, proposalID string, includeInternal bool) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT tv.thread_id, COALESCE(SUM(tv.vote), 0) AS vote_total
		FROM thread_votes tv
		JOIN threads t ON t.proposal_id = tv.proposal_id AND t.id = tv.thread_id
		WHERE tv.proposal_id=$1
		  AND ($2::boolean OR t.visibility='EXTERNAL')
		GROUP BY tv.thread_id
	`, proposalID, includeInternal)
	if err != nil {
		return nil, fmt.Errorf("list thread vote totals: %w", err)
	}
	defer rows.Close()

	totals := make(map[string]int)
	for rows.Next() {
		var threadID string
		var total int
		if err := rows.Scan(&threadID, &total); err != nil {
			return nil, fmt.Errorf("scan thread vote total: %w", err)
		}
		totals[threadID] = total
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate thread vote totals: %w", err)
	}
	return totals, nil
}

func (s *PostgresStore) ListThreadReactionCounts(ctx context.Context, proposalID string, includeInternal bool) ([]ThreadReactionCount, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT tr.thread_id, tr.emoji, COUNT(*)::int
		FROM thread_reactions tr
		JOIN threads t ON t.proposal_id = tr.proposal_id AND t.id = tr.thread_id
		WHERE tr.proposal_id=$1
		  AND ($2::boolean OR t.visibility='EXTERNAL')
		GROUP BY tr.thread_id, tr.emoji
		ORDER BY tr.thread_id ASC, tr.emoji ASC
	`, proposalID, includeInternal)
	if err != nil {
		return nil, fmt.Errorf("list thread reaction counts: %w", err)
	}
	defer rows.Close()

	items := make([]ThreadReactionCount, 0)
	for rows.Next() {
		var item ThreadReactionCount
		if err := rows.Scan(&item.ThreadID, &item.Emoji, &item.Count); err != nil {
			return nil, fmt.Errorf("scan thread reaction count: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate thread reaction counts: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) ListApprovals(ctx context.Context, proposalID string) ([]Approval, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT role, status, COALESCE(approved_by_name, ''), approved_at
		FROM approvals
		WHERE proposal_id=$1
		ORDER BY role ASC
	`, proposalID)
	if err != nil {
		return nil, fmt.Errorf("list approvals: %w", err)
	}
	defer rows.Close()

	items := make([]Approval, 0)
	for rows.Next() {
		var item Approval
		if err := rows.Scan(&item.Role, &item.Status, &item.ApprovedBy, &item.ApprovedAt); err != nil {
			return nil, fmt.Errorf("scan approval: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate approvals: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) ApproveRole(ctx context.Context, proposalID, role, approvedBy string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE approvals
		SET status='Approved', approved_by_name=$3, approved_at=NOW()
		WHERE proposal_id=$1 AND role=$2
	`, proposalID, role, approvedBy)
	if err != nil {
		return fmt.Errorf("approve role: %w", err)
	}
	return nil
}

func (s *PostgresStore) OpenThreadCount(ctx context.Context, proposalID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM threads WHERE proposal_id=$1 AND status <> 'RESOLVED'
	`, proposalID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count open threads: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) PendingApprovalCount(ctx context.Context, proposalID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM approvals WHERE proposal_id=$1 AND status <> 'Approved'
	`, proposalID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count pending approvals: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) InsertDecisionLog(ctx context.Context, entry DecisionLogEntry) error {
	participants := entry.Participants
	if participants == nil {
		participants = []string{}
	}
	encodedParticipants, err := json.Marshal(participants)
	if err != nil {
		return fmt.Errorf("marshal decision participants: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO decision_log (thread_id, document_id, proposal_id, outcome, rationale, decided_by_name, commit_hash, participants)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
	`, entry.ThreadID, entry.DocumentID, entry.ProposalID, entry.Outcome, entry.Rationale, entry.DecidedBy, entry.CommitHash, string(encodedParticipants))
	if err != nil {
		return fmt.Errorf("insert decision log: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListDecisionLog(ctx context.Context, documentID, proposalID string, limit int) ([]DecisionLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, document_id, proposal_id, thread_id, outcome, rationale, decided_by_name, decided_at, commit_hash, participants
		FROM decision_log
		WHERE document_id=$1 AND (proposal_id=$2 OR $2='')
		ORDER BY decided_at DESC
		LIMIT $3
	`, documentID, proposalID, limit)
	if err != nil {
		return nil, fmt.Errorf("list decision log: %w", err)
	}
	defer rows.Close()

	items := make([]DecisionLogEntry, 0)
	for rows.Next() {
		var item DecisionLogEntry
		var participantsRaw []byte
		if err := rows.Scan(
			&item.ID,
			&item.DocumentID,
			&item.ProposalID,
			&item.ThreadID,
			&item.Outcome,
			&item.Rationale,
			&item.DecidedBy,
			&item.DecidedAt,
			&item.CommitHash,
			&participantsRaw,
		); err != nil {
			return nil, fmt.Errorf("scan decision log: %w", err)
		}
		_ = json.Unmarshal(participantsRaw, &item.Participants)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate decision log: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) ListDecisionLogFiltered(ctx context.Context, documentID, proposalID, outcome, query, author string, limit int) ([]DecisionLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, document_id, proposal_id, thread_id, outcome, rationale, decided_by_name, decided_at, commit_hash, participants
		FROM decision_log
		WHERE document_id=$1
		  AND ($2='' OR proposal_id=$2)
		  AND ($3='' OR outcome=$3)
		  AND ($4='' OR decided_by_name ILIKE '%' || $4 || '%')
		  AND ($5='' OR rationale ILIKE '%' || $5 || '%' OR thread_id ILIKE '%' || $5 || '%')
		ORDER BY decided_at DESC
		LIMIT $6
	`, documentID, proposalID, outcome, author, query, limit)
	if err != nil {
		return nil, fmt.Errorf("list decision log filtered: %w", err)
	}
	defer rows.Close()

	items := make([]DecisionLogEntry, 0)
	for rows.Next() {
		var item DecisionLogEntry
		var participantsRaw []byte
		if err := rows.Scan(
			&item.ID,
			&item.DocumentID,
			&item.ProposalID,
			&item.ThreadID,
			&item.Outcome,
			&item.Rationale,
			&item.DecidedBy,
			&item.DecidedAt,
			&item.CommitHash,
			&participantsRaw,
		); err != nil {
			return nil, fmt.Errorf("scan filtered decision log: %w", err)
		}
		_ = json.Unmarshal(participantsRaw, &item.Participants)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate filtered decision log: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) InsertNamedVersion(ctx context.Context, proposalID, name, hash, createdBy string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO named_versions (proposal_id, version_name, commit_hash, created_by_name)
		VALUES ($1, $2, $3, $4)
	`, proposalID, name, hash, createdBy)
	if err != nil {
		return fmt.Errorf("insert named version: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListNamedVersions(ctx context.Context, proposalID string) ([]NamedVersion, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT version_name, commit_hash, created_by_name, created_at
		FROM named_versions
		WHERE proposal_id=$1
		ORDER BY created_at DESC
	`, proposalID)
	if err != nil {
		return nil, fmt.Errorf("list named versions: %w", err)
	}
	defer rows.Close()

	items := make([]NamedVersion, 0)
	for rows.Next() {
		var item NamedVersion
		if err := rows.Scan(&item.Name, &item.Hash, &item.CreatedBy, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan named version: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate named versions: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) ProposalQueue(ctx context.Context) ([]map[string]any, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT p.id, p.document_id, d.title, p.created_by_name,
			(SELECT COUNT(*) FROM approvals a WHERE a.proposal_id=p.id AND a.status <> 'Approved') AS pending_approvals,
			(SELECT COUNT(*) FROM threads t WHERE t.proposal_id=p.id AND t.status <> 'RESOLVED') AS open_threads
		FROM proposals p
		JOIN documents d ON d.id=p.document_id
		WHERE p.status IN ('DRAFT', 'UNDER_REVIEW')
		ORDER BY p.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("proposal queue: %w", err)
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var proposalID, documentID, title, requestedBy string
		var pendingApprovals, openThreads int
		if err := rows.Scan(&proposalID, &documentID, &title, &requestedBy, &pendingApprovals, &openThreads); err != nil {
			return nil, fmt.Errorf("scan proposal queue: %w", err)
		}
		status := "Ready"
		if pendingApprovals > 0 || openThreads > 0 {
			status = "Blocked"
		}
		items = append(items, map[string]any{
			"id":          documentID + ":" + proposalID,
			"documentId":  documentID,
			"proposalId":  proposalID,
			"title":       title,
			"requestedBy": requestedBy,
			"status":      status,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate proposal queue: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) SummaryCounts(ctx context.Context) (allDocuments int, openReviews int, merged int, err error) {
	if err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM documents`).Scan(&allDocuments); err != nil {
		err = fmt.Errorf("count all documents: %w", err)
		return
	}
	if err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM documents WHERE status='In review'`).Scan(&openReviews); err != nil {
		err = fmt.Errorf("count open reviews: %w", err)
		return
	}
	if err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM proposals WHERE status='MERGED'`).Scan(&merged); err != nil {
		err = fmt.Errorf("count merged proposals: %w", err)
		return
	}
	return
}

func (s *PostgresStore) GetDefaultWorkspace(ctx context.Context) (Workspace, error) {
	var item Workspace
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, slug, COALESCE(settings_json::text, '{}'), created_at, updated_at
		FROM workspaces
		LIMIT 1
	`).Scan(&item.ID, &item.Name, &item.Slug, &item.Settings, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Workspace{}, fmt.Errorf("get default workspace: %w", err)
	}
	return item, nil
}

func (s *PostgresStore) ListSpaces(ctx context.Context, workspaceID string) ([]Space, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, workspace_id, name, slug, description, COALESCE(visibility, 'organization'), sort_order, created_at, updated_at
		FROM spaces
		WHERE workspace_id=$1
		ORDER BY sort_order ASC, name ASC
	`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list spaces: %w", err)
	}
	defer rows.Close()

	items := make([]Space, 0)
	for rows.Next() {
		var item Space
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Slug, &item.Description, &item.Visibility, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan space: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate spaces: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) GetSpace(ctx context.Context, spaceID string) (Space, error) {
	var item Space
	err := s.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, name, slug, description, COALESCE(visibility, 'organization'), sort_order, created_at, updated_at
		FROM spaces
		WHERE id=$1
	`, spaceID).Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Slug, &item.Description, &item.Visibility, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Space{}, fmt.Errorf("get space: %w", err)
	}
	return item, nil
}

func (s *PostgresStore) InsertSpace(ctx context.Context, space Space) error {
	vis := space.Visibility
	if vis == "" {
		vis = "organization"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO spaces (id, workspace_id, name, slug, description, visibility, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, space.ID, space.WorkspaceID, space.Name, space.Slug, space.Description, vis, space.SortOrder)
	if err != nil {
		return fmt.Errorf("insert space: %w", err)
	}
	return nil
}

func (s *PostgresStore) UpdateSpace(ctx context.Context, spaceID, name, description, visibility string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE spaces SET name=$2, description=$3, visibility=$4, updated_at=NOW()
		WHERE id=$1
	`, spaceID, name, description, visibility)
	if err != nil {
		return fmt.Errorf("update space: %w", err)
	}
	return nil
}

func (s *PostgresStore) DeleteSpace(ctx context.Context, spaceID string) error {
	var docCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM documents WHERE space_id=$1`, spaceID).Scan(&docCount); err != nil {
		return fmt.Errorf("count space documents: %w", err)
	}
	if docCount > 0 {
		return fmt.Errorf("space contains %d documents", docCount)
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM spaces WHERE id=$1`, spaceID)
	if err != nil {
		return fmt.Errorf("delete space: %w", err)
	}
	return nil
}

// CountSlugsWithPrefix counts how many spaces in a workspace have slugs matching a base or base-N pattern.
func (s *PostgresStore) CountSlugsWithPrefix(ctx context.Context, workspaceID, baseSlug string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM spaces
		WHERE workspace_id=$1 AND (slug=$2 OR slug ~ ($2 || '-[0-9]+$'))
	`, workspaceID, baseSlug).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count slugs with prefix: %w", err)
	}
	return count, nil
}

func (s *PostgresStore) ListDocumentsBySpace(ctx context.Context, spaceID string) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, subtitle, status, space_id, updated_by_name, updated_at
		FROM documents
		WHERE space_id=$1
		ORDER BY updated_at DESC
	`, spaceID)
	if err != nil {
		return nil, fmt.Errorf("list documents by space: %w", err)
	}
	defer rows.Close()

	items := make([]Document, 0)
	for rows.Next() {
		var item Document
		if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID, &item.UpdatedBy, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate documents: %w", err)
	}
	return items, nil
}

func (s *PostgresStore) MoveDocument(ctx context.Context, documentID, newSpaceID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE documents SET space_id=$2 WHERE id=$1`, documentID, newSpaceID)
	if err != nil {
		return fmt.Errorf("move document: %w", err)
	}
	return nil
}

func (s *PostgresStore) SpaceDocumentCount(ctx context.Context, spaceID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM documents WHERE space_id=$1`, spaceID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count space documents: %w", err)
	}
	return count, nil
}

// Tree Operations for Document Hierarchy

// ListDocumentTree returns documents in tree order (root level only, sorted)
func (s *PostgresStore) ListDocumentTree(ctx context.Context, spaceID string) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, subtitle, status, space_id, parent_id, sort_order, path, updated_by_name, updated_at
		FROM documents
		WHERE space_id=$1 AND parent_id IS NULL
		ORDER BY sort_order, title
	`, spaceID)
	if err != nil {
		return nil, fmt.Errorf("list document tree: %w", err)
	}
	defer rows.Close()

	items := make([]Document, 0)
	for rows.Next() {
		var item Document
		if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID,
			&item.ParentID, &item.SortOrder, &item.Path, &item.UpdatedBy, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate documents: %w", err)
	}
	return items, nil
}

// ListChildDocuments returns children of a parent document
func (s *PostgresStore) ListChildDocuments(ctx context.Context, parentID string) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, subtitle, status, space_id, parent_id, sort_order, path, updated_by_name, updated_at
		FROM documents
		WHERE parent_id=$1
		ORDER BY sort_order, title
	`, parentID)
	if err != nil {
		return nil, fmt.Errorf("list child documents: %w", err)
	}
	defer rows.Close()

	items := make([]Document, 0)
	for rows.Next() {
		var item Document
		if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID,
			&item.ParentID, &item.SortOrder, &item.Path, &item.UpdatedBy, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate documents: %w", err)
	}
	return items, nil
}

// MoveDocumentToParent moves a document to a new parent (or root) and updates path
func (s *PostgresStore) MoveDocumentToParent(ctx context.Context, documentID string, newParentID *string, newSpaceID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Get current document info
	var oldPath string
	var oldSpaceID string
	err = tx.QueryRowContext(ctx, `SELECT path, space_id FROM documents WHERE id=$1`, documentID).Scan(&oldPath, &oldSpaceID)
	if err != nil {
		return fmt.Errorf("get document path: %w", err)
	}

	// Build new path
	var newPath string
	if newParentID != nil {
		var parentPath string
		err = tx.QueryRowContext(ctx, `SELECT path FROM documents WHERE id=$1`, *newParentID).Scan(&parentPath)
		if err != nil {
			return fmt.Errorf("get parent path: %w", err)
		}
		newPath = parentPath + "/" + documentID
	} else {
		newPath = "/" + documentID
	}

	// Update this document
	_, err = tx.ExecContext(ctx, `
		UPDATE documents 
		SET parent_id=$2, space_id=$3, path=$4, updated_at=NOW()
		WHERE id=$1
	`, documentID, newParentID, newSpaceID, newPath)
	if err != nil {
		return fmt.Errorf("update document parent: %w", err)
	}

	// Update all descendants' paths
	oldPrefix := oldPath
	newPrefix := newPath
	_, err = tx.ExecContext(ctx, `
		UPDATE documents
		SET path = $2 || substring(path from $3),
		    space_id = $4,
		    updated_at = NOW()
		WHERE path LIKE $1 || '/%'
	`, oldPrefix, newPrefix, len(oldPrefix)+1, newSpaceID)
	if err != nil {
		return fmt.Errorf("update descendant paths: %w", err)
	}

	return tx.Commit()
}

// ReorderDocument updates sort_order for manual reordering
func (s *PostgresStore) ReorderDocument(ctx context.Context, documentID string, newOrder int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE documents 
		SET sort_order=$2, updated_at=NOW()
		WHERE id=$1
	`, documentID, newOrder)
	if err != nil {
		return fmt.Errorf("reorder document: %w", err)
	}
	return nil
}

// GetDocumentWithChildren returns a document with its children populated
func (s *PostgresStore) GetDocumentWithChildren(ctx context.Context, documentID string) (DocumentTreeNode, error) {
	doc, err := s.GetDocument(ctx, documentID)
	if err != nil {
		return DocumentTreeNode{}, err
	}

	children, err := s.ListChildDocuments(ctx, documentID)
	if err != nil {
		return DocumentTreeNode{}, err
	}

	childNodes := make([]DocumentTreeNode, len(children))
	for i, child := range children {
		childNodes[i] = DocumentTreeNode{Document: child, Depth: 1}
	}

	return DocumentTreeNode{
		Document: doc,
		Children: childNodes,
		Depth:    0,
	}, nil
}

// Ping verifies the database connection is alive
func (s *PostgresStore) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

// UpsertChangeReviewState inserts or updates a change review state
func (s *PostgresStore) UpsertChangeReviewState(ctx context.Context, state ChangeReviewState) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO change_review_states (change_id, proposal_id, document_id, from_ref, to_ref, review_state, rejected_rationale, reviewed_by_name, reviewed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (proposal_id, change_id, from_ref, to_ref) DO UPDATE
		SET review_state = EXCLUDED.review_state,
		    rejected_rationale = EXCLUDED.rejected_rationale,
		    reviewed_by_name = EXCLUDED.reviewed_by_name,
		    reviewed_at = EXCLUDED.reviewed_at,
		    updated_at = NOW()
	`, state.ChangeID, state.ProposalID, state.DocumentID, state.FromRef, state.ToRef,
		state.ReviewState, state.RejectedRationale, state.ReviewedBy, state.ReviewedAt)
	if err != nil {
		return fmt.Errorf("upsert change review state: %w", err)
	}
	return nil
}

// ListChangeReviewStates returns all review states for a proposal/compare range
func (s *PostgresStore) ListChangeReviewStates(ctx context.Context, proposalID, fromRef, toRef string) ([]ChangeReviewState, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, change_id, proposal_id, document_id, from_ref, to_ref, review_state, rejected_rationale, reviewed_by_name, reviewed_at, created_at, updated_at
		FROM change_review_states
		WHERE proposal_id = $1 AND from_ref = $2 AND to_ref = $3
		ORDER BY created_at ASC
	`, proposalID, fromRef, toRef)
	if err != nil {
		return nil, fmt.Errorf("list change review states: %w", err)
	}
	defer rows.Close()

	items := make([]ChangeReviewState, 0)
	for rows.Next() {
		var item ChangeReviewState
		if err := rows.Scan(
			&item.ID, &item.ChangeID, &item.ProposalID, &item.DocumentID, &item.FromRef, &item.ToRef,
			&item.ReviewState, &item.RejectedRationale, &item.ReviewedBy, &item.ReviewedAt,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan change review state: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate change review states: %w", err)
	}
	return items, nil
}

// GetChangeReviewState returns a specific change review state
func (s *PostgresStore) GetChangeReviewState(ctx context.Context, proposalID, changeID, fromRef, toRef string) (ChangeReviewState, error) {
	var item ChangeReviewState
	err := s.db.QueryRowContext(ctx, `
		SELECT id, change_id, proposal_id, document_id, from_ref, to_ref, review_state, rejected_rationale, reviewed_by_name, reviewed_at, created_at, updated_at
		FROM change_review_states
		WHERE proposal_id = $1 AND change_id = $2 AND from_ref = $3 AND to_ref = $4
	`, proposalID, changeID, fromRef, toRef).Scan(
		&item.ID, &item.ChangeID, &item.ProposalID, &item.DocumentID, &item.FromRef, &item.ToRef,
		&item.ReviewState, &item.RejectedRationale, &item.ReviewedBy, &item.ReviewedAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ChangeReviewState{}, sql.ErrNoRows
		}
		return ChangeReviewState{}, fmt.Errorf("get change review state: %w", err)
	}
	return item, nil
}

// InsertAuditEvent inserts an immutable audit event
func (s *PostgresStore) InsertAuditEvent(ctx context.Context, event AuditEvent) error {
	payloadJSON, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("marshal audit payload: %w", err)
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO audit_events (event_type, actor_name, document_id, proposal_id, change_id, thread_id, payload)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
	`, event.EventType, event.ActorName, event.DocumentID, event.ProposalID, event.ChangeID, event.ThreadID, string(payloadJSON))
	if err != nil {
		return fmt.Errorf("insert audit event: %w", err)
	}
	return nil
}

// ListAuditEvents returns audit events for a document or proposal
func (s *PostgresStore) ListAuditEvents(ctx context.Context, documentID, proposalID string, limit int) ([]AuditEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	query := `
		SELECT id, event_type, actor_name, document_id, proposal_id, change_id, thread_id, payload, created_at
		FROM audit_events
		WHERE document_id = $1 AND ($2 = '' OR proposal_id = $2)
		ORDER BY created_at DESC
		LIMIT $3
	`
	rows, err := s.db.QueryContext(ctx, query, documentID, proposalID, limit)
	if err != nil {
		return nil, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()

	items := make([]AuditEvent, 0)
	for rows.Next() {
		var item AuditEvent
		var payloadRaw []byte
		var changeID, threadID sql.NullString
		if err := rows.Scan(
			&item.ID, &item.EventType, &item.ActorName, &item.DocumentID, &item.ProposalID,
			&changeID, &threadID, &payloadRaw, &item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan audit event: %w", err)
		}
		if changeID.Valid {
			item.ChangeID = &changeID.String
		}
		if threadID.Valid {
			item.ThreadID = &threadID.String
		}
		_ = json.Unmarshal(payloadRaw, &item.Payload)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit events: %w", err)
	}
	return items, nil
}

// ListAuditEventsForChange returns audit events for a specific change
func (s *PostgresStore) ListAuditEventsForChange(ctx context.Context, changeID string, limit int) ([]AuditEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, event_type, actor_name, document_id, proposal_id, change_id, thread_id, payload, created_at
		FROM audit_events
		WHERE change_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, changeID, limit)
	if err != nil {
		return nil, fmt.Errorf("list audit events for change: %w", err)
	}
	defer rows.Close()

	items := make([]AuditEvent, 0)
	for rows.Next() {
		var item AuditEvent
		var payloadRaw []byte
		var changeIDPtr, threadID sql.NullString
		if err := rows.Scan(
			&item.ID, &item.EventType, &item.ActorName, &item.DocumentID, &item.ProposalID,
			&changeIDPtr, &threadID, &payloadRaw, &item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan audit event: %w", err)
		}
		if changeIDPtr.Valid {
			item.ChangeID = &changeIDPtr.String
		}
		if threadID.Valid {
			item.ThreadID = &threadID.String
		}
		_ = json.Unmarshal(payloadRaw, &item.Payload)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit events for change: %w", err)
	}
	return items, nil
}


// OrphanThread marks a thread as orphaned with a reason
func (s *PostgresStore) OrphanThread(ctx context.Context, proposalID, threadID, reason string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE threads
		SET status='ORPHANED', orphaned_reason=$3, updated_at=NOW()
		WHERE proposal_id=$1 AND id=$2 AND status <> 'ORPHANED'
	`, proposalID, threadID, reason)
	if err != nil {
		return false, fmt.Errorf("orphan thread: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("orphan thread rows: %w", err)
	}
	return affected > 0, nil
}

// ListOrphanedThreads returns all orphaned threads for a proposal
func (s *PostgresStore) ListOrphanedThreads(ctx context.Context, proposalID string) ([]Thread, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, proposal_id, anchor_label, COALESCE(anchor_node_id, ''), COALESCE(anchor_offsets_json::text, '{}'), body, status, visibility, type, COALESCE(resolved_outcome, ''), COALESCE(resolved_note, ''), COALESCE(orphaned_reason, ''), created_by_name, created_at
		FROM threads
		WHERE proposal_id=$1 AND status='ORPHANED'
		ORDER BY created_at ASC
	`, proposalID)
	if err != nil {
		return nil, fmt.Errorf("list orphaned threads: %w", err)
	}
	defer rows.Close()

	items := make([]Thread, 0)
	for rows.Next() {
		var item Thread
		if err := rows.Scan(
			&item.ID,
			&item.ProposalID,
			&item.Anchor,
			&item.AnchorNodeID,
			&item.AnchorOffsets,
			&item.Text,
			&item.Status,
			&item.Visibility,
			&item.Type,
			&item.ResolvedOutcome,
			&item.ResolvedNote,
			&item.OrphanedReason,
			&item.Author,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan orphaned thread: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate orphaned threads: %w", err)
	}
	return items, nil
}

// FindThreadsByAnchorNodeIDs returns threads anchored to specific nodes
func (s *PostgresStore) FindThreadsByAnchorNodeIDs(ctx context.Context, proposalID string, nodeIDs []string) ([]Thread, error) {
	if len(nodeIDs) == 0 {
		return []Thread{}, nil
	}
	
	// Build placeholders for IN clause
	placeholders := make([]string, len(nodeIDs))
	args := make([]interface{}, 0, len(nodeIDs)+1)
	args = append(args, proposalID)
	for i, id := range nodeIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args = append(args, id)
	}
	
	query := fmt.Sprintf(`
		SELECT id, proposal_id, anchor_label, COALESCE(anchor_node_id, ''), COALESCE(anchor_offsets_json::text, '{}'), body, status, visibility, type, COALESCE(resolved_outcome, ''), COALESCE(resolved_note, ''), COALESCE(orphaned_reason, ''), created_by_name, created_at
		FROM threads
		WHERE proposal_id=$1 AND anchor_node_id IN (%s)
		ORDER BY created_at ASC
	`, strings.Join(placeholders, ", "))
	
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("find threads by anchor: %w", err)
	}
	defer rows.Close()

	items := make([]Thread, 0)
	for rows.Next() {
		var item Thread
		if err := rows.Scan(
			&item.ID,
			&item.ProposalID,
			&item.Anchor,
			&item.AnchorNodeID,
			&item.AnchorOffsets,
			&item.Text,
			&item.Status,
			&item.Visibility,
			&item.Type,
			&item.ResolvedOutcome,
			&item.ResolvedNote,
			&item.OrphanedReason,
			&item.Author,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan thread by anchor: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate threads by anchor: %w", err)
	}
	return items, nil
}


// Auth methods

// GetUserByEmail looks up a user by email address
func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (User, error) {
	var user User
	var verificationExpires sql.NullTime
	var verificationToken sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, display_name, email, password_hash, role, is_external, 
		       is_email_verified, verification_token, verification_expires_at, created_at, updated_at
		FROM users
		WHERE email = $1
	`, email).Scan(
		&user.ID, &user.DisplayName, &user.Email, &user.PasswordHash, &user.Role,
		&user.IsExternal, &user.IsEmailVerified, &verificationToken,
		&verificationExpires, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return User{}, sql.ErrNoRows
	}
	if err != nil {
		return User{}, fmt.Errorf("get user by email: %w", err)
	}
	if verificationToken.Valid {
		user.VerificationToken = verificationToken.String
	}
	if verificationExpires.Valid {
		user.VerificationExpiresAt = &verificationExpires.Time
	}
	return user, nil
}

// CreateUser creates a new user with email/password
func (s *PostgresStore) CreateUser(ctx context.Context, user User) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, display_name, email, password_hash, role, is_external, is_email_verified)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, user.ID, user.DisplayName, user.Email, user.PasswordHash, user.Role, user.IsExternal, user.IsEmailVerified)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// UpdateUserVerificationToken sets the email verification token
func (s *PostgresStore) UpdateUserVerificationToken(ctx context.Context, userID, token string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users 
		SET verification_token = $2, verification_expires_at = $3, updated_at = NOW()
		WHERE id = $1
	`, userID, token, expiresAt)
	if err != nil {
		return fmt.Errorf("update verification token: %w", err)
	}
	return nil
}

// VerifyUserEmail marks a user as email-verified
func (s *PostgresStore) VerifyUserEmail(ctx context.Context, token string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE users 
		SET is_email_verified = true, verification_token = NULL, verification_expires_at = NULL, updated_at = NOW()
		WHERE verification_token = $1 AND verification_expires_at > NOW()
	`, token)
	if err != nil {
		return fmt.Errorf("verify email: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// UpdateUserPassword updates the password hash for a user
func (s *PostgresStore) UpdateUserPassword(ctx context.Context, userID, passwordHash string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users 
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1
	`, userID, passwordHash)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	return nil
}

// CreatePasswordReset creates a password reset token
func (s *PostgresStore) CreatePasswordReset(ctx context.Context, userID, token string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO password_resets (user_id, reset_token, expires_at)
		VALUES ($1, $2, $3)
	`, userID, token, expiresAt)
	if err != nil {
		return fmt.Errorf("create password reset: %w", err)
	}
	return nil
}

// GetPasswordReset looks up a password reset token
func (s *PostgresStore) GetPasswordReset(ctx context.Context, token string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id FROM password_resets
		WHERE reset_token = $1 AND expires_at > NOW() AND used_at IS NULL
	`, token).Scan(&userID)
	if err == sql.ErrNoRows {
		return "", sql.ErrNoRows
	}
	if err != nil {
		return "", fmt.Errorf("get password reset: %w", err)
	}
	return userID, nil
}

// MarkPasswordResetUsed marks a password reset token as used
func (s *PostgresStore) MarkPasswordResetUsed(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE password_resets
		SET used_at = NOW()
		WHERE reset_token = $1
	`, token)
	if err != nil {
		return fmt.Errorf("mark password reset used: %w", err)
	}
	return nil
}

// InsertPermissionDenial logs a permission denial for auditing
func (s *PostgresStore) InsertPermissionDenial(ctx context.Context, d PermissionDenial) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO permission_denials (actor_id, actor_name, action, resource_type, resource_id, role, path, method)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, d.ActorID, d.ActorName, d.Action, d.ResourceType, d.ResourceID, d.Role, d.Path, d.Method)
	if err != nil {
		return fmt.Errorf("insert permission denial: %w", err)
	}
	return nil
}

// ListPermissionDenials returns recent permission denials for auditing
func (s *PostgresStore) ListPermissionDenials(ctx context.Context, actorID string, limit int) ([]PermissionDenial, error) {
	query := `SELECT id, actor_id, actor_name, action, resource_type, COALESCE(resource_id, ''), role, path, method, created_at
		FROM permission_denials`
	args := []any{}
	if actorID != "" {
		query += ` WHERE actor_id = $1`
		args = append(args, actorID)
	}
	query += ` ORDER BY created_at DESC LIMIT ` + fmt.Sprintf("%d", limit)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list permission denials: %w", err)
	}
	defer rows.Close()

	items := make([]PermissionDenial, 0)
	for rows.Next() {
		var d PermissionDenial
		if err := rows.Scan(&d.ID, &d.ActorID, &d.ActorName, &d.Action, &d.ResourceType, &d.ResourceID, &d.Role, &d.Path, &d.Method, &d.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan permission denial: %w", err)
		}
		items = append(items, d)
	}
	return items, rows.Err()
}

// GetEffectiveRole returns the effective role for a user on a document.
// Document-level permissions override workspace-level roles.
// Expired grants are ignored.
func (s *PostgresStore) GetEffectiveRole(ctx context.Context, userID, documentID string) (string, error) {
	// Check document_permissions first (non-expired)
	var docRole string
	err := s.db.QueryRowContext(ctx, `
		SELECT role FROM document_permissions
		WHERE document_id = $1 AND user_id = $2
			AND (expires_at IS NULL OR expires_at > NOW())
	`, documentID, userID).Scan(&docRole)
	if err == nil {
		return docRole, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("check document permission: %w", err)
	}

	// Fall back to workspace_memberships
	wsRole, err := s.getRole(ctx, userID)
	if err != nil {
		return "", err
	}
	return wsRole, nil
}

// ListDocumentPermissions returns all permission grants for a document
func (s *PostgresStore) ListDocumentPermissions(ctx context.Context, documentID string) ([]DocumentPermission, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT dp.id, dp.document_id, dp.user_id, dp.role, dp.granted_by, dp.granted_at, dp.expires_at,
			u.email, u.display_name
		FROM document_permissions dp
		JOIN users u ON u.id = dp.user_id
		WHERE dp.document_id = $1
		ORDER BY dp.granted_at DESC
	`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list document permissions: %w", err)
	}
	defer rows.Close()

	items := make([]DocumentPermission, 0)
	for rows.Next() {
		var dp DocumentPermission
		if err := rows.Scan(&dp.ID, &dp.DocumentID, &dp.UserID, &dp.Role, &dp.GrantedBy, &dp.GrantedAt, &dp.ExpiresAt, &dp.UserEmail, &dp.UserName); err != nil {
			return nil, fmt.Errorf("scan document permission: %w", err)
		}
		items = append(items, dp)
	}
	return items, rows.Err()
}

// UpsertDocumentPermission creates or updates a document permission grant
func (s *PostgresStore) UpsertDocumentPermission(ctx context.Context, dp DocumentPermission) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO document_permissions (document_id, user_id, role, granted_by, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (document_id, user_id) DO UPDATE SET
			role = EXCLUDED.role,
			granted_by = EXCLUDED.granted_by,
			granted_at = NOW(),
			expires_at = EXCLUDED.expires_at
	`, dp.DocumentID, dp.UserID, dp.Role, dp.GrantedBy, dp.ExpiresAt)
	if err != nil {
		return fmt.Errorf("upsert document permission: %w", err)
	}
	return nil
}

// DeleteDocumentPermission removes a document permission grant
func (s *PostgresStore) DeleteDocumentPermission(ctx context.Context, documentID, userID string) error {
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2
	`, documentID, userID)
	if err != nil {
		return fmt.Errorf("delete document permission: %w", err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ListDocumentsForExternalUser returns only documents an external user has explicit permissions for
func (s *PostgresStore) ListDocumentsForExternalUser(ctx context.Context, userID string) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.id, d.title, d.subtitle, d.status, d.space_id, d.updated_by_name, d.updated_at
		FROM documents d
		JOIN document_permissions dp ON dp.document_id = d.id
		WHERE dp.user_id = $1 AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
		ORDER BY d.updated_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list documents for external user: %w", err)
	}
	defer rows.Close()

	items := make([]Document, 0)
	for rows.Next() {
		var item Document
		if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID, &item.UpdatedBy, &item.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// =============================================================================
// Sprint 3 RBAC: Groups
// =============================================================================

// ListGroups returns all groups in a workspace
func (s *PostgresStore) ListGroups(ctx context.Context, workspaceID string) ([]Group, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, workspace_id, name, description, scim_external_id, created_at, updated_at
		FROM groups
		WHERE workspace_id = $1 AND deleted_at IS NULL
		ORDER BY name
	`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}
	defer rows.Close()

	items := make([]Group, 0)
	for rows.Next() {
		var g Group
		if err := rows.Scan(&g.ID, &g.WorkspaceID, &g.Name, &g.Description, &g.SCIMExternalID, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan group: %w", err)
		}
		items = append(items, g)
	}
	return items, rows.Err()
}

// GetGroup returns a single group by ID
func (s *PostgresStore) GetGroup(ctx context.Context, id string) (*Group, error) {
	var g Group
	err := s.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, name, description, scim_external_id, created_at, updated_at
		FROM groups
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&g.ID, &g.WorkspaceID, &g.Name, &g.Description, &g.SCIMExternalID, &g.CreatedAt, &g.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get group: %w", err)
	}
	return &g, nil
}

// InsertGroup creates a new group
func (s *PostgresStore) InsertGroup(ctx context.Context, g Group) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO groups (id, workspace_id, name, description, scim_external_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, g.ID, g.WorkspaceID, g.Name, g.Description, g.SCIMExternalID, g.CreatedAt, g.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert group: %w", err)
	}
	return nil
}

// InsertGroupReturningID creates a new group, letting the DB generate the UUID
func (s *PostgresStore) InsertGroupReturningID(ctx context.Context, g Group) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO groups (workspace_id, name, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, g.WorkspaceID, g.Name, g.Description, g.CreatedAt, g.UpdatedAt).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert group: %w", err)
	}
	return id, nil
}

// UpdateGroup updates a group's details
func (s *PostgresStore) UpdateGroup(ctx context.Context, g Group) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE groups SET name = $1, description = $2, updated_at = $3
		WHERE id = $4 AND deleted_at IS NULL
	`, g.Name, g.Description, time.Now(), g.ID)
	if err != nil {
		return fmt.Errorf("update group: %w", err)
	}
	return nil
}

// DeleteGroup soft-deletes a group
func (s *PostgresStore) DeleteGroup(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE groups SET deleted_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete group: %w", err)
	}
	return nil
}

// =============================================================================
// Sprint 3 RBAC: Group Memberships
// =============================================================================

// ListGroupMembers returns all members of a group
func (s *PostgresStore) ListGroupMembers(ctx context.Context, groupID string) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.display_name, u.email, u.role, u.is_external, u.created_at
		FROM users u
		JOIN group_memberships gm ON u.id = gm.user_id
		WHERE gm.group_id = $1
		ORDER BY u.display_name
	`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}
	defer rows.Close()

	items := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Email, &u.Role, &u.IsExternal, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		items = append(items, u)
	}
	return items, rows.Err()
}

// ListUserGroups returns all groups a user belongs to
func (s *PostgresStore) ListUserGroups(ctx context.Context, userID string) ([]Group, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT g.id, g.workspace_id, g.name, g.description, g.created_at, g.updated_at
		FROM groups g
		JOIN group_memberships gm ON g.id = gm.group_id
		WHERE gm.user_id = $1 AND g.deleted_at IS NULL
		ORDER BY g.name
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list user groups: %w", err)
	}
	defer rows.Close()

	items := make([]Group, 0)
	for rows.Next() {
		var g Group
		if err := rows.Scan(&g.ID, &g.WorkspaceID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan group: %w", err)
		}
		items = append(items, g)
	}
	return items, rows.Err()
}

// AddGroupMember adds a user to a group
func (s *PostgresStore) AddGroupMember(ctx context.Context, groupID, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO group_memberships (group_id, user_id, created_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (group_id, user_id) DO NOTHING
	`, groupID, userID)
	if err != nil {
		return fmt.Errorf("add group member: %w", err)
	}
	return nil
}

// RemoveGroupMember removes a user from a group
func (s *PostgresStore) RemoveGroupMember(ctx context.Context, groupID, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2
	`, groupID, userID)
	if err != nil {
		return fmt.Errorf("remove group member: %w", err)
	}
	return nil
}

// =============================================================================
// Sprint 3 RBAC: Unified Permissions (Space & Document)
// =============================================================================

// ListPermissions returns all permissions for a resource
func (s *PostgresStore) ListPermissions(ctx context.Context, resourceType, resourceID string) ([]PermissionWithDetails, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			p.id, p.workspace_id, p.subject_type, p.subject_id, p.resource_type, p.resource_id, p.role,
			p.granted_by, p.granted_at, p.expires_at,
			u.email as user_email, u.display_name as user_name,
			g.name as group_name,
			(SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = p.subject_id) as member_count
		FROM permissions p
		LEFT JOIN users u ON p.subject_type = 'user' AND p.subject_id = u.id
		LEFT JOIN groups g ON p.subject_type = 'group' AND p.subject_id = g.id
		WHERE p.resource_type = $1 AND p.resource_id = $2 AND p.deleted_at IS NULL
			AND (p.expires_at IS NULL OR p.expires_at > NOW())
		ORDER BY p.granted_at DESC
	`, resourceType, resourceID)
	if err != nil {
		return nil, fmt.Errorf("list permissions: %w", err)
	}
	defer rows.Close()

	items := make([]PermissionWithDetails, 0)
	for rows.Next() {
		var pd PermissionWithDetails
		if err := rows.Scan(
			&pd.ID, &pd.WorkspaceID, &pd.SubjectType, &pd.SubjectID, &pd.ResourceType, &pd.ResourceID, &pd.Role,
			&pd.GrantedBy, &pd.GrantedAt, &pd.ExpiresAt,
			&pd.UserEmail, &pd.UserName, &pd.GroupName, &pd.MemberCount,
		); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		items = append(items, pd)
	}
	return items, rows.Err()
}

// UpsertPermission creates or updates a permission grant.
// The permission ID is auto-generated by the database (UUID).
func (s *PostgresStore) UpsertPermission(ctx context.Context, p Permission) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO permissions (workspace_id, subject_type, subject_id, resource_type, resource_id, role, granted_by, granted_at, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id) DO UPDATE SET
			role = EXCLUDED.role,
			granted_by = EXCLUDED.granted_by,
			granted_at = EXCLUDED.granted_at,
			expires_at = EXCLUDED.expires_at,
			deleted_at = NULL
		RETURNING id
	`, p.WorkspaceID, p.SubjectType, p.SubjectID, p.ResourceType, p.ResourceID, p.Role, p.GrantedBy, p.GrantedAt, p.ExpiresAt).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("upsert permission: %w", err)
	}
	return id, nil
}

// DeletePermission soft-deletes a permission grant
func (s *PostgresStore) DeletePermission(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE permissions SET deleted_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete permission: %w", err)
	}
	return nil
}

// GetEffectivePermission returns the effective permission for a user on a resource
func (s *PostgresStore) GetEffectivePermission(ctx context.Context, userID, resourceType, resourceID string) (*EffectivePermission, error) {
	var ep EffectivePermission
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id, resource_type, resource_id, workspace_id, role, computed_at
		FROM mv_effective_permissions
		WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3
	`, userID, resourceType, resourceID).Scan(
		&ep.UserID, &ep.ResourceType, &ep.ResourceID, &ep.WorkspaceID, &ep.Role, &ep.ComputedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get effective permission: %w", err)
	}
	return &ep, nil
}

// RefreshEffectivePermissions manually refreshes the materialized view
func (s *PostgresStore) RefreshEffectivePermissions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_effective_permissions`)
	if err != nil {
		return fmt.Errorf("refresh effective permissions: %w", err)
	}
	return nil
}

// =============================================================================
// Sprint 3 RBAC: Public Links
// =============================================================================

// GetPublicLinkByToken returns a public link by its token
func (s *PostgresStore) GetPublicLinkByToken(ctx context.Context, token string) (*PublicLink, error) {
	var pl PublicLink
	err := s.db.QueryRowContext(ctx, `
		SELECT id, token, document_id, created_by, role, password_hash, expires_at, access_count, last_accessed_at, created_at, revoked_at
		FROM public_links
		WHERE token = $1 AND revoked_at IS NULL
			AND (expires_at IS NULL OR expires_at > NOW())
	`, token).Scan(
		&pl.ID, &pl.Token, &pl.DocumentID, &pl.CreatedBy, &pl.Role, &pl.PasswordHash,
		&pl.ExpiresAt, &pl.AccessCount, &pl.LastAccessedAt, &pl.CreatedAt, &pl.RevokedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get public link: %w", err)
	}
	return &pl, nil
}

// ListPublicLinks returns all active public links for a document
func (s *PostgresStore) ListPublicLinks(ctx context.Context, documentID string) ([]PublicLink, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, token, document_id, created_by, role, expires_at, access_count, last_accessed_at, created_at
		FROM public_links
		WHERE document_id = $1 AND revoked_at IS NULL
			AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY created_at DESC
	`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list public links: %w", err)
	}
	defer rows.Close()

	items := make([]PublicLink, 0)
	for rows.Next() {
		var pl PublicLink
		if err := rows.Scan(&pl.ID, &pl.Token, &pl.DocumentID, &pl.CreatedBy, &pl.Role, &pl.ExpiresAt, &pl.AccessCount, &pl.LastAccessedAt, &pl.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan public link: %w", err)
		}
		items = append(items, pl)
	}
	return items, rows.Err()
}

// InsertPublicLink creates a new public link. ID is auto-generated by the database (UUID).
func (s *PostgresStore) InsertPublicLink(ctx context.Context, pl PublicLink) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO public_links (token, document_id, created_by, role, password_hash, expires_at, access_count, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`, pl.Token, pl.DocumentID, pl.CreatedBy, pl.Role, pl.PasswordHash, pl.ExpiresAt, pl.AccessCount, pl.CreatedAt).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert public link: %w", err)
	}
	return id, nil
}

// RevokePublicLink marks a public link as revoked
func (s *PostgresStore) RevokePublicLink(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE public_links SET revoked_at = NOW() WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("revoke public link: %w", err)
	}
	return nil
}

// IncrementPublicLinkAccess updates the access count and last accessed time
func (s *PostgresStore) IncrementPublicLinkAccess(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE public_links 
		SET access_count = access_count + 1, last_accessed_at = NOW() 
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("increment public link access: %w", err)
	}
	return nil
}

// =============================================================================
// Sprint 3 RBAC: Guest User Helpers
// =============================================================================

// ListGuestUsers returns all guest users for a space
func (s *PostgresStore) ListGuestUsers(ctx context.Context, spaceID string) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, display_name, email, role, created_at, external_expires_at
		FROM users
		WHERE is_external = true AND external_space_id = $1
		ORDER BY created_at DESC
	`, spaceID)
	if err != nil {
		return nil, fmt.Errorf("list guest users: %w", err)
	}
	defer rows.Close()

	items := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Email, &u.Role, &u.CreatedAt, &u.VerificationExpiresAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		items = append(items, u)
	}
	return items, rows.Err()
}

// CreateGuestUser inserts a new external/guest user scoped to a single space
func (s *PostgresStore) CreateGuestUser(ctx context.Context, user User, spaceID string, expiresAt *time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, display_name, email, role, is_external, external_space_id, external_expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, true, $5, $6, NOW(), NOW())
	`, user.ID, user.DisplayName, user.Email, user.Role, spaceID, expiresAt)
	if err != nil {
		return fmt.Errorf("create guest user: %w", err)
	}
	return nil
}

// UpdateDocumentShareMode updates the share_mode column on a document
func (s *PostgresStore) UpdateDocumentShareMode(ctx context.Context, documentID, mode string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE documents SET share_mode = $1 WHERE id = $2
	`, mode, documentID)
	if err != nil {
		return fmt.Errorf("update document share mode: %w", err)
	}
	return nil
}

// RemoveGuestUser removes a guest user's space access
func (s *PostgresStore) RemoveGuestUser(ctx context.Context, userID string) error {
	// Soft-delete approach: mark as deleted
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET is_external = false, external_space_id = NULL WHERE id = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("remove guest user: %w", err)
	}
	return nil
}

// =============================================================================
// Admin User Management
// =============================================================================

// ListWorkspaceUsers returns paginated workspace users with optional search
func (s *PostgresStore) ListWorkspaceUsers(ctx context.Context, workspaceID, search string, limit, offset int) ([]User, int, error) {
	baseWhere := "WHERE (wm.workspace_id = $1 OR wm.workspace_id IS NULL)"
	args := []any{workspaceID}
	argIdx := 2

	if search != "" {
		baseWhere += fmt.Sprintf(" AND (u.display_name ILIKE $%d OR u.email ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	// Count total
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM users u
		JOIN workspace_memberships wm ON u.id = wm.user_id
		%s
	`, baseWhere)
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count workspace users: %w", err)
	}

	// Fetch page
	query := fmt.Sprintf(`
		SELECT u.id, u.display_name, u.email, COALESCE(wm.role, u.role) as role,
			u.is_external, u.deactivated_at, u.created_at
		FROM users u
		JOIN workspace_memberships wm ON u.id = wm.user_id
		%s
		ORDER BY u.display_name
		LIMIT $%d OFFSET $%d
	`, baseWhere, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list workspace users: %w", err)
	}
	defer rows.Close()

	items := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Email, &u.Role, &u.IsExternal, &u.DeactivatedAt, &u.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		items = append(items, u)
	}
	return items, total, rows.Err()
}

// UpdateUserRole updates a user's role within a workspace
func (s *PostgresStore) UpdateUserRole(ctx context.Context, userID, workspaceID, role string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE workspace_memberships SET role = $1
		WHERE user_id = $2 AND (workspace_id = $3 OR workspace_id IS NULL)
	`, role, userID, workspaceID)
	if err != nil {
		return fmt.Errorf("update user role: %w", err)
	}
	return nil
}

// SetUserDeactivated sets or clears the deactivated_at timestamp for a user
func (s *PostgresStore) SetUserDeactivated(ctx context.Context, userID string, deactivated bool) error {
	var query string
	if deactivated {
		query = `UPDATE users SET deactivated_at = NOW() WHERE id = $1`
	} else {
		query = `UPDATE users SET deactivated_at = NULL WHERE id = $1`
	}
	_, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("set user deactivated: %w", err)
	}
	return nil
}

// CreateSpaceWithPermissions creates a space and its initial permissions in a transaction
func (s *PostgresStore) CreateSpaceWithPermissions(ctx context.Context, space Space, permissions []Permission) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	vis := space.Visibility
	if vis == "" {
		vis = "organization"
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO spaces (id, workspace_id, name, slug, description, visibility, sort_order, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
	`, space.ID, space.WorkspaceID, space.Name, space.Slug, space.Description, vis, space.SortOrder)
	if err != nil {
		return fmt.Errorf("insert space: %w", err)
	}

	for _, p := range permissions {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO permissions (workspace_id, subject_type, subject_id, resource_type, resource_id, role, granted_by, granted_at, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, p.WorkspaceID, p.SubjectType, p.SubjectID, p.ResourceType, p.ResourceID, p.Role, p.GrantedBy, p.GrantedAt, p.ExpiresAt)
		if err != nil {
			return fmt.Errorf("insert permission: %w", err)
		}
	}

	return tx.Commit()
}

// =============================================================================
// Approval Workflow V2
// =============================================================================

func (s *PostgresStore) ListApprovalGroups(ctx context.Context, documentID string) ([]ApprovalGroup, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, document_id, name, COALESCE(description, ''), min_approvals, sort_order, created_at, updated_at
		FROM approval_groups
		WHERE document_id = $1
		ORDER BY sort_order ASC
	`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list approval groups: %w", err)
	}
	defer rows.Close()

	var groups []ApprovalGroup
	for rows.Next() {
		var g ApprovalGroup
		if err := rows.Scan(&g.ID, &g.DocumentID, &g.Name, &g.Description, &g.MinApprovals, &g.SortOrder, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan approval group: %w", err)
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

func (s *PostgresStore) ListApprovalGroupMembers(ctx context.Context, groupID string) ([]ApprovalGroupMember, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT agm.id, agm.group_id, agm.user_id, u.display_name, COALESCE(u.email, ''), agm.created_at
		FROM approval_group_members agm
		JOIN users u ON u.id = agm.user_id
		WHERE agm.group_id = $1
		ORDER BY u.display_name ASC
	`, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}
	defer rows.Close()

	var members []ApprovalGroupMember
	for rows.Next() {
		var m ApprovalGroupMember
		if err := rows.Scan(&m.ID, &m.GroupID, &m.UserID, &m.DisplayName, &m.Email, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan group member: %w", err)
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (s *PostgresStore) SaveApprovalRules(ctx context.Context, documentID string, groups []ApprovalGroup, membersByGroup map[string][]string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Delete existing groups (cascade deletes members)
	if _, err := tx.ExecContext(ctx, `DELETE FROM approval_groups WHERE document_id = $1`, documentID); err != nil {
		return fmt.Errorf("delete old groups: %w", err)
	}

	// Insert new groups
	for _, g := range groups {
		var groupID string
		err := tx.QueryRowContext(ctx, `
			INSERT INTO approval_groups (document_id, name, description, min_approvals, sort_order)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`, documentID, g.Name, g.Description, g.MinApprovals, g.SortOrder).Scan(&groupID)
		if err != nil {
			return fmt.Errorf("insert group %q: %w", g.Name, err)
		}

		// Insert members for this group using the client-side temp ID
		memberUserIDs := membersByGroup[g.ID]
		for _, userID := range memberUserIDs {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO approval_group_members (group_id, user_id) VALUES ($1, $2::uuid)
			`, groupID, userID); err != nil {
				return fmt.Errorf("insert member for group %q: %w", g.Name, err)
			}
		}
	}

	return tx.Commit()
}

func (s *PostgresStore) ListProposalApprovals(ctx context.Context, proposalID string) ([]ProposalApproval, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT pa.id, pa.proposal_id, COALESCE(pa.group_id::text, ''), pa.approved_by::text,
		       COALESCE(u.display_name, ''), pa.commit_hash, pa.status, COALESCE(pa.comment, ''), pa.created_at
		FROM proposal_approvals pa
		LEFT JOIN users u ON u.id = pa.approved_by
		WHERE pa.proposal_id = $1
		ORDER BY pa.created_at ASC
	`, proposalID)
	if err != nil {
		return nil, fmt.Errorf("list proposal approvals: %w", err)
	}
	defer rows.Close()

	var approvals []ProposalApproval
	for rows.Next() {
		var a ProposalApproval
		if err := rows.Scan(&a.ID, &a.ProposalID, &a.GroupID, &a.ApprovedBy, &a.ApprovedByName, &a.CommitHash, &a.Status, &a.Comment, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan proposal approval: %w", err)
		}
		approvals = append(approvals, a)
	}
	return approvals, rows.Err()
}

func (s *PostgresStore) UpsertProposalApproval(ctx context.Context, proposalID, groupID, userID, commitHash, status, comment string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO proposal_approvals (proposal_id, group_id, approved_by, commit_hash, status, comment)
		VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6)
		ON CONFLICT (proposal_id, approved_by) DO UPDATE
		SET group_id = $2::uuid, commit_hash = $4, status = $5, comment = $6, created_at = NOW()
	`, proposalID, groupID, userID, commitHash, status, comment)
	if err != nil {
		return fmt.Errorf("upsert proposal approval: %w", err)
	}
	return nil
}
