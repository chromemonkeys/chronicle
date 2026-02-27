package export

import (
	"fmt"
	"html"
	"strings"
)

// ProseMirrorNode represents a node in the ProseMirror document tree
type ProseMirrorNode struct {
	Type    string                 `json:"type"`
	Attrs   map[string]interface{} `json:"attrs"`
	Content []ProseMirrorNode      `json:"content"`
	Text    string                 `json:"text"`
	Marks   []ProseMirrorMark      `json:"marks"`
}

// ProseMirrorMark represents a text mark (formatting)
type ProseMirrorMark struct {
	Type  string                 `json:"type"`
	Attrs map[string]interface{} `json:"attrs"`
}

// ProseMirrorToHTML converts ProseMirror JSON to HTML
func ProseMirrorToHTML(doc interface{}) string {
	if doc == nil {
		return ""
	}

	// Handle map[string]interface{} from JSON unmarshaling
	root, ok := doc.(map[string]interface{})
	if !ok {
		return ""
	}

	return renderNode(root)
}

// renderNode recursively renders a ProseMirror node to HTML
func renderNode(node map[string]interface{}) string {
	nodeType, _ := node["type"].(string)
	if nodeType == "" {
		return ""
	}

	switch nodeType {
	case "doc":
		return renderContent(node["content"])
	case "paragraph":
		content := renderContent(node["content"])
		return fmt.Sprintf("<p>%s</p>\n", content)
	case "heading":
		level := 1
		if attrs, ok := node["attrs"].(map[string]interface{}); ok {
			if lvl, ok := attrs["level"].(float64); ok {
				level = int(lvl)
			}
		}
		content := renderContent(node["content"])
		return fmt.Sprintf("<h%d>%s</h%d>\n", level, content, level)
	case "bulletList":
		content := renderContent(node["content"])
		return fmt.Sprintf("<ul>\n%s</ul>\n", content)
	case "orderedList":
		content := renderContent(node["content"])
		return fmt.Sprintf("<ol>\n%s</ol>\n", content)
	case "listItem":
		content := renderContent(node["content"])
		return fmt.Sprintf("<li>%s</li>\n", content)
	case "blockquote":
		content := renderContent(node["content"])
		return fmt.Sprintf("<blockquote>\n%s</blockquote>\n", content)
	case "codeBlock":
		content := renderContent(node["content"])
		return fmt.Sprintf("<pre><code>%s</code></pre>\n", html.EscapeString(content))
	case "text":
		text, _ := node["text"].(string)
		marks, _ := node["marks"].([]interface{})
		return renderTextWithMarks(text, marks)
	case "hardBreak":
		return "<br>"
	case "table":
		content := renderContent(node["content"])
		return fmt.Sprintf("<table>\n%s</table>\n", content)
	case "tableRow":
		content := renderContent(node["content"])
		return fmt.Sprintf("<tr>\n%s</tr>\n", content)
	case "tableCell":
		content := renderContent(node["content"])
		return fmt.Sprintf("<td>%s</td>\n", content)
	case "tableHeader":
		content := renderContent(node["content"])
		return fmt.Sprintf("<th>%s</th>\n", content)
	case "horizontalRule":
		return "<hr>\n"
	default:
		// Unknown node type - render content if any
		return renderContent(node["content"])
	}
}

// renderContent renders a slice of content nodes
func renderContent(content interface{}) string {
	if content == nil {
		return ""
	}

	items, ok := content.([]interface{})
	if !ok {
		return ""
	}

	var result strings.Builder
	for _, item := range items {
		if node, ok := item.(map[string]interface{}); ok {
			result.WriteString(renderNode(node))
		}
	}
	return result.String()
}

// renderTextWithMarks renders text with formatting marks
func renderTextWithMarks(text string, marks []interface{}) string {
	if text == "" {
		return ""
	}

	htmlText := html.EscapeString(text)

	if len(marks) == 0 {
		return htmlText
	}

	// Apply marks from outside in
	for i := len(marks) - 1; i >= 0; i-- {
		mark, ok := marks[i].(map[string]interface{})
		if !ok {
			continue
		}
		markType, _ := mark["type"].(string)

		switch markType {
		case "bold":
			htmlText = fmt.Sprintf("<strong>%s</strong>", htmlText)
		case "italic":
			htmlText = fmt.Sprintf("<em>%s</em>", htmlText)
		case "code":
			htmlText = fmt.Sprintf("<code>%s</code>", htmlText)
		case "link":
			href := ""
			if attrs, ok := mark["attrs"].(map[string]interface{}); ok {
				if hrefVal, ok := attrs["href"].(string); ok {
					href = hrefVal
				}
			}
			htmlText = fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(href), htmlText)
		case "strike":
			htmlText = fmt.Sprintf("<s>%s</s>", htmlText)
		case "underline":
			htmlText = fmt.Sprintf("<u>%s</u>", htmlText)
		}
	}

	return htmlText
}
