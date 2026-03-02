package app

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"chronicle/api/internal/rbac"
	"chronicle/api/internal/store"
	"chronicle/api/internal/util"
	"golang.org/x/crypto/bcrypt"
)

// parseRFC3339 parses a time string in RFC3339 format, tolerating milliseconds
// from JavaScript's Date.toISOString() (e.g. "2026-03-12T16:10:00.000Z").
func parseRFC3339(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339Nano, s)
	}
	return t, err
}

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
		t, err := parseRFC3339(*expiresAtStr)
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

	permID, err := s.store.UpsertPermission(ctx, perm)
	if err != nil {
		return nil, fmt.Errorf("upsert permission: %w", err)
	}

	return map[string]any{
		"id":           permID,
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
		t, err := parseRFC3339(*expiresAtStr)
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
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check existing user: %w", err)
	}

	var userID string
	if existingUser.ID == "" {
		// Create new guest user
		userID = util.NewID("usr")
		user := store.User{
			ID:          userID,
			Email:       email,
			DisplayName: email,
			Role:        string(normalizedRole),
			IsExternal:  true,
		}
		if err := s.store.CreateGuestUser(ctx, user, spaceID, expiresAt); err != nil {
			return nil, fmt.Errorf("create guest user: %w", err)
		}
	} else {
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
		t, err := parseRFC3339(*expiresAtStr)
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
		Token:     token,
		DocumentID: documentID,
		CreatedBy: createdBy,
		Role:      role,
		PasswordHash: passwordHash,
		ExpiresAt: expiresAt,
		AccessCount: 0,
		CreatedAt: time.Now(),
	}

	linkID, err := s.store.InsertPublicLink(ctx, link)
	if err != nil {
		return nil, fmt.Errorf("insert public link: %w", err)
	}

	return map[string]any{
		"id":        linkID,
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

// GetDocumentShareData returns the composite share state for a document
func (s *Service) GetDocumentShareData(ctx context.Context, documentID string) (map[string]any, error) {
	doc, err := s.store.GetDocument(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}

	space, err := s.store.GetSpace(ctx, doc.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("get space: %w", err)
	}

	perms, err := s.store.ListPermissions(ctx, "document", documentID)
	if err != nil {
		return nil, fmt.Errorf("list document permissions: %w", err)
	}

	links, err := s.store.ListPublicLinks(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("list public links: %w", err)
	}

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

	formattedLinks := make([]map[string]any, len(links))
	for i, l := range links {
		formattedLinks[i] = map[string]any{
			"id":             l.ID,
			"token":          l.Token,
			"documentId":     l.DocumentID,
			"role":           l.Role,
			"expiresAt":      l.ExpiresAt,
			"accessCount":    l.AccessCount,
			"lastAccessedAt": l.LastAccessedAt,
			"createdAt":      l.CreatedAt,
		}
	}

	return map[string]any{
		"document": map[string]any{
			"id":     doc.ID,
			"title":  doc.Title,
			"status": doc.Status,
		},
		"space": map[string]any{
			"id":   space.ID,
			"name": space.Name,
		},
		"shareMode":   doc.ShareMode,
		"permissions": formattedPerms,
		"publicLinks": formattedLinks,
	}, nil
}

// UpdateDocumentShareMode updates a document's share mode
func (s *Service) UpdateDocumentShareMode(ctx context.Context, documentID, mode string) error {
	return s.store.UpdateDocumentShareMode(ctx, documentID, mode)
}

// GrantDocumentPermission grants a user permission on a document by email
func (s *Service) GrantDocumentPermission(ctx context.Context, documentID, email, role string, expiresAtStr *string, grantedByID string) (map[string]any, error) {
	normalizedRole := rbac.Normalize(role)

	var expiresAt *time.Time
	if expiresAtStr != nil && *expiresAtStr != "" {
		t, err := parseRFC3339(*expiresAtStr)
		if err != nil {
			return nil, &DomainError{
				Status:  422,
				Code:    "VALIDATION_ERROR",
				Message: "Invalid expiresAt format",
			}
		}
		expiresAt = &t
	}

	// Look up user by email
	user, err := s.store.GetUserByEmail(ctx, email)
	userNotFound := errors.Is(err, sql.ErrNoRows)
	if err != nil && !userNotFound {
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	// User not found — generate a secure invite link (view-only guest access)
	if userNotFound {
		if expiresAt == nil {
			defaultExpiry := time.Now().AddDate(0, 0, 30)
			expiresAt = &defaultExpiry
		}
		token := generateSecureToken(32)
		link := store.PublicLink{
			Token:      token,
			DocumentID: documentID,
			CreatedBy:  grantedByID,
			Role:       "viewer",
			ExpiresAt:  expiresAt,
			CreatedAt:  time.Now(),
		}
		linkID, linkErr := s.store.InsertPublicLink(ctx, link)
		if linkErr != nil {
			return nil, fmt.Errorf("create invite link: %w", linkErr)
		}
		return map[string]any{
			"type":      "invite_link",
			"id":        linkID,
			"token":     token,
			"email":     email,
			"role":      "viewer",
			"expiresAt": expiresAt,
			"createdAt": link.CreatedAt,
		}, nil
	}

	// Existing user — grant document permission with requested role
	doc, err := s.store.GetDocument(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}

	space, err := s.store.GetSpace(ctx, doc.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("get space: %w", err)
	}

	perm := store.Permission{
		WorkspaceID:  space.WorkspaceID,
		SubjectType:  "user",
		SubjectID:    user.ID,
		ResourceType: "document",
		ResourceID:   documentID,
		Role:         string(normalizedRole),
		GrantedBy:    &grantedByID,
		GrantedAt:    time.Now(),
		ExpiresAt:    expiresAt,
	}

	permID, err := s.store.UpsertPermission(ctx, perm)
	if err != nil {
		return nil, fmt.Errorf("upsert permission: %w", err)
	}

	return map[string]any{
		"type":         "permission",
		"id":           permID,
		"subjectType":  perm.SubjectType,
		"subjectId":    perm.SubjectID,
		"resourceType": perm.ResourceType,
		"resourceId":   perm.ResourceID,
		"role":         perm.Role,
		"grantedBy":    perm.GrantedBy,
		"grantedAt":    perm.GrantedAt,
		"expiresAt":    perm.ExpiresAt,
		"userEmail":    user.Email,
		"userName":     user.DisplayName,
	}, nil
}

// SearchShareCandidates returns users and groups matching a query for the share dialog
func (s *Service) SearchShareCandidates(ctx context.Context, query string) (map[string]any, error) {
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}

	users, _, err := s.store.ListWorkspaceUsers(ctx, ws.ID, query, 10, 0)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}

	allGroups, err := s.store.ListGroups(ctx, ws.ID)
	if err != nil {
		return nil, fmt.Errorf("search groups: %w", err)
	}

	// Filter groups by name (case-insensitive)
	lowerQuery := strings.ToLower(query)
	matchedGroups := make([]store.Group, 0)
	for _, g := range allGroups {
		if strings.Contains(strings.ToLower(g.Name), lowerQuery) {
			matchedGroups = append(matchedGroups, g)
		}
	}

	formattedUsers := make([]map[string]any, len(users))
	for i, u := range users {
		formattedUsers[i] = map[string]any{
			"id":          u.ID,
			"displayName": u.DisplayName,
			"email":       u.Email,
		}
	}

	formattedGroups := make([]map[string]any, len(matchedGroups))
	for i, g := range matchedGroups {
		members, _ := s.store.ListGroupMembers(ctx, g.ID)
		formattedGroups[i] = map[string]any{
			"id":          g.ID,
			"name":        g.Name,
			"description": g.Description,
			"memberCount": len(members),
		}
	}

	return map[string]any{
		"users":  formattedUsers,
		"groups": formattedGroups,
	}, nil
}

