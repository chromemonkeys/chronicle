// Package session provides session storage backends for refresh tokens.
package session

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"chronicle/api/internal/store"
	"github.com/redis/go-redis/v9"
)

// TokenData holds the data stored for each refresh token
type TokenData struct {
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
	IsExternal  bool      `json:"is_external"`
	CreatedAt   time.Time `json:"created_at"`
}

// RedisStore implements refresh token storage using Redis
type RedisStore struct {
	client *redis.Client
	prefix string
}

// NewRedisStore creates a new Redis-backed session store
func NewRedisStore(redisURL string) (*RedisStore, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}

	client := redis.NewClient(opts)
	
	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("connect to redis: %w", err)
	}

	return &RedisStore{
		client: client,
		prefix: "refresh:",
	}, nil
}

// NewRedisStoreWithClient creates a store from an existing Redis client
func NewRedisStoreWithClient(client *redis.Client) *RedisStore {
	return &RedisStore{
		client: client,
		prefix: "refresh:",
	}
}

// key generates the Redis key for a token hash
func (s *RedisStore) key(tokenHash string) string {
	return s.prefix + tokenHash
}

// SaveRefreshSession stores a refresh token with expiration
func (s *RedisStore) SaveRefreshSession(ctx context.Context, tokenHash, userID string, expiresAt time.Time) error {
	data := TokenData{
		UserID:    userID,
		CreatedAt: time.Now(),
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal token data: %w", err)
	}

	ttl := time.Until(expiresAt)
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour // Default 30 days
	}

	key := s.key(tokenHash)
	if err := s.client.Set(ctx, key, jsonData, ttl).Err(); err != nil {
		return fmt.Errorf("save refresh token: %w", err)
	}

	return nil
}

// LookupRefreshSession retrieves a refresh token and returns user info
func (s *RedisStore) LookupRefreshSession(ctx context.Context, tokenHash string) (store.User, error) {
	key := s.key(tokenHash)
	jsonData, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return store.User{}, fmt.Errorf("token not found or expired")
	}
	if err != nil {
		return store.User{}, fmt.Errorf("lookup refresh token: %w", err)
	}

	var data TokenData
	if err := json.Unmarshal([]byte(jsonData), &data); err != nil {
		return store.User{}, fmt.Errorf("unmarshal token data: %w", err)
	}

	// Default role if empty
	if data.Role == "" {
		data.Role = "viewer"
	}

	return store.User{
		ID:          data.UserID,
		DisplayName: data.DisplayName,
		Role:        data.Role,
		IsExternal:  data.IsExternal,
	}, nil
}

// RevokeRefreshSession deletes a refresh token
func (s *RedisStore) RevokeRefreshSession(ctx context.Context, tokenHash string) error {
	key := s.key(tokenHash)
	if err := s.client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// Close closes the Redis connection
func (s *RedisStore) Close() error {
	return s.client.Close()
}

// Ping checks if Redis is reachable
func (s *RedisStore) Ping(ctx context.Context) error {
	return s.client.Ping(ctx).Err()
}


