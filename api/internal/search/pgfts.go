package search

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// PgFTS implements Searcher using PostgreSQL full-text search as a fallback.
type PgFTS struct {
	db *sql.DB
}

// NewPgFTS creates a PostgreSQL FTS searcher.
func NewPgFTS(db *sql.DB) *PgFTS {
	return &PgFTS{db: db}
}

// Healthy always returns true — if Postgres is down, the whole app is down.
func (p *PgFTS) Healthy() bool {
	return true
}

// Search executes a UNION ALL query across documents, threads, and decision_log
// using plainto_tsquery and ts_rank, with ts_headline for snippets.
func (p *PgFTS) Search(q Query) ([]Result, int, error) {
	if strings.TrimSpace(q.Text) == "" {
		return nil, 0, nil
	}

	limit := q.Limit
	if limit <= 0 {
		limit = 20
	}
	offset := q.Offset
	if offset < 0 {
		offset = 0
	}

	tsQuery := "plainto_tsquery('english', $1)"
	args := []any{q.Text}
	argN := 2

	var subQueries []string

	// Documents sub-query
	if q.FilterType == "" || q.FilterType == ResultDocument {
		docWhere := "d.fts @@ " + tsQuery
		if q.FilterSpaceID != "" {
			docWhere += fmt.Sprintf(" AND d.space_id = $%d", argN)
			args = append(args, q.FilterSpaceID)
			argN++
		}
		subQueries = append(subQueries, fmt.Sprintf(`
			SELECT 'document'::text AS type, d.id, d.title,
				ts_headline('english', coalesce(d.subtitle, ''), %s, 'MaxFragments=1,MaxWords=30') AS snippet,
				d.id AS document_id, d.space_id,
				''::text AS visibility,
				ts_rank(d.fts, %s) AS rank
			FROM documents d
			WHERE %s`, tsQuery, tsQuery, docWhere))
	}

	// Threads sub-query
	if q.FilterType == "" || q.FilterType == ResultThread {
		threadWhere := "t.fts @@ " + tsQuery
		if q.FilterSpaceID != "" {
			threadWhere += fmt.Sprintf(" AND d.space_id = $%d", argN)
			args = append(args, q.FilterSpaceID)
			argN++
		}
		if q.IsExternal {
			threadWhere += " AND t.visibility = 'EXTERNAL'"
		}
		subQueries = append(subQueries, fmt.Sprintf(`
			SELECT 'thread'::text AS type, t.id, t.anchor_label AS title,
				ts_headline('english', coalesce(t.body, ''), %s, 'MaxFragments=1,MaxWords=30') AS snippet,
				p.document_id, d.space_id,
				t.visibility,
				ts_rank(t.fts, %s) AS rank
			FROM threads t
			JOIN proposals p ON p.id = t.proposal_id
			JOIN documents d ON d.id = p.document_id
			WHERE %s`, tsQuery, tsQuery, threadWhere))
	}

	// Decision log sub-query
	if q.FilterType == "" || q.FilterType == ResultDecision {
		decWhere := "dl.fts @@ " + tsQuery
		if q.FilterSpaceID != "" {
			decWhere += fmt.Sprintf(" AND d.space_id = $%d", argN)
			args = append(args, q.FilterSpaceID)
			argN++
		}
		subQueries = append(subQueries, fmt.Sprintf(`
			SELECT 'decision'::text AS type, dl.id::text, dl.outcome AS title,
				ts_headline('english', coalesce(dl.rationale, ''), %s, 'MaxFragments=1,MaxWords=30') AS snippet,
				dl.document_id, d.space_id,
				''::text AS visibility,
				ts_rank(dl.fts, %s) AS rank
			FROM decision_log dl
			JOIN documents d ON d.id = dl.document_id
			WHERE %s`, tsQuery, tsQuery, decWhere))
	}

	if len(subQueries) == 0 {
		return nil, 0, nil
	}

	// Count query
	countSQL := fmt.Sprintf("SELECT count(*) FROM (%s) sub",
		strings.Join(subQueries, " UNION ALL "))

	// Data query
	dataSQL := fmt.Sprintf(`SELECT type, id, title, snippet, document_id, space_id, visibility
		FROM (%s) sub
		ORDER BY rank DESC
		LIMIT %d OFFSET %d`,
		strings.Join(subQueries, " UNION ALL "),
		limit, offset)

	ctx := context.Background()

	var total int
	if err := p.db.QueryRowContext(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("pgfts count: %w", err)
	}

	rows, err := p.db.QueryContext(ctx, dataSQL, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("pgfts query: %w", err)
	}
	defer rows.Close()

	var results []Result
	for rows.Next() {
		var r Result
		var typ string
		if err := rows.Scan(&typ, &r.ID, &r.Title, &r.Snippet, &r.DocumentID, &r.SpaceID, &r.Visibility); err != nil {
			return nil, 0, fmt.Errorf("pgfts scan: %w", err)
		}
		r.Type = ResultType(typ)
		results = append(results, r)
	}

	return results, total, rows.Err()
}

