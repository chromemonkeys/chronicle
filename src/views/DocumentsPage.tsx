import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createDocument,
  fetchDocuments,
  fetchSpaceDocuments,
  fetchWorkspaces,
  isApiError
} from "../api/client";
import type { DocumentSummary, Space, WorkspacesResponse } from "../api/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CreateSpaceDialog } from "../ui/CreateSpaceDialog";
import { ShareDialog } from "../ui/ShareDialog";
import { SpaceSettingsDialog } from "../ui/SpaceSettingsDialog";
import { EmptyStateError, EmptyStateEmpty } from "../ui/EmptyState";
import { SearchBar } from "../ui/SearchBar";
import { useAuth } from "../state/AuthProvider";

type ViewState = "success" | "loading" | "empty" | "error";

export function DocumentsPage() {
  const navigate = useNavigate();
  const { spaceId } = useParams<{ spaceId?: string }>();
  const { role } = useAuth();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateSpaceDialogOpen, setIsCreateSpaceDialogOpen] = useState(false);
  const [settingsSpaceId, setSettingsSpaceId] = useState<string | null>(null);
  const [newDocId, setNewDocId] = useState<string | null>(null);
  const [newDocTitle, setNewDocTitle] = useState("");

  const canManageSpaces = role === "admin" || role === "editor";

  useEffect(() => {
    fetchWorkspaces()
      .then((data: WorkspacesResponse) => {
        setSpaces(data.spaces);
        setWorkspaceName(data.workspace.name);
      })
      .catch(() => {
        // Spaces sidebar is best-effort
      });
  }, []);

  useEffect(() => {
    let active = true;
    setViewState("loading");
    const fetcher = spaceId ? fetchSpaceDocuments(spaceId) : fetchDocuments();
    fetcher
      .then((response) => {
        if (!active) return;
        setDocuments(response);
        setViewState(response.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        if (active) setViewState("error");
      });
    return () => {
      active = false;
    };
  }, [spaceId]);

  function retry() {
    setViewState("loading");
    const fetcher = spaceId ? fetchSpaceDocuments(spaceId) : fetchDocuments();
    fetcher
      .then((response) => {
        setDocuments(response);
        setViewState(response.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        setViewState("error");
      });
  }

  async function createNewDocument() {
    setIsCreating(true);
    setCreateError(null);
    try {
      const workspace = await createDocument("Untitled Document", "", spaceId);
      setNewDocId(workspace.document.id);
      setNewDocTitle("Untitled Document");
    } catch (error) {
      if (isApiError(error)) {
        setCreateError(error.message);
      } else {
        setCreateError("Could not create document.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  const activeSpace = spaceId ? spaces.find((s) => s.id === spaceId) : null;
  const settingsSpace = settingsSpaceId ? spaces.find((s) => s.id === settingsSpaceId) : null;
  const pageTitle = activeSpace ? activeSpace.name : "All Documents";

  return (
    <div className="documents-layout">
      <aside className="space-sidebar">
        <div className="space-sidebar-header">
          {workspaceName && <span className="space-sidebar-workspace">{workspaceName}</span>}
        </div>
        <nav className="space-sidebar-nav">
          <Link
            className={`space-sidebar-item${!spaceId ? " active" : ""}`}
            to="/documents"
          >
            All Documents
          </Link>
          {spaces.map((space) => (
            <Link
              key={space.id}
              className={`space-sidebar-item${spaceId === space.id ? " active" : ""}`}
              to={`/spaces/${space.id}`}
            >
              <span className="space-sidebar-item-label">{space.name}</span>
              <span className="space-sidebar-count">{space.documentCount}</span>
              {canManageSpaces && (
                <button
                  className="space-sidebar-settings"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSettingsSpaceId(space.id);
                  }}
                  title="Space settings"
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.212-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </button>
              )}
            </Link>
          ))}
        </nav>
        <button
          className="space-sidebar-create"
          onClick={() => setIsCreateSpaceDialogOpen(true)}
        >
          + New space
        </button>
        <CreateSpaceDialog
          isOpen={isCreateSpaceDialogOpen}
          onClose={() => setIsCreateSpaceDialogOpen(false)}
          onCreated={(data) => {
            setSpaces(data.spaces);
            setIsCreateSpaceDialogOpen(false);
          }}
        />
        {settingsSpace && (
          <SpaceSettingsDialog
            space={settingsSpace}
            isOpen={!!settingsSpaceId}
            onClose={() => setSettingsSpaceId(null)}
            onUpdated={(updated) => {
              setSpaces((prev) =>
                prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
              );
            }}
          />
        )}
      </aside>
      <section className="documents-content">
        <div className="section-head">
          <div className="documents-head-row">
            <div>
              <h1>{pageTitle}</h1>
              <p className="muted">
                {activeSpace ? activeSpace.description : "Primary browser journey backed by Chronicle API."}
              </p>
            </div>
            <div className="documents-head-actions">
              {activeSpace && canManageSpaces && (
                <Button
                  variant="ghost"
                  onClick={() => setSettingsSpaceId(activeSpace.id)}
                >
                  Settings
                </Button>
              )}
              {!newDocId && (
                <Button
                  variant="primary"
                  onClick={() => void createNewDocument()}
                  disabled={isCreating}
                >
                  {isCreating ? "Creating..." : "Create document"}
                </Button>
              )}
            </div>
          </div>
          <SearchBar spaceId={spaceId} />
          {createError && <p className="muted">{createError}</p>}
        </div>
        {viewState === "loading" && (
          <div className="grid">
            {[1, 2, 3].map((id) => (
              <Card key={id}>
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line short" />
              </Card>
            ))}
          </div>
        )}
        {viewState === "empty" && (
          <EmptyStateEmpty
            title="No documents yet"
            description={
              activeSpace
                ? `No documents in ${activeSpace.name}. Create one to get started.`
                : "Create your first RFC, ADR, or policy draft to begin collaboration."
            }
            actionLabel={isCreating ? "Creating..." : "Create document"}
            onAction={() => void createNewDocument()}
          />
        )}
        {viewState === "error" && (
          <EmptyStateError
            title="Could not load documents"
            description="We couldn't retrieve your documents. This might be a temporary connection issue."
            onRetry={retry}
            showHomeFallback={false}
          />
        )}
        {viewState === "success" && (
          <div className="grid">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <h2>{doc.title}</h2>
                <p className="muted">
                  {doc.status} · Updated by {doc.updatedBy}
                </p>
                <p className="muted">{doc.openThreads} open threads</p>
                <Link className="link" to={`/workspace/${doc.id}`}>
                  Open workspace
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>
      {newDocId && (
        <ShareDialog
          documentId={newDocId}
          documentTitle={newDocTitle}
          isOpen={true}
          continueLabel="Open document"
          onClose={() => {
            const docId = newDocId;
            setNewDocId(null);
            setNewDocTitle("");
            navigate(`/workspace/${docId}`);
          }}
        />
      )}
    </div>
  );
}