// GrantDocumentPermissionDirect grants a permission on a document by subject type and ID
func (s *Service) GrantDocumentPermissionDirect(ctx context.Context, documentID, subjectType, subjectID, role string, expiresAtStr *string, grantedByID string) (map[string]any, error) {
	normalizedRole := rbac.Normalize(role)

	var expiresAt *time.Time
	if expiresAtStr != nil && *expiresAtStr != "" {
		t, err := parseRFC3339(*expiresAtStr)
		if err != nil {
			return nil, &DomainError{
				Status:  422,
				Code:    "VALIDATION_ERROR",
				Message: "Invalid expiresAt format",
			}
		}
		expiresAt = &t
	}

	// Validate subject type
	if subjectType != "user" && subjectType != "group" {
		return nil, &DomainError{
			Status:  422,
			Code:    "VALIDATION_ERROR",
			Message: "subjectType must be 'user' or 'group'",
		}
	}

	// For groups, validate the group exists
	if subjectType == "group" {
		group, err := s.store.GetGroup(ctx, subjectID)
		if err != nil {
			return nil, fmt.Errorf("get group: %w", err)
		}
		if group == nil {
			return nil, &DomainError{Status: 404, Code: "NOT_FOUND", Message: "Group not found"}
		}
	}

	// Resolve doc→space→workspace chain
	doc, err := s.store.GetDocument(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}
	space, err := s.store.GetSpace(ctx, doc.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("get space: %w", err)
	}

	perm := store.Permission{
		WorkspaceID:  space.WorkspaceID,
		SubjectType:  subjectType,
		SubjectID:    subjectID,
		ResourceType: "document",
		ResourceID:   documentID,
		Role:         string(normalizedRole),
		GrantedBy:    &grantedByID,
		GrantedAt:    time.Now(),
		ExpiresAt:    expiresAt,
	}

	permID, err := s.store.UpsertPermission(ctx, perm)
	if err != nil {
		return nil, fmt.Errorf("upsert permission: %w", err)
	}

	result := map[string]any{
		"type":         "permission",
		"id":           permID,
		"subjectType":  perm.SubjectType,
		"subjectId":    perm.SubjectID,
		"resourceType": perm.ResourceType,
		"resourceId":   perm.ResourceID,
		"role":         perm.Role,
		"grantedBy":    perm.GrantedBy,
		"grantedAt":    perm.GrantedAt,
		"expiresAt":    perm.ExpiresAt,
	}

	// Add joined fields based on subject type
	if subjectType == "group" {
		group, _ := s.store.GetGroup(ctx, subjectID)
		if group != nil {
			result["groupName"] = group.Name
			members, _ := s.store.ListGroupMembers(ctx, group.ID)
			result["memberCount"] = len(members)
		}
	} else {
		user, uErr := s.store.GetUserByID(ctx, subjectID)
		if uErr == nil {
			result["userEmail"] = user.Email
			result["userName"] = user.DisplayName
		}
	}

	return result, nil
}

