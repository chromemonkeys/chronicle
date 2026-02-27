package gitrepo

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"chronicle/api/internal/store"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type Content struct {
	Title    string          `json:"title"`
	Subtitle string          `json:"subtitle"`
	Purpose  string          `json:"purpose"`
	Tiers    string          `json:"tiers"`
	Enforce  string          `json:"enforce"`
	Doc      json.RawMessage `json:"doc,omitempty"`
}

type Service struct {
	baseDir string
	lockMu  sync.Mutex
	locks   map[string]*sync.Mutex
}

func New(baseDir string) *Service {
	return &Service{
		baseDir: baseDir,
		locks:   make(map[string]*sync.Mutex),
	}
}

func (s *Service) EnsureDocumentRepo(documentID string, initial Content, author string) error {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	path := s.repoPath(documentID)
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat repo path: %w", err)
	}

	if err := os.MkdirAll(path, 0o755); err != nil {
		return fmt.Errorf("create repo dir: %w", err)
	}

	repo, err := git.PlainInit(path, false)
	if err != nil {
		return fmt.Errorf("init repo: %w", err)
	}

	worktree, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("open worktree: %w", err)
	}
	payload, err := json.MarshalIndent(initial, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal initial content: %w", err)
	}
	if err := os.WriteFile(filepath.Join(path, "content.json"), append(payload, '\n'), 0o644); err != nil {
		return fmt.Errorf("write initial content: %w", err)
	}
	if _, err := worktree.Add("content.json"); err != nil {
		return fmt.Errorf("git add initial content: %w", err)
	}
	hash, err := worktree.Commit("Import document baseline", &git.CommitOptions{
		Author: &object.Signature{
			Name:  author,
			Email: fmt.Sprintf("%s@local.chronicle.dev", sanitizeEmail(author)),
			When:  time.Now(),
		},
	})
	if err != nil {
		return fmt.Errorf("commit initial content: %w", err)
	}
	if err := repo.Storer.SetReference(plumbing.NewHashReference(plumbing.NewBranchReferenceName("main"), hash)); err != nil {
		return fmt.Errorf("set main branch ref: %w", err)
	}
	if err := repo.Storer.SetReference(plumbing.NewSymbolicReference(plumbing.HEAD, plumbing.NewBranchReferenceName("main"))); err != nil {
		return fmt.Errorf("set HEAD to main: %w", err)
	}
	return nil
}

func (s *Service) EnsureBranch(documentID, branchName, fromBranch string) error {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}

	branchRefName := plumbing.NewBranchReferenceName(branchName)
	if _, err := repo.Reference(branchRefName, true); err == nil {
		return nil
	}

	fromRef, err := repo.Reference(plumbing.NewBranchReferenceName(fromBranch), true)
	if err != nil {
		return fmt.Errorf("read source branch ref: %w", err)
	}

	if err := repo.Storer.SetReference(plumbing.NewHashReference(branchRefName, fromRef.Hash())); err != nil {
		return fmt.Errorf("create branch ref: %w", err)
	}
	return nil
}

func (s *Service) CommitContent(documentID, branchName string, content Content, author, message string) (store.CommitInfo, error) {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("open repo: %w", err)
	}

	hash, err := s.commit(repo, branchName, content, author, message, false)
	if err != nil {
		return store.CommitInfo{}, err
	}

	commitObj, err := repo.CommitObject(hash)
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("read commit object: %w", err)
	}

	return toCommitInfo(commitObj), nil
}

func (s *Service) GetHeadContent(documentID, branchName string) (Content, store.CommitInfo, error) {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return Content{}, store.CommitInfo{}, fmt.Errorf("open repo: %w", err)
	}

	ref, err := repo.Reference(plumbing.NewBranchReferenceName(branchName), true)
	if err != nil {
		return Content{}, store.CommitInfo{}, fmt.Errorf("resolve branch %s: %w", branchName, err)
	}

	commitObj, err := repo.CommitObject(ref.Hash())
	if err != nil {
		return Content{}, store.CommitInfo{}, fmt.Errorf("load commit object: %w", err)
	}

	content, err := readContentFromCommit(commitObj)
	if err != nil {
		return Content{}, store.CommitInfo{}, err
	}

	return content, toCommitInfo(commitObj), nil
}

func (s *Service) GetContentByHash(documentID, hash string) (Content, error) {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return Content{}, fmt.Errorf("open repo: %w", err)
	}

	resolvedHash, err := resolveHash(repo, hash)
	if err != nil {
		return Content{}, err
	}
	commitObj, err := repo.CommitObject(resolvedHash)
	if err != nil {
		return Content{}, fmt.Errorf("read commit %s: %w", hash, err)
	}
	return readContentFromCommit(commitObj)
}

