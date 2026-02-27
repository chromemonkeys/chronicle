package authpw

import (
	"context"
	"errors"
	"testing"
	"time"

	"chronicle/api/internal/store"
)

// mockUserStore is a mock implementation of UserStore for testing
type mockUserStore struct {
	users         map[string]store.User
	emailIndex    map[string]string // email -> userID
	verifications map[string]store.User
	resets        map[string]struct {
		userID    string
		expiresAt time.Time
		used      bool
	}
}

func newMockUserStore() *mockUserStore {
	return &mockUserStore{
		users:         make(map[string]store.User),
		emailIndex:    make(map[string]string),
		verifications: make(map[string]store.User),
		resets:        make(map[string]struct {
			userID    string
			expiresAt time.Time
			used      bool
		}),
	}
}

func (m *mockUserStore) GetUserByEmail(ctx context.Context, email string) (store.User, error) {
	if userID, ok := m.emailIndex[email]; ok {
		return m.users[userID], nil
	}
	return store.User{}, errors.New("user not found")
}

func (m *mockUserStore) GetUserByID(ctx context.Context, id string) (store.User, error) {
	if user, ok := m.users[id]; ok {
		return user, nil
	}
	return store.User{}, errors.New("user not found")
}

func (m *mockUserStore) CreateUser(ctx context.Context, user store.User) error {
	m.users[user.ID] = user
	m.emailIndex[user.Email] = user.ID
	return nil
}

func (m *mockUserStore) UpdateUserVerificationToken(ctx context.Context, userID, token string, expiresAt time.Time) error {
	if user, ok := m.users[userID]; ok {
		user.VerificationToken = token
		user.VerificationExpiresAt = &expiresAt
		m.users[userID] = user
		m.verifications[token] = user
	}
	return nil
}

func (m *mockUserStore) VerifyUserEmail(ctx context.Context, token string) error {
	if user, ok := m.verifications[token]; ok {
		user.IsEmailVerified = true
		m.users[user.ID] = user
		m.emailIndex[user.Email] = user.ID
		return nil
	}
	return errors.New("invalid token")
}

func (m *mockUserStore) UpdateUserPassword(ctx context.Context, userID, passwordHash string) error {
	if user, ok := m.users[userID]; ok {
		user.PasswordHash = passwordHash
		m.users[userID] = user
		return nil
	}
	return errors.New("user not found")
}

func (m *mockUserStore) CreatePasswordReset(ctx context.Context, userID, token string, expiresAt time.Time) error {
	m.resets[token] = struct {
		userID    string
		expiresAt time.Time
		used      bool
	}{userID: userID, expiresAt: expiresAt, used: false}
	return nil
}

func (m *mockUserStore) GetPasswordReset(ctx context.Context, token string) (string, error) {
	if reset, ok := m.resets[token]; ok && !reset.used && time.Now().Before(reset.expiresAt) {
		return reset.userID, nil
	}
	return "", errors.New("invalid or expired token")
}

func (m *mockUserStore) MarkPasswordResetUsed(ctx context.Context, token string) error {
	if reset, ok := m.resets[token]; ok {
		reset.used = true
		m.resets[token] = reset
	}
	return nil
}

