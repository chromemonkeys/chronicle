package app

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"chronicle/api/internal/auth"
	"chronicle/api/internal/authpw"
	"chronicle/api/internal/export"
	"chronicle/api/internal/rbac"
)

type HTTPServer struct {
	service    *Service
	corsOrigin string
}

func NewHTTPServer(service *Service, corsOrigin string) *HTTPServer {
	return &HTTPServer{service: service, corsOrigin: corsOrigin}
}

func (s *HTTPServer) Handler() http.Handler {
	return s.withMiddleware(http.HandlerFunc(s.handle))
}

// forbid writes a 403 Forbidden response and logs the denial
func (s *HTTPServer) forbid(w http.ResponseWriter, r *http.Request, session Session, action string) {
	writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
}

func (s *HTTPServer) handle(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		writeJSON(w, http.StatusNoContent, map[string]any{})
		return
	}

	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && r.URL.Path == "/api/health" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && r.URL.Path == "/api/ready" {
		// Check database connectivity
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		status := "ready"
		statusCode := http.StatusOK
		checks := map[string]any{
			"database": map[string]any{"status": "ok"},
		}

		if err := s.service.Ping(ctx); err != nil {
			status = "not_ready"
			statusCode = http.StatusServiceUnavailable
			checks["database"] = map[string]any{
				"status": "error",
				"error":  err.Error(),
			}
		}

		writeJSON(w, statusCode, map[string]any{
			"ok":     status == "ready",
			"status": status,
			"checks": checks,
		})
		return
	}

	// Auth routes (no session required)
	if r.Method == http.MethodPost && r.URL.Path == "/api/auth/signup" {
		s.handleAuthSignUp(w, r)
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/auth/signin" {
		s.handleAuthSignIn(w, r)
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/auth/verify-email" {
		s.handleAuthVerifyEmail(w, r)
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/auth/reset-password/request" {
		s.handleAuthRequestReset(w, r)
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/auth/reset-password" {
		s.handleAuthResetPassword(w, r)
		return
	}

	if r.Method == http.MethodGet && r.URL.Path == "/api/session" {
		token := bearerToken(r)
		if token == "" {
			writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "userName": nil})
			return
		}
		session, err := s.service.SessionFromToken(r.Context(), token)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "userName": nil})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "userName": session.UserName, "userId": session.UserID, "role": session.Role})
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/session/login" {
		var body struct {
			Name string `json:"name"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		session, err := s.service.Login(r.Context(), body.Name)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "LOGIN_FAILED", "Login failed", nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"token":        session.Token,
			"refreshToken": session.RefreshToken,
			"userName":     session.UserName,
			"userId":       session.UserID,
			"role":         session.Role,
		})
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/session/refresh" {
		var body struct {
			RefreshToken string `json:"refreshToken"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		session, err := s.service.Refresh(r.Context(), body.RefreshToken)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Refresh token invalid", nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"token":        session.Token,
			"refreshToken": session.RefreshToken,
			"userName":     session.UserName,
		})
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/session/logout" {
		session := Session{}
		if token := bearerToken(r); token != "" {
			if parsed, err := s.service.SessionFromToken(r.Context(), token); err == nil {
				session = parsed
			}
		}
		var body struct {
			RefreshToken string `json:"refreshToken"`
		}
		_ = decodeBody(r, &body)
		_ = s.service.Logout(r.Context(), session, body.RefreshToken)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/internal/sync/session-ended" {
		syncToken := strings.TrimSpace(r.Header.Get("x-chronicle-sync-token"))
		if syncToken == "" || syncToken != s.service.SyncToken() {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Unauthorized", nil)
			return
		}
		var body struct {
			SessionID   string            `json:"sessionId"`
			DocumentID  string            `json:"documentId"`
			ProposalID  string            `json:"proposalId"`
			Actor       string            `json:"actor"`
			UpdateCount int               `json:"updateCount"`
			Snapshot    *WorkspaceContent `json:"snapshot"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		if strings.TrimSpace(body.DocumentID) == "" {
			writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "documentId is required", nil)
			return
		}
		if strings.TrimSpace(body.SessionID) == "" {
			writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "sessionId is required", nil)
			return
		}
		payload, err := s.service.HandleSyncSessionEnded(
			r.Context(),
			body.SessionID,
			body.DocumentID,
			body.ProposalID,
			body.Actor,
			body.UpdateCount,
			body.Snapshot,
		)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	// Public share links — no authentication required
	if strings.HasPrefix(r.URL.Path, "/share/") {
		token := strings.TrimPrefix(r.URL.Path, "/share/")
		if token != "" {
			s.handlePublicShare(w, r, token)
			return
		}
	}

	session, ok := s.requireSession(w, r)
	if !ok {
		return
	}

	if r.Method == http.MethodGet && r.URL.Path == "/api/search" {
		if !s.service.Can(session.Role, rbac.ActionRead) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		filterType := strings.TrimSpace(r.URL.Query().Get("type"))
		spaceID := strings.TrimSpace(r.URL.Query().Get("spaceId"))
		limit := 20
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "limit must be an integer", nil)
				return
			}
			limit = parsed
		}
		offset := 0
		if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "offset must be an integer", nil)
				return
			}
			offset = parsed
		}

		payload, err := s.service.Search(r.Context(), q, filterType, spaceID, limit, offset, session.IsExternal)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodGet && r.URL.Path == "/api/documents" {
		if !s.service.Can(session.Role, rbac.ActionRead) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		items, err := s.service.ListDocuments(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not list documents", nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"documents": items})
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/documents" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			Title    string `json:"title"`
			Subtitle string `json:"subtitle"`
			SpaceID  string `json:"spaceId"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		payload, err := s.service.CreateDocument(r.Context(), body.Title, body.Subtitle, body.SpaceID, session.UserName, session.IsExternal)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodGet && r.URL.Path == "/api/approvals" {
		payload, err := s.service.Approvals(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not load approvals", nil)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodGet && r.URL.Path == "/api/workspaces" {
		payload, err := s.service.GetOrgWorkspace(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not load workspaces", nil)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/spaces" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			Name               string              `json:"name"`
			Description        string              `json:"description"`
			Visibility         string              `json:"visibility"`
			InitialPermissions []InitialPermission `json:"initialPermissions"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		payload, err := s.service.CreateSpaceWithOptions(r.Context(), body.Name, body.Description, body.Visibility, body.InitialPermissions, session.UserID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	parts := splitPath(r.URL.Path)

	// Dispatch Sprint 3 RBAC routes (permissions, guests, public-links, admin, groups)
	if isRBACRoute(r.URL.Path) {
		apiParts := parts
		if len(apiParts) > 0 && apiParts[0] == "api" {
			apiParts = apiParts[1:]
		}
		if s.routeRBAC(w, r, session, apiParts) {
			return
		}
	}

	if len(parts) == 3 && parts[0] == "api" && parts[1] == "spaces" {
		spaceID := parts[2]
		s.handleSpaces(w, r, session, spaceID)
		return
	}

	if len(parts) == 4 && parts[0] == "api" && parts[1] == "spaces" && parts[3] == "documents" {
		spaceID := parts[2]
		if r.Method == http.MethodGet {
			// Check for tree view query param
			if r.URL.Query().Get("tree") == "true" {
				items, err := s.service.ListDocumentTree(r.Context(), spaceID)
				if err != nil {
					writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not list document tree", nil)
					return
				}
				writeJSON(w, http.StatusOK, map[string]any{"tree": items})
				return
			}
			items, err := s.service.ListDocumentsBySpace(r.Context(), spaceID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not list documents", nil)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"documents": items})
			return
		}
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	// Document tree move endpoint
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "documents" && parts[3] == "tree-move" {
		if r.Method == http.MethodPost {
			if !s.service.Can(session.Role, rbac.ActionWrite) {
				writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
				return
			}
			documentID := parts[2]
			var body struct {
				ParentID *string `json:"parentId"`
				SpaceID  string  `json:"spaceId"`
			}
			if err := decodeBody(r, &body); err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
				return
			}
			payload, err := s.service.MoveDocumentInTree(r.Context(), documentID, body.ParentID, body.SpaceID)
			if err != nil {
				status, code, message, details := mapError(err)
				writeError(w, status, code, message, details)
				return
			}
			writeJSON(w, http.StatusOK, payload)
			return
		}
	}

	// Document reorder endpoint
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "documents" && parts[3] == "reorder" {
		if r.Method == http.MethodPost {
			if !s.service.Can(session.Role, rbac.ActionWrite) {
				writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
				return
			}
			documentID := parts[2]
			var body struct {
				SortOrder int `json:"sortOrder"`
			}
			if err := decodeBody(r, &body); err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
				return
			}
			payload, err := s.service.ReorderDocument(r.Context(), documentID, body.SortOrder)
			if err != nil {
				status, code, message, details := mapError(err)
				writeError(w, status, code, message, details)
				return
			}
			writeJSON(w, http.StatusOK, payload)
			return
		}
	}

	// Document export endpoint
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "documents" && parts[3] == "export" {
		if r.Method == http.MethodPost {
			// Export requires read permission
			if !s.service.Can(session.Role, rbac.ActionRead) {
				writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
				return
			}
			documentID := parts[2]
			var body struct {
				Format         string `json:"format"`  // "pdf" or "docx"
				Version        string `json:"version"` // "latest" or commit hash
				IncludeThreads bool   `json:"includeThreads"`
			}
			if err := decodeBody(r, &body); err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
				return
			}

			// Validate format
			format := export.Format(body.Format)
			if format != export.FormatPDF && format != export.FormatDOCX {
				writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "format must be 'pdf' or 'docx'", nil)
				return
			}

			// Call export service
			result, err := s.service.ExportDocument(r.Context(), export.Request{
				DocumentID:       documentID,
				Version:          body.Version,
				Format:           format,
				IncludeThreads:   body.IncludeThreads,
				ViewerIsExternal: session.IsExternal,
			})
			if err != nil {
				status, code, message, details := mapError(err)
				writeError(w, status, code, message, details)
				return
			}

			// Return as downloadable file
			w.Header().Set("Content-Disposition", "attachment; filename=\""+result.Filename+"\"")
			w.Header().Set("Content-Type", result.MimeType)
			w.Write(result.Data)
			return
		}
	}

	if len(parts) == 4 && parts[0] == "api" && parts[1] == "documents" && parts[3] == "move" {
		if r.Method == http.MethodPost {
			if !s.service.Can(session.Role, rbac.ActionWrite) {
				writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
				return
			}
			documentID := parts[2]
			var body struct {
				SpaceID string `json:"spaceId"`
			}
			if err := decodeBody(r, &body); err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
				return
			}
			payload, err := s.service.MoveDocument(r.Context(), documentID, body.SpaceID)
			if err != nil {
				status, code, message, details := mapError(err)
				writeError(w, status, code, message, details)
				return
			}
			writeJSON(w, http.StatusOK, payload)
			return
		}
	}

	if len(parts) >= 3 && parts[0] == "api" && parts[1] == "workspace" {
		documentID := parts[2]
		s.handleWorkspace(w, r, session, documentID)
		return
	}

	if len(parts) >= 3 && parts[0] == "api" && parts[1] == "documents" {
		documentID := parts[2]
		s.handleDocuments(w, r, session, documentID, parts)
		return
	}

	writeError(w, http.StatusNotFound, "NOT_FOUND", "Not found", nil)
}

func (s *HTTPServer) handleSpaces(w http.ResponseWriter, r *http.Request, session Session, spaceID string) {
	if r.Method == http.MethodGet {
		payload, err := s.service.GetSpace(r.Context(), spaceID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodPut {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Visibility  string `json:"visibility"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		payload, err := s.service.UpdateSpace(r.Context(), spaceID, body.Name, body.Description, body.Visibility)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodDelete {
		if !s.service.Can(session.Role, rbac.ActionAdmin) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		if err := s.service.DeleteSpace(r.Context(), spaceID); err != nil {
			if strings.Contains(err.Error(), "contains") {
				writeError(w, http.StatusConflict, "SPACE_NOT_EMPTY", err.Error(), nil)
				return
			}
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
}

func (s *HTTPServer) handleWorkspace(w http.ResponseWriter, r *http.Request, session Session, documentID string) {
	if r.Method == http.MethodGet {
		payload, err := s.service.GetWorkspace(r.Context(), documentID, session.UserID, session.IsExternal)
		if err != nil {
			log.Printf("GetWorkspace(%s) error: %v", documentID, err)
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if r.Method == http.MethodPost {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var payload WorkspaceContent
		if err := decodeBody(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		updated, err := s.service.SaveWorkspace(r.Context(), documentID, payload, session.UserName, session.IsExternal)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not save workspace", nil)
			return
		}
		writeJSON(w, http.StatusOK, updated)
		return
	}

	writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
}

func (s *HTTPServer) handleDocuments(w http.ResponseWriter, r *http.Request, session Session, documentID string, parts []string) {
	if len(parts) == 3 && r.Method == http.MethodGet {
		summary, err := s.service.GetDocumentSummary(r.Context(), documentID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"document": summary})
		return
	}

	if len(parts) == 4 && parts[3] == "share" && r.Method == http.MethodGet {
		if !s.service.Can(session.Role, rbac.ActionRead) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		payload, err := s.service.GetDocumentShareData(r.Context(), documentID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if len(parts) == 4 && parts[3] == "history" && r.Method == http.MethodGet {
		proposalID := strings.TrimSpace(r.URL.Query().Get("proposalId"))
		payload, err := s.service.History(r.Context(), documentID, proposalID)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if len(parts) == 4 && parts[3] == "compare" && r.Method == http.MethodGet {
		from := strings.TrimSpace(r.URL.Query().Get("from"))
		to := strings.TrimSpace(r.URL.Query().Get("to"))
		if from == "" || to == "" {
			writeError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "from and to commit hashes are required", nil)
			return
		}
		payload, err := s.service.Compare(r.Context(), documentID, from, to)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if len(parts) == 4 && parts[3] == "decision-log" && r.Method == http.MethodGet {
		if !s.service.Can(session.Role, rbac.ActionRead) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		limit := 50
		if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
			if parsedLimit, err := strconv.Atoi(rawLimit); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}
		payload, err := s.service.DecisionLog(r.Context(), documentID, DecisionLogFilterInput{
			ProposalID: strings.TrimSpace(r.URL.Query().Get("proposalId")),
			Outcome:    strings.TrimSpace(r.URL.Query().Get("outcome")),
			Query:      strings.TrimSpace(r.URL.Query().Get("q")),
			Author:     strings.TrimSpace(r.URL.Query().Get("author")),
			Limit:      limit,
		})
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if len(parts) == 4 && parts[3] == "audit-events" && r.Method == http.MethodGet {
		if !s.service.Can(session.Role, rbac.ActionRead) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		limit := 100
		if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
			if parsedLimit, err := strconv.Atoi(rawLimit); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}
		proposalID := strings.TrimSpace(r.URL.Query().Get("proposalId"))
		events, err := s.service.ListAuditEvents(r.Context(), documentID, proposalID, limit)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"events": events})
		return
	}

	if len(parts) == 4 && parts[3] == "proposals" && r.Method == http.MethodPost {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			Title string `json:"title"`
		}
		_ = decodeBody(r, &body)
		payload, err := s.service.CreateProposal(r.Context(), documentID, session.UserName, body.Title, session.IsExternal)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Could not create proposal", nil)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	// ── Approval Rules V2 ──
	if len(parts) == 4 && parts[3] == "approval-rules" {
		if r.Method == http.MethodGet {
			payload, err := s.service.GetApprovalRules(r.Context(), documentID)
			if err != nil {
				status, code, message, details := mapError(err)
				writeError(w, status, code, message, details)
				return
			}
			writeJSON(w, http.StatusOK, payload)
			return
		}
		if r.Method == http.MethodPut {
			if !s.service.Can(session.Role, rbac.ActionWrite) {
				writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
				return
			}
			var body SaveApprovalRulesInput
			if err := decodeBody(r, &body); err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
				return
			}
			payload, err := s.service.SaveApprovalRules(r.Context(), documentID, body)
			if err != nil {
				status, code, message, details := mapError(err)
				writeError(w, status, code, message, details)
				return
			}
			writeJSON(w, http.StatusOK, payload)
			return
		}
	}

	if len(parts) >= 6 && parts[3] == "proposals" {
		proposalID := parts[4]
		action := parts[5]
		s.handleProposalAction(w, r, session, documentID, proposalID, action, parts)
		return
	}

	writeError(w, http.StatusNotFound, "NOT_FOUND", "Not found", nil)
}

func (s *HTTPServer) handleProposalAction(w http.ResponseWriter, r *http.Request, session Session, documentID, proposalID, action string, parts []string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed", nil)
		return
	}

	if action == "submit" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		payload, err := s.service.SubmitProposal(r.Context(), documentID, proposalID, session.IsExternal)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "approvals" {
		if !s.service.Can(session.Role, rbac.ActionApprove) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			Role string `json:"role"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		payload, err := s.service.ApproveProposalRole(r.Context(), documentID, proposalID, body.Role, session.UserName, session.IsExternal)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "group-approvals" {
		var body struct {
			GroupID string `json:"groupId"`
			Status  string `json:"status"`
			Comment string `json:"comment"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		if body.GroupID == "" || (body.Status != "approved" && body.Status != "rejected") {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", "groupId and status (approved|rejected) are required", nil)
			return
		}
		var payload map[string]any
		var err error
		if body.Status == "approved" {
			payload, err = s.service.ApproveProposalGroup(r.Context(), documentID, proposalID, body.GroupID, session.UserID, body.Comment, session.IsExternal)
		} else {
			payload, err = s.service.RejectProposalGroup(r.Context(), documentID, proposalID, body.GroupID, session.UserID, body.Comment, session.IsExternal)
		}
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "versions" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		payload, err := s.service.SaveNamedVersion(r.Context(), documentID, proposalID, body.Name, session.UserName, session.IsExternal)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "merge" {
		if !s.service.Can(session.Role, rbac.ActionApprove) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		policy := defaultMergeGatePolicy()
		changeStates := []map[string]any(nil)
		if r.ContentLength > 0 {
			var body struct {
				Policy       *MergeGatePolicy `json:"policy"`
				ChangeStates []map[string]any `json:"changeStates"`
			}
			if err := decodeBody(r, &body); err != nil {
				writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
				return
			}
			if body.Policy != nil {
				policy = *body.Policy
			}
			changeStates = body.ChangeStates
		}
		payload, mergeGateDetails, err := s.service.MergeProposal(r.Context(), documentID, proposalID, session.UserName, session.IsExternal, policy, changeStates)
		if err != nil {
			log.Printf("merge error for document=%s proposal=%s: %v", documentID, proposalID, err)
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		if payload == nil {
			writeError(w, http.StatusConflict, "MERGE_GATE_BLOCKED", "Merge gate blocked", mergeGateDetails)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 8 && parts[7] == "resolve" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body ResolveThreadInput
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		threadID := parts[6]
		payload, err := s.service.ResolveThread(r.Context(), documentID, proposalID, threadID, session.UserName, session.IsExternal, body)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 6 {
		if !s.service.Can(session.Role, rbac.ActionComment) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body CreateThreadInput
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		body.AnchorLabel = strings.TrimSpace(firstNonBlank(body.AnchorLabel, r.URL.Query().Get("anchorLabel")))
		payload, err := s.service.CreateThread(r.Context(), documentID, proposalID, session.UserName, session.IsExternal, body)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 8 && parts[7] == "replies" {
		if !s.service.Can(session.Role, rbac.ActionComment) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body ThreadReplyInput
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		threadID := parts[6]
		payload, err := s.service.ReplyThread(r.Context(), documentID, proposalID, threadID, session.UserName, session.IsExternal, body)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 8 && parts[7] == "vote" {
		if !s.service.Can(session.Role, rbac.ActionComment) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body VoteThreadInput
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		threadID := parts[6]
		payload, err := s.service.VoteThread(r.Context(), documentID, proposalID, threadID, session.UserName, session.IsExternal, body)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 8 && parts[7] == "reactions" {
		if !s.service.Can(session.Role, rbac.ActionComment) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body ReactThreadInput
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		threadID := parts[6]
		payload, err := s.service.ReactThread(r.Context(), documentID, proposalID, threadID, session.UserName, session.IsExternal, body)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 8 && parts[7] == "reopen" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		threadID := parts[6]
		payload, err := s.service.ReopenThread(r.Context(), documentID, proposalID, threadID, session.IsExternal)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "threads" && len(parts) == 8 && parts[7] == "visibility" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body UpdateThreadVisibilityInput
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		threadID := parts[6]
		payload, err := s.service.SetThreadVisibility(r.Context(), documentID, proposalID, threadID, session.IsExternal, body)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	if action == "changes" && r.Method == http.MethodGet && len(parts) == 7 && parts[6] == "review-states" {
		if !s.service.Can(session.Role, rbac.ActionRead) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		fromRef := strings.TrimSpace(r.URL.Query().Get("fromRef"))
		toRef := strings.TrimSpace(r.URL.Query().Get("toRef"))
		states, err := s.service.ListChangeReviewStates(r.Context(), proposalID, fromRef, toRef)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"states": states})
		return
	}

	if action == "changes" && len(parts) == 8 && parts[7] == "review" {
		if !s.service.Can(session.Role, rbac.ActionWrite) {
			writeError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden", nil)
			return
		}
		var body struct {
			ReviewState       string `json:"reviewState"`
			RejectedRationale string `json:"rejectedRationale"`
			FromRef           string `json:"fromRef"`
			ToRef             string `json:"toRef"`
		}
		if err := decodeBody(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
			return
		}
		changeID := parts[6]
		payload, err := s.service.UpdateChangeReviewState(r.Context(), documentID, proposalID, changeID, session.UserName, session.IsExternal, body.ReviewState, body.RejectedRationale, body.FromRef, body.ToRef)
		if err != nil {
			status, code, message, details := mapError(err)
			writeError(w, status, code, message, details)
			return
		}
		writeJSON(w, http.StatusOK, payload)
		return
	}

	writeError(w, http.StatusNotFound, "NOT_FOUND", "Not found", nil)
}

func (s *HTTPServer) requireSession(w http.ResponseWriter, r *http.Request) (Session, bool) {
	token := bearerToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Unauthorized", nil)
		return Session{}, false
	}
	session, err := s.service.SessionFromToken(r.Context(), token)
	if err != nil {
		if errors.Is(err, auth.ErrExpiredToken) || errors.Is(err, auth.ErrInvalidToken) {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Unauthorized", nil)
			return Session{}, false
		}
		writeError(w, http.StatusInternalServerError, "SERVER_ERROR", "Session lookup failed", nil)
		return Session{}, false
	}
	return session, true
}

func (s *HTTPServer) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = randomRequestID()
		}
		ctx := context.WithValue(r.Context(), requestIDKey{}, requestID)
		r = r.WithContext(ctx)

		started := time.Now()
		writer := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		setCORSHeaders(writer.Header(), s.corsOrigin)
		writer.Header().Set("X-Request-ID", requestID)

		next.ServeHTTP(writer, r)

		log.Printf(`{"request_id":"%s","method":"%s","path":"%s","status":%d,"duration_ms":%d}`,
			requestID,
			r.Method,
			r.URL.Path,
			writer.status,
			time.Since(started).Milliseconds(),
		)
	})
}

type requestIDKey struct{}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func randomRequestID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func setCORSHeaders(header http.Header, corsOrigin string) {
	header.Set("Access-Control-Allow-Origin", corsOrigin)
	header.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
	header.Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
	header.Set("Cache-Control", "no-store")
	header.Set("Content-Type", "application/json")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code, message string, details any) {
	response := map[string]any{
		"code":  code,
		"error": message,
	}
	if details != nil {
		response["details"] = details
	}
	writeJSON(w, status, response)
}

func decodeBody(r *http.Request, target any) error {
	if r.Body == nil {
		return nil
	}
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, http.ErrBodyReadAfterClose) {
			return nil
		}
		return fmt.Errorf("invalid JSON body")
	}
	return nil
}

func bearerToken(r *http.Request) string {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func splitPath(path string) []string {
	trimmed := strings.Trim(path, "/")
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "/")
}

func mapError(err error) (status int, code, message string, details any) {
	var domainErr *DomainError
	if errors.As(err, &domainErr) {
		return domainErr.Status, domainErr.Code, domainErr.Message, domainErr.Details
	}
	if errors.Is(err, sql.ErrNoRows) {
		return http.StatusNotFound, "NOT_FOUND", "Not found", nil
	}
	if errors.Is(err, auth.ErrInvalidToken) || errors.Is(err, auth.ErrExpiredToken) {
		return http.StatusUnauthorized, "UNAUTHORIZED", "Unauthorized", nil
	}
	return http.StatusInternalServerError, "SERVER_ERROR", "Server error", nil
}

// Auth handlers for email/password authentication

func (s *HTTPServer) handleAuthSignUp(w http.ResponseWriter, r *http.Request) {
	authSvc := s.service.AuthPasswordService()
	if authSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "Authentication service not configured", nil)
		return
	}

	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}

	resp, err := authSvc.SignUp(r.Context(), authpw.SignUpRequest{
		Email:       body.Email,
		Password:    body.Password,
		DisplayName: body.DisplayName,
	})
	if err != nil {
		if err.Error() == "email already registered" {
			writeError(w, http.StatusConflict, "EMAIL_EXISTS", "Email already registered", nil)
			return
		}
		writeError(w, http.StatusBadRequest, "SIGNUP_FAILED", err.Error(), nil)
		return
	}

	// Check if email service is configured for dev bypass
	emailConfigured := s.service.SMTPConfigured()

	response := map[string]any{
		"userId":  resp.UserID,
		"message": "Please check your email to verify your account",
	}
	// Dev bypass: include verification token in response when email not configured
	if !emailConfigured {
		response["devVerificationToken"] = resp.VerificationToken
		response["message"] = "Account created. Verify your email to continue."
	}

	writeJSON(w, http.StatusCreated, response)
}

