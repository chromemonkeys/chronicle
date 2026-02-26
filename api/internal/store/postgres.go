package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
		SELECT id, title, subtitle, status, space_id, updated_by_name, updated_at
		FROM documents
		WHERE id=$1
	`, documentID).Scan(&item.ID, &item.Title, &item.Subtitle, &item.Status, &item.SpaceID, &item.UpdatedBy, &item.UpdatedAt)
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
		SELECT id, workspace_id, name, slug, description, sort_order, created_at, updated_at
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
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt); err != nil {
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
		SELECT id, workspace_id, name, slug, description, sort_order, created_at, updated_at
		FROM spaces
		WHERE id=$1
	`, spaceID).Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Slug, &item.Description, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return Space{}, fmt.Errorf("get space: %w", err)
	}
	return item, nil
}

func (s *PostgresStore) InsertSpace(ctx context.Context, space Space) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO spaces (id, workspace_id, name, slug, description, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, space.ID, space.WorkspaceID, space.Name, space.Slug, space.Description, space.SortOrder)
	if err != nil {
		return fmt.Errorf("insert space: %w", err)
	}
	return nil
}

func (s *PostgresStore) UpdateSpace(ctx context.Context, spaceID, name, description string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE spaces SET name=$2, description=$3, updated_at=NOW()
		WHERE id=$1
	`, spaceID, name, description)
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

// Ping verifies the database connection is alive
func (s *PostgresStore) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}
