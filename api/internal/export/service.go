package export

import (
	"context"
	"fmt"
	"html/template"
)

// DataStore defines the interface for data access
type DataStore interface {
	GetDocument(ctx context.Context, id string) (DocumentInfo, error)
	GetSpace(ctx context.Context, id string) (SpaceInfo, error)
	ListThreads(ctx context.Context, documentID string) ([]ThreadInfo, error)
	ListThreadReplies(ctx context.Context, threadID string) ([]ReplyInfo, error)
	GetDocumentContent(ctx context.Context, documentID, version string) (interface{}, error)
}

// DocumentInfo holds basic document metadata
type DocumentInfo struct {
	ID        string
	Title     string
	Subtitle  string
	Status    string
	SpaceID   string
	UpdatedBy string
	UpdatedAt interface{} // time.Time or string
}

// SpaceInfo holds space metadata
type SpaceInfo struct {
	ID   string
	Name string
}

// ThreadInfo holds thread metadata
type ThreadInfo struct {
	ID         string
	DocumentID string
	Anchor     string
	Text       string
	Author     string
	Status     string
	Outcome    string
	Visibility string
	CreatedAt  interface{}
}

// ReplyInfo holds reply metadata
type ReplyInfo struct {
	Author string
	Body   string
}

// Service provides document export functionality
type Service struct {
	store DataStore
}

// NewService creates a new export service
func NewService(store DataStore) *Service {
	return &Service{store: store}
}

// Export generates an export in the requested format
func (s *Service) Export(ctx context.Context, req Request) (*Result, error) {
	// Get document metadata
	docInfo, err := s.store.GetDocument(ctx, req.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}

	// Get space info
	spaceInfo, err := s.store.GetSpace(ctx, docInfo.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("get space: %w", err)
	}

	// Get document content (ProseMirror JSON)
	content, err := s.store.GetDocumentContent(ctx, req.DocumentID, req.Version)
	if err != nil {
		return nil, fmt.Errorf("get document content: %w", err)
	}

	// Convert content to HTML
	contentHTML := ProseMirrorToHTML(content)

	// Build template data
	data := TemplateData{
		Title:       docInfo.Title,
		Subtitle:    docInfo.Subtitle,
		ContentHTML: template.HTML(contentHTML),
		Author:      docInfo.UpdatedBy,
		SpaceName:   spaceInfo.Name,
		Threads:     []TemplateThread{},
	}

	// Parse updated_at if needed (data already contains time info)
	_ = docInfo.UpdatedAt

	// Get threads if requested
	if req.IncludeThreads {
		threads, err := s.store.ListThreads(ctx, req.DocumentID)
		if err != nil {
			return nil, fmt.Errorf("list threads: %w", err)
		}

		for _, t := range threads {
			// Filter threads based on viewer role
			if req.ViewerIsExternal && t.Visibility != "EXTERNAL" {
				continue
			}

			thread := TemplateThread{
				Anchor:  t.Anchor,
				Text:    t.Text,
				Author:  t.Author,
				Status:  t.Status,
				Outcome: t.Outcome,
				Replies: []TemplateReply{},
			}

			// Get replies
			replies, err := s.store.ListThreadReplies(ctx, t.ID)
			if err == nil {
				for _, r := range replies {
					thread.Replies = append(thread.Replies, TemplateReply{
						Author: r.Author,
						Body:   r.Body,
					})
				}
			}

			data.Threads = append(data.Threads, thread)
		}
	}

	// Render HTML template
	html, err := RenderDocumentHTML(data)
	if err != nil {
		return nil, fmt.Errorf("render template: %w", err)
	}

	// Generate output based on format
	switch req.Format {
	case FormatPDF:
		return s.exportPDF(html, docInfo.Title)
	case FormatDOCX:
		return s.exportDOCX(html, docInfo.Title)
	default:
		return nil, fmt.Errorf("unsupported format: %s", req.Format)
	}
}

// exportPDF generates a PDF from HTML using chromedp
func (s *Service) exportPDF(html string, title string) (*Result, error) {
	// Implementation in pdf.go
	return exportPDF(html, title)
}

// exportDOCX generates a DOCX from HTML using pandoc
func (s *Service) exportDOCX(html string, title string) (*Result, error) {
	// Implementation in docx.go
	return exportDOCX(html, title)
}
