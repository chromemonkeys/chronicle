import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchApprovals } from "../api/client";
import type { ApprovalsResponse } from "../api/types";
import { Card } from "../ui/Card";
import { EmptyStateError, EmptyStateEmpty } from "../ui/EmptyState";
import { MergeGateBadge } from "../ui/MergeGateBadge";
import { StatusPill } from "../ui/StatusPill";

type ViewState = "success" | "loading" | "empty" | "error";

export function ApprovalsPage() {
  const navigate = useNavigate();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [approvals, setApprovals] = useState<ApprovalsResponse | null>(null);

  useEffect(() => {
    let active = true;
    setViewState("loading");
    fetchApprovals()
      .then((response) => {
        if (!active) {
          return;
        }
        setApprovals(response);
        setViewState(response.queue.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        if (active) {
          setViewState("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function retry() {
    setViewState("loading");
    fetchApprovals()
      .then((response) => {
        setApprovals(response);
        setViewState(response.queue.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        setViewState("error");
      });
  }

  const queue = approvals?.queue ?? [];
  const blockedQueue = queue.filter((item) => item.status === "Blocked");
  const readyQueue = queue.filter((item) => item.status === "Ready");
  const nextRequest = blockedQueue[0] ?? queue[0] ?? null;

  return (
    <section>
      <div className="section-head">
        <h1>Approvals</h1>
        <p className="muted">Review requests that are waiting on your sign-off and unblock merge gates.</p>
        <div className="button-row approvals-actions">
          <Link className="btn btn-ghost" to="/documents">
            Browse documents
          </Link>
          {nextRequest ? (
            <Link className="btn btn-primary" to={`/workspace/${nextRequest.documentId}`}>
              Review next request
            </Link>
          ) : null}
        </div>
      </div>

      {viewState === "loading" && (
        <div className="grid">
          {[1, 2].map((id) => (
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
          title="No pending approvals"
          description="You have no documents waiting for sign-off right now. Documents will appear here when you're added as an approver."
          actionLabel="Browse documents"
          onAction={() => navigate("/documents")}
        />
      )}

      {viewState === "error" && (
        <EmptyStateError
          title="Approval queue unavailable"
          description="Service timeout while loading approval chains. You can retry or check your documents."
          onRetry={retry}
          showHomeFallback={true}
        />
      )}

      {viewState === "success" && approvals && (
        <>
          <div className="grid approvals-summary-grid">
            <Card>
              <p className="muted">Needs your action</p>
              <p className="approvals-metric">{blockedQueue.length}</p>
            </Card>
            <Card>
              <p className="muted">Waiting on others</p>
              <p className="approvals-metric">{readyQueue.length}</p>
            </Card>
            <Card>
              <p className="muted">Total queue</p>
              <p className="approvals-metric">{queue.length}</p>
            </Card>
          </div>

          <Card>
            <h2>Current gate status</h2>
            <p className="muted">
              Merge stays blocked until required approvers sign off and open annotations are resolved.
            </p>
            <MergeGateBadge gate={approvals.mergeGate} />
          </Card>

          <div className="grid approvals-grid">
            <Card>
              <h2>Needs your review</h2>
              <div className="approvals-list" role="list">
                {blockedQueue.length === 0 && <p className="muted">No requests are currently blocked on your action.</p>}
                {blockedQueue.map((item) => (
                  <Link className="approvals-row approvals-row-link" to={`/workspace/${item.documentId}`} key={item.id} role="listitem">
                    <div className="approvals-row-main">
                      <strong>{item.title}</strong>
                      <p className="muted">Requested by {item.requestedBy}</p>
                    </div>
                    <div className="approvals-row-side">
                      <StatusPill variant="deferred">{item.status}</StatusPill>
                      <span className="approvals-row-cta">Review now</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <h2>Waiting on others</h2>
            <div className="approvals-list">
                {readyQueue.length === 0 && <p className="muted">No requests are waiting on other approvers right now.</p>}
                {readyQueue.map((item) => (
                  <Link className="approvals-row approvals-row-link" to={`/workspace/${item.documentId}`} key={item.id}>
                    <div className="approvals-row-main">
                      <strong>{item.title}</strong>
                      <p className="muted">Requested by {item.requestedBy}</p>
                    </div>
                    <div className="approvals-row-side">
                      <StatusPill variant="accepted">{item.status}</StatusPill>
                      <span className="approvals-row-cta">Open</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
