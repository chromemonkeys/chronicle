import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchSharedDocument, type SharedDocumentPayload } from "../api/client";

type ViewState = "loading" | "error" | "ready";

export function SharedDocumentPage() {
  const { token = "" } = useParams();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<SharedDocumentPayload | null>(null);

  useEffect(() => {
    if (!token) {
      setViewState("error");
      setErrorMessage("Invalid share link.");
      return;
    }
    let cancelled = false;
    setViewState("loading");
    fetchSharedDocument(token)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setViewState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load shared document.";
        setErrorMessage(msg);
        setViewState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (viewState === "loading") {
    return (
      <div className="cm-share-page">
        <div className="cm-share-loading">Loading shared document…</div>
      </div>
    );
  }

  if (viewState === "error" || !data) {
    return (
      <div className="cm-share-page">
        <div className="cm-share-error">
          <h2>Unable to load document</h2>
          <p>{errorMessage}</p>
        </div>
      </div>
    );
  }

  const { document: doc, content, link } = data;

  return (
    <div className="cm-share-page">
      <header className="cm-share-header">
        <div className="cm-share-badge">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M8 1a5 5 0 0 0-5 5v2a2 2 0 0 0-1 1.73V13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.73A2 2 0 0 0 13 8V6a5 5 0 0 0-5-5Zm3 5v2H5V6a3 3 0 1 1 6 0Z"
              fill="currentColor"
            />
          </svg>
          Shared · {link.role}
        </div>
        <div className="cm-share-meta">
          {doc.editedBy} · {doc.editedAt}
        </div>
      </header>

      <article className="cm-share-document">
        <h1 className="cm-share-title">{doc.title}</h1>
        {doc.subtitle && (
          <p className="cm-share-subtitle">{doc.subtitle}</p>
        )}
        <div className="cm-share-status">{doc.status}</div>

        {content.purpose && (
          <section className="cm-share-section">
            <h2>Purpose</h2>
            <div className="cm-share-content">{content.purpose}</div>
          </section>
        )}

        {content.tiers && (
          <section className="cm-share-section">
            <h2>Tiers</h2>
            <div className="cm-share-content">{content.tiers}</div>
          </section>
        )}

        {content.enforce && (
          <section className="cm-share-section">
            <h2>Enforcement</h2>
            <div className="cm-share-content">{content.enforce}</div>
          </section>
        )}
      </article>

      <footer className="cm-share-footer">
        Shared via Chronicle
      </footer>
    </div>
  );
}
