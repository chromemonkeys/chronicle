// Package export provides document export functionality for PDF and DOCX formats.
package export

import (
	"errors"
	"time"
)

// Format represents the export output format
type Format string

const (
	FormatPDF  Format = "pdf"
	FormatDOCX Format = "docx"
)

// Request contains parameters for an export operation
type Request struct {
	DocumentID     string
	Version        string // "latest" or commit hash
	Format         Format
	IncludeThreads bool
	ViewerIsExternal bool
}

// Document represents the document content for export
type Document struct {
	ID          string
	Title       string
	Subtitle    string
	Purpose     string
	Content     interface{} // ProseMirror JSON
	Author      string
	UpdatedAt   time.Time
	SpaceName   string
}

// Thread represents a discussion thread for export
type Thread struct {
	ID         string
	Anchor     string
	Text       string
	Author     string
	Status     string // "OPEN", "RESOLVED"
	Outcome    string // "ACCEPTED", "REJECTED", "DEFERRED" (if resolved)
	Visibility string // "INTERNAL", "EXTERNAL"
	CreatedAt  time.Time
	Replies    []Reply
}

// Reply represents a thread reply
type Reply struct {
	Author    string
	Body      string
	CreatedAt time.Time
}

// Result contains the export output
type Result struct {
	Data     []byte
	Filename string
	MimeType string
}

var (
	// ErrContentUnavailable indicates document content could not be loaded for export.
	ErrContentUnavailable = errors.New("export content unavailable")
	// ErrPDFDependencyMissing indicates PDF export runtime dependencies are unavailable.
	ErrPDFDependencyMissing = errors.New("export pdf dependency missing")
	// ErrDOCXDependencyMissing indicates DOCX export runtime dependencies are unavailable.
	ErrDOCXDependencyMissing = errors.New("export docx dependency missing")
)
