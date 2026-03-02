package app

import (
	"fmt"
	"net/http"
	"strings"

	"chronicle/api/internal/rbac"
)

// =============================================================================
// Sprint 3: Space Permissions HTTP Handlers
// =============================================================================

func (s *HTTPServer) handleSpacePermissions(w http.ResponseWriter, r *http.Request, session Session, spaceID string) {
	switch r.Method {
	case http.MethodGet:
		// List space permissions
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			s.forbid(w, r, session, string(rbac.ActionAdmin))
			return
		}
		result, err := s.service.ListSpacePermissions(r.Context(), spaceID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, result)

	case http.MethodPost:
		// Grant space permission
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			s.forbid(w, r, session, string(rbac.ActionAdmin))
			return
		}
		var body struct {
			SubjectType string  `json:"subjectType"`
			SubjectID   string  `json:"subjectId"`
			Role        string  `json:"role"`
			ExpiresAt   *string `json:"expiresAt"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		perm, err := s.service.GrantSpacePermission(r.Context(), spaceID, body.SubjectType, body.SubjectID, body.Role, body.ExpiresAt, session.UserID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, perm)

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleSpacePermissionRevoke(w http.ResponseWriter, r *http.Request, session Session, spaceID, permissionID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	if err := s.service.RevokeSpacePermission(r.Context(), permissionID); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// =============================================================================
// Sprint 3: Guest Users HTTP Handlers
// =============================================================================

func (s *HTTPServer) handleSpaceGuests(w http.ResponseWriter, r *http.Request, session Session, spaceID string) {
	switch r.Method {
	case http.MethodPost:
		// Invite guest
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			s.forbid(w, r, session, string(rbac.ActionAdmin))
			return
		}
		var body struct {
			Email     string  `json:"email"`
			Role      string  `json:"role"`
			ExpiresAt *string `json:"expiresAt"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		guest, err := s.service.InviteGuest(r.Context(), spaceID, body.Email, body.Role, body.ExpiresAt)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusCreated, guest)

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleSpaceGuestRemove(w http.ResponseWriter, r *http.Request, session Session, spaceID, userID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	if err := s.service.RemoveGuest(r.Context(), spaceID, userID); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// =============================================================================
// Sprint 3: Public Links HTTP Handlers
// =============================================================================

func (s *HTTPServer) handleDocumentPublicLinks(w http.ResponseWriter, r *http.Request, session Session, documentID string) {
	switch r.Method {
	case http.MethodPost:
		// Create public link
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			s.forbid(w, r, session, string(rbac.ActionAdmin))
			return
		}
		var body struct {
			Role      string  `json:"role"`
			Password  string  `json:"password"`
			ExpiresAt *string `json:"expiresAt"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		link, err := s.service.CreatePublicLink(r.Context(), documentID, body.Role, body.Password, body.ExpiresAt, session.UserID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusCreated, link)

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleDocumentPublicLinkRevoke(w http.ResponseWriter, r *http.Request, session Session, documentID, linkID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	if err := s.service.RevokePublicLink(r.Context(), linkID); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// =============================================================================
// Sprint 3: Share Mode HTTP Handler
// =============================================================================

func (s *HTTPServer) handleDocumentShareMode(w http.ResponseWriter, r *http.Request, session Session, documentID string) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	var body struct {
		Mode string `json:"mode"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}

	// Validate mode
	validModes := map[string]bool{"private": true, "space": true, "invite": true, "link": true}
	if !validModes[body.Mode] {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Invalid share mode", nil)
		return
	}

	if err := s.service.UpdateDocumentShareMode(r.Context(), documentID, body.Mode); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mode": body.Mode})
}

// =============================================================================
// Document Share Search HTTP Handler
// =============================================================================

func (s *HTTPServer) handleDocumentShareSearch(w http.ResponseWriter, r *http.Request, session Session, documentID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if !s.service.Can(session.Role, rbac.ActionWrite) {
		s.forbid(w, r, session, string(rbac.ActionWrite))
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		writeJSON(w, http.StatusOK, map[string]any{"users": []any{}, "groups": []any{}})
		return
	}

	result, err := s.service.SearchShareCandidates(r.Context(), query)
	if err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// =============================================================================
// Document Permissions HTTP Handlers
// =============================================================================

func (s *HTTPServer) handleDocumentPermissions(w http.ResponseWriter, r *http.Request, session Session, documentID string) {
	switch r.Method {
	case http.MethodGet:
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			s.forbid(w, r, session, string(rbac.ActionAdmin))
			return
		}
		result, err := s.service.GetDocumentShareData(r.Context(), documentID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, result)

	case http.MethodPost:
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			s.forbid(w, r, session, string(rbac.ActionAdmin))
			return
		}
		var body struct {
			Email       string  `json:"email"`
			Role        string  `json:"role"`
			ExpiresAt   *string `json:"expiresAt"`
			SubjectType string  `json:"subjectType"`
			SubjectID   string  `json:"subjectId"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}

		var perm map[string]any
		var err error

		if body.SubjectType != "" && body.SubjectID != "" {
			// Direct grant by subject type + ID (for groups and users by ID)
			perm, err = s.service.GrantDocumentPermissionDirect(r.Context(), documentID, body.SubjectType, body.SubjectID, body.Role, body.ExpiresAt, session.UserID)
		} else {
			// Legacy flow: grant by email
			perm, err = s.service.GrantDocumentPermission(r.Context(), documentID, body.Email, body.Role, body.ExpiresAt, session.UserID)
		}

		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, perm)

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleDocumentPermissionRevoke(w http.ResponseWriter, r *http.Request, session Session, documentID, permissionID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	if err := s.service.RevokeDocumentPermission(r.Context(), permissionID); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// =============================================================================
// Sprint 3: Public Access Handler (unauthenticated)
// =============================================================================

func (s *HTTPServer) handlePublicShare(w http.ResponseWriter, r *http.Request, token string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	payload, err := s.service.GetSharedDocument(r.Context(), token)
	if err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}

	writeJSON(w, http.StatusOK, payload)
}

// =============================================================================
// Routing helper for Sprint 3 endpoints
// =============================================================================

func (s *HTTPServer) routeRBAC(w http.ResponseWriter, r *http.Request, session Session, parts []string) bool {
	// /api/spaces/{id}/permissions → ["spaces", "{id}", "permissions"] len=3
	if len(parts) == 3 && parts[0] == "spaces" && parts[2] == "permissions" {
		s.handleSpacePermissions(w, r, session, parts[1])
		return true
	}

	// /api/spaces/{id}/permissions/{permissionId} → len=4
	if len(parts) == 4 && parts[0] == "spaces" && parts[2] == "permissions" {
		s.handleSpacePermissionRevoke(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/spaces/{id}/guests → len=3
	if len(parts) == 3 && parts[0] == "spaces" && parts[2] == "guests" {
		s.handleSpaceGuests(w, r, session, parts[1])
		return true
	}

	// /api/spaces/{id}/guests/{userId} → len=4
	if len(parts) == 4 && parts[0] == "spaces" && parts[2] == "guests" {
		s.handleSpaceGuestRemove(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/documents/{id}/permissions → len=3
	if len(parts) == 3 && parts[0] == "documents" && parts[2] == "permissions" {
		s.handleDocumentPermissions(w, r, session, parts[1])
		return true
	}

	// /api/documents/{id}/permissions/{permissionId} → len=4
	if len(parts) == 4 && parts[0] == "documents" && parts[2] == "permissions" {
		s.handleDocumentPermissionRevoke(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/documents/{id}/public-links → len=3
	if len(parts) == 3 && parts[0] == "documents" && parts[2] == "public-links" {
		s.handleDocumentPublicLinks(w, r, session, parts[1])
		return true
	}

	// /api/documents/{id}/public-links/{linkId} → len=4
	if len(parts) == 4 && parts[0] == "documents" && parts[2] == "public-links" {
		s.handleDocumentPublicLinkRevoke(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/documents/{id}/share/search → len=4
	if len(parts) == 4 && parts[0] == "documents" && parts[2] == "share" && parts[3] == "search" {
		s.handleDocumentShareSearch(w, r, session, parts[1])
		return true
	}

	// /api/documents/{id}/share-mode → len=3
	if len(parts) == 3 && parts[0] == "documents" && parts[2] == "share-mode" {
		s.handleDocumentShareMode(w, r, session, parts[1])
		return true
	}

	// Note: /share/{token} is handled before auth in http.go handle()

	// GET/POST /api/admin/users
	if len(parts) == 2 && parts[0] == "admin" && parts[1] == "users" {
		if r.Method == http.MethodGet {
			s.handleAdminUsers(w, r, session)
			return true
		}
		if r.Method == http.MethodPost {
			s.handleAdminCreateUser(w, r, session)
			return true
		}
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return true
	}

	// PUT /api/admin/users/{id}/role
	if len(parts) == 4 && parts[0] == "admin" && parts[1] == "users" && parts[3] == "role" {
		s.handleAdminUserRole(w, r, session, parts[2])
		return true
	}

	// PUT /api/admin/users/{id}/status
	if len(parts) == 4 && parts[0] == "admin" && parts[1] == "users" && parts[3] == "status" {
		s.handleAdminUserStatus(w, r, session, parts[2])
		return true
	}

	// GET/POST /api/groups
	if len(parts) == 1 && parts[0] == "groups" {
		s.handleGroups(w, r, session)
		return true
	}

	// GET/POST /api/workspaces/{id}/groups (workspace-scoped)
	if len(parts) == 3 && parts[0] == "workspaces" && parts[2] == "groups" {
		s.handleGroups(w, r, session)
		return true
	}

	// GET/PUT/DELETE /api/groups/{id}
	if len(parts) == 2 && parts[0] == "groups" {
		s.handleGroup(w, r, session, parts[1])
		return true
	}

	// GET/POST /api/groups/{id}/members
	if len(parts) == 3 && parts[0] == "groups" && parts[2] == "members" {
		s.handleGroupMembers(w, r, session, parts[1])
		return true
	}

	// DELETE /api/groups/{id}/members/{userId}
	if len(parts) == 4 && parts[0] == "groups" && parts[2] == "members" {
		s.handleGroupMemberRemove(w, r, session, parts[1], parts[3])
		return true
	}

	return false
}

// =============================================================================
// Admin Users Handlers
// =============================================================================

func (s *HTTPServer) handleAdminUsers(w http.ResponseWriter, r *http.Request, session Session) {
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	search := r.URL.Query().Get("search")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit := 20
	offset := 0
	if limitStr != "" {
		if v, err := parseInt(limitStr); err == nil && v > 0 {
			limit = v
		}
	}
	if offsetStr != "" {
		if v, err := parseInt(offsetStr); err == nil && v >= 0 {
			offset = v
		}
	}

	result, err := s.service.ListWorkspaceUsers(r.Context(), search, limit, offset)
	if err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *HTTPServer) handleAdminCreateUser(w http.ResponseWriter, r *http.Request, session Session) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	var body struct {
		DisplayName string `json:"displayName"`
		Email       string `json:"email"`
		Role        string `json:"role"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}
	if body.DisplayName == "" && body.Email == "" {
		writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "displayName or email is required", nil)
		return
	}

	result, err := s.service.AdminCreateUser(r.Context(), body.DisplayName, body.Email, body.Role)
	if err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *HTTPServer) handleAdminUserRole(w http.ResponseWriter, r *http.Request, session Session, userID string) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}
	if err := s.service.UpdateUserRole(r.Context(), userID, body.Role); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *HTTPServer) handleAdminUserStatus(w http.ResponseWriter, r *http.Request, session Session, userID string) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	var body struct {
		Active bool `json:"active"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}
	if err := s.service.SetUserDeactivated(r.Context(), userID, !body.Active); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// =============================================================================
// Groups Handlers
// =============================================================================

func (s *HTTPServer) handleGroups(w http.ResponseWriter, r *http.Request, session Session) {
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	switch r.Method {
	case http.MethodGet:
		result, err := s.service.ListGroups(r.Context())
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"groups": result})

	case http.MethodPost:
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		group, err := s.service.CreateGroup(r.Context(), body.Name, body.Description)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusCreated, group)

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleGroup(w http.ResponseWriter, r *http.Request, session Session, groupID string) {
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	switch r.Method {
	case http.MethodGet:
		group, err := s.service.GetGroup(r.Context(), groupID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, group)

	case http.MethodPut:
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		if err := s.service.UpdateGroup(r.Context(), groupID, body.Name, body.Description); err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	case http.MethodDelete:
		if err := s.service.DeleteGroup(r.Context(), groupID); err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleGroupMembers(w http.ResponseWriter, r *http.Request, session Session, groupID string) {
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	switch r.Method {
	case http.MethodGet:
		members, err := s.service.ListGroupMembers(r.Context(), groupID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": members})

	case http.MethodPost:
		var body struct {
			UserID string `json:"userId"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		if err := s.service.AddGroupMember(r.Context(), groupID, body.UserID); err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	default:
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
	}
}

func (s *HTTPServer) handleGroupMemberRemove(w http.ResponseWriter, r *http.Request, session Session, groupID, userID string) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}
	if !s.service.Can(session.Role, rbac.ActionAdmin) {
		s.forbid(w, r, session, string(rbac.ActionAdmin))
		return
	}

	if err := s.service.RemoveGroupMember(r.Context(), groupID, userID); err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func parseInt(s string) (int, error) {
	var n int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid int: %s", s)
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}

// Helper to parse path and check if it's an RBAC route
func isRBACRoute(path string) bool {
	return strings.Contains(path, "/permissions") ||
		strings.Contains(path, "/guests") ||
		strings.Contains(path, "/public-links") ||
		strings.Contains(path, "/share-mode") ||
		strings.Contains(path, "/share/search") ||
		strings.Contains(path, "/admin/") ||
		strings.Contains(path, "/groups")
}
