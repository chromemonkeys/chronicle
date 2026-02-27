package search

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync/atomic"
	"time"

	meili "github.com/meilisearch/meilisearch-go"
)

const (
	idxDocuments = "chronicle_documents"
	idxThreads   = "chronicle_threads"
	idxDecisions = "chronicle_decisions"
)

// Meili implements Searcher and Indexer via Meilisearch.
type Meili struct {
	client  meili.ServiceManager
	healthy atomic.Bool
	done    chan struct{}
}

// NewMeili creates a Meilisearch client and configures indexes.
// Returns nil if the initial connection fails (caller should proceed without it).
func NewMeili(url, apiKey string) *Meili {
	client := meili.New(url, meili.WithAPIKey(apiKey))

	m := &Meili{
		client: client,
		done:   make(chan struct{}),
	}

	// Initial health check
	if _, err := client.Health(); err != nil {
		log.Printf("search: meilisearch unavailable at %s: %v", url, err)
		m.healthy.Store(false)
	} else {
		m.healthy.Store(true)
		m.configureIndexes()
	}

	go m.healthLoop()
	return m
}

func (m *Meili) configureIndexes() {
	indexes := []struct {
		uid        string
		primaryKey string
		filterable []string
		searchable []string
	}{
		{
			uid:        idxDocuments,
			primaryKey: "id",
			filterable: []string{"spaceId", "status"},
			searchable: []string{"title", "subtitle"},
		},
		{
			uid:        idxThreads,
			primaryKey: "id",
			filterable: []string{"spaceId", "visibility", "status", "type", "documentId"},
			searchable: []string{"body", "anchorLabel"},
		},
		{
			uid:        idxDecisions,
			primaryKey: "id",
			filterable: []string{"spaceId", "outcome", "documentId"},
			searchable: []string{"rationale"},
		},
	}

	for _, idx := range indexes {
		if _, err := m.client.CreateIndex(&meili.IndexConfig{
			Uid:        idx.uid,
			PrimaryKey: idx.primaryKey,
		}); err != nil {
			log.Printf("search: create index %s (may already exist): %v", idx.uid, err)
		}

		index := m.client.Index(idx.uid)
		filterableInterface := make([]interface{}, len(idx.filterable))
		for i, v := range idx.filterable {
			filterableInterface[i] = v
		}
		if _, err := index.UpdateFilterableAttributes(&filterableInterface); err != nil {
			log.Printf("search: update filterable attrs for %s: %v", idx.uid, err)
		}
		if _, err := index.UpdateSearchableAttributes(&idx.searchable); err != nil {
			log.Printf("search: update searchable attrs for %s: %v", idx.uid, err)
		}
	}
}

func (m *Meili) healthLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-m.done:
			return
		case <-ticker.C:
			_, err := m.client.Health()
			wasHealthy := m.healthy.Load()
			m.healthy.Store(err == nil)
			if err == nil && !wasHealthy {
				log.Println("search: meilisearch recovered, reconfiguring indexes")
				m.configureIndexes()
			}
		}
	}
}

// Close stops the background health monitor.
func (m *Meili) Close() {
	close(m.done)
}

// Healthy reports whether Meilisearch is reachable.
func (m *Meili) Healthy() bool {
	return m.healthy.Load()
}

// Search queries all three indexes (or a filtered subset) and merges results.
func (m *Meili) Search(q Query) ([]Result, int, error) {
	if !m.healthy.Load() {
		return nil, 0, fmt.Errorf("meilisearch unhealthy")
	}

	limit := int64(q.Limit)
	if limit == 0 {
		limit = 20
	}

	var queries []*meili.SearchRequest
	targetIndexes := []struct {
		uid  string
		rtyp ResultType
	}{
		{idxDocuments, ResultDocument},
		{idxThreads, ResultThread},
		{idxDecisions, ResultDecision},
	}

	for _, ti := range targetIndexes {
		if q.FilterType != "" && q.FilterType != ti.rtyp {
			continue
		}
		sr := &meili.SearchRequest{
			IndexUID:              ti.uid,
			Limit:                 limit,
			Offset:                int64(q.Offset),
			AttributesToHighlight: []string{"*"},
			HighlightPreTag:       "<mark>",
			HighlightPostTag:      "</mark>",
			ShowRankingScore:      true,
		}

		var filters []string
		if q.FilterSpaceID != "" {
			filters = append(filters, fmt.Sprintf("spaceId = %q", q.FilterSpaceID))
		}
		if q.IsExternal && ti.rtyp == ResultThread {
			filters = append(filters, "visibility = \"EXTERNAL\"")
		}
		if len(filters) > 0 {
			sr.Filter = filters
		}
		queries = append(queries, sr)
	}

	if len(queries) == 0 {
		return nil, 0, nil
	}

	resp, err := m.client.MultiSearch(&meili.MultiSearchRequest{
		Queries: queries,
	})
	if err != nil {
		m.healthy.Store(false)
		return nil, 0, fmt.Errorf("meilisearch multi-search: %w", err)
	}

	var results []Result
	total := 0
	for _, sr := range resp.Results {
		total += int(sr.EstimatedTotalHits)
		rtyp := indexToResultType(sr.IndexUID)
		for _, hit := range sr.Hits {
			results = append(results, hitToResult(hit, rtyp))
		}
	}

	return results, total, nil
}

