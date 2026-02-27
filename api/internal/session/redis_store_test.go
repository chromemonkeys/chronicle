package session

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func setupTestRedis(t *testing.T) (*RedisStore, *miniredis.Miniredis) {
	s := miniredis.RunT(t)
	store, err := NewRedisStore("redis://" + s.Addr())
	if err != nil {
		t.Fatalf("failed to create redis store: %v", err)
	}
	return store, s
}

func TestNewRedisStore(t *testing.T) {
	s := miniredis.RunT(t)
	defer s.Close()

	store, err := NewRedisStore("redis://" + s.Addr())
	if err != nil {
		t.Fatalf("NewRedisStore failed: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	if err := store.Ping(ctx); err != nil {
		t.Errorf("Ping failed: %v", err)
	}
}

func TestSaveAndLookupRefreshSession(t *testing.T) {
	store, s := setupTestRedis(t)
	defer store.Close()
	defer s.Close()

	ctx := context.Background()
	tokenHash := "test-token-hash"
	userID := "user-123"
	expiresAt := time.Now().Add(24 * time.Hour)

	// Save session
	err := store.SaveRefreshSession(ctx, tokenHash, userID, expiresAt)
	if err != nil {
		t.Fatalf("SaveRefreshSession failed: %v", err)
	}

	// Lookup session
	user, err := store.LookupRefreshSession(ctx, tokenHash)
	if err != nil {
		t.Fatalf("LookupRefreshSession failed: %v", err)
	}

	if user.ID != userID {
		t.Errorf("expected user ID %s, got %s", userID, user.ID)
	}
}

func TestLookupExpiredSession(t *testing.T) {
	store, s := setupTestRedis(t)
	defer store.Close()
	defer s.Close()

	ctx := context.Background()
	tokenHash := "expired-token"
	userID := "user-456"
	
	// Save with very short TTL
	expiresAt := time.Now().Add(1 * time.Millisecond)
	err := store.SaveRefreshSession(ctx, tokenHash, userID, expiresAt)
	if err != nil {
		t.Fatalf("SaveRefreshSession failed: %v", err)
	}

	// Fast-forward time in miniredis
	s.FastForward(2 * time.Millisecond)

	// Lookup should fail (token expired)
	_, err = store.LookupRefreshSession(ctx, tokenHash)
	if err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestLookupNonExistentSession(t *testing.T) {
	store, s := setupTestRedis(t)
	defer store.Close()
	defer s.Close()

	ctx := context.Background()

	// Lookup non-existent token
	_, err := store.LookupRefreshSession(ctx, "non-existent-token")
	if err == nil {
		t.Error("expected error for non-existent token, got nil")
	}
}

func TestRevokeRefreshSession(t *testing.T) {
	store, s := setupTestRedis(t)
	defer store.Close()
	defer s.Close()

	ctx := context.Background()
	tokenHash := "token-to-revoke"
	userID := "user-789"
	expiresAt := time.Now().Add(24 * time.Hour)

	// Save session
	err := store.SaveRefreshSession(ctx, tokenHash, userID, expiresAt)
	if err != nil {
		t.Fatalf("SaveRefreshSession failed: %v", err)
	}

	// Verify it exists
	_, err = store.LookupRefreshSession(ctx, tokenHash)
	if err != nil {
		t.Fatalf("Lookup before revoke failed: %v", err)
	}

	// Revoke session
	err = store.RevokeRefreshSession(ctx, tokenHash)
	if err != nil {
		t.Fatalf("RevokeRefreshSession failed: %v", err)
	}

	// Lookup should fail (token revoked)
	_, err = store.LookupRefreshSession(ctx, tokenHash)
	if err == nil {
		t.Error("expected error for revoked token, got nil")
	}
}

func TestRevokeNonExistentSession(t *testing.T) {
	store, s := setupTestRedis(t)
	defer store.Close()
	defer s.Close()

	ctx := context.Background()

	// Revoking non-existent token should not error
	err := store.RevokeRefreshSession(ctx, "non-existent-token")
	if err != nil {
		t.Errorf("RevokeRefreshSession for non-existent token failed: %v", err)
	}
}

func TestSessionIsolation(t *testing.T) {
	store, s := setupTestRedis(t)
	defer store.Close()
	defer s.Close()

	ctx := context.Background()
	expiresAt := time.Now().Add(24 * time.Hour)

	// Save two different sessions
	err := store.SaveRefreshSession(ctx, "token-1", "user-1", expiresAt)
	if err != nil {
		t.Fatalf("SaveRefreshSession 1 failed: %v", err)
	}

	err = store.SaveRefreshSession(ctx, "token-2", "user-2", expiresAt)
	if err != nil {
		t.Fatalf("SaveRefreshSession 2 failed: %v", err)
	}

	// Lookup each session
	user1, err := store.LookupRefreshSession(ctx, "token-1")
	if err != nil {
		t.Fatalf("Lookup token-1 failed: %v", err)
	}
	if user1.ID != "user-1" {
		t.Errorf("expected user-1, got %s", user1.ID)
	}

	user2, err := store.LookupRefreshSession(ctx, "token-2")
	if err != nil {
		t.Fatalf("Lookup token-2 failed: %v", err)
	}
	if user2.ID != "user-2" {
		t.Errorf("expected user-2, got %s", user2.ID)
	}

	// Revoke one session
	err = store.RevokeRefreshSession(ctx, "token-1")
	if err != nil {
		t.Fatalf("Revoke token-1 failed: %v", err)
	}

	// token-1 should be gone
	_, err = store.LookupRefreshSession(ctx, "token-1")
	if err == nil {
		t.Error("expected error for revoked token-1, got nil")
	}

	// token-2 should still exist
	user2, err = store.LookupRefreshSession(ctx, "token-2")
	if err != nil {
		t.Fatalf("Lookup token-2 after revoke failed: %v", err)
	}
	if user2.ID != "user-2" {
		t.Errorf("expected user-2 after revoke, got %s", user2.ID)
	}
}
