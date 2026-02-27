package search

import (
	"context"
	"log"
)

// Service is the facade that tries Meilisearch first and falls back to PG FTS.
type Service struct {
	meili *Meili
	pgfts *PgFTS
}

// NewService creates a search service. meili may be nil if Meilisearch is not configured.
func NewService(meili *Meili, pgfts *PgFTS) *Service {
	return &Service{meili: meili, pgfts: pgfts}
}

// Search tries Meilisearch if healthy, otherwise falls back to PG FTS.
func (s *Service) Search(q Query) Response {
	if s.meili != nil && s.meili.Healthy() {
		results, total, err := s.meili.Search(q)
		if err == nil {
			return Response{Results: sanitizeResults(nonNil(results), q.IsExternal), Total: total, Query: q.Text}
		}
		log.Printf("search: meilisearch error, falling back to pgfts: %v", err)
	}

	results, total, err := s.pgfts.Search(q)
	if err != nil {
		log.Printf("search: pgfts error: %v", err)
		return Response{Results: []Result{}, Total: 0, Query: q.Text}
	}
	return Response{Results: sanitizeResults(nonNil(results), q.IsExternal), Total: total, Query: q.Text}
}

// IndexDocument indexes a document (fire-and-forget to Meilisearch).
func (s *Service) IndexDocument(doc DocumentRecord) {
	if s.meili == nil || !s.meili.Healthy() {
		return
	}
	go func() {
		if err := s.meili.IndexDocument(doc); err != nil {
			log.Printf("search: index document %s: %v", doc.ID, err)
		}
	}()
}

// IndexThread indexes a thread (fire-and-forget to Meilisearch).
func (s *Service) IndexThread(t ThreadRecord) {
	if s.meili == nil || !s.meili.Healthy() {
		return
	}
	go func() {
		if err := s.meili.IndexThread(t); err != nil {
			log.Printf("search: index thread %s: %v", t.ID, err)
		}
	}()
}

// IndexDecision indexes a decision log entry (fire-and-forget to Meilisearch).
func (s *Service) IndexDecision(d DecisionRecord) {
	if s.meili == nil || !s.meili.Healthy() {
		return
	}
	go func() {
		if err := s.meili.IndexDecision(d); err != nil {
			log.Printf("search: index decision %s: %v", d.ID, err)
		}
	}()
}

// DeleteDocument removes a document from the search index (fire-and-forget).
func (s *Service) DeleteDocument(id string) {
	if s.meili == nil || !s.meili.Healthy() {
		return
	}
	go func() {
		if err := s.meili.DeleteDocument(id); err != nil {
			log.Printf("search: delete document %s: %v", id, err)
		}
	}()
}

// DeleteThread removes a thread from the search index (fire-and-forget).
func (s *Service) DeleteThread(id string) {
	if s.meili == nil || !s.meili.Healthy() {
		return
	}
	go func() {
		if err := s.meili.DeleteThread(id); err != nil {
			log.Printf("search: delete thread %s: %v", id, err)
		}
	}()
}

// ReindexAll reads all entities from PG and pushes them to Meilisearch.
// Called during Bootstrap if Meilisearch is healthy and indexes are empty.
func (s *Service) ReindexAll(documents []DocumentRecord, threads []ThreadRecord, decisions []DecisionRecord) {
	if s.meili == nil || !s.meili.Healthy() {
		return
	}

	if len(documents) > 0 {
		if err := s.meili.IndexDocuments(documents); err != nil {
			log.Printf("search: reindex documents: %v", err)
		}
	}
	if len(threads) > 0 {
		if err := s.meili.IndexThreads(threads); err != nil {
			log.Printf("search: reindex threads: %v", err)
		}
	}
	if len(decisions) > 0 {
		if err := s.meili.IndexDecisions(decisions); err != nil {
			log.Printf("search: reindex decisions: %v", err)
		}
	}
}

// ReindexAllFromPG reindexes all searchable entities from PostgreSQL into Meilisearch.
func (s *Service) ReindexAllFromPG(ctx context.Context) {
	if s.meili == nil || !s.meili.Healthy() || s.pgfts == nil {
		return
	}
	documents, threads, decisions, err := s.pgfts.LoadAllRecords(ctx)
	if err != nil {
		log.Printf("search: reindex load failed: %v", err)
		return
	}
	s.ReindexAll(documents, threads, decisions)
}

func nonNil(r []Result) []Result {
	if r == nil {
		return []Result{}
	}
	return r
}

func sanitizeResults(results []Result, isExternal bool) []Result {
	if !isExternal {
		return results
	}
	filtered := make([]Result, 0, len(results))
	for _, result := range results {
		if result.Type == ResultThread && result.Visibility == "INTERNAL" {
			continue
		}
		filtered = append(filtered, result)
	}
	return filtered
}
