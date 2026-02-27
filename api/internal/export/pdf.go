package export

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// percentEncodeForDataURL encodes a string for use in a data URL
// Unlike url.QueryEscape, this properly encodes spaces as %20 for data URLs
func percentEncodeForDataURL(s string) string {
	var result strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '-', r == '_', r == '.', r == '~':
			// Unreserved characters per RFC 3986
			result.WriteRune(r)
		case r == ' ':
			// Space must be encoded as %20 in data URLs, not +
			result.WriteString("%20")
		default:
			// Percent-encode all other characters
			for _, b := range string(r) {
				result.WriteString(fmt.Sprintf("%%%02X", b))
			}
		}
	}
	return result.String()
}

// exportPDF converts HTML to PDF using headless Chrome
func exportPDF(html string, title string) (*Result, error) {
	if _, err := exec.LookPath("chromium-browser"); err != nil {
		if _, fallbackErr := exec.LookPath("chromium"); fallbackErr != nil {
			return nil, fmt.Errorf("%w: chromium not installed", ErrPDFDependencyMissing)
		}
	}

	// Create chromedp context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Chrome options for headless mode in container
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("disable-web-security", true),
		chromedp.Flag("disable-features", "IsolateOrigins,site-per-process"),
	)

	allocCtx, cancel := chromedp.NewExecAllocator(ctx, opts...)
	defer cancel()

	taskCtx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	// Encode HTML as data URL using proper percent-encoding
	// url.QueryEscape uses + for spaces which is wrong for data URLs
	dataURL := "data:text/html;charset=utf-8," + percentEncodeForDataURL(html)

	// Navigate and generate PDF
	var pdfData []byte
	err := chromedp.Run(taskCtx,
		chromedp.Navigate(dataURL),
		chromedp.WaitReady("body"),
		chromedp.ActionFunc(func(ctx context.Context) error {
			var err error
			pdfData, _, err = page.PrintToPDF().
				WithPrintBackground(true).
				WithPaperWidth(8.5).   // Letter size
				WithPaperHeight(11.0).
				WithMarginTop(0.75).
				WithMarginBottom(0.75).
				WithMarginLeft(0.75).
				WithMarginRight(0.75).
				WithPreferCSSPageSize(true).
				Do(ctx)
			return err
		}),
	)

	if err != nil {
		return nil, fmt.Errorf("chrome pdf generation failed: %w", err)
	}

	return &Result{
		Data:     pdfData,
		Filename: sanitizeFilename(title) + ".pdf",
		MimeType: "application/pdf",
	}, nil
}

// sanitizeFilename creates a safe filename from a title
func sanitizeFilename(title string) string {
	// Replace spaces with hyphens
	result := ""
	for _, r := range title {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			result += string(r)
		case r == ' ':
			result += "-"
		case r == '-', r == '_':
			result += string(r)
		default:
			// Skip other characters
		}
	}

	// Limit length
	if len(result) > 50 {
		result = result[:50]
	}

	if result == "" {
		result = "document"
	}

	return result
}