// RevokeDocumentPermission removes a document permission by ID
func (s *Service) RevokeDocumentPermission(ctx context.Context, permissionID string) error {
	if err := s.store.DeletePermission(ctx, permissionID); err != nil {
		return fmt.Errorf("delete permission: %w", err)
	}
	return nil
}

// =============================================================================
// Admin User Management Service Methods
// =============================================================================

// ListWorkspaceUsers returns paginated workspace users
func (s *Service) ListWorkspaceUsers(ctx context.Context, search string, limit, offset int) (map[string]any, error) {
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}

	users, total, err := s.store.ListWorkspaceUsers(ctx, ws.ID, search, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list workspace users: %w", err)
	}

	formatted := make([]map[string]any, len(users))
	for i, u := range users {
		formatted[i] = map[string]any{
			"id":            u.ID,
			"email":         u.Email,
			"displayName":   u.DisplayName,
			"role":          u.Role,
			"isExternal":    u.IsExternal,
			"deactivatedAt": u.DeactivatedAt,
			"createdAt":     u.CreatedAt,
		}
	}

	return map[string]any{
		"users": formatted,
		"total": total,
	}, nil
}

// AdminCreateUser creates a new user and adds them to the default workspace
func (s *Service) AdminCreateUser(ctx context.Context, displayName, email, role string) (map[string]any, error) {
	if displayName == "" && email == "" {
		return nil, &DomainError{Status: 422, Code: "VALIDATION_ERROR", Message: "displayName or email is required"}
	}
	if role == "" {
		role = "editor"
	}
	normalizedRole := rbac.Normalize(role)

	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}

	name := displayName
	if name == "" {
		name = email
	}

	// EnsureUserByName creates the user + workspace membership atomically
	user, err := s.store.EnsureUserByName(ctx, name)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	// Update role if not the default "editor"
	if string(normalizedRole) != "editor" {
		_ = s.store.UpdateUserRole(ctx, user.ID, ws.ID, string(normalizedRole))
	}

	return map[string]any{
		"id":          user.ID,
		"displayName": user.DisplayName,
		"email":       user.Email,
		"role":        string(normalizedRole),
		"createdAt":   user.CreatedAt,
	}, nil
}

// UpdateUserRole changes a user's workspace role
func (s *Service) UpdateUserRole(ctx context.Context, userID, role string) error {
	normalizedRole := rbac.Normalize(role)
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return fmt.Errorf("get workspace: %w", err)
	}
	return s.store.UpdateUserRole(ctx, userID, ws.ID, string(normalizedRole))
}