func TestSignUp(t *testing.T) {
	ctx := context.Background()
	mockStore := newMockUserStore()
	svc := NewService(mockStore, "test-secret")

	t.Run("successful sign up", func(t *testing.T) {
		req := SignUpRequest{
			Email:       "test@example.com",
			Password:    "password123",
			DisplayName: "Test User",
		}

		resp, err := svc.SignUp(ctx, req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if resp.UserID == "" {
			t.Error("expected UserID to be set")
		}
		if resp.VerificationToken == "" {
			t.Error("expected VerificationToken to be set")
		}
		if !resp.RequiresEmailVerify {
			t.Error("expected RequiresEmailVerify to be true")
		}
	})

	t.Run("duplicate email", func(t *testing.T) {
		req := SignUpRequest{
			Email:       "test@example.com",
			Password:    "password123",
			DisplayName: "Test User 2",
		}

		_, err := svc.SignUp(ctx, req)
		if err == nil {
			t.Error("expected error for duplicate email")
		}
	})

	t.Run("short password", func(t *testing.T) {
		req := SignUpRequest{
			Email:       "test2@example.com",
			Password:    "short",
			DisplayName: "Test User",
		}

		_, err := svc.SignUp(ctx, req)
		if err == nil {
			t.Error("expected error for short password")
		}
	})

	t.Run("missing fields", func(t *testing.T) {
		_, err := svc.SignUp(ctx, SignUpRequest{})
		if err == nil {
			t.Error("expected error for missing fields")
		}
	})
}

func TestSignIn(t *testing.T) {
	ctx := context.Background()
	mockStore := newMockUserStore()
	svc := NewService(mockStore, "test-secret")

	// Create a verified user
	req := SignUpRequest{
		Email:       "test@example.com",
		Password:    "password123",
		DisplayName: "Test User",
	}
	resp, _ := svc.SignUp(ctx, req)
	svc.VerifyEmail(ctx, resp.VerificationToken)

	t.Run("successful sign in", func(t *testing.T) {
		signInReq := SignInRequest{
			Email:    "test@example.com",
			Password: "password123",
		}

		signInResp, err := svc.SignIn(ctx, signInReq)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if signInResp.User.Email != "test@example.com" {
			t.Errorf("expected email test@example.com, got %s", signInResp.User.Email)
		}
		if signInResp.RequiresVerify {
			t.Error("expected RequiresVerify to be false for verified user")
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		req := SignInRequest{
			Email:    "test@example.com",
			Password: "wrongpassword",
		}

		_, err := svc.SignIn(ctx, req)
		if err == nil {
			t.Error("expected error for wrong password")
		}
	})

	t.Run("non-existent user", func(t *testing.T) {
		req := SignInRequest{
			Email:    "nonexistent@example.com",
			Password: "password123",
		}

		_, err := svc.SignIn(ctx, req)
		if err == nil {
			t.Error("expected error for non-existent user")
		}
	})

	t.Run("unverified email", func(t *testing.T) {
		// Create unverified user
		signUpReq := SignUpRequest{
			Email:       "unverified@example.com",
			Password:    "password123",
			DisplayName: "Unverified User",
		}
		svc.SignUp(ctx, signUpReq)

		signInReq := SignInRequest{
			Email:    "unverified@example.com",
			Password: "password123",
		}

		resp, err := svc.SignIn(ctx, signInReq)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !resp.RequiresVerify {
			t.Error("expected RequiresVerify to be true for unverified user")
		}
	})
}

func TestVerifyEmail(t *testing.T) {
	ctx := context.Background()
	mockStore := newMockUserStore()
	svc := NewService(mockStore, "test-secret")

	// Create a user
	req := SignUpRequest{
		Email:       "test@example.com",
		Password:    "password123",
		DisplayName: "Test User",
	}
	resp, _ := svc.SignUp(ctx, req)

	t.Run("valid token", func(t *testing.T) {
		err := svc.VerifyEmail(ctx, resp.VerificationToken)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify user is now verified
		user, _ := mockStore.GetUserByID(ctx, resp.UserID)
		if !user.IsEmailVerified {
			t.Error("expected user to be verified")
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		err := svc.VerifyEmail(ctx, "invalid-token")
		if err == nil {
			t.Error("expected error for invalid token")
		}
	})

	t.Run("empty token", func(t *testing.T) {
		err := svc.VerifyEmail(ctx, "")
		if err == nil {
			t.Error("expected error for empty token")
		}
	})
}

func TestPasswordReset(t *testing.T) {
	ctx := context.Background()
	mockStore := newMockUserStore()
	svc := NewService(mockStore, "test-secret")

	// Create and verify a user
	signUpReq := SignUpRequest{
		Email:       "test@example.com",
		Password:    "password123",
		DisplayName: "Test User",
	}
	resp, _ := svc.SignUp(ctx, signUpReq)
	svc.VerifyEmail(ctx, resp.VerificationToken)

	t.Run("request reset for existing user", func(t *testing.T) {
		token, err := svc.RequestPasswordReset(ctx, "test@example.com")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if token == "" {
			t.Error("expected token to be generated")
		}
	})

	t.Run("request reset for non-existent user - no error", func(t *testing.T) {
		_, err := svc.RequestPasswordReset(ctx, "nonexistent@example.com")
		if err != nil {
			t.Errorf("expected no error for non-existent user, got: %v", err)
		}
	})

	t.Run("reset password with valid token", func(t *testing.T) {
		token, _ := svc.RequestPasswordReset(ctx, "test@example.com")

		err := svc.ResetPassword(ctx, ResetPasswordRequest{
			Token:       token,
			NewPassword: "newpassword123",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Verify old password doesn't work
		_, err = svc.SignIn(ctx, SignInRequest{
			Email:    "test@example.com",
			Password: "password123",
		})
		if err == nil {
			t.Error("expected old password to not work")
		}

		// Verify new password works
		_, err = svc.SignIn(ctx, SignInRequest{
			Email:    "test@example.com",
			Password: "newpassword123",
		})
		if err != nil {
			t.Errorf("expected new password to work: %v", err)
		}
	})

	t.Run("reset with invalid token", func(t *testing.T) {
		err := svc.ResetPassword(ctx, ResetPasswordRequest{
			Token:       "invalid-token",
			NewPassword: "newpassword123",
		})
		if err == nil {
			t.Error("expected error for invalid token")
		}
	})

	t.Run("reset with short password", func(t *testing.T) {
		err := svc.ResetPassword(ctx, ResetPasswordRequest{
			Token:       "some-token",
			NewPassword: "short",
		})
		if err == nil {
			t.Error("expected error for short password")
		}
	})
}