func (s *Service) GetCommitByHash(documentID, hash string) (store.CommitInfo, error) {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("open repo: %w", err)
	}

	resolvedHash, err := resolveHash(repo, hash)
	if err != nil {
		return store.CommitInfo{}, err
	}
	commitObj, err := repo.CommitObject(resolvedHash)
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("read commit %s: %w", hash, err)
	}

	return toCommitInfo(commitObj), nil
}

func (s *Service) History(documentID, branchName string, limit int) ([]store.CommitInfo, error) {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return nil, fmt.Errorf("open repo: %w", err)
	}

	ref, err := repo.Reference(plumbing.NewBranchReferenceName(branchName), true)
	if err != nil {
		return nil, fmt.Errorf("resolve branch %s: %w", branchName, err)
	}

	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		return nil, fmt.Errorf("read log: %w", err)
	}
	defer iter.Close()

	items := make([]store.CommitInfo, 0, limit)
	count := 0
	err = iter.ForEach(func(commitObj *object.Commit) error {
		items = append(items, toCommitInfo(commitObj))
		count++
		if limit > 0 && count >= limit {
			return io.EOF
		}
		return nil
	})
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("iterate log: %w", err)
	}
	return items, nil
}

func (s *Service) CreateTag(documentID, hash, name string) error {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}
	resolvedHash, err := resolveHash(repo, hash)
	if err != nil {
		return err
	}

	_, err = repo.CreateTag(name, resolvedHash, &git.CreateTagOptions{
		Tagger: &object.Signature{
			Name:  "Chronicle",
			Email: "chronicle@localhost",
			When:  time.Now(),
		},
		Message: name,
	})
	if err != nil && !errors.Is(err, git.ErrTagExists) {
		return fmt.Errorf("create tag: %w", err)
	}
	return nil
}

func (s *Service) MergeIntoMain(documentID, sourceBranch, author, message string) (store.CommitInfo, error) {
	lock := s.documentLock(documentID)
	lock.Lock()
	defer lock.Unlock()

	repo, err := git.PlainOpen(s.repoPath(documentID))
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("open repo: %w", err)
	}
	ref, err := repo.Reference(plumbing.NewBranchReferenceName(sourceBranch), true)
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("resolve source branch %s: %w", sourceBranch, err)
	}
	commitObj, err := repo.CommitObject(ref.Hash())
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("load source commit object: %w", err)
	}
	content, err := readContentFromCommit(commitObj)
	if err != nil {
		return store.CommitInfo{}, err
	}

	mergeMessage := fmt.Sprintf(
		"%s\n\nmerge: source=%s target=main actor=%s mode=copy-commit",
		message,
		sourceBranch,
		author,
	)
	hash, err := s.commit(repo, "main", content, author, mergeMessage, true)
	if err != nil {
		return store.CommitInfo{}, err
	}
	merged, err := repo.CommitObject(hash)
	if err != nil {
		return store.CommitInfo{}, fmt.Errorf("read merge commit object: %w", err)
	}
	return toCommitInfo(merged), nil
}

func (s *Service) repoPath(documentID string) string {
	return filepath.Join(s.baseDir, documentID)
}

func (s *Service) documentLock(documentID string) *sync.Mutex {
	s.lockMu.Lock()
	defer s.lockMu.Unlock()
	lock, ok := s.locks[documentID]
	if ok {
		return lock
	}
	lock = &sync.Mutex{}
	s.locks[documentID] = lock
	return lock
}

func (s *Service) commit(repo *git.Repository, branchName string, content Content, author, message string, allowEmpty bool) (plumbing.Hash, error) {
	if err := checkoutBranch(repo, branchName); err != nil {
		return plumbing.ZeroHash, err
	}

	worktree, err := repo.Worktree()
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("open worktree: %w", err)
	}

	payload, err := json.MarshalIndent(content, "", "  ")
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("marshal content: %w", err)
	}

	repoRoot := worktree.Filesystem.Root()
	if err := os.WriteFile(filepath.Join(repoRoot, "content.json"), append(payload, '\n'), 0o644); err != nil {
		return plumbing.ZeroHash, fmt.Errorf("write content.json: %w", err)
	}

	if _, err := worktree.Add("content.json"); err != nil {
		return plumbing.ZeroHash, fmt.Errorf("git add content: %w", err)
	}

	hash, err := worktree.Commit(message, &git.CommitOptions{
		AllowEmptyCommits: allowEmpty,
		Author: &object.Signature{
			Name:  author,
			Email: fmt.Sprintf("%s@local.chronicle.dev", sanitizeEmail(author)),
			When:  time.Now(),
		},
	})
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("commit content: %w", err)
	}
	return hash, nil
}