// SetUserDeactivated activates or deactivates a user
func (s *Service) SetUserDeactivated(ctx context.Context, userID string, deactivated bool) error {
	return s.store.SetUserDeactivated(ctx, userID, deactivated)
}

// =============================================================================
// Groups Service Methods
// =============================================================================

// ListGroups returns all groups in the default workspace
func (s *Service) ListGroups(ctx context.Context) ([]map[string]any, error) {
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}

	groups, err := s.store.ListGroups(ctx, ws.ID)
	if err != nil {
		return nil, fmt.Errorf("list groups: %w", err)
	}

	formatted := make([]map[string]any, len(groups))
	for i, g := range groups {
		// Get member count
		members, err := s.store.ListGroupMembers(ctx, g.ID)
		if err != nil {
			return nil, fmt.Errorf("list group members: %w", err)
		}
		formatted[i] = map[string]any{
			"id":          g.ID,
			"name":        g.Name,
			"description": g.Description,
			"memberCount": len(members),
			"createdAt":   g.CreatedAt,
		}
	}
	return formatted, nil
}

// GetGroup returns a single group by ID
func (s *Service) GetGroup(ctx context.Context, groupID string) (map[string]any, error) {
	group, err := s.store.GetGroup(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("get group: %w", err)
	}
	if group == nil {
		return nil, &DomainError{Status: 404, Code: "NOT_FOUND", Message: "Group not found"}
	}

	members, err := s.store.ListGroupMembers(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}

	formattedMembers := make([]map[string]any, len(members))
	for i, m := range members {
		formattedMembers[i] = map[string]any{
			"id":          m.ID,
			"displayName": m.DisplayName,
			"email":       m.Email,
			"role":        m.Role,
		}
	}

	return map[string]any{
		"id":          group.ID,
		"name":        group.Name,
		"description": group.Description,
		"memberCount": len(members),
		"members":     formattedMembers,
		"createdAt":   group.CreatedAt,
	}, nil
}

// CreateGroup creates a new group
func (s *Service) CreateGroup(ctx context.Context, name, description string) (map[string]any, error) {
	ws, err := s.store.GetDefaultWorkspace(ctx)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}

	now := time.Now()
	group := store.Group{
		WorkspaceID: ws.ID,
		Name:        name,
		Description: description,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// InsertGroupReturningID lets the DB generate the UUID
	id, err := s.store.InsertGroupReturningID(ctx, group)
	if err != nil {
		return nil, fmt.Errorf("create group: %w", err)
	}

	return map[string]any{
		"id":          id,
		"name":        group.Name,
		"description": group.Description,
		"memberCount": 0,
		"createdAt":   group.CreatedAt,
	}, nil
}

// UpdateGroup updates a group's name and description
func (s *Service) UpdateGroup(ctx context.Context, groupID, name, description string) error {
	group, err := s.store.GetGroup(ctx, groupID)
	if err != nil {
		return fmt.Errorf("get group: %w", err)
	}
	if group == nil {
		return &DomainError{Status: 404, Code: "NOT_FOUND", Message: "Group not found"}
	}

	group.Name = name
	group.Description = description
	return s.store.UpdateGroup(ctx, *group)
}

// DeleteGroup deletes a group
func (s *Service) DeleteGroup(ctx context.Context, groupID string) error {
	return s.store.DeleteGroup(ctx, groupID)
}

// ListGroupMembers returns all members of a group
func (s *Service) ListGroupMembers(ctx context.Context, groupID string) ([]map[string]any, error) {
	members, err := s.store.ListGroupMembers(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("list group members: %w", err)
	}

	formatted := make([]map[string]any, len(members))
	for i, m := range members {
		formatted[i] = map[string]any{
			"id":          m.ID,
			"displayName": m.DisplayName,
			"email":       m.Email,
			"role":        m.Role,
		}
	}
	return formatted, nil
}

// AddGroupMember adds a user to a group
func (s *Service) AddGroupMember(ctx context.Context, groupID, userID string) error {
	return s.store.AddGroupMember(ctx, groupID, userID)
}

// RemoveGroupMember removes a user from a group
func (s *Service) RemoveGroupMember(ctx context.Context, groupID, userID string) error {
	return s.store.RemoveGroupMember(ctx, groupID, userID)
}

// =============================================================================
// Helper functions
// =============================================================================

func generateSecureToken(length int) string {
	b := make([]byte, length)
	if _, err := crand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func hashPassword(password string) string {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		panic("bcrypt failed: " + err.Error())
	}
	return string(hash)
}
