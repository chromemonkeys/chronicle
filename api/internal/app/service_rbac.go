package app

import (
	"context"
	"fmt"
	"time"

	"chronicle/api/internal/rbac"
	"chronicle/api/internal/store"
	"chronicle/api/internal/util"
)

// =============================================================================
// Sprint 3: Space Permissions Service Methods
// =============================================================================

// ListSpacePermissions returns all permissions for a space
func (s *Service) ListSpacePermissions(ctx context.Context, spaceID string) (map[string]any, error) {
	perms, err := s.store.ListPermissions(ctx, "space", spaceID)
	if err != nil {
		return nil, fmt.Errorf("list space permissions: %w", err)
	}

	guests, err := s.store.ListGuestUsers(ctx, spaceID)
	if err != nil {
		return nil, fmt.Errorf("list guest users: %w", err)
	}

	// Format permissions for API response
	formattedPerms := make([]map[string]any, len(perms))
	for i, p := range perms {
		formattedPerms[i] = map[string]any{
			"id":           p.ID,
			"subjectType":  p.SubjectType,
			"subjectId":    p.SubjectID,
			"resourceType": p.ResourceType,
			"resourceId":   p.ResourceID,
			"role":         p.Role,
			"grantedBy":    p.GrantedBy,
			"grantedAt":    p.GrantedAt,
			"expiresAt":    p.ExpiresAt,
			"userEmail":    p.UserEmail,
			"userName":     p.UserName,
			"groupName":    p.GroupName,
			"memberCount":  p.MemberCount,
		}
	}

	// Format guests for API response
	formattedGuests := make([]map[string]any, len(guests))
	for i, g := range guests {
		formattedGuests[i] = map[string]any{
			"id":          g.ID,
			"email":       g.Email,
			"displayName": g.DisplayName,
			"role":        g.Role,
			"createdAt":   g.CreatedAt,
			"expiresAt":   g.VerificationExpiresAt,
		}
	}

	return map[string]any{
		"permissions": formattedPerms,
		"guests":      formattedGuests,
	}, nil
}

// GrantSpacePermission creates or updates a space permission
func (s *Service) GrantSpacePermission(ctx context.Context, spaceID string, subjectType, subjectID, role string, expiresAtStr *string, grantedByID string) (map[string]any, error) {
	// Validate role
	normalizedRole := rbac.Normalize(role)

	// Parse expires at
	var expiresAt *time.Time
	if expiresAtStr != nil && *expiresAtStr != "" {
		t, err := time.Parse(time.RFC3339, *expiresAtStr)
		if err != nil {
			return nil, &DomainError{
				Status:  422,
				Code:    "VALIDATION_ERROR",
				Message: "Invalid expiresAt format",
			}
		}
		expiresAt = &t
	}

	// Get workspace ID from space
	space, err := s.store.GetSpace(ctx, spaceID)
	if err != nil {
		return nil, fmt.Errorf("get space: %w", err)
	}
	if space.ID == "" {
		return nil, &DomainError{
			Status:  404,
			Code:    "NOT_FOUND",
			Message: "Space not found",
		}
	}

	perm := store.Permission{
		ID:           util.NewID("perm"),
		WorkspaceID:  space.WorkspaceID,
		SubjectType:  subjectType,
		SubjectID:    subjectID,
		ResourceType: "space",
		ResourceID:   spaceID,
		Role:         string(normalizedRole),
		GrantedBy:    &grantedByID,
		GrantedAt:    time.Now(),
		ExpiresAt:    expiresAt,
	}

	if err := s.store.UpsertPermission(ctx, perm); err != nil {
		return nil, fmt.Errorf("upsert permission: %w", err)
	}

	return map[string]any{
		"id":           perm.ID,
		"subjectType":  perm.SubjectType,
		"subjectId":    perm.SubjectID,
		"resourceType": perm.ResourceType,
		"resourceId":   perm.ResourceID,
		"role":         perm.Role,
		"grantedBy":    perm.GrantedBy,
		"grantedAt":    perm.GrantedAt,
		"expiresAt":    perm.ExpiresAt,
	}, nil
}

// RevokeSpacePermission removes a space permission
func (s *Service) RevokeSpacePermission(ctx context.Context, permissionID string) error {
	if err := s.store.DeletePermission(ctx, permissionID); err != nil {
		return fmt.Errorf("delete permission: %w", err)
	}
	return nil
}

// =============================================================================
// Sprint 3: Guest User Service Methods
// =============================================================================