func checkoutBranch(repo *git.Repository, branchName string) error {
	worktree, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("open worktree: %w", err)
	}

	branchRef := plumbing.NewBranchReferenceName(branchName)
	if _, err := repo.Reference(branchRef, true); err != nil {
		if errors.Is(err, plumbing.ErrReferenceNotFound) {
			if err := worktree.Checkout(&git.CheckoutOptions{Branch: branchRef, Create: true}); err != nil {
				return fmt.Errorf("create branch checkout %s: %w", branchName, err)
			}
			return nil
		}
		return fmt.Errorf("resolve branch %s: %w", branchName, err)
	}

	if err := worktree.Checkout(&git.CheckoutOptions{Branch: branchRef, Force: true}); err != nil {
		return fmt.Errorf("checkout branch %s: %w", branchName, err)
	}
	return nil
}

func readContentFromCommit(commitObj *object.Commit) (Content, error) {
	file, err := commitObj.File("content.json")
	if err != nil {
		return Content{}, fmt.Errorf("load content.json from commit: %w", err)
	}
	reader, err := file.Reader()
	if err != nil {
		return Content{}, fmt.Errorf("open content reader: %w", err)
	}
	defer reader.Close()

	bytes, err := io.ReadAll(reader)
	if err != nil {
		return Content{}, fmt.Errorf("read content bytes: %w", err)
	}

	var content Content
	if err := json.Unmarshal(bytes, &content); err != nil {
		return Content{}, fmt.Errorf("decode commit content: %w", err)
	}
	return content, nil
}

func DiffFields(from, to Content) []map[string]string {
	type pair struct {
		field  string
		before string
		after  string
	}
	pairs := []pair{
		{field: "title", before: from.Title, after: to.Title},
		{field: "subtitle", before: from.Subtitle, after: to.Subtitle},
		{field: "purpose", before: from.Purpose, after: to.Purpose},
		{field: "tiers", before: from.Tiers, after: to.Tiers},
		{field: "enforce", before: from.Enforce, after: to.Enforce},
	}
	result := make([]map[string]string, 0)
	for _, item := range pairs {
		if item.before == item.after {
			continue
		}
		result = append(result, map[string]string{
			"field":  item.field,
			"before": item.before,
			"after":  item.after,
		})
	}
	if !bytes.Equal(normalizeDoc(from.Doc), normalizeDoc(to.Doc)) {
		result = append(result, map[string]string{
			"field":  "doc",
			"before": "[rich content]",
			"after":  "[rich content]",
		})
	}
	sort.SliceStable(result, func(i, j int) bool {
		return result[i]["field"] < result[j]["field"]
	})
	return result
}

func HasChanges(from, to Content) bool {
	if from.Title != to.Title ||
		from.Subtitle != to.Subtitle ||
		from.Purpose != to.Purpose ||
		from.Tiers != to.Tiers ||
		from.Enforce != to.Enforce {
		return true
	}
	return !bytes.Equal(normalizeDoc(from.Doc), normalizeDoc(to.Doc))
}

func toCommitInfo(commitObj *object.Commit) store.CommitInfo {
	return store.CommitInfo{
		Hash:      commitObj.Hash.String()[:7],
		Message:   commitObj.Message,
		Author:    commitObj.Author.Name,
		CreatedAt: commitObj.Author.When,
		Added:     0,
		Removed:   0,
	}
}

func sanitizeEmail(input string) string {
	bytes := make([]rune, 0, len(input))
	for _, r := range input {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			bytes = append(bytes, r)
			continue
		}
		if r == ' ' || r == '-' || r == '_' {
			bytes = append(bytes, '.')
		}
	}
	if len(bytes) == 0 {
		return "user"
	}
	return string(bytes)
}

func normalizeDoc(doc json.RawMessage) []byte {
	if len(doc) == 0 {
		return nil
	}
	var parsed any
	if err := json.Unmarshal(doc, &parsed); err != nil {
		return nil
	}
	normalized, err := json.Marshal(parsed)
	if err != nil {
		return nil
	}
	return normalized
}

func resolveHash(repo *git.Repository, hash string) (plumbing.Hash, error) {
	if len(hash) == 40 {
		return plumbing.NewHash(hash), nil
	}
	resolved, err := repo.ResolveRevision(plumbing.Revision(hash))
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("resolve hash %s: %w", hash, err)
	}
	return *resolved, nil
}