// LoadAllRecords returns all searchable records for full reindexing.
func (p *PgFTS) LoadAllRecords(ctx context.Context) ([]DocumentRecord, []ThreadRecord, []DecisionRecord, error) {
	docRows, err := p.db.QueryContext(ctx, `
		SELECT id, title, subtitle, space_id, status
		FROM documents
	`)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load documents: %w", err)
	}
	defer docRows.Close()

	documents := make([]DocumentRecord, 0)
	for docRows.Next() {
		var d DocumentRecord
		if err := docRows.Scan(&d.ID, &d.Title, &d.Subtitle, &d.SpaceID, &d.Status); err != nil {
			return nil, nil, nil, fmt.Errorf("scan document: %w", err)
		}
		documents = append(documents, d)
	}
	if err := docRows.Err(); err != nil {
		return nil, nil, nil, fmt.Errorf("iterate documents: %w", err)
	}

	threadRows, err := p.db.QueryContext(ctx, `
		SELECT t.id, t.body, t.anchor_label, p.document_id, d.space_id, t.visibility, t.status, t.type
		FROM threads t
		JOIN proposals p ON p.id = t.proposal_id
		JOIN documents d ON d.id = p.document_id
	`)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load threads: %w", err)
	}
	defer threadRows.Close()

	threads := make([]ThreadRecord, 0)
	for threadRows.Next() {
		var t ThreadRecord
		if err := threadRows.Scan(&t.ID, &t.Body, &t.AnchorLabel, &t.DocumentID, &t.SpaceID, &t.Visibility, &t.Status, &t.Type); err != nil {
			return nil, nil, nil, fmt.Errorf("scan thread: %w", err)
		}
		threads = append(threads, t)
	}
	if err := threadRows.Err(); err != nil {
		return nil, nil, nil, fmt.Errorf("iterate threads: %w", err)
	}

	decisionRows, err := p.db.QueryContext(ctx, `
		SELECT dl.id::text, dl.rationale, dl.outcome, dl.document_id, d.space_id
		FROM decision_log dl
		JOIN documents d ON d.id = dl.document_id
	`)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load decisions: %w", err)
	}
	defer decisionRows.Close()

	decisions := make([]DecisionRecord, 0)
	for decisionRows.Next() {
		var d DecisionRecord
		if err := decisionRows.Scan(&d.ID, &d.Rationale, &d.Outcome, &d.DocumentID, &d.SpaceID); err != nil {
			return nil, nil, nil, fmt.Errorf("scan decision: %w", err)
		}
		decisions = append(decisions, d)
	}
	if err := decisionRows.Err(); err != nil {
		return nil, nil, nil, fmt.Errorf("iterate decisions: %w", err)
	}

	return documents, threads, decisions, nil
}
