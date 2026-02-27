import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createDocument,
  createSpace,
  fetchDocuments,
  fetchSpaceDocuments,
  fetchWorkspaces,
  isApiError
} from "../api/client";
import type { DocumentSummary, Space, WorkspacesResponse } from "../api/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyStateError, EmptyStateEmpty } from "../ui/EmptyState";

type ViewState = "success" | "loading" | "empty" | "error";

export function DocumentsPage() {
  const navigate = useNavigate();
  const { spaceId } = useParams<{ spaceId?: string }>();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreateDocFormOpen, setIsCreateDocFormOpen] = useState(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [isCreateSpaceFormOpen, setIsCreateSpaceFormOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);

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
    const title = newDocumentTitle.trim() || "Untitled Document";
    setIsCreating(true);
    setCreateError(null);
    try {
      const workspace = await createDocument(title, "", spaceId);
      setIsCreateDocFormOpen(false);
      setNewDocumentTitle("");
      navigate(`/workspace/${workspace.document.id}`);
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

  async function handleCreateSpace() {
    const trimmedName = newSpaceName.trim();
    if (!trimmedName) {
      setSpaceError("Space name is required.");
      return;
    }
    setIsCreatingSpace(true);
    setSpaceError(null);
    try {
      const data = await createSpace(trimmedName);
      setSpaces(data.spaces);
      setIsCreateSpaceFormOpen(false);
      setNewSpaceName("");
    } catch (error) {
      if (isApiError(error)) {
        setSpaceError(error.message);
      } else {
        setSpaceError("Could not create space.");
      }
    } finally {
      setIsCreatingSpace(false);
    }
  }

  const activeSpace = spaceId ? spaces.find((s) => s.id === spaceId) : null;
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
              {space.name}
              <span className="space-sidebar-count">{space.documentCount}</span>
            </Link>
          ))}
        </nav>
        {isCreateSpaceFormOpen ? (
          <form
            className="space-sidebar-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateSpace();
            }}
          >
            <input
              id="new-space-name"
              value={newSpaceName}
              onChange={(event) => {
                setNewSpaceName(event.target.value);
                if (spaceError) {
                  setSpaceError(null);
                }
              }}
              placeholder="Space name"
              disabled={isCreatingSpace}
              autoFocus
            />
            <div className="space-sidebar-form-actions">
              <Button type="submit" className="btn-sm" disabled={isCreatingSpace || !newSpaceName.trim()}>
                {isCreatingSpace ? "Creating..." : "Create"}
              </Button>
              <Button
                className="btn-sm"
                variant="ghost"
                onClick={() => {
                  setIsCreateSpaceFormOpen(false);
                  setNewSpaceName("");
                  setSpaceError(null);
                }}
                disabled={isCreatingSpace}
              >
                Cancel
              </Button>
            </div>
            {spaceError ? <p className="space-sidebar-error">{spaceError}</p> : null}
          </form>
        ) : (
          <button
            className="space-sidebar-create"
            onClick={() => setIsCreateSpaceFormOpen(true)}
          >
            + New space
          </button>
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
              <Button
                variant={isCreateDocFormOpen ? "ghost" : "primary"}
                onClick={() => {
                  setIsCreateDocFormOpen((value) => !value);
                  setCreateError(null);
                }}
                disabled={isCreating}
              >
                {isCreateDocFormOpen ? "Cancel" : "Create document"}
              </Button>
            </div>
          </div>
          {isCreateDocFormOpen ? (
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createNewDocument();
              }}
            >
              <label htmlFor="new-document-title">Document title</label>
              <input
                id="new-document-title"
                value={newDocumentTitle}
                onChange={(event) => {
                  setNewDocumentTitle(event.target.value);
                  if (createError) {
                    setCreateError(null);
                  }
                }}
                placeholder="Untitled Document"
                disabled={isCreating}
              />
              <div className="button-row">
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? "Creating document..." : "Create document"}
                </Button>
              </div>
            </form>
          ) : null}
          {createError ? <p className="muted">{createError}</p> : null}
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
            onAction={() => setIsCreateDocFormOpen(true)}
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
    </div>
  );
}