func (s *HTTPServer) handleAuthSignIn(w http.ResponseWriter, r *http.Request) {
	authSvc := s.service.AuthPasswordService()
	if authSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "Authentication service not configured", nil)
		return
	}

	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}

	resp, err := authSvc.SignIn(r.Context(), authpw.SignInRequest{
		Email:    body.Email,
		Password: body.Password,
	})
	if err != nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Invalid email or password", nil)
		return
	}

	if resp.RequiresVerify {
		writeError(w, http.StatusForbidden, "EMAIL_NOT_VERIFIED", "Please verify your email before signing in", nil)
		return
	}

	// Create session
	session, err := s.service.CreateSession(r.Context(), resp.User.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SESSION_FAILED", "Failed to create session", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"accessToken":  session.Token,
		"refreshToken": session.RefreshToken,
		"userId":       session.UserID,
		"userName":     session.UserName,
		"role":         session.Role,
		"expiresAt":    session.ExpiresAt.Unix(),
	})
}

func (s *HTTPServer) handleAuthVerifyEmail(w http.ResponseWriter, r *http.Request) {
	authSvc := s.service.AuthPasswordService()
	if authSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "Authentication service not configured", nil)
		return
	}

	var body struct {
		Token string `json:"token"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}

	if err := authSvc.VerifyEmail(r.Context(), body.Token); err != nil {
		writeError(w, http.StatusBadRequest, "VERIFICATION_FAILED", err.Error(), nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Email verified successfully",
	})
}

func (s *HTTPServer) handleAuthRequestReset(w http.ResponseWriter, r *http.Request) {
	authSvc := s.service.AuthPasswordService()
	if authSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "Authentication service not configured", nil)
		return
	}

	var body struct {
		Email string `json:"email"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}

	token, _ := authSvc.RequestPasswordReset(r.Context(), body.Email)

	// Check if email service is configured for dev bypass
	emailConfigured := s.service.SMTPConfigured()

	response := map[string]any{
		"message": "If an account exists, a reset email has been sent",
	}
	// Dev bypass: include reset token in response when email not configured and token was created
	if !emailConfigured && token != "" {
		response["devResetToken"] = token
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *HTTPServer) handleAuthResetPassword(w http.ResponseWriter, r *http.Request) {
	authSvc := s.service.AuthPasswordService()
	if authSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "AUTH_UNAVAILABLE", "Authentication service not configured", nil)
		return
	}

	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := decodeBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error(), nil)
		return
	}

	if err := authSvc.ResetPassword(r.Context(), authpw.ResetPasswordRequest{
		Token:       body.Token,
		NewPassword: body.NewPassword,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "RESET_FAILED", err.Error(), nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Password reset successfully",
	})
}
