package export

import (
	"fmt"
	"os/exec"
	"strings"
)

// exportDOCX converts HTML to DOCX using pandoc
func exportDOCX(html string, title string) (*Result, error) {
	// Check if pandoc is available
	if _, err := exec.LookPath("pandoc"); err != nil {
		return nil, fmt.Errorf("%w: pandoc not installed", ErrDOCXDependencyMissing)
	}

	// Build pandoc command
	// Using --reference-doc for consistent styling would be ideal,
	// but we'll use default styling for now
	cmd := exec.Command("pandoc",
		"-f", "html",
		"-t", "docx",
		"--standalone",
		"-o", "-", // Output to stdout
	)

	// Feed HTML to stdin
	cmd.Stdin = strings.NewReader(html)

	// Run command and capture output
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("pandoc failed: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("pandoc execution failed: %w", err)
	}

	return &Result{
		Data:     output,
		Filename: sanitizeFilename(title) + ".docx",
		MimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	}, nil
}
