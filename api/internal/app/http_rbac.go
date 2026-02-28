package app

import (
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

	// TODO: Update document share mode in store
	writeJSON(w, http.StatusOK, map[string]any{"mode": body.Mode})
}

// =============================================================================
// Sprint 3: Public Access Handler (unauthenticated)
// =============================================================================

func (s *HTTPServer) handlePublicShare(w http.ResponseWriter, r *http.Request, token string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	link, err := s.service.GetPublicLink(r.Context(), token)
	if err != nil {
		status, code, message, details := mapError(err)
		writeError(w, status, code, message, details)
		return
	}

	// Record access
	_ = s.service.RecordPublicLinkAccess(r.Context(), link["id"].(string))

	// Return document with limited role
	writeJSON(w, http.StatusOK, map[string]any{
		"link": link,
		// TODO: Include document content with limited role
	})
}

// =============================================================================
// Routing helper for Sprint 3 endpoints
// =============================================================================

func (s *HTTPServer) routeRBAC(w http.ResponseWriter, r *http.Request, session Session, parts []string) bool {
	// /api/spaces/{id}/permissions
	if len(parts) == 4 && parts[0] == "spaces" && parts[2] == "permissions" {
		s.handleSpacePermissions(w, r, session, parts[1])
		return true
	}

	// /api/spaces/{id}/permissions/{permissionId}
	if len(parts) == 5 && parts[0] == "spaces" && parts[2] == "permissions" {
		s.handleSpacePermissionRevoke(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/spaces/{id}/guests
	if len(parts) == 4 && parts[0] == "spaces" && parts[2] == "guests" {
		s.handleSpaceGuests(w, r, session, parts[1])
		return true
	}

	// /api/spaces/{id}/guests/{userId}
	if len(parts) == 5 && parts[0] == "spaces" && parts[2] == "guests" {
		s.handleSpaceGuestRemove(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/documents/{id}/public-links
	if len(parts) == 4 && parts[0] == "documents" && parts[2] == "public-links" {
		s.handleDocumentPublicLinks(w, r, session, parts[1])
		return true
	}

	// /api/documents/{id}/public-links/{linkId}
	if len(parts) == 5 && parts[0] == "documents" && parts[2] == "public-links" {
		s.handleDocumentPublicLinkRevoke(w, r, session, parts[1], parts[3])
		return true
	}

	// /api/documents/{id}/share-mode
	if len(parts) == 4 && parts[0] == "documents" && parts[2] == "share-mode" {
		s.handleDocumentShareMode(w, r, session, parts[1])
		return true
	}

	// /share/{token} (public access, unauthenticated)
	if len(parts) == 2 && parts[0] == "share" {
		s.handlePublicShare(w, r, parts[1])
		return true
	}

	return false
}

// Helper to parse path and check if it's an RBAC route
func isRBACRoute(path string) bool {
	return strings.Contains(path, "/permissions") ||
		strings.Contains(path, "/guests") ||
		strings.Contains(path, "/public-links") ||
		strings.Contains(path, "/share-mode") ||
		strings.HasPrefix(path, "/share/")
}
