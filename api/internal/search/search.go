package search

// ResultType identifies the kind of entity in a search result.
type ResultType string

const (
	ResultDocument ResultType = "document"
	ResultThread   ResultType = "thread"
	ResultDecision ResultType = "decision"
)

// Result is a single search hit returned to the caller.
type Result struct {
	Type       ResultType `json:"type"`
	ID         string     `json:"id"`
	Title      string     `json:"title"`
	Snippet    string     `json:"snippet"`
	DocumentID string     `json:"documentId"`
	SpaceID    string     `json:"spaceId"`
	Visibility string     `json:"visibility,omitempty"`
}

// Query describes a search request.
type Query struct {
	Text          string
	FilterType    ResultType // empty = all types
	FilterSpaceID string
	Limit         int
	Offset        int
	IsExternal    bool
}

// Response is the envelope returned by the search endpoint.
type Response struct {
	Results []Result `json:"results"`
	Total   int      `json:"total"`
	Query   string   `json:"query"`
}

// Searcher can execute a full-text search.
type Searcher interface {
	Search(q Query) ([]Result, int, error)
	Healthy() bool
}

// Indexer can push entities into a search index.
type Indexer interface {
	IndexDocument(doc DocumentRecord) error
	IndexThread(t ThreadRecord) error
	IndexDecision(d DecisionRecord) error
	DeleteDocument(id string) error
	DeleteThread(id string) error
}

// DocumentRecord is the data we index for a document.
type DocumentRecord struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	SpaceID  string `json:"spaceId"`
	Status   string `json:"status"`
}

// ThreadRecord is the data we index for a thread.
type ThreadRecord struct {
	ID          string `json:"id"`
	Body        string `json:"body"`
	AnchorLabel string `json:"anchorLabel"`
	DocumentID  string `json:"documentId"`
	SpaceID     string `json:"spaceId"`
	Visibility  string `json:"visibility"`
	Status      string `json:"status"`
	Type        string `json:"type"`
}

// DecisionRecord is the data we index for a decision log entry.
type DecisionRecord struct {
	ID         string `json:"id"`
	Rationale  string `json:"rationale"`
	Outcome    string `json:"outcome"`
	DocumentID string `json:"documentId"`
	SpaceID    string `json:"spaceId"`
}
