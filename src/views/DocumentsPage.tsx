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
    const title = window.prompt("Document title", "Untitled Document");
    if (title === null) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const workspace = await createDocument(title.trim() || "Untitled Document", "", spaceId);
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
    const name = window.prompt("Space name");
    if (!name) return;
    try {
      const data = await createSpace(name.trim());
      setSpaces(data.spaces);
    } catch {
      // Silently fail — user can retry
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
        <button className="space-sidebar-create" onClick={() => void handleCreateSpace()}>
          + Create Space
        </button>
      </aside>
      <section className="documents-content">
        <div className="section-head">
          <h1>{pageTitle}</h1>
          <p className="muted">
            {activeSpace ? activeSpace.description : "Primary browser journey backed by Chronicle API."}
          </p>
          <div>
            <Button onClick={() => void createNewDocument()} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create document"}
            </Button>
          </div>
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
            onAction={createNewDocument}
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
