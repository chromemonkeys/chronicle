package gitrepo

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestDocumentRepoLifecycle(t *testing.T) {
	tempDir := t.TempDir()
	svc := New(tempDir)

	initial := Content{
		Title:    "Doc",
		Subtitle: "Sub",
		Purpose:  "Purpose",
		Tiers:    "Tiers",
		Enforce:  "Enforce",
		Doc: json.RawMessage(`{
			"type":"doc",
			"content":[
				{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Doc"}]},
				{"type":"paragraph","content":[{"type":"text","text":"Sub"}]}
			]
		}`),
	}

	if err := svc.EnsureDocumentRepo("doc-1", initial, "Avery"); err != nil {
		t.Fatalf("EnsureDocumentRepo() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(tempDir, "doc-1")); err != nil {
		t.Fatalf("repo directory missing: %v", err)
	}

	if err := svc.EnsureBranch("doc-1", "proposal-doc-1", "main"); err != nil {
		t.Fatalf("EnsureBranch() error = %v", err)
	}

	updated := initial
	updated.Purpose = "Updated purpose"
	commit, err := svc.CommitContent("doc-1", "proposal-doc-1", updated, "Avery", "Update purpose")
	if err != nil {
		t.Fatalf("CommitContent() error = %v", err)
	}
	if commit.Hash == "" {
		t.Fatal("expected commit hash")
	}

	history, err := svc.History("doc-1", "proposal-doc-1", 10)
	if err != nil {
		t.Fatalf("History() error = %v", err)
	}
	if len(history) == 0 {
		t.Fatal("expected history entries")
	}

	changed, err := svc.GetContentByHash("doc-1", commit.Hash)
	if err != nil {
		t.Fatalf("GetContentByHash() error = %v", err)
	}
	if changed.Purpose != "Updated purpose" {
		t.Fatalf("unexpected content: %+v", changed)
	}
	if len(changed.Doc) == 0 {
		t.Fatal("expected persisted doc JSON")
	}
}

func TestFullDocRoundTripPreservesStructure(t *testing.T) {
	tempDir := t.TempDir()
	svc := New(tempDir)

	initial := Content{
		Title:    "Doc",
		Subtitle: "Sub",
		Purpose:  "Purpose",
		Tiers:    "Tiers",
		Enforce:  "Enforce",
		Doc: json.RawMessage(`{
			"type":"doc",
			"content":[
				{"type":"heading","attrs":{"level":1,"nodeId":"n-title"},"content":[{"type":"text","text":"Doc"}]},
				{"type":"paragraph","attrs":{"nodeId":"n-sub"},"content":[{"type":"text","text":"Sub"}]},
				{"type":"bulletList","content":[
					{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"One"}]}]},
					{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Two"}]}]}
				]},
				{"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Quoted"}]}]},
				{"type":"codeBlock","content":[{"type":"text","text":"const x = 1;"}]}
			]
		}`),
	}

	if err := svc.EnsureDocumentRepo("doc-1", initial, "Avery"); err != nil {
		t.Fatalf("EnsureDocumentRepo() error = %v", err)
	}
	if err := svc.EnsureBranch("doc-1", "proposal-doc-1", "main"); err != nil {
		t.Fatalf("EnsureBranch() error = %v", err)
	}
	updated := initial
	updated.Subtitle = "Sub (edited)"
	_, err := svc.CommitContent("doc-1", "proposal-doc-1", updated, "Avery", "Round-trip doc")
	if err != nil {
		t.Fatalf("CommitContent() error = %v", err)
	}

	got, _, err := svc.GetHeadContent("doc-1", "proposal-doc-1")
	if err != nil {
		t.Fatalf("GetHeadContent() error = %v", err)
	}

	wantNorm := normalizeDoc(updated.Doc)
	gotNorm := normalizeDoc(got.Doc)
	if string(wantNorm) != string(gotNorm) {
		t.Fatalf("doc JSON mismatch after round-trip\nwant=%s\ngot=%s", string(wantNorm), string(gotNorm))
	}
}

func TestConcurrentCommitContentSameBranch(t *testing.T) {
	tempDir := t.TempDir()
	svc := New(tempDir)

	initial := Content{
		Title:    "Doc",
		Subtitle: "Sub",
		Purpose:  "Purpose",
		Tiers:    "Tiers",
		Enforce:  "Enforce",
	}

	if err := svc.EnsureDocumentRepo("doc-1", initial, "Avery"); err != nil {
		t.Fatalf("EnsureDocumentRepo() error = %v", err)
	}
	if err := svc.EnsureBranch("doc-1", "proposal-doc-1", "main"); err != nil {
		t.Fatalf("EnsureBranch() error = %v", err)
	}

	const writers = 12
	var wg sync.WaitGroup
	errCh := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			next := initial
			next.Purpose = fmt.Sprintf("purpose-%02d", idx)
			next.Tiers = fmt.Sprintf("tiers-%02d", idx)
			if _, err := svc.CommitContent("doc-1", "proposal-doc-1", next, "Avery", fmt.Sprintf("Commit %02d", idx)); err != nil {
				errCh <- err
			}
		}(i)
	}
	wg.Wait()
	close(errCh)

	for err := range errCh {
		if err != nil {
			t.Fatalf("CommitContent() concurrent error = %v", err)
		}
	}

	history, err := svc.History("doc-1", "proposal-doc-1", 100)
	if err != nil {
		t.Fatalf("History() error = %v", err)
	}
	if len(history) < writers+1 {
		t.Fatalf("expected at least %d commits in history, got %d", writers+1, len(history))
	}

	head, _, err := svc.GetHeadContent("doc-1", "proposal-doc-1")
	if err != nil {
		t.Fatalf("GetHeadContent() error = %v", err)
	}
	if !strings.HasPrefix(head.Purpose, "purpose-") {
		t.Fatalf("unexpected head content after concurrent commits: %+v", head)
	}
}
