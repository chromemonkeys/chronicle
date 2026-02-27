// Package authpw provides email/password authentication with verification.
package authpw

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"chronicle/api/internal/store"
	"golang.org/x/crypto/bcrypt"
)

// Service provides email/password authentication
type Service struct {
	store       UserStore
	tokenSecret []byte
}

// UserStore defines the storage interface for auth
type UserStore interface {
	GetUserByEmail(ctx context.Context, email string) (store.User, error)
	GetUserByID(ctx context.Context, id string) (store.User, error)
	CreateUser(ctx context.Context, user store.User) error
	UpdateUserVerificationToken(ctx context.Context, userID, token string, expiresAt time.Time) error
	VerifyUserEmail(ctx context.Context, token string) error
	UpdateUserPassword(ctx context.Context, userID, passwordHash string) error
	CreatePasswordReset(ctx context.Context, userID, token string, expiresAt time.Time) error
	GetPasswordReset(ctx context.Context, token string) (string, error)
	MarkPasswordResetUsed(ctx context.Context, token string) error
}

// NewService creates a new auth service
func NewService(store UserStore, tokenSecret string) *Service {
	return &Service{
		store:       store,
		tokenSecret: []byte(tokenSecret),
	}
}

// SignUpRequest contains sign-up parameters
type SignUpRequest struct {
	Email       string
	Password    string
	DisplayName string
}

// SignUpResponse contains sign-up result
type SignUpResponse struct {
	UserID              string
	VerificationToken   string
	RequiresEmailVerify bool
}

// SignUp creates a new user account
func (s *Service) SignUp(ctx context.Context, req SignUpRequest) (*SignUpResponse, error) {
	// Validate input
	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		return nil, errors.New("email, password, and display name are required")
	}

	if len(req.Password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}

	// Check if email already exists
	_, err := s.store.GetUserByEmail(ctx, req.Email)
	if err == nil {
		return nil, errors.New("email already registered")
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Generate verification token
	verificationToken, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generate verification token: %w", err)
	}

	// Create user
	user := store.User{
		ID:                generateID(),
		DisplayName:       req.DisplayName,
		Email:             req.Email,
		PasswordHash:      string(hash),
		Role:              "editor", // Default role
		IsExternal:        false,
		IsEmailVerified:   false,
		VerificationToken: verificationToken,
	}

	if err := s.store.CreateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	// Set verification expiry (24 hours)
	expiresAt := time.Now().Add(24 * time.Hour)
	if err := s.store.UpdateUserVerificationToken(ctx, user.ID, verificationToken, expiresAt); err != nil {
		return nil, fmt.Errorf("set verification expiry: %w", err)
	}

	return &SignUpResponse{
		UserID:              user.ID,
		VerificationToken:   verificationToken,
		RequiresEmailVerify: true,
	}, nil
}

// SignInRequest contains sign-in parameters
type SignInRequest struct {
	Email    string
	Password string
}

// SignInResponse contains sign-in result
type SignInResponse struct {
	User           store.User
	RequiresVerify bool
}

// SignIn authenticates a user
func (s *Service) SignIn(ctx context.Context, req SignInRequest) (*SignInResponse, error) {
	if req.Email == "" || req.Password == "" {
		return nil, errors.New("email and password are required")
	}

	// Look up user by email
	user, err := s.store.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, errors.New("invalid email or password")
	}

	// Check if email is verified
	if !user.IsEmailVerified {
		return &SignInResponse{
			User:           user,
			RequiresVerify: true,
		}, nil
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	return &SignInResponse{
		User:           user,
		RequiresVerify: false,
	}, nil
}

// VerifyEmail verifies an email address using a token
func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	if token == "" {
		return errors.New("verification token required")
	}

	if err := s.store.VerifyUserEmail(ctx, token); err != nil {
		return errors.New("invalid or expired verification token")
	}

	return nil
}

// RequestPasswordReset creates a password reset token
func (s *Service) RequestPasswordReset(ctx context.Context, email string) (string, error) {
	user, err := s.store.GetUserByEmail(ctx, email)
	if err != nil {
		// Don't reveal if email exists
		return "", nil
	}

	token, err := generateToken()
	if err != nil {
		return "", err
	}

	expiresAt := time.Now().Add(1 * time.Hour)
	if err := s.store.CreatePasswordReset(ctx, user.ID, token, expiresAt); err != nil {
		return "", err
	}

	return token, nil
}

// ResetPasswordRequest contains password reset parameters
type ResetPasswordRequest struct {
	Token       string
	NewPassword string
}

// ResetPassword resets a user's password using a reset token
func (s *Service) ResetPassword(ctx context.Context, req ResetPasswordRequest) error {
	if req.Token == "" || req.NewPassword == "" {
		return errors.New("token and new password are required")
	}

	if len(req.NewPassword) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	// Get user ID from token
	userID, err := s.store.GetPasswordReset(ctx, req.Token)
	if err != nil {
		return errors.New("invalid or expired reset token")
	}

	// Hash new password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	// Update password
	if err := s.store.UpdateUserPassword(ctx, userID, string(hash)); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	// Mark token as used
	if err := s.store.MarkPasswordResetUsed(ctx, req.Token); err != nil {
		// Log but don't fail - password was reset
	}

	return nil
}

// generateToken creates a secure random token
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// generateID creates a simple ID
func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
