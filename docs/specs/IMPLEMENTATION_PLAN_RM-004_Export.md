# Implementation Plan: RM-004 Export to PDF/DOCX

## Overview
Implement rich-format export functionality for Chronicle documents, supporting PDF (via headless Chrome) and DOCX (via Pandoc) formats.

**Estimated Duration:** 1.5 days  
**Priority:** P0 (v1.0 blocker)  
**Issue:** #32

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Frontend      │────▶│   Go API Server  │────▶│   Export Service    │
│  Export Button  │     │  POST /api/...   │     │  (new package)      │
└─────────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                           │
                              ┌────────────────────────────┼────────────┐
                              ▼                            ▼            ▼
                       ┌─────────────┐              ┌─────────────┐  ┌──────────┐
                       │  HTML+CSS   │─────────────▶│   Chrome    │  │  Pandoc  │
                       │  Template   │   Render     │  (PDF)      │  │ (DOCX)   │
                       └─────────────┘              └─────────────┘  └──────────┘
```

---

## Phase 1: Foundation (Day 1 Morning)

### 1.1 Create Export Package Structure
**Files to create:**
- `api/internal/export/service.go` - Main export service
- `api/internal/export/templates.go` - HTML template management
- `api/internal/export/prosemirror.go` - ProseMirror JSON to HTML converter
- `api/internal/export/pdf.go` - chromedp PDF generation
- `api/internal/export/docx.go` - Pandoc DOCX generation
- `api/internal/export/export_test.go` - Unit tests

### 1.2 ProseMirror to HTML Converter
**Goal:** Convert ProseMirror JSON document to semantic HTML

**Implementation:**
```go
// Walk the ProseMirror document tree
// Map node types to HTML:
// - paragraph → <p>
// - heading → <h1>, <h2>, <h3>
// - bulletList → <ul>
// - orderedList → <ol>
// - listItem → <li>
// - codeBlock → <pre><code>
// - blockquote → <blockquote>
// - table → <table>
// - text with marks → <strong>, <em>, <code>, <a>
```

**Acceptance:**
- [ ] All core block types render correctly
- [ ] Marks (bold, italic, code, links) preserved
- [ ] Thread anchors rendered as HTML comments

### 1.3 HTML Template System
**Files:**
- `api/internal/export/templates/document.html` - Base document template
- `api/internal/export/templates/styles.css` - Rich CSS styling

**Template Features:**
- Document title, subtitle, purpose header
- Styled content body
- Thread/annotation sidebar or appendix
- Page headers/footers with document metadata
- Print-optimized CSS (@page rules)

**CSS Requirements:**
- Typography: Inter or system fonts
- Colors: Professional document palette
- Spacing: Consistent margins and padding
- Thread styling: Color-coded by status (open/resolved/rejected)

---

## Phase 2: PDF Generation (Day 1 Afternoon)

### 2.1 chromedp Integration
**Dependencies:**
```bash
go get github.com/chromedp/chromedp
```

**Implementation Steps:**
1. Create chromedp context with headless Chrome
2. Navigate to data URL with rendered HTML
3. Use Chrome DevTools Protocol to print to PDF
4. Return PDF bytes

**Configuration:**
- Paper size: A4 or Letter
- Margins: 2cm all sides
- Print backgrounds: true (for colored threads)
- Prefer CSS page size: true

### 2.2 Thread Visibility Filtering
**Security Critical:**
```go
func filterThreads(threads []Thread, viewerIsExternal bool) []Thread {
    if !viewerIsExternal {
        return threads // Internal users see all
    }
    // External users: only EXTERNAL visibility threads
    var filtered []Thread
    for _, t := range threads {
        if t.Visibility == "EXTERNAL" {
            filtered = append(filtered, t)
        }
    }
    return filtered
}
```

### 2.3 PDF Acceptance Criteria
- [ ] Text renders crisply at print resolution
- [ ] CSS colors and backgrounds render correctly
- [ ] Page breaks don't split content awkwardly
- [ ] Thread annotations styled with colored borders
- [ ] Document metadata in page footer

---

## Phase 3: DOCX Generation (Day 2 Morning)

### 3.1 Pandoc Integration
**Docker Requirements:**
```dockerfile
# Add to api/Dockerfile
RUN apt-get update && apt-get install -y \
    pandoc \
    chromium \
    --no-install-recommends
