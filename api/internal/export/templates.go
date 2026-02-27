package export

import (
	"bytes"
	"embed"
	"html/template"
	"strings"
	"time"
)

// SafeHTML is a template function that marks a string as safe HTML
func SafeHTML(s interface{}) template.HTML {
	switch v := s.(type) {
	case string:
		return template.HTML(v)
	case template.HTML:
		return v
	default:
		return template.HTML("")
	}
}

//go:embed templates/*.html
var templateFS embed.FS

var documentTemplate *template.Template

func init() {
	// Custom template functions
	funcMap := template.FuncMap{
		"lower": strings.ToLower,
		"formatDate": func(t time.Time, layout string) string {
			return t.Format(layout)
		},
		"safeHTML": SafeHTML,
	}

	templateContent, err := templateFS.ReadFile("templates/document.html")
	if err != nil {
		// Fallback to built-in template if file not found
		documentTemplate = template.Must(template.New("document").Funcs(funcMap).Parse(fallbackTemplate))
		return
	}

	documentTemplate = template.Must(template.New("document").Funcs(funcMap).Parse(string(templateContent)))
}

// TemplateData holds data for document template rendering
type TemplateData struct {
	Title       string
	Subtitle    string
	Purpose     string
	ContentHTML template.HTML
	Author      string
	UpdatedAt   time.Time
	SpaceName   string
	Threads     []TemplateThread
}

// TemplateThread holds thread data for template
type TemplateThread struct {
	Anchor  string
	Text    string
	Author  string
	Status  string
	Outcome string
	Replies []TemplateReply
}

// TemplateReply holds reply data for template
type TemplateReply struct {
	Author string
	Body   string
}

// RenderDocumentHTML renders the document template with provided data
func RenderDocumentHTML(data TemplateData) (string, error) {
	var buf bytes.Buffer
	if err := documentTemplate.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// fallbackTemplate is used if the embedded template fails to load
const fallbackTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{.Title}}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    .meta { color: #666; font-size: 0.9em; margin-bottom: 2rem; }
    .thread { background: #f5f5f5; padding: 1rem; margin: 1rem 0; border-left: 3px solid #333; }
  </style>
</head>
<body>
  <h1>{{.Title}}</h1>
  {{if .Subtitle}}<p>{{.Subtitle}}</p>{{end}}
  <div class="meta">{{.SpaceName}} | {{.Author}} | {{.UpdatedAt.Format "Jan 2, 2006"}}</div>
  <div>{{.ContentHTML | safeHTML}}</div>
  {{if .Threads}}
  <h2>Discussion</h2>
  {{range .Threads}}<div class="thread">{{.Text}}</div>{{end}}
  {{end}}
</body>
</html>`