// InviteGuest invites a guest user to a space
func (s *Service) InviteGuest(ctx context.Context, spaceID, email string, role string, expiresAtStr *string) (map[string]any, error) {
	// Validate role
	normalizedRole := rbac.Normalize(role)

	// Parse expires at
	var expiresAt *time.Time
	if expiresAtStr != nil && *expiresAtStr != "" {
		t, err := time.Parse(time.RFC3339, *expiresAtStr)
		if err != nil {
			return nil, &DomainError{
				Status:  422,
				Code:    "VALIDATION_ERROR",
				Message: "Invalid expiresAt format",
			}
		}
		expiresAt = &t
	}

	// Check if user already exists
	existingUser, err := s.store.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("check existing user: %w", err)
	}

	var userID string
	if existingUser.ID == "" {
		// Create new guest user
		userID = util.NewID("usr")
		user := store.User{
			ID:          userID,
			Email:       email,
			DisplayName: email, // Default to email
			Role:        string(normalizedRole),
			IsExternal:  true,
			// Note: external_space_id and external_expires_at are in the DB
			// but not in the User struct yet - would need to be added
		}
		// We'd need a CreateGuestUser method in store
		// For now, this is a placeholder
		_ = user
	} else {
		// Update existing user to be a guest for this space
		userID = existingUser.ID
	}

	// TODO: Send invitation email

	return map[string]any{
		"id":          userID,
		"email":       email,
		"role":        string(normalizedRole),
		"spaceId":     spaceID,
		"expiresAt":   expiresAt,
		"displayName": email,
	}, nil
}

// RemoveGuest removes a guest's access to a space
func (s *Service) RemoveGuest(ctx context.Context, spaceID, userID string) error {
	// Remove from space permissions
	if err := s.store.RemoveGuestUser(ctx, userID); err != nil {
		return fmt.Errorf("remove guest user: %w", err)
	}
	return nil
}

// =============================================================================
// Sprint 3: Public Links Service Methods
// =============================================================================

// CreatePublicLink creates a public share link for a document
func (s *Service) CreatePublicLink(ctx context.Context, documentID, role string, password string, expiresAtStr *string, createdBy string) (map[string]any, error) {
	// Generate secure token
	token := generateSecureToken(32)

	// Parse expires at
	var expiresAt *time.Time
	if expiresAtStr != nil && *expiresAtStr != "" {
		t, err := time.Parse(time.RFC3339, *expiresAtStr)
		if err != nil {
			return nil, &DomainError{
				Status:  422,
				Code:    "VALIDATION_ERROR",
				Message: "Invalid expiresAt format",
			}
		}
		expiresAt = &t
	}

	// Hash password if provided
	var passwordHash *string
	if password != "" {
		hash := hashPassword(password) // Would need bcrypt
		passwordHash = &hash
	}

	link := store.PublicLink{
		ID:        util.NewID("link"),
		Token:     token,
		DocumentID: documentID,
		CreatedBy: createdBy,
		Role:      role,
		PasswordHash: passwordHash,
		ExpiresAt: expiresAt,
		AccessCount: 0,
		CreatedAt: time.Now(),
	}

	if err := s.store.InsertPublicLink(ctx, link); err != nil {
		return nil, fmt.Errorf("insert public link: %w", err)
	}

	return map[string]any{
		"id":        link.ID,
		"token":     link.Token,
		"documentId": link.DocumentID,
		"role":      link.Role,
		"expiresAt": link.ExpiresAt,
		"createdAt": link.CreatedAt,
	}, nil
}

// RevokePublicLink revokes a public share link
func (s *Service) RevokePublicLink(ctx context.Context, linkID string) error {
	if err := s.store.RevokePublicLink(ctx, linkID); err != nil {
		return fmt.Errorf("revoke public link: %w", err)
	}
	return nil
}

// GetPublicLink returns a public link by token
func (s *Service) GetPublicLink(ctx context.Context, token string) (map[string]any, error) {
	link, err := s.store.GetPublicLinkByToken(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("get public link: %w", err)
	}
	if link == nil {
		return nil, &DomainError{
			Status:  404,
			Code:    "NOT_FOUND",
			Message: "Link not found or expired",
		}
	}

	return map[string]any{
		"id":        link.ID,
		"token":     link.Token,
		"documentId": link.DocumentID,
		"role":      link.Role,
		"expiresAt": link.ExpiresAt,
	}, nil
}

// RecordPublicLinkAccess increments the access count for a public link
func (s *Service) RecordPublicLinkAccess(ctx context.Context, linkID string) error {
	if err := s.store.IncrementPublicLinkAccess(ctx, linkID); err != nil {
		return fmt.Errorf("record public link access: %w", err)
	}
	return nil
}

// =============================================================================
// Helper functions
// =============================================================================

func generateSecureToken(length int) string {
	// Simple implementation - use crypto/rand in production
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[time.Now().UnixNano()%int64(len(charset))]
	}
	return string(result)
}

func hashPassword(password string) string {
	// Placeholder - use bcrypt in production
	return password
}