```

**Implementation:**
1. Generate same HTML as PDF path
2. Pipe HTML to pandoc subprocess
3. Use reference DOCX for Chronicle styling
4. Return DOCX bytes

**Reference Template:**
- Create `templates/chronicle-reference.docx`
- Define Chronicle brand styles (Heading 1, Heading 2, Body Text, etc.)
- Include document header/footer layouts

### 3.2 DOCX Acceptance Criteria
- [ ] Opens correctly in Microsoft Word
- [ ] Styles map to Word styles (not just direct formatting)
- [ ] Tables render correctly
- [ ] Thread annotations in styled callout boxes

---

## Phase 4: API & Integration (Day 2 Afternoon)

### 4.1 HTTP Endpoints
**New Routes:**
```
POST /api/documents/{id}/export
Content-Type: application/json

Request:
{
    "format": "pdf" | "docx",
    "version": "latest" | "{commit-hash}",
    "includeThreads": true | false
}

Response:
Content-Type: application/pdf OR application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="document.pdf"
[binary data]
```

**Permissions:**
- Require READ permission on document
- Enforce thread visibility based on user role

### 4.2 Error Handling
**Error Cases:**
- Document not found → 404
- No read permission → 403
- Invalid format → 400
- Chrome/pandoc failure → 500 with error code

### 4.3 Frontend UI
**Files to modify:**
- `src/views/WorkspacePage.tsx` - Add export button
- `src/components/ExportMenu.tsx` - New dropdown component

**UI Design:**
```
[Export ▼]
   ├── Download as PDF
   └── Download as Word (.docx)
```

**Behavior:**
- Show loading spinner during export
- Trigger file download on completion
- Show error toast on failure

---

## Phase 5: Testing (Day 2 End)

### 5.1 Unit Tests
**Test Cases:**
- [ ] ProseMirror JSON to HTML conversion
- [ ] Thread visibility filtering (internal vs external)
- [ ] PDF generation produces valid PDF
- [ ] DOCX generation produces valid DOCX
- [ ] Error handling for missing documents

### 5.2 Integration Tests
**Test Cases:**
- [ ] End-to-end export flow for PDF
- [ ] End-to-end export flow for DOCX
- [ ] External user sees filtered threads
- [ ] Internal user sees all threads

### 5.3 E2E Tests
**Playwright Tests:**
- [ ] User clicks export → file downloads
- [ ] Open exported PDF in viewer → content correct
- [ ] Open exported DOCX in Word → formatting correct

---

## File Checklist

### New Files
- [ ] `api/internal/export/service.go`
- [ ] `api/internal/export/prosemirror.go`
- [ ] `api/internal/export/pdf.go`
- [ ] `api/internal/export/docx.go`
- [ ] `api/internal/export/templates.go`
- [ ] `api/internal/export/templates/document.html`
- [ ] `api/internal/export/templates/styles.css`
- [ ] `api/internal/export/export_test.go`
- [ ] `src/components/ExportMenu.tsx`

### Modified Files
- [ ] `api/Dockerfile` - Add chromium, pandoc
- [ ] `api/internal/app/http.go` - Add export routes
- [ ] `api/internal/app/service.go` - Add ExportDocument method
- [ ] `src/views/WorkspacePage.tsx` - Add export button
- [ ] `go.mod` - Add chromedp dependency

---

## Dependencies

### Go Modules
```
github.com/chromedp/chromedp v0.9.0
```

### System Dependencies
- `chromium` - Headless browser for PDF
- `pandoc` - Document converter for DOCX

### Fonts (Optional)
- Inter font family (for consistent typography)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Chrome crashes in container | Set --no-sandbox, --disable-gpu flags |
| Pandoc not available | Graceful error: "DOCX export temporarily unavailable" |
| Large documents timeout | Add 30s timeout, stream response |
| Memory usage | Limit Chrome to single tab, kill after each export |

---

## Success Criteria

1. **Functionality:**
   - [ ] PDF exports with rich formatting
   - [ ] DOCX exports with proper styles
   - [ ] Both formats include/exclude threads correctly based on viewer

2. **Quality:**
   - [ ] All tests pass
   - [ ] No regressions in existing features
   - [ ] CI build includes chromium/pandoc

3. **UX:**
   - [ ] Export completes in < 5 seconds for typical document
   - [ ] Clear error messages on failure
   - [ ] Mobile-friendly export button placement

---

## Post-Implementation

Update Sprint 2 tracker:
```
- [x] #32 RM-004 - Export to PDF, Markdown, DOCX
```
