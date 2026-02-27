package export

import (
	"html/template"
	"strings"
	"testing"
)

func TestProseMirrorToHTML(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected string
	}{
		{
			name:     "nil input",
			input:    nil,
			expected: "",
		},
		{
			name: "simple paragraph",
			input: map[string]interface{}{
				"type": "doc",
				"content": []interface{}{
					map[string]interface{}{
						"type": "paragraph",
						"content": []interface{}{
							map[string]interface{}{
								"type": "text",
								"text": "Hello world",
							},
						},
					},
				},
			},
			expected: "<p>Hello world</p>",
		},
		{
			name: "heading with levels",
			input: map[string]interface{}{
				"type": "doc",
				"content": []interface{}{
					map[string]interface{}{
						"type": "heading",
						"attrs": map[string]interface{}{"level": 2.0},
						"content": []interface{}{
							map[string]interface{}{
								"type": "text",
								"text": "Section Title",
							},
						},
					},
				},
			},
			expected: "<h2>Section Title</h2>",
		},
		{
			name: "bold and italic text",
			input: map[string]interface{}{
				"type": "doc",
				"content": []interface{}{
					map[string]interface{}{
						"type": "paragraph",
						"content": []interface{}{
							map[string]interface{}{
								"type": "text",
								"text": "Bold and italic",
								"marks": []interface{}{
									map[string]interface{}{"type": "bold"},
									map[string]interface{}{"type": "italic"},
								},
							},
						},
					},
				},
			},
			expected: "<strong><em>Bold and italic</em></strong>",
		},
		{
			name: "bullet list",
			input: map[string]interface{}{
				"type": "doc",
				"content": []interface{}{
					map[string]interface{}{
						"type": "bulletList",
						"content": []interface{}{
							map[string]interface{}{
								"type": "listItem",
								"content": []interface{}{
									map[string]interface{}{
										"type": "paragraph",
										"content": []interface{}{
											map[string]interface{}{
												"type": "text",
												"text": "Item 1",
											},
										},
									},
								},
							},
						},
					},
				},
			},
			expected: "<ul>",
		},
		{
			name: "code block",
			input: map[string]interface{}{
				"type": "doc",
				"content": []interface{}{
					map[string]interface{}{
						"type": "codeBlock",
						"content": []interface{}{
							map[string]interface{}{
								"type": "text",
								"text": "func main() {}",
							},
						},
					},
				},
			},
			expected: "<pre><code>func main() {}</code></pre>",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ProseMirrorToHTML(tt.input)
			// Normalize whitespace for comparison
			result = strings.TrimSpace(result)
			expected := strings.TrimSpace(tt.expected)
			if !strings.Contains(result, expected) {
				t.Errorf("ProseMirrorToHTML() = %v, want %v", result, expected)
			}
		})
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Hello World", "Hello-World"},
		{"My Document v1.2", "My-Document-v12"},
		{"Special!@#$%Chars", "SpecialChars"},
		{"", "document"},
		{"Very Long Title That Exceeds Fifty Characters Limit", "Very-Long-Title-That-Exceeds-Fifty-Characters-Limi"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := sanitizeFilename(tt.input)
			if result != tt.expected {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestPercentEncodeForDataURL(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello world", "hello%20world"},          // Spaces encoded as %20, not +
		{"test+sign", "test%2Bsign"},              // + signs are encoded
		{"special<>", "special%3C%3E"},            // Special chars encoded
		{"normal-text.txt", "normal-text.txt"},    // Unreserved chars pass through
		{"", ""},                                  // Empty string
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := percentEncodeForDataURL(tt.input)
			if result != tt.expected {
				t.Errorf("percentEncodeForDataURL(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestRenderDocumentHTML(t *testing.T) {
	data := TemplateData{
		Title:       "Test Document",
		Subtitle:    "A test subtitle",
		Purpose:     "Testing the export system",
		ContentHTML: template.HTML("<p>This is the content.</p>"),
		Author:      "Test Author",
		SpaceName:   "Test Space",
		Threads: []TemplateThread{
			{
				Anchor: "Introduction",
				Text:   "This is a thread",
				Status: "OPEN",
				Author: "Commenter",
			},
		},
	}

	html, err := RenderDocumentHTML(data)
	if err != nil {
		t.Fatalf("RenderDocumentHTML() error = %v", err)
	}

	// Check that key elements are present
	if !strings.Contains(html, "Test Document") {
		t.Error("HTML missing title")
	}
	if !strings.Contains(html, "A test subtitle") {
		t.Error("HTML missing subtitle")
	}
	if !strings.Contains(html, "Testing the export system") {
		t.Error("HTML missing purpose")
	}
	if !strings.Contains(html, "This is the content") {
		t.Error("HTML missing content")
	}
	if !strings.Contains(html, "Discussion") {
		t.Error("HTML missing threads section")
	}

	// Verify that HTML content is NOT escaped (the bug fix)
	// If ContentHTML were escaped, we would see &lt;p&gt; instead of <p>
	if strings.Contains(html, "&lt;p&gt;") {
		t.Error("HTML content was escaped - should be rendered as raw HTML")
	}
	// Check that the actual HTML tag is present
	if !strings.Contains(html, "<p>This is the content.</p>") {
		t.Error("HTML content should contain unescaped <p> tags")
	}
}