func indexToResultType(uid string) ResultType {
	switch uid {
	case idxDocuments:
		return ResultDocument
	case idxThreads:
		return ResultThread
	case idxDecisions:
		return ResultDecision
	default:
		return ""
	}
}

func hitToResult(hit meili.Hit, rtyp ResultType) Result {
	r := Result{Type: rtyp}
	r.ID = decodeString(hit, "id")
	r.DocumentID = decodeString(hit, "documentId")
	r.SpaceID = decodeString(hit, "spaceId")
	r.Visibility = decodeString(hit, "visibility")

	switch rtyp {
	case ResultDocument:
		r.Title = firstNonBlank(decodeFormattedString(hit, "title"), decodeString(hit, "title"))
		r.Snippet = firstNonBlank(decodeFormattedString(hit, "subtitle"), decodeString(hit, "subtitle"))
		r.DocumentID = r.ID // document's own ID
	case ResultThread:
		r.Title = firstNonBlank(decodeFormattedString(hit, "anchorLabel"), decodeString(hit, "anchorLabel"))
		r.Snippet = firstNonBlank(decodeFormattedString(hit, "body"), decodeString(hit, "body"))
	case ResultDecision:
		r.Title = firstNonBlank(decodeFormattedString(hit, "outcome"), decodeString(hit, "outcome"))
		r.Snippet = firstNonBlank(decodeFormattedString(hit, "rationale"), decodeString(hit, "rationale"))
	}
	return r
}

func decodeString(hit meili.Hit, key string) string {
	raw, ok := hit[key]
	if !ok {
		return ""
	}

	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	return ""
}

func decodeFormattedString(hit meili.Hit, key string) string {
	raw, ok := hit["_formatted"]
	if !ok {
		return ""
	}
	var formatted map[string]string
	if err := json.Unmarshal(raw, &formatted); err != nil {
		return ""
	}
	return strings.TrimSpace(formatted[key])
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// IndexDocument adds or updates a document in the search index.
func (m *Meili) IndexDocument(doc DocumentRecord) error {
	_, err := m.client.Index(idxDocuments).AddDocuments([]DocumentRecord{doc}, nil)
	return err
}

// IndexThread adds or updates a thread in the search index.
func (m *Meili) IndexThread(t ThreadRecord) error {
	_, err := m.client.Index(idxThreads).AddDocuments([]ThreadRecord{t}, nil)
	return err
}

// IndexDecision adds or updates a decision in the search index.
func (m *Meili) IndexDecision(d DecisionRecord) error {
	_, err := m.client.Index(idxDecisions).AddDocuments([]DecisionRecord{d}, nil)
	return err
}

// DeleteDocument removes a document from the search index.
func (m *Meili) DeleteDocument(id string) error {
	_, err := m.client.Index(idxDocuments).DeleteDocument(id, nil)
	return err
}

// DeleteThread removes a thread from the search index.
func (m *Meili) DeleteThread(id string) error {
	_, err := m.client.Index(idxThreads).DeleteDocument(id, nil)
	return err
}

// IndexDocuments bulk-indexes documents.
func (m *Meili) IndexDocuments(documents []DocumentRecord) error {
	if len(documents) == 0 {
		return nil
	}
	_, err := m.client.Index(idxDocuments).AddDocuments(documents, nil)
	return err
}

// IndexThreads bulk-indexes threads.
func (m *Meili) IndexThreads(threads []ThreadRecord) error {
	if len(threads) == 0 {
		return nil
	}
	_, err := m.client.Index(idxThreads).AddDocuments(threads, nil)
	return err
}

// IndexDecisions bulk-indexes decision records.
func (m *Meili) IndexDecisions(decisions []DecisionRecord) error {
	if len(decisions) == 0 {
		return nil
	}
	_, err := m.client.Index(idxDecisions).AddDocuments(decisions, nil)
	return err
}
